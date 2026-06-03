// MMORPG — редактор карт (только для админа)
// Подключается как mode=admin, проходит проверку пароля, рисует и сохраняет карту.

const socket = io({ query: { mode: 'admin' } });

// --- DOM ---
const authEl = document.getElementById('auth');
const editorEl = document.getElementById('editor');
const pwInput = document.getElementById('pwInput');
const authBtn = document.getElementById('authBtn');
const authErr = document.getElementById('authErr');
const paletteEl = document.getElementById('palette');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// --- Карта ---
let MAP = null, mapW = 0, mapH = 0;

// --- Изометрия / камера ---
const TW = 64, TH = 32, WALL_H = 34, TREE_H = 46;

// Деревья: 2 текстуры (как в игре), вариант стабилен по координатам клетки
const treeImgs = ['/assets/tree1.svg', '/assets/tree2.svg'].map(src => { const im = new Image(); im._ready = false; im.onload = () => { im._ready = true; }; im.src = src; return im; });
function treeVariant(x, y) { let h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0; h = (h ^ (h >>> 13)) >>> 0; return h & 1; }
let zoom = 1;
let panX = 0, panY = 0; // экранное смещение начала координат

// --- Палитра тайлов по категориям ---
const CATEGORIES = [
  { name: 'Земля',    items: [ { id: 0, name: 'Трава', color: '#5fa84e' }, { id: 4, name: 'Тропа', color: '#c6a96a' }, { id: 1, name: 'Вода', color: '#3a86c8' } ] },
  { name: 'Стены',    items: [ { id: 2, name: 'Стена', color: '#9aa0ac' } ] },
  { name: 'Ресурсы',  items: [ { id: 3, name: 'Дерево', color: '#2f7d32' }, { id: 5, name: 'Камень', color: '#828892' }, { id: 6, name: 'Руда', color: '#c2641f' } ] },
  { name: 'Верстаки', items: [ { id: 7, name: 'Наковальня', color: '#3a3f47' }, { id: 8, name: 'Плавильня', color: '#e8632a' }, { id: 9, name: 'Костёр', color: '#f4a23d' } ] },
  { name: 'Хранилище', items: [ { id: 10, name: 'Сундук', color: '#8a5a28' } ] },
];
let selected = 0; // выбранный id тайла

const TOP = { 0:'#5fa84e', 1:'#3a86c8', 2:'#9aa0ac', 3:'#5fa84e', 4:'#c6a96a', 5:'#5fa84e', 6:'#5fa84e', 7:'#5fa84e', 8:'#5fa84e', 9:'#5fa84e', 10:'#5fa84e' };
const WALL = { top:'#9aa0ac', left:'#5d626d', right:'#787e8a' };

// --- Авторизация ---
function tryAuth() {
  authErr.classList.add('hidden');
  socket.emit('adminAuth', pwInput.value);
}
authBtn.addEventListener('click', tryAuth);
pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryAuth(); });

socket.on('adminAuthResult', ({ ok }) => {
  if (ok) {
    authEl.classList.add('hidden');
    editorEl.classList.remove('hidden');
    buildPalette();
    resize();
    centerMap();
  } else {
    authErr.classList.remove('hidden');
    pwInput.value = '';
  }
});

socket.on('mapData', (data) => {
  MAP = data.map.map(row => row.slice()); // копия
  mapW = data.width; mapH = data.height;
});
socket.on('saveResult', ({ ok }) => {
  statusEl.textContent = ok ? '✓ Сохранено' : '✗ Ошибка';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
});

// --- Палитра (кнопки) ---
function buildPalette() {
  paletteEl.innerHTML = '';
  CATEGORIES.forEach((cat) => {
    const group = document.createElement('div');
    group.className = 'pal-group';
    group.innerHTML = `<span class="pal-cat">${cat.name}</span>`;
    cat.items.forEach((t) => {
      const el = document.createElement('div');
      el.className = 'swatch' + (t.id === selected ? ' active' : '');
      el.innerHTML = `<span class="dot" style="background:${t.color}"></span>${t.name}`;
      el.addEventListener('click', () => {
        selected = t.id;
        document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
        el.classList.add('active');
      });
      group.appendChild(el);
    });
    paletteEl.appendChild(group);
  });
}

saveBtn.addEventListener('click', () => { socket.emit('saveMap', MAP); });

// --- Геометрия изометрии ---
function isoX(x, y) { return (x - y) * (TW / 2) * zoom; }
function isoY(x, y) { return (x + y) * (TH / 2) * zoom; }

function centerMap() {
  // Центрируем середину карты на экране
  const cx = isoX(mapW / 2, mapH / 2);
  const cy = isoY(mapW / 2, mapH / 2);
  panX = canvas.width / 2 - cx;
  panY = canvas.height / 2 - cy;
}

// Экран → тайл
function screenToTile(mx, my) {
  const hw = (TW / 2) * zoom, hh = (TH / 2) * zoom;
  const a = (mx - panX) / hw; // x - y
  const b = (my - panY) / hh; // x + y
  return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
}

