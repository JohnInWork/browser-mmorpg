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
const GROUND = new Set([0, 1, 4, 15, 20, 21, 22, 23]); // тайлы пола (+ пещера, земля, тёмн.трава, цветы, брусчатка)
const TELES = new Set([13, 14, 16, 17, 18]);       // порталы-телепорты (вид отвязан от связи)
const isGround = (t) => GROUND.has(t);
const ERASE = -1;                                  // «ластик» — убрать объект (оставить пол)
const EDIT = -2;                                   // «изменить» — правка параметров поставленного объекта
const SIGN = 30;                                   // табличка с текстом
const LOC_NAMES = { surface: 'Поверхность', mines: 'Шахты' };
function deriveFloor(map) { return map.map(row => row.map(t => (isGround(t) ? t : 0))); }

// --- Изометрия / камера ---
const TW = 64, TH = 32, WALL_H = 34, TREE_H = 46;

// Деревья: 2 текстуры (как в игре), вариант стабилен по координатам клетки
const onAsset = () => { if (typeof refreshPaletteIcons === 'function') refreshPaletteIcons(); }; // обновить иконки палитры после загрузки SVG
const treeImgs = ['/assets/tree1.svg', '/assets/tree2.svg'].map(src => { const im = new Image(); im._ready = false; im.onload = () => { im._ready = true; onAsset(); }; im.src = src; return im; });
const chestImg = new Image(); chestImg._ready = false; chestImg.onload = () => { chestImg._ready = true; onAsset(); }; chestImg.src = '/assets/chest.svg';
const anvilImg = new Image(); anvilImg._ready = false; anvilImg.onload = () => { anvilImg._ready = true; onAsset(); }; anvilImg.src = '/assets/anvil.svg';
const campfireImg = new Image(); campfireImg._ready = false; campfireImg.onload = () => { campfireImg._ready = true; onAsset(); }; campfireImg.src = '/assets/campfire.svg';
const mkImg = (src) => { const im = new Image(); im._ready = false; im.onload = () => { im._ready = true; onAsset(); }; im.src = src; return im; };
const MOB_IMG = { passive: mkImg('/assets/chicken.svg'), aggressive: mkImg('/assets/wolf.svg'), bear: mkImg('/assets/bear.svg') };
const MOB_INFO = { passive: { name: 'Курица', color: '#f1c40f' }, aggressive: { name: 'Волк', color: '#888' }, bear: { name: 'Медведь', color: '#6b4a2b' }, friendly: { name: 'Мирный', color: '#2ecc71' }, trader: { name: 'Торговец', color: '#c79a2a' }, questgiver: { name: 'Лесник', color: '#3f9e63' } };
// Спрайты объектов из SVG-файлов (id тайла → картинка) — единый источник с игрой
const OBJ_IMG = { 3: treeImgs[0], 5: mkImg('/assets/rock.svg'), 6: mkImg('/assets/ore.svg'), 7: anvilImg, 8: mkImg('/assets/smelter.svg'), 9: campfireImg, 10: chestImg, 11: mkImg('/assets/sandpile.svg'), 12: mkImg('/assets/well.svg'), 13: mkImg('/assets/stairs-down.svg'), 14: mkImg('/assets/stairs-up.svg'), 16: mkImg('/assets/portal-blue.svg'), 17: mkImg('/assets/portal-purple.svg'), 18: mkImg('/assets/portal-green.svg'), 19: mkImg('/assets/spawn.svg'), 24: mkImg('/assets/mountain.svg'), 25: mkImg('/assets/bush.svg'), 26: mkImg('/assets/boulder.svg'), 27: mkImg('/assets/fence.svg'), 28: mkImg('/assets/lamp.svg'), 29: mkImg('/assets/bridge.svg'), 30: mkImg('/assets/sign.svg') };
function objSprite(im, cx, cy, sz) { if (im && im._ready) { const W = sz * zoom, H = sz * zoom; ctx.drawImage(im, cx - W / 2, cy - H / 2 - 5 * zoom, W, H); } }
function treeVariant(x, y) { let h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0; h = (h ^ (h >>> 13)) >>> 0; return h & 1; }
let zoom = 1;
let panX = 0, panY = 0; // экранное смещение начала координат

