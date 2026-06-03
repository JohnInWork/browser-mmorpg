// MMORPG — редактор карт (только для админа)
// Подключается как mode=admin, проходит проверку пароля, рисует и сохраняет карту.

const socket = io({ query: { mode: 'admin' } });

// --- DOM ---
const paletteEl = document.getElementById('palette');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');
const locTabsEl = document.getElementById('locTabs');
const sidInput = document.getElementById('sidInput');
const mapWInput = document.getElementById('mapWInput');
const mapHInput = document.getElementById('mapHInput');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// --- Локации/карта ---
let LOCS = {};                 // { name: {map,floor,teleports,W,H} }
let curLoc = 'surface';        // редактируемая локация
let MAP = null, FLOOR = null, mapW = 0, mapH = 0;  // ссылки на текущую локацию
const GROUND = new Set([0, 1, 4, 15]);             // тайлы пола (+ пещера)
const TELES = new Set([13, 14, 16, 17, 18]);       // порталы-телепорты (вид отвязан от связи)
const PORTAL_COLORS = { 16: ['#2f6aa8', '#5fa8e0'], 17: ['#6f2f9e', '#a86fd0'], 18: ['#1f9e63', '#5fe0a0'] };
const isGround = (t) => GROUND.has(t);
const ERASE = -1;                                  // «ластик» — убрать объект (оставить пол)
const LOC_NAMES = { surface: 'Поверхность', mines: 'Шахты' };
function deriveFloor(map) { return map.map(row => row.map(t => (isGround(t) ? t : 0))); }

// --- Изометрия / камера ---
const TW = 64, TH = 32, WALL_H = 34, TREE_H = 46;

// Деревья: 2 текстуры (как в игре), вариант стабилен по координатам клетки
const treeImgs = ['/assets/tree1.svg', '/assets/tree2.svg'].map(src => { const im = new Image(); im._ready = false; im.onload = () => { im._ready = true; }; im.src = src; return im; });
const chestImg = new Image(); chestImg._ready = false; chestImg.onload = () => { chestImg._ready = true; }; chestImg.src = '/assets/chest.svg';
const anvilImg = new Image(); anvilImg._ready = false; anvilImg.onload = () => { anvilImg._ready = true; }; anvilImg.src = '/assets/anvil.svg';
const campfireImg = new Image(); campfireImg._ready = false; campfireImg.onload = () => { campfireImg._ready = true; }; campfireImg.src = '/assets/campfire.svg';
function treeVariant(x, y) { let h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0; h = (h ^ (h >>> 13)) >>> 0; return h & 1; }
let zoom = 1;
let panX = 0, panY = 0; // экранное смещение начала координат

// --- Палитра тайлов по категориям ---
const CATEGORIES = [
  { name: 'Земля',    items: [ { id: 0, name: 'Трава', color: '#5fa84e' }, { id: 4, name: 'Тропа', color: '#c6a96a' }, { id: 1, name: 'Вода', color: '#3a86c8' }, { id: 15, name: 'Пещера', color: '#3b3b46' } ] },
  { name: 'Стены',    items: [ { id: 2, name: 'Стена', color: '#9aa0ac' } ] },
  { name: 'Ресурсы',  items: [ { id: 3, name: 'Дерево', color: '#2f7d32' }, { id: 5, name: 'Камень', color: '#828892' }, { id: 6, name: 'Руда', color: '#c2641f' }, { id: 11, name: 'Песок', color: '#dcc480' } ] },
  { name: 'Верстаки', items: [ { id: 7, name: 'Наковальня', color: '#3a3f47' }, { id: 8, name: 'Плавильня', color: '#e8632a' }, { id: 9, name: 'Костёр', color: '#f4a23d' } ] },
  { name: 'Объекты', items: [ { id: 10, name: 'Сундук', color: '#8a5a28' }, { id: 12, name: 'Колодец', color: '#9aa0aa' } ] },
  { name: 'Порталы', items: [ { id: 13, name: 'Лестн.↓', color: '#5b8def' }, { id: 14, name: 'Лестн.↑', color: '#8fd06a' }, { id: 16, name: 'Синий', color: '#5fa8e0' }, { id: 17, name: 'Фиолет.', color: '#a86fd0' }, { id: 18, name: 'Зелёный', color: '#5fe0a0' } ] },
  { name: 'Спавн', items: [ { id: 19, name: 'Точка спавна', color: '#e74c3c' } ] },
  { name: 'Правка', items: [ { id: -1, name: 'Убрать объект', color: '#444' } ] },
];
let selected = 0; // выбранный id тайла