// --- Ввод мыши ---
let painting = false, panning = false, lastX = 0, lastY = 0;
let hover = { x: -1, y: -1 };

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 2) { panning = true; lastX = e.clientX; lastY = e.clientY; }
  else if (e.button === 0) { painting = true; paintAt(e); }
});
window.addEventListener('mouseup', () => { painting = false; panning = false; });

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  hover = screenToTile(e.clientX - r.left, e.clientY - r.top);
  if (panning) {
    panX += e.clientX - lastX;
    panY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
  }
  if (painting) paintAt(e);
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const nz = Math.max(0.4, Math.min(2.5, zoom * factor));
  // зум к курсору
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  panX = mx - (mx - panX) * (nz / zoom);
  panY = my - (my - panY) * (nz / zoom);
  zoom = nz;
}, { passive: false });

function paintAt(e) {
  const r = canvas.getBoundingClientRect();
  const t = screenToTile(e.clientX - r.left, e.clientY - r.top);
  if (t.x < 0 || t.y < 0 || t.x >= mapW || t.y >= mapH) return;
  if (MAP[t.y][t.x] !== selected) MAP[t.y][t.x] = selected;
}

// --- Рендер ---
function resize() { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; }
window.addEventListener('resize', () => { resize(); });

function fillDiamond(cx, cy, color, stroke) {
  const hw = (TW / 2) * zoom, hh = (TH / 2) * zoom;
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function drawCube(cx, cy, h) {
  const hw = (TW / 2) * zoom, hh = (TH / 2) * zoom; h *= zoom;
  ctx.beginPath();
  ctx.moveTo(cx, cy + hh); ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx + hw, cy - h); ctx.lineTo(cx, cy + hh - h);
  ctx.closePath(); ctx.fillStyle = WALL.right; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy + hh); ctx.lineTo(cx - hw, cy);
  ctx.lineTo(cx - hw, cy - h); ctx.lineTo(cx, cy + hh - h);
  ctx.closePath(); ctx.fillStyle = WALL.left; ctx.fill();
  fillDiamond(cx, cy - h, WALL.top, 'rgba(0,0,0,.15)');
}
function drawTree(cx, cy, x, y) {
  const z = zoom;
  const img = treeImgs[treeVariant(x, y)];
  const W = 56 * z, H = 56 * z, top = cy + 6 * z - H;
  if (img._ready) ctx.drawImage(img, cx - W / 2, top, W, H);
}
function drawRock(cx, cy, ore) {
  const z = zoom;
  ctx.fillStyle = '#828892';
  ctx.beginPath();
  ctx.moveTo(cx - 20 * z, cy + 2 * z); ctx.lineTo(cx - 14 * z, cy - 14 * z); ctx.lineTo(cx + 2 * z, cy - 20 * z);
  ctx.lineTo(cx + 18 * z, cy - 11 * z); ctx.lineTo(cx + 21 * z, cy + 3 * z); ctx.lineTo(cx + 4 * z, cy + 10 * z);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9aa0aa';
  ctx.beginPath(); ctx.moveTo(cx - 20 * z, cy + 2 * z); ctx.lineTo(cx - 14 * z, cy - 14 * z); ctx.lineTo(cx + 2 * z, cy - 20 * z); ctx.lineTo(cx - 2 * z, cy - 2 * z); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#646a74';
  ctx.beginPath(); ctx.moveTo(cx + 2 * z, cy - 20 * z); ctx.lineTo(cx + 18 * z, cy - 11 * z); ctx.lineTo(cx + 21 * z, cy + 3 * z); ctx.lineTo(cx + 4 * z, cy + 10 * z); ctx.lineTo(cx - 2 * z, cy - 2 * z); ctx.closePath(); ctx.fill();
  if (ore) {
    ctx.fillStyle = '#c2641f';
    ctx.beginPath(); ctx.arc(cx - 6 * z, cy - 6 * z, 2.6 * z, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 8 * z, cy - 4 * z, 2.2 * z, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 2 * z, cy - 13 * z, 2 * z, 0, Math.PI * 2); ctx.fill();
  }
}
function drawAnvil(cx, cy) {
  const z = zoom;
  ctx.fillStyle = '#7a5230'; ctx.fillRect(cx - 12 * z, cy - 10 * z, 24 * z, 12 * z);
  ctx.fillStyle = '#3a3f47';
  ctx.beginPath(); ctx.moveTo(cx - 16 * z, cy - 22 * z); ctx.lineTo(cx + 14 * z, cy - 22 * z); ctx.lineTo(cx + 22 * z, cy - 18 * z); ctx.lineTo(cx + 10 * z, cy - 16 * z); ctx.lineTo(cx + 8 * z, cy - 12 * z); ctx.lineTo(cx - 8 * z, cy - 12 * z); ctx.lineTo(cx - 10 * z, cy - 16 * z); ctx.lineTo(cx - 14 * z, cy - 18 * z); ctx.closePath(); ctx.fill();
}
function drawSmelter(cx, cy) {
  const z = zoom;
  ctx.fillStyle = '#7a808a';
  ctx.beginPath(); ctx.moveTo(cx - 18 * z, cy + 2 * z); ctx.lineTo(cx - 16 * z, cy - 30 * z); ctx.lineTo(cx + 16 * z, cy - 30 * z); ctx.lineTo(cx + 18 * z, cy + 2 * z); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a2d33'; ctx.beginPath(); ctx.ellipse(cx, cy - 10 * z, 9 * z, 7 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8632a'; ctx.beginPath(); ctx.ellipse(cx, cy - 9 * z, 6 * z, 4.5 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4b73d'; ctx.beginPath(); ctx.ellipse(cx, cy - 8 * z, 3 * z, 2.4 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#646a74'; ctx.fillRect(cx + 6 * z, cy - 40 * z, 8 * z, 12 * z);
}
function drawCampfire(cx, cy) {
  const z = zoom;
  ctx.fillStyle = '#7c8088';
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * 15 * z, cy + Math.sin(a) * 7 * z, 3.6 * z, 2.9 * z, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.lineCap = 'round'; ctx.strokeStyle = '#7a4f22'; ctx.lineWidth = 4.5 * z;
  ctx.beginPath(); ctx.moveTo(cx - 11 * z, cy + 2 * z); ctx.lineTo(cx + 11 * z, cy - 4 * z); ctx.moveTo(cx - 11 * z, cy - 4 * z); ctx.lineTo(cx + 11 * z, cy + 2 * z); ctx.stroke();
  const flame = (ox, h, w, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(cx + ox, cy - 2 * z); ctx.quadraticCurveTo(cx + ox - w, cy - h * 0.5, cx + ox, cy - h); ctx.quadraticCurveTo(cx + ox + w, cy - h * 0.5, cx + ox, cy - 2 * z); ctx.closePath(); ctx.fill(); };
  flame(0, 26 * z, 9 * z, '#e8632a'); flame(-3 * z, 18 * z, 6 * z, '#f4a23d'); flame(3 * z, 16 * z, 5 * z, '#f4a23d'); flame(0, 12 * z, 3.5 * z, '#ffe07a');
}
function drawChest(cx, cy) {
  const z = zoom, W = 30 * z, baseH = 16 * z, lidH = 11 * z, x = cx - W / 2, top = cy - 6 * z;
  ctx.fillStyle = '#7a4f24'; ctx.fillRect(x, top, W, baseH);
  ctx.fillStyle = '#5e3c1a'; ctx.fillRect(x, top + baseH - 4 * z, W, 4 * z);
  ctx.fillStyle = '#8a5a28'; ctx.beginPath(); ctx.moveTo(x, top); ctx.quadraticCurveTo(cx, top - lidH, x + W, top); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c9a24a'; ctx.fillRect(x + 3 * z, top - lidH * 0.4, 4 * z, baseH + lidH * 0.4); ctx.fillRect(x + W - 7 * z, top - lidH * 0.4, 4 * z, baseH + lidH * 0.4);
  ctx.fillStyle = '#b98e3c'; ctx.fillRect(cx - 2 * z, top - lidH * 0.5, 4 * z, baseH + lidH * 0.5);
  ctx.fillStyle = '#f1c40f'; ctx.fillRect(cx - 3 * z, top + baseH * 0.35, 6 * z, 6 * z);
}

function render() {
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!MAP) { requestAnimationFrame(render); return; }

  // Пол
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const t = MAP[y][x];
      if (t === 2) continue;
      fillDiamond(panX + isoX(x, y), panY + isoY(x, y), TOP[t], 'rgba(0,0,0,.18)');
    }
  }
  // Подсветка тайла под курсором
  if (hover.x >= 0 && hover.y >= 0 && hover.x < mapW && hover.y < mapH) {
    fillDiamond(panX + isoX(hover.x, hover.y), panY + isoY(hover.x, hover.y),
                'rgba(255,255,255,.25)', '#fff');
  }
  // Объекты (стены, деревья) по глубине
  const obj = [];
  for (let y = 0; y < mapH; y++)
    for (let x = 0; x < mapW; x++) {
      const t = MAP[y][x];
      if (t === 2) obj.push({ d: x + y, k: 2, x, y });
      else if (t === 3) obj.push({ d: x + y + 0.1, k: 3, x, y });
      else if (t === 5) obj.push({ d: x + y + 0.1, k: 5, x, y });
      else if (t === 6) obj.push({ d: x + y + 0.1, k: 6, x, y });
      else if (t === 7) obj.push({ d: x + y + 0.1, k: 7, x, y });
      else if (t === 8) obj.push({ d: x + y + 0.1, k: 8, x, y });
      else if (t === 9) obj.push({ d: x + y + 0.1, k: 9, x, y });
      else if (t === 10) obj.push({ d: x + y + 0.1, k: 10, x, y });
    }
  obj.sort((a, b) => a.d - b.d);
  for (const o of obj) {
    if (o.k === 2) drawCube(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), WALL_H);
    else if (o.k === 3) drawTree(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), o.x, o.y);
    else if (o.k === 7) drawAnvil(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y));
    else if (o.k === 8) drawSmelter(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y));
    else if (o.k === 9) drawCampfire(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y));
    else if (o.k === 10) drawChest(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y));
    else drawRock(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), o.k === 6);
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