// --- Палитра тайлов по категориям ---
const CATEGORIES = [
  { name: 'Земля',    items: [ { id: 0, name: 'Трава', color: '#5fa84e' }, { id: 21, name: 'Тёмн. трава', color: '#3f7e3a' }, { id: 22, name: 'Цветы', color: '#62ab51' }, { id: 4, name: 'Тропа', color: '#c6a96a' }, { id: 20, name: 'Земля', color: '#9c7a4d' }, { id: 23, name: 'Брусчатка', color: '#8d8f97' }, { id: 1, name: 'Вода', color: '#3a86c8' }, { id: 15, name: 'Пещера', color: '#3b3b46' } ] },
  { name: 'Стены',    items: [ { id: 2, name: 'Стена', color: '#9aa0ac' }, { id: 24, name: 'Горы', color: '#7c8088' }, { id: 27, name: 'Забор', color: '#9a6b3a' } ] },
  { name: 'Ресурсы',  items: [ { id: 3, name: 'Дерево', color: '#2f7d32' }, { id: 5, name: 'Камень', color: '#828892' }, { id: 6, name: 'Руда', color: '#c2641f' }, { id: 11, name: 'Песок', color: '#dcc480' } ] },
  { name: 'Природа',  items: [ { id: 25, name: 'Куст', color: '#3f8a39' }, { id: 26, name: 'Валун', color: '#8a909a' } ] },
  { name: 'Верстаки', items: [ { id: 7, name: 'Наковальня', color: '#3a3f47' }, { id: 8, name: 'Плавильня', color: '#e8632a' }, { id: 9, name: 'Костёр', color: '#f4a23d' } ] },
  { name: 'Объекты', items: [ { id: 10, name: 'Сундук', color: '#8a5a28' }, { id: 12, name: 'Колодец', color: '#9aa0aa' }, { id: 28, name: 'Фонарь', color: '#f0c24a' }, { id: 29, name: 'Мост', color: '#a9743f' }, { id: 30, name: 'Табличка', color: '#9a6b3a' } ] },
  { name: 'Порталы', items: [ { id: 13, name: 'Лестн.↓', color: '#5b8def' }, { id: 14, name: 'Лестн.↑', color: '#8fd06a' }, { id: 16, name: 'Синий', color: '#5fa8e0' }, { id: 17, name: 'Фиолет.', color: '#a86fd0' }, { id: 18, name: 'Зелёный', color: '#5fe0a0' } ] },
  { name: 'Спавн', items: [ { id: 19, name: 'Точка спавна', color: '#e74c3c' } ] },
  { name: 'Существа', items: [ { id: 'mob:passive', name: 'Курица', color: '#f1c40f' }, { id: 'mob:aggressive', name: 'Волк', color: '#888c94' }, { id: 'mob:bear', name: 'Медведь', color: '#6b4a2b' }, { id: 'mob:friendly', name: 'Мирный', color: '#2ecc71' }, { id: 'mob:trader', name: 'Торговец', color: '#c79a2a' }, { id: 'mob:questgiver', name: 'Лесник', color: '#3f9e63' } ] },
  { name: 'Правка', items: [ { id: -1, name: 'Убрать объект', color: '#444' }, { id: -2, name: 'Изменить (текст/связь)', color: '#3aa' } ] },
];
let selected = 0; // выбранный id тайла
let iconCanvases = [];                          // {c: canvas, id} — мини-иконки палитры (перерисовка после загрузки SVG)