const TOP = { 0:'#5fa84e', 1:'#3a86c8', 2:'#9aa0ac', 3:'#5fa84e', 4:'#c6a96a', 5:'#5fa84e', 6:'#5fa84e', 7:'#5fa84e', 8:'#5fa84e', 9:'#5fa84e', 10:'#5fa84e', 11:'#5fa84e', 12:'#5fa84e', 13:'#5fa84e', 14:'#5fa84e', 15:'#3b3b46', 16:'#5fa84e', 17:'#5fa84e', 18:'#5fa84e', 19:'#5fa84e' };
const WALL = { top:'#9aa0ac', left:'#5d626d', right:'#787e8a' };

// Без логина: редактор открыт сразу. Палитра и размер — на загрузке, центрирование — когда придёт карта.
socket.emit('adminAuth');               // сервер выдаёт права (на всякий случай)
buildPalette();
resize();

socket.on('mapData', (data) => {
  LOCS = {};
  for (const k in (data.locations || {})) {
    const L = data.locations[k];
    LOCS[k] = { map: L.map.map(r => r.slice()), floor: (L.floor || deriveFloor(L.map)).map(r => r.slice()),
                teleports: (L.teleports || []).map(e => ({ ...e })), W: L.width, H: L.height };
  }
  switchLoc(LOCS.surface ? 'surface' : Object.keys(LOCS)[0]);
});

function buildLocTabs() {
  locTabsEl.innerHTML = '';
  for (const k in LOCS) {
    const b = document.createElement('button');
    b.className = 'loc-tab' + (k === curLoc ? ' active' : '');
    b.textContent = LOC_NAMES[k] || k;
    b.addEventListener('click', () => switchLoc(k));
    locTabsEl.appendChild(b);
  }
  const add = document.createElement('button');           // «+» — добавить новую локацию
  add.className = 'loc-tab loc-add'; add.textContent = '+'; add.title = 'Добавить локацию';
  add.addEventListener('click', addLocation);
  locTabsEl.appendChild(add);
  if (curLoc !== 'surface') {                             // удалить текущую (кроме стартовой)
    const del = document.createElement('button');
    del.className = 'loc-tab loc-del'; del.textContent = '✕'; del.title = 'Удалить текущую локацию';
    del.addEventListener('click', deleteLocation);
    locTabsEl.appendChild(del);
  }
}
// Пустая новая локация: комната 32×24 со стенами по краю и травой внутри (размер можно менять)
function blankLocation() {
  const W = 32, H = 24, map = [], floor = [];
  for (let y = 0; y < H; y++) {
    const mr = [], fr = [];
    for (let x = 0; x < W; x++) { const b = (x === 0 || y === 0 || x === W - 1 || y === H - 1); mr.push(b ? 2 : 0); fr.push(0); }
    map.push(mr); floor.push(fr);
  }
  return { map, floor, teleports: [], W, H };
}
function addLocation() {
  const name = (prompt('Название новой локации:', '') || '').trim();
  if (!name) return;
  if (LOCS[name]) { alert('Локация с таким названием уже есть'); return; }
  LOCS[name] = blankLocation();
  switchLoc(name);
}
function deleteLocation() {
  if (curLoc === 'surface') { alert('«Поверхность» удалить нельзя — это стартовая локация.'); return; }
  if (!confirm(`Удалить локацию «${LOC_NAMES[curLoc] || curLoc}»? Не забудь сохранить.`)) return;
  delete LOCS[curLoc];
  switchLoc('surface');
}
function switchLoc(name) {
  if (!LOCS[name]) return;
  curLoc = name;
  MAP = LOCS[name].map; FLOOR = LOCS[name].floor; mapW = LOCS[name].W; mapH = LOCS[name].H;
  mapWInput.value = mapW; mapHInput.value = mapH;     // поля размера = размер текущей локации
  centerMap();
  buildLocTabs();
}

