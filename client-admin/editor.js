// MMORPG — редактор карт (только для админа)
// Подключается как mode=admin, проходит проверку пароля, рисует и сохраняет карту.
import { buildCharacterSVG, getCharImage, PALETTES, DEFAULT_APPEARANCE, CHAR_RATIO, CHAR_FEET, HAIR_STYLES } from '/js/character.js';
import { MOB_TEXTURES, MOB_TEX_BY_ID } from '/js/mob-textures.js';
import { FLOOR_TEX } from '/js/floor-textures.js';

const socket = io({ query: { mode: 'admin' } });

// --- Данные для конструктора НПС ---
// Экипируемые предметы по слотам (id → имя). Только те, у кого есть визуал на персонаже.
const EQUIP_ITEMS = {
  helmet: [['', '— нет —'], ['helmet', 'Железный шлем'], ['leatherHat', 'Кожаный капюшон'], ['silverHelmet', 'Серебряный шлем'], ['bearHelmet', 'Медвежий шлем']],
  chest: [['', '— нет —'], ['chest', 'Железный нагрудник'], ['leatherTunic', 'Кожаный нагрудник'], ['silverChest', 'Серебряный нагрудник'], ['merchantRobe', 'Кафтан торговца'], ['forestTunic', 'Лесная туника']],
  gloves: [['', '— нет —'], ['leatherMitts', 'Кожаные перчатки'], ['silverGloves', 'Серебряные перчатки'], ['blueGloves', 'Синие перчатки']],
  pants: [['', '— нет —'], ['leatherLegs', 'Кожаные поножи'], ['silverLegs', 'Серебряные поножи'], ['goldPants', 'Золотые штаны'], ['brownPants', 'Кожаные штаны'], ['redPants', 'Красные штаны']],
  boots: [['', '— нет —'], ['leatherShoes', 'Кожаные сапоги'], ['silverBoots', 'Серебряные сапоги'], ['leatherBoots', 'Кожаные сапоги (одежда)']],
  cloak: [['', '— нет —'], ['cloak', 'Плащ']],
  mainHand: [['', '— нет —'], ['ironSword', 'Железный меч'], ['ironGreatsword', 'Двуручный меч']],
  offHand: [['', '— нет —'], ['ironShield', 'Железный щит']],
};
const SLOT_NAMES = { helmet: 'Шлем', chest: 'Тело', gloves: 'Перчатки', pants: 'Ноги', boots: 'Обувь', cloak: 'Плащ', mainHand: 'Прав. рука', offHand: 'Лев. рука' };
const EQUIP_ORDER = ['helmet', 'chest', 'gloves', 'pants', 'boots', 'cloak', 'mainHand', 'offHand'];
const GATHER_TARGETS = [['wood', 'Древесина'], ['stone', 'Камень'], ['ore', 'Железная руда'], ['sand', 'Песок']];
const KILL_TARGETS = [['passive', 'Курица'], ['aggressive', 'Волк'], ['bear', 'Медведь']];
// Предметы, которые можно выдать в награду
const REWARD_ITEMS = [['', '— нет —'], ['wood', 'Древесина'], ['stone', 'Камень'], ['ore', 'Железная руда'], ['sand', 'Песок'],
  ['leather', 'Кожа'], ['silverOre', 'Серебряная руда'], ['silverIngot', 'Серебряный слиток'], ['ironSword', 'Железный меч'], ['ironShield', 'Железный щит'], ['bearHelmet', 'Медвежий шлем'], ['helmet', 'Железный шлем'], ['chest', 'Железный нагрудник'], ['leatherHat', 'Кожаный капюшон'], ['leatherTunic', 'Кожаный нагрудник'], ['silverHelmet', 'Серебряный шлем'], ['silverChest', 'Серебряный нагрудник']];

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
const GROUND = new Set([0, 1, 4, 15, 20, 21, 22, 23, 31]); // тайлы пола (+ пещера, земля, тёмн.трава, цветы, брусчатка, песок)
const TELES = new Set([13, 14, 16, 17, 18]);       // порталы-телепорты (вид отвязан от связи)
const isGround = (t) => GROUND.has(t);
const ERASE = -1;                                  // «ластик» — убрать объект (оставить пол)
const EDIT = -2;                                   // «изменить» — правка параметров поставленного объекта
const POINTER = -3;                                // указатель — нейтральный режим (клик ничего не делает)
const EYEDROPPER = -4;                             // пипетка/копирование — скопировать объект под курсором
let clipboard = null;                              // буфер пипетки: {kind:'mob'|'npc'|'spot'|'sign', data}
const SIGN = 30;                                   // табличка с текстом
const RETURN_STONE = 36;                           // камень возвращения (с именем точки)
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
// Иконки и подписи текстур мобов строятся из единого реестра (client/js/mob-textures.js)
const MOB_IMG = {}, SPRITE_INFO = {};
for (const t of MOB_TEXTURES) { MOB_IMG[t.id] = mkImg(t.svg); SPRITE_INFO[t.id] = { name: t.name, color: '#888c94' }; }
// Библиотека сохранённых мобов: создал моба → он попадает сюда и появляется в палитре отдельной кнопкой.
// Живёт в localStorage (между перезагрузками и на всех картах).
let savedMobs = [];
try { savedMobs = JSON.parse(localStorage.getItem('mmorpg_savedMobs') || '[]'); } catch (e) { savedMobs = []; }
function persistSavedMobs() { try { localStorage.setItem('mmorpg_savedMobs', JSON.stringify(savedMobs)); } catch (e) {} }
function mobLabelFor(m) { return (m && m.name) || (m && SPRITE_INFO[m.sprite] && SPRITE_INFO[m.sprite].name) || 'Моб'; }
// Библиотека сохранённых рыбных мест: настроил таблицу рыбы один раз → штампуешь его в любом месте.
let savedSpots = [];
try { savedSpots = JSON.parse(localStorage.getItem('mmorpg_savedSpots') || '[]'); } catch (e) { savedSpots = []; }
function persistSavedSpots() { try { localStorage.setItem('mmorpg_savedSpots', JSON.stringify(savedSpots)); } catch (e) {} }
function spotLabelFor(s) { return (s && s.name) || 'Рыбное место'; }
// Рыба, доступная для таблицы рыбного места (id → подпись)
const FISH_ITEMS = [['sprat', 'Килька'], ['perch', 'Окунь'], ['trout', 'Форель'], ['salmon', 'Лосось']];
// Спрайты объектов из SVG-файлов (id тайла → картинка) — единый источник с игрой
const OBJ_IMG = { 3: treeImgs[0], 5: mkImg('/assets/rock.svg'), 6: mkImg('/assets/ore.svg'), 7: anvilImg, 8: mkImg('/assets/smelter.svg'), 9: campfireImg, 10: chestImg, 11: mkImg('/assets/sandpile.svg'), 12: mkImg('/assets/well.svg'), 13: mkImg('/assets/stairs-down.svg'), 14: mkImg('/assets/stairs-up.svg'), 16: mkImg('/assets/portal-blue.svg'), 17: mkImg('/assets/portal-purple.svg'), 18: mkImg('/assets/portal-green.svg'), 19: mkImg('/assets/spawn.svg'), 24: mkImg('/assets/mountain.svg'), 25: mkImg('/assets/bush.svg'), 26: mkImg('/assets/boulder.svg'), 27: mkImg('/assets/fence.svg'), 28: mkImg('/assets/lamp.svg'), 29: mkImg('/assets/bridge.svg'), 30: mkImg('/assets/sign.svg'), 33: mkImg('/assets/workbench.svg'), 34: mkImg('/assets/admin-chest.svg'), 35: mkImg('/assets/silver-ore.svg'), 36: mkImg('/assets/return-stone.svg') };
function objSprite(im, cx, cy, sz) { if (im && im._ready) { const W = sz * zoom, H = sz * zoom; ctx.drawImage(im, cx - W / 2, cy - H / 2 - 5 * zoom, W, H); } }
function treeVariant(x, y) { let h = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0; h = (h ^ (h >>> 13)) >>> 0; return h & 1; }
function tileSeed(x, y) { return (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Пещерная скала в редакторе — тот же тёмный 3D-изо вид, что и в игре
function drawCaveWallEd(cx, cy, x, y) {
  const z = zoom, hw = (TW / 2) * z, hh = (TH / 2) * z;
  const rnd = mulberry32(tileSeed(x, y) ^ 0x7c0f);
  const bodyH = (26 + rnd() * 14) * z, crest = (6 + rnd() * 13) * z, adx = (rnd() - 0.5) * hw * 0.44;
  const ty = cy - bodyH;
  ctx.fillStyle = '#4a4f59'; ctx.beginPath(); ctx.moveTo(cx, cy + hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx + hw, ty); ctx.lineTo(cx, ty + hh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#333842'; ctx.beginPath(); ctx.moveTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.lineTo(cx - hw, ty); ctx.lineTo(cx, ty + hh); ctx.closePath(); ctx.fill();
  const ax = cx + adx, ay = ty - crest, T = [cx, ty - hh], R = [cx + hw, ty], B = [cx, ty + hh], L = [cx - hw, ty];
  const face = (p1, p2, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(ax, ay); ctx.closePath(); ctx.fill(); };
  face(L, T, '#3a3f48'); face(R, T, '#545a64'); face(L, B, '#41464f'); face(R, B, '#646b75');
}
// Гора в редакторе — тот же процедурный 3D-изо вид, что и в игре
function drawMountainEd(cx, cy, x, y) {
  const z = zoom, hw = (TW / 2) * z, hh = (TH / 2) * z;
  const rnd = mulberry32(tileSeed(x, y) ^ 0x51a3);
  const bodyH = (14 + rnd() * 22) * z, peakH = (20 + rnd() * 30) * z, adx = (rnd() - 0.5) * hw * 0.68;
  const ty = cy - bodyH;
  ctx.fillStyle = '#646b75'; ctx.beginPath(); ctx.moveTo(cx, cy + hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx + hw, ty); ctx.lineTo(cx, ty + hh); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#474d56'; ctx.beginPath(); ctx.moveTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.lineTo(cx - hw, ty); ctx.lineTo(cx, ty + hh); ctx.closePath(); ctx.fill();
  const ax = cx + adx, ay = ty - peakH, T = [cx, ty - hh], R = [cx + hw, ty], B = [cx, ty + hh], L = [cx - hw, ty];
  const face = (p1, p2, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(ax, ay); ctx.closePath(); ctx.fill(); };
  face(L, T, '#565c66'); face(R, T, '#727983'); face(L, B, '#5c636d'); face(R, B, '#8a929c');
  if (rnd() < 0.62) {
    const sh = peakH * (0.28 + rnd() * 0.14);
    ctx.fillStyle = '#cdd6e0'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay + sh); ctx.lineTo(ax - sh * 0.8, ay + sh * 0.7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#eef3f8'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, ay + sh); ctx.lineTo(ax + sh * 0.8, ay + sh * 0.7); ctx.closePath(); ctx.fill();
  }
}
let zoom = 1;
let panX = 0, panY = 0; // экранное смещение начала координат

// --- Палитра тайлов по категориям ---
const CATEGORIES = [
  { name: 'Земля',    items: [ { id: 0, name: 'Трава', color: '#819A35' }, { id: 21, name: 'Тёмн. трава', color: '#3f7e3a' }, { id: 22, name: 'Цветы', color: '#62ab51' }, { id: 4, name: 'Тропа', color: '#c6a96a' }, { id: 20, name: 'Земля', color: '#9c7a4d' }, { id: 23, name: 'Брусчатка', color: '#8d8f97' }, { id: 31, name: 'Песок (пустыня)', color: '#dcc878' }, { id: 1, name: 'Вода', color: '#3a86c8' }, { id: 15, name: 'Пещера', color: '#3b3b46' } ] },
  { name: 'Стены',    items: [ { id: 2, name: 'Стена', color: '#9aa0ac' }, { id: 24, name: 'Горы', color: '#7c8088' }, { id: 32, name: 'Скала (пещера)', color: '#4a4f59' }, { id: 27, name: 'Забор', color: '#9a6b3a' } ] },
  { name: 'Ресурсы',  items: [ { id: 3, name: 'Дерево', color: '#2f7d32' }, { id: 5, name: 'Камень', color: '#828892' }, { id: 6, name: 'Руда', color: '#c2641f' }, { id: 35, name: 'Серебро', color: '#c0c0c0' }, { id: 11, name: 'Песок', color: '#dcc480' } ] },
  { name: 'Природа',  items: [ { id: 25, name: 'Куст', color: '#3f8a39' }, { id: 26, name: 'Валун', color: '#8a909a' } ] },
  { name: 'Верстаки', items: [ { id: 7, name: 'Наковальня', color: '#3a3f47' }, { id: 8, name: 'Плавильня', color: '#e8632a' }, { id: 9, name: 'Костёр', color: '#f4a23d' }, { id: 33, name: 'Верстак', color: '#a9743f' } ] },
  { name: 'Объекты', items: [ { id: 10, name: 'Сундук', color: '#8a5a28' }, { id: 12, name: 'Колодец', color: '#9aa0aa' }, { id: 28, name: 'Фонарь', color: '#f0c24a' }, { id: 29, name: 'Мост', color: '#a9743f' }, { id: 30, name: 'Табличка', color: '#9a6b3a' }, { id: 34, name: 'Админ-сундук', color: '#ff5fb0' }, { id: 36, name: 'Камень возврата', color: '#7fd0e0' } ] },
  { name: 'Порталы', items: [ { id: 13, name: 'Лестн.↓', color: '#5b8def' }, { id: 14, name: 'Лестн.↑', color: '#8fd06a' }, { id: 16, name: 'Синий', color: '#5fa8e0' }, { id: 17, name: 'Фиолет.', color: '#a86fd0' }, { id: 18, name: 'Зелёный', color: '#5fe0a0' } ] },
  { name: 'Спавн', items: [ { id: 19, name: 'Точка спавна', color: '#e74c3c' } ] },
  { name: 'НПС', items: [ { id: 'npc', name: 'Создать НПС', color: '#e0a93b' } ] },
  { name: 'Существа', items: [ { id: 'mob', name: 'Создать моба', color: '#c0392b' } ] },
  { name: 'Рыбалка', items: [ { id: 'fishspot', name: 'Рыбное место', color: '#3a86c8' } ] },
];
// Функциональные инструменты (отдельный ряд кнопок над палитрой, не в категориях блоков)
const TOOLS = [
  { id: POINTER,    name: 'Указатель' },
  { id: EYEDROPPER, name: 'Пипетка' },
  { id: EDIT,       name: 'Редактировать' },
  { id: ERASE,      name: 'Удалить' },
];
let selected = POINTER; // выбранный инструмент/тайл (по умолчанию — указатель: клик ничего не делает)
let iconCanvases = [];                          // {c: canvas, id} — мини-иконки палитры (перерисовка после загрузки SVG)
let palQuery = '';                              // текст поиска по палитре
let collapsedCats = new Set();                  // свёрнутые категории (по названию)
try { collapsedCats = new Set(JSON.parse(localStorage.getItem('mmorpg_palCollapsed') || '[]')); } catch (e) {}
function persistCollapsed() { try { localStorage.setItem('mmorpg_palCollapsed', JSON.stringify([...collapsedCats])); } catch (e) {} }
const ICON_PX = 40;                             // размер иконки в палитре (px)
const floorTexImgEd = {};                       // кэш картинок текстур пола (FLOOR_TEX) для редактора и палитры

const TOP = { 0:'#819A35', 1:'#3a86c8', 2:'#9aa0ac', 3:'#819A35', 4:'#c6a96a', 5:'#819A35', 6:'#819A35', 7:'#819A35', 8:'#819A35', 9:'#819A35', 10:'#819A35', 11:'#819A35', 12:'#819A35', 13:'#819A35', 14:'#819A35', 15:'#3b3b46', 16:'#819A35', 17:'#819A35', 18:'#819A35', 19:'#819A35', 20:'#9c7a4d', 21:'#3f7e3a', 22:'#62ab51', 23:'#8d8f97', 24:'#819A35', 25:'#819A35', 26:'#819A35', 27:'#819A35', 28:'#819A35', 29:'#3a86c8', 30:'#819A35', 31:'#dcc878', 33:'#819A35', 34:'#819A35', 35:'#819A35' };
const WALL = { top:'#9aa0ac', left:'#5d626d', right:'#787e8a' };

// Без логина: редактор открыт сразу. Палитра и размер — на загрузке, центрирование — когда придёт карта.
socket.emit('adminAuth');               // сервер выдаёт права (на всякий случай)
buildTools();
buildPalette();
resize();

// Поиск по палитре + сворачивание всей панели
const palSearchEl = document.getElementById('palSearch');
const palCollapseEl = document.getElementById('palCollapse');
const paletteDockEl = document.getElementById('paletteDock');
palSearchEl.addEventListener('input', () => { palQuery = palSearchEl.value.trim().toLowerCase(); applyPaletteFilter(); });
palCollapseEl.addEventListener('click', () => {
  const col = paletteDockEl.classList.toggle('collapsed');
  palCollapseEl.textContent = col ? '›' : '‹';
  resize(); centerMap();                 // панель изменила ширину — пересчитать холст
});

socket.on('mapData', (data) => {
  LOCS = {};
  for (const k in (data.locations || {})) {
    const L = data.locations[k];
    LOCS[k] = { map: L.map.map(r => r.slice()), floor: (L.floor || deriveFloor(L.map)).map(r => r.slice()),
                teleports: (L.teleports || []).map(e => ({ ...e })), mobs: (L.mobs || []).map(m => ({ ...m })),
                signs: (L.signs || []).map(s => ({ ...s })), npcs: (L.npcs || []).map(n => JSON.parse(JSON.stringify(n))),
                spots: (L.spots || []).map(s => JSON.parse(JSON.stringify(s))),
                stones: (L.stones || []).map(s => ({ ...s })), W: L.width, H: L.height };
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
  return { map, floor, teleports: [], mobs: [], signs: [], npcs: [], spots: [], stones: [], W, H };
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
  const npcs = LOCS[curLoc].npcs.filter(n => n.x < w && n.y < h);
  const spots = (LOCS[curLoc].spots || []).filter(s => s.x < w && s.y < h);
  const stones = (LOCS[curLoc].stones || []).filter(s => s.x < w && s.y < h);
  LOCS[curLoc] = { map: nm, floor: nf, teleports: tele, mobs, signs, npcs, spots, stones, W: w, H: h };
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
function setMob(x, y, cfg) { removeMob(x, y); LOCS[curLoc].mobs.push({ ...cfg, x, y }); }
function mobAt(x, y) { return LOCS[curLoc].mobs.find(m => m.x === x && m.y === y); }
// Таблички текущей локации
function removeSign(x, y) { LOCS[curLoc].signs = LOCS[curLoc].signs.filter(s => !(s.x === x && s.y === y)); }
function setSign(x, y, text) { removeSign(x, y); LOCS[curLoc].signs.push({ x, y, text: String(text || '') }); }
function signAt(x, y) { return LOCS[curLoc].signs.find(s => s.x === x && s.y === y); }
// Камни возвращения текущей локации
function removeStone(x, y) { if (LOCS[curLoc].stones) LOCS[curLoc].stones = LOCS[curLoc].stones.filter(s => !(s.x === x && s.y === y)); }
function setStone(x, y, name) { if (!LOCS[curLoc].stones) LOCS[curLoc].stones = []; removeStone(x, y); LOCS[curLoc].stones.push({ x, y, name: String(name || 'Камень возвращения') }); }
function stoneAtEd(x, y) { return (LOCS[curLoc].stones || []).find(s => s.x === x && s.y === y); }
// Рыбные места текущей локации
function removeSpot(x, y) { LOCS[curLoc].spots = (LOCS[curLoc].spots || []).filter(s => !(s.x === x && s.y === y)); }
function setSpot(x, y, data) { if (!LOCS[curLoc].spots) LOCS[curLoc].spots = []; removeSpot(x, y); LOCS[curLoc].spots.push({ ...data, x, y }); }
function spotAtEd(x, y) { return (LOCS[curLoc].spots || []).find(s => s.x === x && s.y === y); }
// НПС текущей локации
function removeNpc(x, y) { LOCS[curLoc].npcs = LOCS[curLoc].npcs.filter(n => !(n.x === x && n.y === y)); }
function setNpc(x, y, data) { removeNpc(x, y); LOCS[curLoc].npcs.push({ ...data, x, y }); }
function npcAt(x, y) { return LOCS[curLoc].npcs.find(n => n.x === x && n.y === y); }
socket.on('saveResult', ({ ok }) => {
  statusEl.textContent = ok ? '✓ Сохранено' : '✗ Ошибка';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
});

// --- Иконки для кнопок палитры (как в игре) ---
function bg(c, color) { c.fillStyle = color; c.beginPath(); c.moveTo(15, 4); c.lineTo(27, 15); c.lineTo(15, 26); c.lineTo(3, 15); c.closePath(); c.fill(); } // ромб-пол
function drawIcon(c, id) {
  c.clearRect(0, 0, 30, 30);
  const TAU = Math.PI * 2;
  // Тайлы пола: если задана своя текстура (FLOOR_TEX) — рисуем её в ромб, иначе цветной ромб
  if (GROUND.has(id)) {
    const ft = FLOOR_TEX[id];
    if (ft) {
      const img = floorImgEd(Array.isArray(ft) ? ft[0] : ft);
      if (img._ready) {
        c.save();
        c.beginPath(); c.moveTo(15, 4); c.lineTo(27, 15); c.lineTo(15, 26); c.lineTo(3, 15); c.closePath(); c.clip();
        c.drawImage(img, 3, 4, 24, 22);
        c.restore();
        return;
      }
    }
    return bg(c, TOP[id]);
  }
  // Всё остальное — БЕЗ фона травы (рисуем сам объект на прозрачном; тёмный фон кнопки сам по себе)
  if (id === 2) { c.fillStyle = '#5d626d'; c.fillRect(7, 9, 16, 14); c.fillStyle = '#787e8a'; c.fillRect(7, 6, 16, 9); c.fillStyle = '#9aa0ac'; c.fillRect(7, 4, 16, 4); return; }
  if (id === 32) { c.fillStyle = '#333842'; c.beginPath(); c.moveTo(15, 24); c.lineTo(6, 19); c.lineTo(6, 11); c.lineTo(15, 7); c.closePath(); c.fill(); c.fillStyle = '#4a4f59'; c.beginPath(); c.moveTo(15, 24); c.lineTo(24, 19); c.lineTo(24, 11); c.lineTo(15, 7); c.closePath(); c.fill(); c.fillStyle = '#646b75'; c.beginPath(); c.moveTo(15, 7); c.lineTo(24, 11); c.lineTo(16, 3); c.lineTo(9, 10); c.closePath(); c.fill(); return; }
  if (id === 'mob') {     // создать моба — голова волка из спрайта или кружок-зверь
    const mi = MOB_IMG.wolf; if (mi && mi._ready) return void c.drawImage(mi, 3, 2, 24, 24);
    c.fillStyle = '#888c94'; c.beginPath(); c.arc(15, 14, 8, 0, TAU); c.fill();
    c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(12, 13, 1.3, 0, TAU); c.arc(18, 13, 1.3, 0, TAU); c.fill(); return;
  }
  if (typeof id === 'string' && id.startsWith('mobstamp:')) { // сохранённый моб — рисуем его спрайт
    const m = savedMobs[+id.slice(9)], mi = m && MOB_IMG[m.sprite];
    if (mi && mi._ready) return void c.drawImage(mi, 3, 2, 24, 24);
    c.fillStyle = '#888c94'; c.beginPath(); c.arc(15, 14, 8, 0, TAU); c.fill();
    c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(12, 13, 1.3, 0, TAU); c.arc(18, 13, 1.3, 0, TAU); c.fill(); return;
  }
  if (id === 'fishspot' || (typeof id === 'string' && id.startsWith('spotstamp:'))) { // рыбное место: рыбка в кругах ряби
    c.strokeStyle = '#5fa8e0'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(15, 16, 11, 6, 0, 0, TAU); c.stroke();
    c.fillStyle = '#b8c2cc'; c.beginPath(); c.ellipse(14, 15, 7, 3.4, 0, 0, TAU); c.fill();
    c.fillStyle = '#b8c2cc'; c.beginPath(); c.moveTo(20, 15); c.lineTo(25, 11); c.lineTo(25, 19); c.closePath(); c.fill();
    c.fillStyle = '#2a2f37'; c.beginPath(); c.arc(10, 14, 1.3, 0, TAU); c.fill(); return;
  }
  if (id === 'npc') {   // человечек (создать НПС)
    c.fillStyle = '#f3cfa6'; c.beginPath(); c.arc(15, 9, 4.5, 0, TAU); c.fill();           // голова
    c.fillStyle = '#3a78c2'; c.beginPath(); c.moveTo(15, 13); c.lineTo(22, 25); c.lineTo(8, 25); c.closePath(); c.fill(); // тело
    c.fillStyle = '#e0a93b'; c.beginPath(); c.arc(23, 7, 3, 0, TAU); c.fill();              // звёздочка-«+» намёк
    c.fillStyle = '#1a1a24'; c.font = 'bold 7px sans-serif'; c.textAlign = 'center'; c.fillText('+', 23, 9.5); return;
  }
  if (id === -1) { c.strokeStyle = '#e74c3c'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(9, 9); c.lineTo(21, 21); c.moveTo(21, 9); c.lineTo(9, 21); c.stroke(); return; }
  if (id === -3) { // указатель-курсор
    c.fillStyle = '#dfe4ee'; c.strokeStyle = '#1a1a24'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(9, 6); c.lineTo(9, 23); c.lineTo(13.5, 19); c.lineTo(16.5, 25); c.lineTo(19, 24); c.lineTo(16, 18); c.lineTo(22, 18); c.closePath(); c.fill(); c.stroke(); return;
  }
  if (id === -4) { // пипетка
    c.strokeStyle = '#7fd0e0'; c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(8, 23); c.lineTo(18, 13); c.stroke();             // трубка
    c.fillStyle = '#cfa14a'; c.beginPath(); c.moveTo(17, 9); c.lineTo(22, 14); c.lineTo(19.5, 16.5); c.lineTo(14.5, 11.5); c.closePath(); c.fill(); // колпачок
    c.fillStyle = '#7fd0e0'; c.beginPath(); c.arc(8, 23, 2.2, 0, TAU); c.fill(); return; // капля
  }
  if (id === -2) { // карандаш «изменить»
    c.fillStyle = '#3ad0c0'; c.beginPath(); c.moveTo(8, 22); c.lineTo(18, 12); c.lineTo(21, 15); c.lineTo(11, 25); c.closePath(); c.fill();
    c.fillStyle = '#cfa14a'; c.beginPath(); c.moveTo(19, 11); c.lineTo(22, 8); c.lineTo(25, 11); c.lineTo(22, 14); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(8, 22); c.lineTo(11, 25); c.lineTo(7, 26); c.closePath(); c.fill(); return; }
  // Все объекты — из единых SVG (OBJ_IMG). Перерисовал svg-файл → иконка обновилась везде.
  const im = OBJ_IMG[id];
  if (im && im._ready) c.drawImage(im, 2, 0, 26, 26);
}
function refreshPaletteIcons() { for (const o of iconCanvases) drawIcon(o.c.getContext('2d'), o.id); }

// --- Палитра (боковая панель): крупные иконки сеткой + поиск + сворачиваемые группы ---
// Канвас-иконка нужного размера: рисуем в 30-координатах drawIcon, масштабируем контекст до ICON_PX.
function makeIcon(id) {
  const ic = document.createElement('canvas');
  ic.width = ICON_PX; ic.height = ICON_PX; ic.className = 'dot-ic';
  const c = ic.getContext('2d'); c.scale(ICON_PX / 30, ICON_PX / 30);
  drawIcon(c, id);
  iconCanvases.push({ c: ic, id });
  return ic;
}
// Один кафель палитры: иконка + подпись (подпись используется и для поиска).
function makeSwatch(id, name, opts = {}) {
  const el = document.createElement('div');
  el.className = 'swatch' + (id === selected ? ' active' : '');
  el.dataset.name = String(name).toLowerCase();
  el.dataset.tool = String(id);
  el.title = opts.title || name;
  el.appendChild(makeIcon(id));
  const cap = document.createElement('span'); cap.className = 'sw-cap'; cap.textContent = name;
  el.appendChild(cap);
  el.addEventListener('click', () => { setTool(id); if (opts.onClick) opts.onClick(); });
  if (opts.onContext) el.addEventListener('contextmenu', (e) => { e.preventDefault(); opts.onContext(); });
  return el;
}

// Выбрать инструмент/тайл: запомнить и подсветить активный и в палитре, и в ряду инструментов.
function setTool(id) {
  selected = id;
  document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.tool === String(id)));
  document.querySelectorAll('.pal-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === String(id) || (id === 'paste' && +b.dataset.tool === EYEDROPPER)));
}

// Ряд функциональных инструментов над палитрой (указатель/пипетка/правка/удаление)
function buildTools() {
  const box = document.getElementById('palTools');
  if (!box) return;
  box.innerHTML = '';
  TOOLS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'pal-tool' + (t.id === selected ? ' active' : '');
    b.dataset.tool = String(t.id);
    b.title = t.name;
    const ic = document.createElement('canvas'); ic.width = ICON_PX; ic.height = ICON_PX; ic.className = 'dot-ic';
    const c = ic.getContext('2d'); c.scale(ICON_PX / 30, ICON_PX / 30); drawIcon(c, t.id);
    b.appendChild(ic);
    b.appendChild(document.createTextNode(t.name));
    b.addEventListener('click', () => setTool(t.id));
    box.appendChild(b);
  });
}

function buildPalette() {
  paletteEl.innerHTML = '';
  iconCanvases = [];
  CATEGORIES.forEach((cat) => {
    const group = document.createElement('div');
    group.className = 'pal-group' + (collapsedCats.has(cat.name) ? ' collapsed' : '');
    group.dataset.cat = cat.name;
    const head = document.createElement('button');
    head.className = 'pal-cat';
    head.innerHTML = `<span class="pal-chev">▼</span>${cat.name}`;
    head.addEventListener('click', () => {
      const col = group.classList.toggle('collapsed');
      if (col) collapsedCats.add(cat.name); else collapsedCats.delete(cat.name);
      persistCollapsed();
    });
    const items = document.createElement('div'); items.className = 'pal-items';
    group.appendChild(head); group.appendChild(items);

    cat.items.forEach((t) => {
      items.appendChild(makeSwatch(t.id, t.name, {
        onClick: () => {
          if (TELES.has(t.id)) {                       // выбрал портал — сразу спросить связь (число ИЛИ слово)
            const v = prompt(`Связь для «${t.name}» (одинаковая метка у пары порталов, напр. 1 или «Лес»):`, sidInput.value || '1');
            if (v !== null && v.trim()) sidInput.value = v.trim();
          }
        },
      }));
    });
    // Сохранённые мобы → в группу «Существа» (выбрал — штампуешь его)
    if (cat.name === 'Существа') {
      savedMobs.forEach((m, i) => {
        const sid = 'mobstamp:' + i;
        items.appendChild(makeSwatch(sid, mobLabelFor(m), {
          title: 'ЛКМ — ставить · ПКМ — удалить из библиотеки',
          onContext: () => { if (confirm(`Удалить моба «${mobLabelFor(m)}» из библиотеки?`)) { savedMobs.splice(i, 1); persistSavedMobs(); if (selected === sid) selected = 'mob'; buildPalette(); } },
        }));
      });
    }
    // Сохранённые рыбные места → в группу «Рыбалка»
    if (cat.name === 'Рыбалка') {
      savedSpots.forEach((s, i) => {
        const sid = 'spotstamp:' + i;
        items.appendChild(makeSwatch(sid, spotLabelFor(s), {
          title: 'ЛКМ — ставить · ПКМ — удалить из библиотеки',
          onContext: () => { if (confirm(`Удалить «${spotLabelFor(s)}» из библиотеки рыбных мест?`)) { savedSpots.splice(i, 1); persistSavedSpots(); if (selected === sid) selected = 'fishspot'; buildPalette(); } },
        }));
      });
    }
    paletteEl.appendChild(group);
  });
  applyPaletteFilter();
}

// Фильтр палитры по тексту поиска: прячем не подходящие кафели и пустые группы; при поиске — раскрываем.
function applyPaletteFilter() {
  const q = palQuery;
  paletteEl.querySelectorAll('.pal-group').forEach(g => {
    let any = false;
    g.querySelectorAll('.swatch').forEach(s => {
      const m = !q || s.dataset.name.includes(q);
      s.style.display = m ? '' : 'none';
      if (m) any = true;
    });
    g.style.display = any ? '' : 'none';
    if (q) g.classList.remove('collapsed');                       // поиск раскрывает найденное
    else g.classList.toggle('collapsed', collapsedCats.has(g.dataset.cat)); // вернуть ручное состояние
  });
}

saveBtn.addEventListener('click', () => {
  const out = {};
  for (const k in LOCS) out[k] = { map: LOCS[k].map, floor: LOCS[k].floor, teleports: LOCS[k].teleports, mobs: LOCS[k].mobs, signs: LOCS[k].signs, npcs: LOCS[k].npcs, spots: LOCS[k].spots || [], stones: LOCS[k].stones || [] };
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
    const dialogTool = (selected === SIGN || selected === RETURN_STONE || selected === EDIT || selected === 'npc' || selected === 'mob' || selected === 'fishspot'
                        || selected === POINTER || selected === EYEDROPPER || selected === 'paste');
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
  if (selected === POINTER) return;                                      // указатель — ничего не делаем
  if (selected === EYEDROPPER) { if (isClick) eyedropPick(t.x, t.y); return; } // пипетка: скопировать объект под курсором
  if (selected === 'paste') { if (isClick) pasteAt(t.x, t.y); return; }  // вставка скопированного пипеткой
  if (selected === EDIT) { if (isClick) editParams(t.x, t.y); return; }  // «Изменить»: правка параметров поставленного объекта
  if (selected === 'npc') { if (isClick) openNpcEditor(t.x, t.y, npcAt(t.x, t.y) || null); return; } // создать/править НПС
  if (selected === 'mob') { if (isClick) openMobEditor(t.x, t.y, null, true); return; }                 // конструктор НОВОГО моба (в библиотеку)
  if (selected === 'fishspot') { if (isClick) openSpotEditor(t.x, t.y, spotAtEd(t.x, t.y) || null, true); return; } // настроить рыбное место (в библиотеку)
  if (typeof selected === 'string' && selected.startsWith('mobstamp:')) {                              // штамп выбранного из библиотеки (можно протяжкой)
    const m = savedMobs[+selected.slice(9)]; if (m) setMob(t.x, t.y, JSON.parse(JSON.stringify(m))); return;
  }
  if (typeof selected === 'string' && selected.startsWith('spotstamp:')) {                             // штамп сохранённого рыбного места
    const s = savedSpots[+selected.slice(10)]; if (s) setSpot(t.x, t.y, JSON.parse(JSON.stringify(s))); return;
  }
  if (selected === ERASE) {                          // ластик: убрать объект/моба/НПС/рыбное место, оставить пол
    MAP[t.y][t.x] = FLOOR[t.y][t.x]; removeTele(t.x, t.y); removeMob(t.x, t.y); removeSign(t.x, t.y); removeNpc(t.x, t.y); removeSpot(t.x, t.y); removeStone(t.x, t.y);
  } else if (isGround(selected)) {                   // пол: меняем землю (под объектом — тоже, объект сохраняется)
    FLOOR[t.y][t.x] = selected;
    if (isGround(MAP[t.y][t.x])) MAP[t.y][t.x] = selected;
  } else if (TELES.has(selected)) {                  // портал: кладём + записываем связь (метка-строка)
    MAP[t.y][t.x] = selected;
    setTele(t.x, t.y, (sidInput.value || '').trim() || '1');
  } else if (selected === SIGN) {                    // табличка: СНАЧАЛА спрашиваем текст, ставим только если не отменили
    const cur = signAt(t.x, t.y);
    const txt = prompt('Текст таблички (его увидит игрок):', cur ? cur.text : '');
    if (txt === null) return;                        // «Отмена» — передумал, ничего не ставим
    MAP[t.y][t.x] = SIGN; removeTele(t.x, t.y);
    setSign(t.x, t.y, txt);
  } else if (selected === RETURN_STONE) {            // камень возвращения: спрашиваем имя точки
    const cur = stoneAtEd(t.x, t.y);
    const name = prompt('Название точки возврата (его увидит игрок):', cur ? cur.name : '');
    if (name === null) return;
    MAP[t.y][t.x] = RETURN_STONE; removeTele(t.x, t.y);
    setStone(t.x, t.y, name.trim() || 'Камень возвращения');
  } else {                                           // прочий объект: поверх пола; если была лестница — убрать связь
    MAP[t.y][t.x] = selected; removeTele(t.x, t.y);
  }
}

// Короткая подсказка в строке статуса
function status(msg) { statusEl.textContent = msg; clearTimeout(status._t); status._t = setTimeout(() => { statusEl.textContent = ''; }, 2800); }

// Пипетка: скопировать то, что на клетке. Объект (моб/НПС/место/табличка) → режим вставки; тайл → берём как кисть.
function eyedropPick(x, y) {
  const mob = mobAt(x, y);
  if (mob) { clipboard = { kind: 'mob', data: JSON.parse(JSON.stringify(mob)) }; setTool('paste'); status('Скопирован моб: ' + mobLabelFor(mob) + ' — кликай, чтобы ставить'); return; }
  const npc = npcAt(x, y);
  if (npc) { clipboard = { kind: 'npc', data: JSON.parse(JSON.stringify(npc)) }; setTool('paste'); status('Скопирован НПС: ' + (npc.name || 'НПС') + ' — кликай, чтобы ставить'); return; }
  const spot = spotAtEd(x, y);
  if (spot) { clipboard = { kind: 'spot', data: JSON.parse(JSON.stringify(spot)) }; setTool('paste'); status('Скопировано рыбное место — кликай, чтобы ставить'); return; }
  const tile = MAP[y][x];
  if (tile === SIGN) { const s = signAt(x, y); clipboard = { kind: 'sign', data: { text: s ? s.text : '' } }; setTool('paste'); status('Скопирована табличка — кликай, чтобы ставить'); return; }
  clipboard = null; setTool(tile); status('Взят тайл как кисть');   // обычный тайл/объект → классическая пипетка
}

// Вставить скопированное пипеткой на клетку (можно сколько угодно раз)
function pasteAt(x, y) {
  if (!clipboard) { setTool(POINTER); return; }
  if (clipboard.kind === 'mob') setMob(x, y, JSON.parse(JSON.stringify(clipboard.data)));
  else if (clipboard.kind === 'npc') setNpc(x, y, JSON.parse(JSON.stringify(clipboard.data)));
  else if (clipboard.kind === 'spot') setSpot(x, y, JSON.parse(JSON.stringify(clipboard.data)));
  else if (clipboard.kind === 'sign') { MAP[y][x] = SIGN; removeTele(x, y); setSign(x, y, clipboard.data.text); }
}

// «Изменить» — правка параметров уже поставленного объекта на клетке
function editParams(x, y) {
  const npc = npcAt(x, y);
  if (npc) { openNpcEditor(x, y, npc); return; }      // НПС — открыть его конструктор
  const mob = mobAt(x, y);
  if (mob) { openMobEditor(x, y, mob); return; }      // моб — открыть его конструктор
  const spot = spotAtEd(x, y);
  if (spot) { openSpotEditor(x, y, spot, false); return; } // рыбное место — правка таблицы рыбы
  const t = MAP[y][x];
  if (t === SIGN) {
    const cur = signAt(x, y);
    const txt = prompt('Текст таблички (его увидит игрок):', cur ? cur.text : '');
    if (txt !== null) setSign(x, y, txt);
  } else if (t === RETURN_STONE) {
    const cur = stoneAtEd(x, y);
    const name = prompt('Название точки возврата (его увидит игрок):', cur ? cur.name : '');
    if (name !== null) setStone(x, y, name.trim() || 'Камень возвращения');
  } else if (TELES.has(t)) {
    const te = teleAt(x, y);
    const sid = prompt('ID связи (порталы/лестницы с одинаковым ID соединены):', te ? te.sid : '');
    if (sid !== null) setTele(x, y, sid.trim() || '1');
  } else {
    alert('На этой клетке нечего настраивать.\nИзменяемые объекты: НПС, моб, табличка (текст), порталы и лестницы (ID связи).');
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
function drawMobMarker(cx, cy, m) {                    // существо в редакторе: спрайт/кружок + подпись + значок агрессии
  const z = zoom, sprite = m.sprite || 'wolf', info = SPRITE_INFO[sprite] || { name: 'Существо', color: '#888' }, img = MOB_IMG[sprite];
  const label = m.name || info.name;
  const scale = m.size ? m.size / mobTexSize(sprite) : 1;
  if (img && img._ready) { const W = 30 * z * scale, H = 30 * z * scale; ctx.drawImage(img, cx - W / 2, cy + 8 * z - H, W, H); }
  else {
    ctx.fillStyle = info.color; ctx.beginPath(); ctx.arc(cx, cy - 8 * z, 9 * z, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a1a24'; ctx.lineWidth = 1.5 * z; ctx.stroke();
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(cx - 3 * z, cy - 9 * z, 1.4 * z, 0, Math.PI * 2); ctx.arc(cx + 3 * z, cy - 9 * z, 1.4 * z, 0, Math.PI * 2); ctx.fill();
  }
  if (m.aggro === 'aggressive') { ctx.fillStyle = '#ff5b5b'; ctx.font = `bold ${Math.round(13 * z)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('!', cx, cy - 26 * z); }
  ctx.font = `bold ${Math.round(10 * z)}px sans-serif`; ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 3 * z; ctx.strokeText(label, cx, cy + 16 * z);
  ctx.fillStyle = '#fff'; ctx.fillText(label, cx, cy + 16 * z);
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

// Текстуры пола из FLOOR_TEX (те же svg, что в игре) — укладываем в изо-клетку с обрезкой по ромбу.
function floorImgEd(path) { return floorTexImgEd[path] || (floorTexImgEd[path] = mkImg(path)); }
function drawFloorTexEd(f, cx, cy, x, y) {
  const t = FLOOR_TEX[f];
  if (!t) return false;
  const list = Array.isArray(t) ? t : [t];
  const path = list.length > 1 ? list[tileSeed(x, y) % list.length] : list[0];
  const img = floorImgEd(path);
  if (!img._ready) return false;
  const hw = (TW / 2) * zoom, hh = (TH / 2) * zoom;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(cx, cy - hh); ctx.lineTo(cx + hw, cy); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy); ctx.closePath(); ctx.clip();
  ctx.drawImage(img, cx - hw, cy - hh, hw * 2, hh * 2);
  ctx.restore();
  return true;
}

function render() {
  ctx.fillStyle = '#10131a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!MAP) { requestAnimationFrame(render); return; }

  // Пол (из слоя FLOOR — под объектами сохраняется земля)
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      if (MAP[y][x] === 2 || MAP[y][x] === 32) continue;  // под стеной/скалой пол не рисуем
      const fx = panX + isoX(x, y), fy = panY + isoY(x, y);
      if (drawFloorTexEd(FLOOR[y][x], fx, fy, x, y)) continue;   // своя текстура пола (как в игре)
      fillDiamond(fx, fy, TOP[FLOOR[y][x]] || TOP[0], 'rgba(0,0,0,.18)');
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
      else if (t === 32) obj.push({ d: x + y, k: 32, x, y });
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
      else if (t === 24 || t === 25 || t === 26 || t === 27 || t === 28 || t === 30 || t === 33 || t === 34 || t === 35 || t === 36) obj.push({ d: x + y + 0.1, k: t, x, y });
      else if (t === 29) obj.push({ d: x + y - 0.4, k: 29, x, y });
    }
  obj.sort((a, b) => a.d - b.d);
  for (const o of obj) {
    if (o.k === 2) drawCube(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), WALL_H);
    else if (o.k === 32) drawCaveWallEd(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), o.x, o.y);
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
    else if (o.k === 24) drawMountainEd(panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), o.x, o.y);
    else if (o.k === 25) objSprite(OBJ_IMG[25], panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), 34);
    else if (o.k === 26) objSprite(OBJ_IMG[26], panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), 38);
    else if (o.k === 27) objSprite(OBJ_IMG[27], panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), 42);
    else if (o.k === 28) objSprite(OBJ_IMG[28], panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), 44);
    else if (o.k === 33) objSprite(OBJ_IMG[33], panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), 44);
    else if (o.k === 34) objSprite(OBJ_IMG[34], panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), 44);
    else if (o.k === 35) objSprite(OBJ_IMG[35], panX + isoX(o.x, o.y), panY + isoY(o.x, o.y), 42);
    else if (o.k === 36) {                          // камень возврата + его имя над ним
      const sx = panX + isoX(o.x, o.y), sy = panY + isoY(o.x, o.y);
      objSprite(OBJ_IMG[36], sx, sy, 40);
      const st = stoneAtEd(o.x, o.y);
      if (st && st.name) { ctx.fillStyle = '#bfe3ff'; ctx.font = `bold ${Math.round(11 * zoom)}px sans-serif`; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 3 * zoom; ctx.strokeText(st.name, sx, sy - 22 * zoom); ctx.fillText(st.name, sx, sy - 22 * zoom); }
    }
    else if (o.k === 29) {                          // мост — плоская клетка-настил (как в игре)
      const sx = panX + isoX(o.x, o.y), sy = panY + isoY(o.x, o.y), hx = (TW / 2) * zoom, hy = (TH / 2) * zoom;
      fillDiamond(sx, sy, '#a9743f', 'rgba(58,36,16,.55)');
      ctx.fillStyle = 'rgba(140,92,48,.35)';
      ctx.beginPath(); ctx.moveTo(sx - hx, sy); ctx.lineTo(sx, sy + hy); ctx.lineTo(sx + hx, sy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(74,48,24,.6)'; ctx.lineWidth = 1.3 * zoom; ctx.lineCap = 'round';
      for (const s of [0.28, 0.5, 0.72]) { ctx.beginPath(); ctx.moveTo(sx - s * hx, sy - hy + s * hy); ctx.lineTo(sx + hx - s * hx, sy + s * hy); ctx.stroke(); }
    }
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
  for (const m of ms) drawMobMarker(panX + isoX(m.x, m.y), panY + isoY(m.x, m.y), m);
  // Авторские НПС (поверх объектов)
  const ns = (LOCS[curLoc] && LOCS[curLoc].npcs) || [];
  for (const n of ns) drawNpcMarker(panX + isoX(n.x, n.y), panY + isoY(n.x, n.y), n);
  // Рыбные места (поверх воды)
  const sp = (LOCS[curLoc] && LOCS[curLoc].spots) || [];
  for (const s of sp) drawSpotMarker(panX + isoX(s.x, s.y), panY + isoY(s.x, s.y), s);

  requestAnimationFrame(render);
}

// --- Конструктор НПС (модальное окно) ---
const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escAttr = escHtml;
// Предметы, которые НПС может продавать игроку (Купить)
const SELL_ITEMS = [
  ['axe', 'Топор'], ['pickaxe', 'Кирка'], ['shovel', 'Лопата'], ['emptyFlask', 'Пустая колба'], ['cookedChicken', 'Жареная курица'],
  ['wood', 'Древесина'], ['stone', 'Камень'], ['ore', 'Железная руда'], ['ingot', 'Слиток'], ['sand', 'Песок'],
  ['leather', 'Кожа'], ['silverOre', 'Серебряная руда'], ['silverIngot', 'Серебряный слиток'], ['helmet', 'Железный шлем'], ['chest', 'Железный нагрудник'],
  ['leatherHat', 'Кожаный капюшон'], ['leatherTunic', 'Кожаный нагрудник'], ['leatherMitts', 'Кожаные перчатки'], ['leatherLegs', 'Кожаные поножи'], ['leatherShoes', 'Кожаные сапоги'],
  ['silverHelmet', 'Серебряный шлем'], ['silverChest', 'Серебряный нагрудник'], ['silverGloves', 'Серебряные перчатки'], ['silverLegs', 'Серебряные поножи'], ['silverBoots', 'Серебряные сапоги'],
  ['ironSword', 'Железный меч'], ['ironShield', 'Железный щит'], ['ironGreatsword', 'Двуручный меч'],
];
function npcDefaults() { return { name: 'НПС', link: '', description: '', appearance: { skin: PALETTES.skin[0] }, equipment: {}, trader: false, sells: [], dialogue: '', talkText: '', quests: [] }; }
function questDefaults() { return { title: 'Задание', desc: '', type: 'gather', target: 'wood', count: 5, reward: 50, rewardItem: null, thanks: 'Спасибо!', repeatable: false }; }
const optHtml = (arr, sel) => arr.map(([v, l]) => `<option value="${escAttr(v)}"${v === sel ? ' selected' : ''}>${escHtml(l)}</option>`).join('');

// Один блок квеста (DOM). Возвращает элемент; чтение — readQuestBlock().
function makeQuestBlock(q) {
  q = { ...questDefaults(), ...q };
  const el = document.createElement('div');
  el.className = 'npc-qblock';
  el.innerHTML = `
    <button class="q-remove" title="Удалить квест">✕</button>
    <label class="npc-f">Название<input class="q-title" type="text" value="${escAttr(q.title)}"></label>
    <label class="npc-f">Описание (что делать)<textarea class="q-desc" rows="2">${escHtml(q.desc)}</textarea></label>
    <label class="npc-f">Тип<select class="q-type">${optHtml([['gather', 'Собрать предмет'], ['kill', 'Убить мобов'], ['talk', 'Поговорить с НПС']], q.type)}</select></label>
    <label class="npc-f q-target-box"></label>
    <label class="npc-f q-count-row">Количество<input class="q-count" type="number" min="1" value="${q.count}"></label>
    <label class="npc-f">Награда — золото<input class="q-reward" type="number" min="0" value="${q.reward}"></label>
    <label class="npc-f">Награда — предмет<span class="npc-inline"><select class="q-ritem">${optHtml(REWARD_ITEMS, q.rewardItem ? q.rewardItem.id : '')}</select>×<input class="q-rqty" type="number" min="1" value="${q.rewardItem ? q.rewardItem.qty : 1}"></span></label>
    <label class="npc-f">Текст благодарности<textarea class="q-thanks" rows="2">${escHtml(q.thanks)}</textarea></label>
    <label class="npc-chk"><input class="q-rep" type="checkbox"${q.repeatable ? ' checked' : ''}> Повторяемый (можно брать снова)</label>`;
  const tbox = el.querySelector('.q-target-box');
  const typeSel = el.querySelector('.q-type');
  const renderTarget = (type) => {
    if (type === 'talk') tbox.innerHTML = `Метка/имя НПС-цели<input class="q-target" type="text" value="${escAttr(q.type === 'talk' ? q.target : '')}" placeholder="напр. Кузнец или 123">`;
    else if (type === 'kill') tbox.innerHTML = `Кого убить<select class="q-target">${optHtml(KILL_TARGETS, q.type === 'kill' ? q.target : 'passive')}</select>`;
    else tbox.innerHTML = `Что собрать<select class="q-target">${optHtml(GATHER_TARGETS, q.type === 'gather' ? q.target : 'wood')}</select>`;
    el.querySelector('.q-count-row').style.display = (type === 'talk') ? 'none' : '';
  };
  renderTarget(q.type);
  typeSel.addEventListener('change', () => renderTarget(typeSel.value));
  el.querySelector('.q-remove').addEventListener('click', () => el.remove());
  return el;
}
function readQuestBlock(el) {
  const v = (sel) => { const e = el.querySelector(sel); return e ? e.value : ''; };
  const type = v('.q-type');
  const rItem = v('.q-ritem');
  return {
    title: (v('.q-title') || 'Задание').slice(0, 60),
    desc: (v('.q-desc') || '').slice(0, 300),
    type,
    target: (v('.q-target') || '').trim(),
    count: type === 'talk' ? 1 : Math.max(1, parseInt(v('.q-count'), 10) || 1),
    reward: Math.max(0, parseInt(v('.q-reward'), 10) || 0),
    rewardItem: rItem ? { id: rItem, qty: Math.max(1, parseInt(v('.q-rqty'), 10) || 1) } : null,
    thanks: (v('.q-thanks') || 'Спасибо!').slice(0, 300),
    repeatable: !!el.querySelector('.q-rep').checked,
  };
}

function openNpcEditor(x, y, existing) {
  const data = existing ? JSON.parse(JSON.stringify(existing)) : npcDefaults();
  if (!data.appearance) data.appearance = { skin: PALETTES.skin[0] };
  if (!data.equipment) data.equipment = {};
  if (!Array.isArray(data.sells)) data.sells = [];
  // легаси: одиночный quest → массив
  if (!Array.isArray(data.quests)) data.quests = data.quest ? [data.quest] : [];
  const ov = document.getElementById('npcOverlay');
  if (data.appearance.hair == null) data.appearance.hair = '#4a3525';
  if (data.appearance.hairStyle == null) data.appearance.hairStyle = '';
  const skinSw = PALETTES.skin.map(c => `<span class="npc-skin${data.appearance.skin === c ? ' sel' : ''}" data-c="${c}" style="background:${c}"></span>`).join('');
  const hairColSw = PALETTES.hair.map(c => `<span class="npc-skin${data.appearance.hair === c ? ' sel' : ''}" data-haircol="${c}" style="background:${c}"></span>`).join('');
  const hairBtns = [{ id: '', name: 'Без' }, ...HAIR_STYLES].map(s => `<button class="npc-hair${data.appearance.hairStyle === s.id ? ' sel' : ''}" data-hair="${s.id}">${s.art ? `<svg viewBox="185 40 150 135">${s.art.split('#484848').join('#6b4a2b')}</svg>` : '✕'}</button>`).join('');
  const equipRows = EQUIP_ORDER.map(slot => `<label class="npc-eq"><span>${SLOT_NAMES[slot]}</span><select data-slot="${slot}">${optHtml(EQUIP_ITEMS[slot], data.equipment[slot] || '')}</select></label>`).join('');
  const sellChecks = SELL_ITEMS.map(([id, l]) => `<label class="npc-sell"><input type="checkbox" data-sell="${id}"${data.sells.includes(id) ? ' checked' : ''}> ${escHtml(l)}</label>`).join('');
  ov.innerHTML = `
    <div class="npc-modal">
      <div class="npc-left">
        <div class="npc-preview" id="npcPreview"></div>
        <div class="npc-skins" id="npcSkins">${skinSw}</div>
        <div class="npc-lbl">Причёска</div>
        <div class="npc-hairstyles">${hairBtns}</div>
        <div class="npc-lbl">Цвет волос</div>
        <div class="npc-skins">${hairColSw}</div>
        <div class="npc-eqgrid">${equipRows}</div>
      </div>
      <div class="npc-right">
        <h3>${existing ? 'Изменить НПС' : 'Создать НПС'}</h3>
        <label class="npc-f">Имя<input id="npcName" type="text" maxlength="24" value="${escAttr(data.name)}"></label>
        <label class="npc-f">Метка связи<input id="npcLink" type="text" maxlength="24" value="${escAttr(data.link)}" placeholder="для квеста «поговори с…» (иначе имя)"></label>
        <label class="npc-f">Описание (видно в окне разговора)<textarea id="npcDesc" maxlength="300" rows="2">${escHtml(data.description)}</textarea></label>
        <label class="npc-f">Реплика (кнопка «Поговорить»)<textarea id="npcDialogue" maxlength="300" rows="2">${escHtml(data.dialogue)}</textarea></label>
        <label class="npc-f">Финальный диалог talk-квеста<textarea id="npcTalk" maxlength="300" rows="2" placeholder="покажется, когда игрок придёт сюда завершить квест «поговори с…»">${escHtml(data.talkText)}</textarea></label>
        <label class="npc-chk"><input id="npcTrader" type="checkbox"${data.trader ? ' checked' : ''}> Принимает товары (игрок ПРОДАЁТ ему)</label>
        <label class="npc-chk"><input id="npcSeller" type="checkbox"${data.sells.length ? ' checked' : ''}> Продаёт товары (игрок ПОКУПАЕТ)</label>
        <div class="npc-f npc-sellbox${data.sells.length ? '' : ' hidden'}" id="npcSellBox">Что продаёт:<div class="npc-sells" id="npcSells">${sellChecks}</div></div>
        <div class="npc-f">Квесты<div id="npcQuests"></div><button id="npcAddQuest" class="npc-addq">+ Добавить квест</button></div>
        <div class="npc-btns">
          ${existing ? '<button id="npcDelete" class="m-danger">Удалить</button>' : ''}
          <button id="npcCancel" class="m-cancel">Отмена</button>
          <button id="npcSave" class="m-ok">Сохранить</button>
        </div>
      </div>
    </div>`;
  ov.classList.remove('hidden');

  const $ = (id) => ov.querySelector('#' + id);
  const preview = () => { $('npcPreview').innerHTML = buildCharacterSVG(data.appearance, data.equipment); };
  preview();

  ov.querySelectorAll('.npc-skin[data-c]').forEach(sw => sw.addEventListener('click', () => {
    data.appearance.skin = sw.dataset.c;
    ov.querySelectorAll('.npc-skin[data-c]').forEach(s => s.classList.remove('sel')); sw.classList.add('sel');
    preview();
  }));
  ov.querySelectorAll('.npc-skin[data-haircol]').forEach(sw => sw.addEventListener('click', () => {
    data.appearance.hair = sw.dataset.haircol;
    ov.querySelectorAll('.npc-skin[data-haircol]').forEach(s => s.classList.remove('sel')); sw.classList.add('sel');
    preview();
  }));
  ov.querySelectorAll('.npc-hair').forEach(b => b.addEventListener('click', () => {
    data.appearance.hairStyle = b.dataset.hair;
    ov.querySelectorAll('.npc-hair').forEach(s => s.classList.remove('sel')); b.classList.add('sel');
    preview();
  }));
  ov.querySelectorAll('select[data-slot]').forEach(sel => sel.addEventListener('change', () => {
    const slot = sel.dataset.slot; if (sel.value) data.equipment[slot] = sel.value; else delete data.equipment[slot];
    preview();
  }));
  // Квесты: блоки + кнопка добавить
  const questsBox = $('npcQuests');
  data.quests.forEach(q => questsBox.appendChild(makeQuestBlock(q)));
  $('npcAddQuest').addEventListener('click', () => questsBox.appendChild(makeQuestBlock(questDefaults())));
  // Список товаров доступен только если включён «продавец»
  $('npcSeller').addEventListener('change', () => $('npcSellBox').classList.toggle('hidden', !$('npcSeller').checked));

  const close = () => { ov.classList.add('hidden'); ov.innerHTML = ''; };
  $('npcCancel').addEventListener('click', close);
  if (existing) $('npcDelete').addEventListener('click', () => { removeNpc(x, y); close(); });
  $('npcSave').addEventListener('click', () => {
    data.name = ($('npcName').value || 'НПС').trim().slice(0, 24);
    data.link = ($('npcLink').value || '').trim().slice(0, 24);
    data.description = ($('npcDesc').value || '').slice(0, 300);
    data.trader = $('npcTrader').checked;
    data.dialogue = ($('npcDialogue').value || '').slice(0, 300);
    data.talkText = ($('npcTalk').value || '').slice(0, 300);
    data.sells = $('npcSeller').checked ? [...ov.querySelectorAll('[data-sell]')].filter(c => c.checked).map(c => c.dataset.sell) : [];
    data.quests = [...questsBox.querySelectorAll('.npc-qblock')].map(readQuestBlock);
    delete data.quest;       // убрать легаси-поле
    setNpc(x, y, data);
    close();
  });
}

// --- Конструктор моба ---
const LOOT_ITEMS = [['rawChicken', 'Сырая курица'], ['cookedChicken', 'Жареная курица'], ['leather', 'Кожа'], ['wood', 'Древесина'], ['stone', 'Камень'], ['ore', 'Железная руда'], ['ingot', 'Слиток'], ['sand', 'Песок'], ['emptyFlask', 'Колба'], ['bearHelmet', 'Медвежий шлем'], ['ironSword', 'Железный меч'], ['ironGreatsword', 'Двуручный меч'], ['ironShield', 'Железный щит'], ['helmet', 'Железный шлем'], ['chest', 'Железный нагрудник'], ['silverOre', 'Серебряная руда'], ['silverIngot', 'Серебряный слиток']];
const MOB_SPRITE_OPTS = MOB_TEXTURES.map(t => [t.id, t.name]);
function mobTexSize(id) { return (MOB_TEX_BY_ID[id] && MOB_TEX_BY_ID[id].size) || 46; }
function mobDefaults() { return { name: '', sprite: 'wolf', aggro: 'aggressive', hp: 24, armor: 0, dmgMin: 2, dmgMax: 5, respawn: 10, size: 0, loot: [] }; }
function makeLootBlock(l) {
  l = l || { id: 'rawChicken', qty: 1, chance: 1 };
  const el = document.createElement('div');
  el.className = 'mob-loot-row';
  el.innerHTML = `<select class="l-item">${optHtml(LOOT_ITEMS, l.id)}</select><span>×</span><input class="l-qty" type="number" min="1" value="${l.qty || 1}"><input class="l-chance" type="number" min="1" max="100" value="${Math.round((l.chance != null ? l.chance : 1) * 100)}"><span>%</span><button class="l-remove" title="Убрать">✕</button>`;
  el.querySelector('.l-remove').addEventListener('click', () => el.remove());
  return el;
}
function readLootBlock(el) {
  const id = el.querySelector('.l-item').value;
  const qty = Math.max(1, parseInt(el.querySelector('.l-qty').value, 10) || 1);
  const chance = Math.max(1, Math.min(100, parseInt(el.querySelector('.l-chance').value, 10) || 100)) / 100;
  return { id, qty, chance };
}

function openMobEditor(x, y, existing, toLibrary) {
  const data = existing ? JSON.parse(JSON.stringify(existing)) : mobDefaults();
  if (!Array.isArray(data.loot)) data.loot = [];
  const ov = document.getElementById('npcOverlay');
  const texSvg = (id) => (MOB_TEX_BY_ID[id] && MOB_TEX_BY_ID[id].svg) || ('/assets/' + id + '.svg');
  const spriteBtns = MOB_SPRITE_OPTS.map(([s, l]) => `<button class="mob-sprite${data.sprite === s ? ' sel' : ''}" data-sprite="${s}"><img src="${texSvg(s)}" alt="">${l}</button>`).join('');
  ov.innerHTML = `
    <div class="npc-modal">
      <div class="npc-left">
        <div class="npc-preview"><img id="mobPreview" src="${texSvg(data.sprite)}" style="width:80%;height:80%"></div>
        <div class="mob-sprites" id="mobSprites">${spriteBtns}</div>
      </div>
      <div class="npc-right">
        <h3>${existing ? 'Изменить моба' : 'Создать моба'}</h3>
        <label class="npc-f">Имя (необязательно)<input id="mName" type="text" maxlength="24" value="${escAttr(data.name)}" placeholder="напр. Лютоволк"></label>
        <label class="npc-f">Поведение<select id="mAggro">${optHtml([['friendly', 'Мирный (нельзя атаковать)'], ['passive', 'Пассивный (даёт сдачи)'], ['aggressive', 'Агрессивный (нападает сам)']], data.aggro)}</select></label>
        <div class="mob-stats">
          <label class="npc-f">HP<input id="mHp" type="number" min="1" value="${data.hp}"></label>
          <label class="npc-f">Броня<input id="mArmor" type="number" min="0" value="${data.armor}"></label>
          <label class="npc-f">Урон мин<input id="mDmgMin" type="number" min="0" value="${data.dmgMin}"></label>
          <label class="npc-f">Урон макс<input id="mDmgMax" type="number" min="0" value="${data.dmgMax}"></label>
          <label class="npc-f">Респавн, сек<input id="mResp" type="number" min="1" value="${data.respawn}"></label>
          <label class="npc-f">Размер<input id="mSize" type="number" min="8" max="200" value="${data.size || mobTexSize(data.sprite)}"></label>
        </div>
        <div class="npc-f">Лут (предмет · кол-во · шанс)<div id="mLoot"></div><button id="mAddLoot" class="npc-addq">+ Добавить лут</button></div>
        <div class="npc-btns">
          ${existing ? '<button id="mDelete" class="m-danger">Удалить</button>' : ''}
          <button id="mCancel" class="m-cancel">Отмена</button>
          <button id="mSave" class="m-ok">Сохранить</button>
        </div>
      </div>
    </div>`;
  ov.classList.remove('hidden');
  const $ = (id) => ov.querySelector('#' + id);
  // выбор текстуры (при смене подставляем размер по умолчанию для этой текстуры, если поле не правили вручную)
  let curTexDef = mobTexSize(data.sprite);
  ov.querySelectorAll('.mob-sprite').forEach(b => b.addEventListener('click', () => {
    const nd = mobTexSize(b.dataset.sprite);
    if (parseInt($('mSize').value, 10) === curTexDef) $('mSize').value = nd;
    curTexDef = nd;
    data.sprite = b.dataset.sprite;
    ov.querySelectorAll('.mob-sprite').forEach(o => o.classList.remove('sel')); b.classList.add('sel');
    $('mobPreview').src = texSvg(data.sprite);
  }));
  // лут
  const lootBox = $('mLoot');
  data.loot.forEach(l => lootBox.appendChild(makeLootBlock(l)));
  $('mAddLoot').addEventListener('click', () => lootBox.appendChild(makeLootBlock()));

  const close = () => { ov.classList.add('hidden'); ov.innerHTML = ''; };
  $('mCancel').addEventListener('click', close);
  if (existing) $('mDelete').addEventListener('click', () => { removeMob(x, y); close(); });
  $('mSave').addEventListener('click', () => {
    data.name = ($('mName').value || '').trim().slice(0, 24);
    data.aggro = $('mAggro').value;
    data.hp = Math.max(1, parseInt($('mHp').value, 10) || 1);
    data.armor = Math.max(0, parseInt($('mArmor').value, 10) || 0);
    data.dmgMin = Math.max(0, parseInt($('mDmgMin').value, 10) || 0);
    data.dmgMax = Math.max(0, parseInt($('mDmgMax').value, 10) || 0);
    data.respawn = Math.max(1, parseInt($('mResp').value, 10) || 10);
    data.size = Math.max(8, Math.min(200, parseInt($('mSize').value, 10) || mobTexSize(data.sprite)));
    data.loot = [...lootBox.querySelectorAll('.mob-loot-row')].map(readLootBlock);
    setMob(x, y, data);
    if (toLibrary) {   // новый моб → в библиотеку + сразу выбран для штамповки
      savedMobs.push(JSON.parse(JSON.stringify(data))); persistSavedMobs();
      selected = 'mobstamp:' + (savedMobs.length - 1); buildPalette();
    }
    close();
  });
}

// НПС в редакторе: персонаж со своей внешностью/экипировкой + имя + значок роли
function drawNpcMarker(cx, cy, n) {
  const z = zoom;
  const ent = getCharImage(n.appearance || DEFAULT_APPEARANCE, n.equipment || {});
  const H = 46 * z, W = H * CHAR_RATIO, topY = cy + 4 * z - H * CHAR_FEET;
  if (ent.ready) ctx.drawImage(ent.img, cx - W / 2, topY, W, H);
  else { ctx.fillStyle = '#f3cfa6'; ctx.beginPath(); ctx.arc(cx, cy - 10 * z, 6 * z, 0, Math.PI * 2); ctx.fill(); }
  // имя
  ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(11 * z)}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText(n.name || 'НПС', cx, topY - 4 * z);
  // значки ролей
  let badge = '';
  if (n.quests && n.quests.length) badge += '!';
  else if (n.quest) badge += '!';                 // легаси
  if (n.trader) badge += '$';
  if (n.sells && n.sells.length) badge += '+';    // продаёт товары
  if (n.talkText) badge += '?';
  if (badge) { ctx.fillStyle = '#f1c40f'; ctx.font = `bold ${Math.round(12 * z)}px sans-serif`; ctx.fillText(badge, cx, topY - 16 * z); }
}

// Рыбное место в редакторе: рябь + рыбка + название
function drawSpotMarker(cx, cy, s) {
  const z = zoom;
  ctx.save();
  ctx.strokeStyle = 'rgba(120,200,255,.85)'; ctx.lineWidth = 1.6 * z;
  for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(cx, cy, 6 * i * z, 3 * i * z, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#b8c2cc'; ctx.beginPath(); ctx.ellipse(cx - 1 * z, cy - 1 * z, 6 * z, 3 * z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + 4 * z, cy - 1 * z); ctx.lineTo(cx + 9 * z, cy - 4 * z); ctx.lineTo(cx + 9 * z, cy + 2 * z); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a2f37'; ctx.beginPath(); ctx.arc(cx - 5 * z, cy - 2 * z, 1.2 * z, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const label = s.name || 'Рыбное место';
  ctx.font = `bold ${Math.round(10 * z)}px sans-serif`; ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 3 * z; ctx.strokeText(label, cx, cy - 14 * z);
  ctx.fillStyle = '#bfe3ff'; ctx.fillText(label, cx, cy - 14 * z);
}

// --- Конструктор рыбного места (модальное окно) ---
function spotDefaults() { return { name: 'Рыбное место', fish: [{ id: 'sprat', chance: 70, minLevel: 1, xp: 8 }] }; }
// Одна строка таблицы рыбы: рыба · шанс(%) · мин.уровень · опыт
function makeFishRow(f) {
  f = { id: 'sprat', chance: 50, minLevel: 1, xp: 10, ...f };
  const el = document.createElement('div');
  el.className = 'mob-loot-row fish-row';
  el.innerHTML = `
    <select class="f-item">${optHtml(FISH_ITEMS, f.id)}</select>
    <span class="npc-inline">шанс<input class="f-chance" type="number" min="1" max="100" value="${Math.round((f.chance <= 1 ? f.chance * 100 : f.chance))}">%</span>
    <span class="npc-inline">ур.<input class="f-min" type="number" min="1" max="99" value="${f.minLevel || 1}"></span>
    <span class="npc-inline">опыт<input class="f-xp" type="number" min="1" value="${f.xp || 10}"></span>
    <button class="l-remove" title="Удалить">✕</button>`;
  el.querySelector('.l-remove').addEventListener('click', () => el.remove());
  return el;
}
function readFishRow(el) {
  return {
    id: el.querySelector('.f-item').value,
    chance: Math.max(1, Math.min(100, parseInt(el.querySelector('.f-chance').value, 10) || 50)) / 100,
    minLevel: Math.max(1, Math.min(99, parseInt(el.querySelector('.f-min').value, 10) || 1)),
    xp: Math.max(1, parseInt(el.querySelector('.f-xp').value, 10) || 10),
  };
}
function openSpotEditor(x, y, existing, toLibrary) {
  const data = existing ? JSON.parse(JSON.stringify(existing)) : spotDefaults();
  if (!Array.isArray(data.fish)) data.fish = [];
  const ov = document.getElementById('npcOverlay');
  ov.innerHTML = `
    <div class="npc-modal">
      <div class="npc-right" style="width:100%">
        <h3>${existing ? 'Рыбное место' : 'Новое рыбное место'}</h3>
        <p class="npc-hint">Ставится на воду. Какая рыба попадётся — зависит от этой таблицы (место) и от уровня рыбалки игрока (мин. уровень). Шанс — это вес рыбы среди доступной по уровню.</p>
        <label class="npc-f">Название<input id="spName" type="text" maxlength="24" value="${escAttr(data.name)}" placeholder="напр. Пруд / Море"></label>
        <div class="npc-f">Рыба (рыба · шанс · мин. уровень · опыт)<div id="spFish"></div><button id="spAddFish" class="npc-addq">+ Добавить рыбу</button></div>
        <div class="npc-btns">
          ${existing ? '<button id="spDelete" class="m-danger">Удалить</button>' : ''}
          <button id="spCancel" class="m-cancel">Отмена</button>
          <button id="spSave" class="m-ok">Сохранить</button>
        </div>
      </div>
    </div>`;
  ov.classList.remove('hidden');
  const $ = (id) => ov.querySelector('#' + id);
  const fishBox = $('spFish');
  data.fish.forEach(f => fishBox.appendChild(makeFishRow(f)));
  $('spAddFish').addEventListener('click', () => fishBox.appendChild(makeFishRow()));
  const close = () => { ov.classList.add('hidden'); ov.innerHTML = ''; };
  $('spCancel').addEventListener('click', close);
  if (existing) $('spDelete').addEventListener('click', () => { removeSpot(x, y); close(); });
  $('spSave').addEventListener('click', () => {
    data.name = ($('spName').value || '').trim().slice(0, 24) || 'Рыбное место';
    data.fish = [...fishBox.querySelectorAll('.fish-row')].map(readFishRow);
    if (!data.fish.length) { alert('Добавь хотя бы одну рыбу в таблицу.'); return; }
    setSpot(x, y, data);
    if (toLibrary) {   // новое место → в библиотеку + сразу выбрано для штамповки
      savedSpots.push(JSON.parse(JSON.stringify(data))); persistSavedSpots();
      selected = 'spotstamp:' + (savedSpots.length - 1); buildPalette();
    }
    close();
  });
}
requestAnimationFrame(render);