const TOP = { 0:'#5fa84e', 1:'#3a86c8', 2:'#9aa0ac', 3:'#5fa84e', 4:'#c6a96a', 5:'#5fa84e', 6:'#5fa84e', 7:'#5fa84e', 8:'#5fa84e', 9:'#5fa84e', 10:'#5fa84e', 11:'#5fa84e', 12:'#5fa84e', 13:'#5fa84e', 14:'#5fa84e', 15:'#3b3b46', 16:'#5fa84e', 17:'#5fa84e', 18:'#5fa84e', 19:'#5fa84e', 20:'#9c7a4d', 21:'#3f7e3a', 22:'#62ab51', 23:'#8d8f97', 24:'#5fa84e', 25:'#5fa84e', 26:'#5fa84e', 27:'#5fa84e', 28:'#5fa84e', 29:'#3a86c8', 30:'#5fa84e' };
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
                teleports: (L.teleports || []).map(e => ({ ...e })), mobs: (L.mobs || []).map(m => ({ ...m })),
                signs: (L.signs || []).map(s => ({ ...s })), W: L.width, H: L.height };
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
  return { map, floor, teleports: [], mobs: [], signs: [], W, H };
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
  const mobs = LOCS[curLoc].mobs.filter(m => m.x < w && m.y < h);
  const signs = LOCS[curLoc].signs.filter(s => s.x < w && s.y < h);
  LOCS[curLoc] = { map: nm, floor: nf, teleports: tele, mobs, signs, W: w, H: h };
  switchLoc(curLoc);
}
mapWInput.addEventListener('change', applyResize);
mapHInput.addEventListener('change', applyResize);
// Телепорты текущей локации
function removeTele(x, y) { LOCS[curLoc].teleports = LOCS[curLoc].teleports.filter(e => !(e.x === x && e.y === y)); }
function setTele(x, y, sid) { removeTele(x, y); LOCS[curLoc].teleports.push({ x, y, sid }); }
function teleAt(x, y) { return LOCS[curLoc].teleports.find(e => e.x === x && e.y === y); }
// Мобы текущей локации
function removeMob(x, y) { LOCS[curLoc].mobs = LOCS[curLoc].mobs.filter(m => !(m.x === x && m.y === y)); }
function setMob(x, y, type) { removeMob(x, y); LOCS[curLoc].mobs.push({ x, y, type }); }
// Таблички текущей локации
function removeSign(x, y) { LOCS[curLoc].signs = LOCS[curLoc].signs.filter(s => !(s.x === x && s.y === y)); }
function setSign(x, y, text) { removeSign(x, y); LOCS[curLoc].signs.push({ x, y, text: String(text || '') }); }
function signAt(x, y) { return LOCS[curLoc].signs.find(s => s.x === x && s.y === y); }
socket.on('saveResult', ({ ok }) => {
  statusEl.textContent = ok ? '✓ Сохранено' : '✗ Ошибка';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
});

// --- Иконки для кнопок палитры (как в игре) ---
function bg(c, color) { c.fillStyle = color; c.beginPath(); c.moveTo(15, 4); c.lineTo(27, 15); c.lineTo(15, 26); c.lineTo(3, 15); c.closePath(); c.fill(); } // ромб-пол
function drawIcon(c, id) {
  c.clearRect(0, 0, 30, 30);
  const TAU = Math.PI * 2;
  // Тайлы пола — это и есть цвет-иконка (оставляем заливку ромбом)
  if (GROUND.has(id)) return bg(c, TOP[id]);
  // Всё остальное — БЕЗ фона травы (рисуем сам объект на прозрачном; тёмный фон кнопки сам по себе)
  if (id === 2) { c.fillStyle = '#5d626d'; c.fillRect(7, 9, 16, 14); c.fillStyle = '#787e8a'; c.fillRect(7, 6, 16, 9); c.fillStyle = '#9aa0ac'; c.fillRect(7, 4, 16, 4); return; }
  if (typeof id === 'string' && id.startsWith('mob:')) {
    const t = id.slice(4), mi = MOB_IMG[t], info = MOB_INFO[t] || { color: '#888' };
    if (mi && mi._ready) return void c.drawImage(mi, 3, 1, 24, 24);
    c.fillStyle = info.color; c.beginPath(); c.arc(15, 14, 8, 0, TAU); c.fill(); c.strokeStyle = '#1a1a24'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(12, 13, 1.3, 0, TAU); c.arc(18, 13, 1.3, 0, TAU); c.fill(); return;
  }
  if (id === -1) { c.strokeStyle = '#e74c3c'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(9, 9); c.lineTo(21, 21); c.moveTo(21, 9); c.lineTo(9, 21); c.stroke(); return; }
  if (id === -2) { // карандаш «изменить»
    c.fillStyle = '#3ad0c0'; c.beginPath(); c.moveTo(8, 22); c.lineTo(18, 12); c.lineTo(21, 15); c.lineTo(11, 25); c.closePath(); c.fill();
    c.fillStyle = '#cfa14a'; c.beginPath(); c.moveTo(19, 11); c.lineTo(22, 8); c.lineTo(25, 11); c.lineTo(22, 14); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(8, 22); c.lineTo(11, 25); c.lineTo(7, 26); c.closePath(); c.fill(); return; }
  // Все объекты — из единых SVG (OBJ_IMG). Перерисовал svg-файл → иконка обновилась везде.
  const im = OBJ_IMG[id];
  if (im && im._ready) c.drawImage(im, 2, 0, 26, 26);
}
function refreshPaletteIcons() { for (const o of iconCanvases) drawIcon(o.c.getContext('2d'), o.id); }