// Изменить размер текущей локации (содержимое сохраняется, новые клетки — трава)
function applyResize() {
  const w = Math.max(5, Math.min(60, parseInt(mapWInput.value, 10) || mapW));
  const h = Math.max(5, Math.min(60, parseInt(mapHInput.value, 10) || mapH));
  mapWInput.value = w; mapHInput.value = h;
  if (w === mapW && h === mapH) return;
  const nm = [], nf = [];
  for (let y = 0; y < h; y++) {
    const mr = [], fr = [];
    for (let x = 0; x < w; x++) {
      const inOld = (y < MAP.length && x < MAP[0].length);
      mr.push(inOld ? MAP[y][x] : 0);
      fr.push(inOld ? FLOOR[y][x] : 0);
    }
    nm.push(mr); nf.push(fr);
  }
  const tele = LOCS[curLoc].teleports.filter(e => e.x < w && e.y < h);   // выкинуть телепорты за границей
  LOCS[curLoc] = { map: nm, floor: nf, teleports: tele, W: w, H: h };
  switchLoc(curLoc);
}
mapWInput.addEventListener('change', applyResize);
mapHInput.addEventListener('change', applyResize);
// Телепорты текущей локации
function removeTele(x, y) { LOCS[curLoc].teleports = LOCS[curLoc].teleports.filter(e => !(e.x === x && e.y === y)); }
function setTele(x, y, sid) { removeTele(x, y); LOCS[curLoc].teleports.push({ x, y, sid }); }
function teleAt(x, y) { return LOCS[curLoc].teleports.find(e => e.x === x && e.y === y); }
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
        if (TELES.has(t.id)) {                       // выбрал портал — сразу спросить связь (число ИЛИ слово)
          const v = prompt(`Связь для «${t.name}» (одинаковая метка у пары порталов, напр. 1 или «Лес»):`, sidInput.value || '1');
          if (v !== null && v.trim()) sidInput.value = v.trim();
        }
      });
      group.appendChild(el);
    });
    paletteEl.appendChild(group);
  });
}

saveBtn.addEventListener('click', () => {
  const out = {};
  for (const k in LOCS) out[k] = { map: LOCS[k].map, floor: LOCS[k].floor, teleports: LOCS[k].teleports };
  socket.emit('saveMap', { locations: out });
});

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
  if (selected === ERASE) {                          // ластик: убрать объект, оставить пол
    MAP[t.y][t.x] = FLOOR[t.y][t.x]; removeTele(t.x, t.y);
  } else if (isGround(selected)) {                   // пол: меняем землю (под объектом — тоже, объект сохраняется)
    FLOOR[t.y][t.x] = selected;
    if (isGround(MAP[t.y][t.x])) MAP[t.y][t.x] = selected;
  } else if (TELES.has(selected)) {                  // портал: кладём + записываем связь (метка-строка)
    MAP[t.y][t.x] = selected;
    setTele(t.x, t.y, (sidInput.value || '').trim() || '1');
  } else {                                           // прочий объект: поверх пола; если была лестница — убрать связь
    MAP[t.y][t.x] = selected; removeTele(t.x, t.y);
  }
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
  const z = zoom, W = 32 * z, H = 32 * z, top = cy - H / 2 - 5 * z;
  if (anvilImg._ready) ctx.drawImage(anvilImg, cx - W / 2, top, W, H);
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
  const z = zoom, W = 34 * z, H = 34 * z, top = cy - H / 2 - 5 * z;
  if (campfireImg._ready) ctx.drawImage(campfireImg, cx - W / 2, top, W, H);
}
function drawChest(cx, cy) {
  const z = zoom, W = 32 * z, H = 32 * z, top = cy - H / 2 - 5 * z;
  if (chestImg._ready) ctx.drawImage(chestImg, cx - W / 2, top, W, H);
}
function drawSandPile(cx, cy) {
  const z = zoom;
  ctx.fillStyle = '#c9ad6a'; ctx.beginPath(); ctx.ellipse(cx, cy + 2 * z, 15 * z, 7 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#dcc480'; ctx.beginPath(); ctx.moveTo(cx - 13 * z, cy + 3 * z); ctx.quadraticCurveTo(cx, cy - 14 * z, cx + 13 * z, cy + 3 * z); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ecdca0'; ctx.beginPath(); ctx.moveTo(cx - 6 * z, cy - 1 * z); ctx.quadraticCurveTo(cx - 1 * z, cy - 11 * z, cx + 5 * z, cy - 2 * z); ctx.closePath(); ctx.fill();
}
function drawWell(cx, cy) {
  const z = zoom;
  ctx.fillStyle = '#9aa0aa'; ctx.beginPath(); ctx.ellipse(cx, cy, 13 * z, 8 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6e747e'; ctx.beginPath(); ctx.ellipse(cx, cy, 9 * z, 5 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4a90cf'; ctx.beginPath(); ctx.ellipse(cx, cy, 6.5 * z, 3.6 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7a4f22'; ctx.fillRect(cx - 12 * z, cy - 26 * z, 3 * z, 28 * z); ctx.fillRect(cx + 9 * z, cy - 26 * z, 3 * z, 28 * z);
  ctx.fillStyle = '#8a5a28'; ctx.beginPath(); ctx.moveTo(cx - 17 * z, cy - 23 * z); ctx.lineTo(cx, cy - 34 * z); ctx.lineTo(cx + 17 * z, cy - 23 * z); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#6e451e'; ctx.fillRect(cx - 17 * z, cy - 23 * z, 34 * z, 3 * z);
}
function drawSpawn(cx, cy) {                          // маркер точки спавна (только в редакторе) — красный, чтобы не сливался с травой
  const z = zoom;
  ctx.fillStyle = 'rgba(231,76,60,.4)'; ctx.beginPath(); ctx.ellipse(cx, cy, 12 * z, 6 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * z; ctx.stroke();
  ctx.strokeStyle = '#1a1a24'; ctx.lineWidth = 2 * z; ctx.beginPath(); ctx.moveTo(cx, cy + 2 * z); ctx.lineTo(cx, cy - 18 * z); ctx.stroke();
  ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.moveTo(cx, cy - 18 * z); ctx.lineTo(cx + 12 * z, cy - 14 * z); ctx.lineTo(cx, cy - 10 * z); ctx.closePath(); ctx.fill();
}
function drawPortal(cx, cy, outer, inner) {
  const z = zoom;
  ctx.fillStyle = outer; ctx.beginPath(); ctx.ellipse(cx, cy, 15 * z, 8 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = inner; ctx.beginPath(); ctx.ellipse(cx, cy, 11 * z, 6 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#15152a'; ctx.beginPath(); ctx.ellipse(cx, cy, 7 * z, 4 * z, 0, 0, Math.PI * 2); ctx.fill();
}
function drawStairs(cx, cy, down) {
  const z = zoom, n = 4, sh = 5 * z;
  ctx.fillStyle = down ? '#23232a' : '#7c828b';
  ctx.beginPath(); ctx.moveTo(cx, cy - 13 * z); ctx.lineTo(cx + 16 * z, cy); ctx.lineTo(cx, cy + 13 * z); ctx.lineTo(cx - 16 * z, cy); ctx.closePath(); ctx.fill();
  const top = cy - (n * sh) / 2;
  for (let i = 0; i < n; i++) {
    const w = (24 - i * 4) * z, y = top + i * sh, v = down ? Math.max(20, 70 - i * 16) : Math.min(220, 120 + i * 26);
    ctx.fillStyle = `rgb(${v},${v},${v + 8})`;
    ctx.beginPath(); ctx.moveTo(cx, y - sh * 0.5); ctx.lineTo(cx + w / 2, y); ctx.lineTo(cx, y + sh * 0.5); ctx.lineTo(cx - w / 2, y); ctx.closePath(); ctx.fill();
  }
}

function render() {
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!MAP) { requestAnimationFrame(render); return; }

  // Пол (из слоя FLOOR — под объектами сохраняется земля)
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      if (MAP[y][x] === 2) continue;                  // под стеной пол не рисуем
      fillDiamond(panX + isoX(x, y), panY + isoY(x, y), TOP[FLOOR[y][x]] || TOP[0], 'rgba(0,0,0,.18)');
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
      else if (t === 11) obj.push({ d: x + y + 0.1, k: 11, x, y });
      else if (t === 12) obj.push({ d: x + y + 0.1, k: 12, x, y });
      else if (t === 13) obj.push({ d: x + y + 0.1, k: 13, x, y });
      else if (t === 14) obj.push({ d: x + y + 0.1, k: 14, x, y });
      else if (t === 16 || t === 17 || t === 18) obj.push({ d: x + y + 0.1, k: t, x, y });
      else if (t === 19) obj.push({ d: x + y + 0.2, k: 19, x, y });
    }
  obj.sort((a, b) => a.d - b.d);
  for (const o of obj) {
    if (o.k === 2) drawCube(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), WALL_H);
    else if (o.k === 3) drawTree(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), o.x, o.y);
    else if (o.k === 7) drawAnvil(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y));
    else if (o.k === 8) drawSmelter(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y));
    else if (o.k === 9) drawCampfire(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y));
    else if (o.k === 10) drawChest(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y));
    else if (o.k === 11) drawSandPile(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y));
    else if (o.k === 12) drawWell(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y));
    else if (o.k === 13 || o.k === 14 || o.k === 16 || o.k === 17 || o.k === 18) {
      const sx = panX + isoX(o.x, o.y), sy = panY + isoY(o.x, o.y);
      if (o.k === 13 || o.k === 14) drawStairs(sx, sy, o.k === 13);
      else { const c = PORTAL_COLORS[o.k]; drawPortal(sx, sy, c[0], c[1]); }
      const te = teleAt(o.x, o.y);                 // показать ID связи на портале
      if (te) { ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(12 * zoom)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(te.sid, sx, sy - 16 * zoom); }
    }
    else if (o.k === 19) drawSpawn(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y));
    else drawRock(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), o.k === 6);
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