// --- Палитра (кнопки) ---
function buildPalette() {
  paletteEl.innerHTML = '';
  iconCanvases = [];
  CATEGORIES.forEach((cat) => {
    const group = document.createElement('div');
    group.className = 'pal-group';
    group.innerHTML = `<span class="pal-cat">${cat.name}</span>`;
    cat.items.forEach((t) => {
      const el = document.createElement('div');
      el.className = 'swatch' + (t.id === selected ? ' active' : '');
      const ic = document.createElement('canvas'); ic.width = 30; ic.height = 30; ic.className = 'dot-ic';
      drawIcon(ic.getContext('2d'), t.id);
      iconCanvases.push({ c: ic, id: t.id });
      el.appendChild(ic);
      el.appendChild(document.createTextNode(' ' + t.name));
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
  for (const k in LOCS) out[k] = { map: LOCS[k].map, floor: LOCS[k].floor, teleports: LOCS[k].teleports, mobs: LOCS[k].mobs, signs: LOCS[k].signs };
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
  else if (e.button === 0) {
    // Инструменты с диалогом (табличка/изменить) — только одиночный клик, БЕЗ протяжки:
    // prompt() блокирует поток и «съедает» mouseup, иначе курсор продолжал бы рисовать.
    const dialogTool = (selected === SIGN || selected === EDIT);
    if (!dialogTool) painting = true;
    paintAt(e, true);   // true = одиночный клик (можно спросить текст/правку)
  }
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
  if (painting) paintAt(e, false);   // протяжка — без диалогов
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

function paintAt(e, isClick) {
  const r = canvas.getBoundingClientRect();
  const t = screenToTile(e.clientX - r.left, e.clientY - r.top);
  if (t.x < 0 || t.y < 0 || t.x >= mapW || t.y >= mapH) return;
  if (selected === EDIT) { if (isClick) editParams(t.x, t.y); return; }  // «Изменить»: правка параметров поставленного объекта
  if (typeof selected === 'string' && selected.startsWith('mob:')) { // существо: ставим маркер (тайл не меняем)
    setMob(t.x, t.y, selected.slice(4)); return;
  }
  if (selected === ERASE) {                          // ластик: убрать объект/моба, оставить пол
    MAP[t.y][t.x] = FLOOR[t.y][t.x]; removeTele(t.x, t.y); removeMob(t.x, t.y); removeSign(t.x, t.y);
  } else if (isGround(selected)) {                   // пол: меняем землю (под объектом — тоже, объект сохраняется)
    FLOOR[t.y][t.x] = selected;
    if (isGround(MAP[t.y][t.x])) MAP[t.y][t.x] = selected;
  } else if (TELES.has(selected)) {                  // портал: кладём + записываем связь (метка-строка)
    MAP[t.y][t.x] = selected;
    setTele(t.x, t.y, (sidInput.value || '').trim() || '1');
  } else if (selected === SIGN) {                    // табличка: кладём + спрашиваем текст (только при клике)
    MAP[t.y][t.x] = SIGN; removeTele(t.x, t.y);
    if (isClick) { const cur = signAt(t.x, t.y); const txt = prompt('Текст таблички (его увидит игрок):', cur ? cur.text : ''); if (txt !== null) setSign(t.x, t.y, txt); else if (!cur) setSign(t.x, t.y, ''); }
    else if (!signAt(t.x, t.y)) setSign(t.x, t.y, '');
  } else {                                           // прочий объект: поверх пола; если была лестница — убрать связь
    MAP[t.y][t.x] = selected; removeTele(t.x, t.y);
  }
}

// «Изменить» — правка параметров уже поставленного объекта на клетке
function editParams(x, y) {
  const t = MAP[y][x];
  if (t === SIGN) {
    const cur = signAt(x, y);
    const txt = prompt('Текст таблички (его увидит игрок):', cur ? cur.text : '');
    if (txt !== null) setSign(x, y, txt);
  } else if (TELES.has(t)) {
    const te = teleAt(x, y);
    const sid = prompt('ID связи (порталы/лестницы с одинаковым ID соединены):', te ? te.sid : '');
    if (sid !== null) setTele(x, y, sid.trim() || '1');
  } else {
    alert('На этой клетке нечего настраивать.\nИзменяемые объекты: табличка (текст), порталы и лестницы (ID связи).');
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
function drawRock(cx, cy, ore) { objSprite(OBJ_IMG[ore ? 6 : 5], cx, cy, 42); }
function drawAnvil(cx, cy) {
  const z = zoom, W = 32 * z, H = 32 * z, top = cy - H / 2 - 5 * z;
  if (anvilImg._ready) ctx.drawImage(anvilImg, cx - W / 2, top, W, H);
}
function drawMobMarker(cx, cy, type) {                 // существо в редакторе: спрайт/кружок + подпись
  const z = zoom, info = MOB_INFO[type] || { name: type, color: '#888' }, img = MOB_IMG[type];
  if (img && img._ready) { const W = 30 * z, H = 30 * z; ctx.drawImage(img, cx - W / 2, cy + 8 * z - H, W, H); }
  else {
    ctx.fillStyle = info.color; ctx.beginPath(); ctx.arc(cx, cy - 8 * z, 9 * z, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a1a24'; ctx.lineWidth = 1.5 * z; ctx.stroke();
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(cx - 3 * z, cy - 9 * z, 1.4 * z, 0, Math.PI * 2); ctx.arc(cx + 3 * z, cy - 9 * z, 1.4 * z, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = `bold ${Math.round(10 * z)}px sans-serif`; ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 3 * z; ctx.strokeText(info.name, cx, cy + 16 * z);
  ctx.fillStyle = '#fff'; ctx.fillText(info.name, cx, cy + 16 * z);
}
function drawSmelter(cx, cy) { objSprite(OBJ_IMG[8], cx, cy, 40); }
function drawCampfire(cx, cy) {
  const z = zoom, W = 34 * z, H = 34 * z, top = cy - H / 2 - 5 * z;
  if (campfireImg._ready) ctx.drawImage(campfireImg, cx - W / 2, top, W, H);
}
function drawChest(cx, cy) {
  const z = zoom, W = 32 * z, H = 32 * z, top = cy - H / 2 - 5 * z;
  if (chestImg._ready) ctx.drawImage(chestImg, cx - W / 2, top, W, H);
}
function drawSandPile(cx, cy) { objSprite(OBJ_IMG[11], cx, cy, 36); }
function drawWell(cx, cy) { objSprite(OBJ_IMG[12], cx, cy, 42); }
function drawSpawn(cx, cy) { objSprite(OBJ_IMG[19], cx, cy, 38); }       // точка спавна (маркер из SVG)
function drawPortal(cx, cy, tile) { objSprite(OBJ_IMG[tile], cx, cy, 36); }
function drawStairs(cx, cy, down) { objSprite(OBJ_IMG[down ? 13 : 14], cx, cy, 34); }

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
      else if (t === 24 || t === 25 || t === 26 || t === 27 || t === 28 || t === 30) obj.push({ d: x + y + 0.1, k: t, x, y });
      else if (t === 29) obj.push({ d: x + y - 0.4, k: 29, x, y });
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
      else drawPortal(sx, sy, o.k);
      const te = teleAt(o.x, o.y);                 // показать ID связи на портале
      if (te) { ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(12 * zoom)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(te.sid, sx, sy - 16 * zoom); }
    }
    else if (o.k === 19) drawSpawn(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y));
    else if (o.k === 24) objSprite(OBJ_IMG[24], panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), 64);
    else if (o.k === 25) objSprite(OBJ_IMG[25], panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), 34);
    else if (o.k === 26) objSprite(OBJ_IMG[26], panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), 38);
    else if (o.k === 27) objSprite(OBJ_IMG[27], panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), 42);
    else if (o.k === 28) objSprite(OBJ_IMG[28], panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), 44);
    else if (o.k === 29) { const im = OBJ_IMG[29]; if (im && im._ready) { const sx = panX + isoX(o.x, o.y), sy = panY + isoY(o.x, o.y), W = 66 * zoom, H = 42 * zoom; ctx.drawImage(im, sx - W / 2, sy - H / 2, W, H); } }
    else if (o.k === 30) {
      const sx = panX + isoX(o.x, o.y), sy = panY + isoY(o.x, o.y);
      objSprite(OBJ_IMG[30], sx, sy, 32);
      const s = signAt(o.x, o.y);                  // показать начало текста над табличкой
      if (s && s.text) { const tx = s.text.replace(/\n/g, ' ').slice(0, 14) + (s.text.length > 14 ? '…' : ''); ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(11 * zoom)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(tx, sx, sy - 22 * zoom); }
    }
    else drawRock(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), o.k === 6);
  }
  // Существа (поверх объектов)
  const ms = (LOCS[curLoc] && LOCS[curLoc].mobs) || [];
  for (const m of ms) drawMobMarker(panX + isoX(m.x, m.y), panY + isoY(m.x, m.y), m.type);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);
