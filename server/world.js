// Мир: НЕСКОЛЬКО локаций (карт). Каждая локация = { map, floor, teleports }.
// MAP — «эффективный» тайл (объект или пол; id не пересекаются), FLOOR — пол под объектом.
// Телепорты (лестницы) связаны по sid: наступив на один, попадаешь к другому с тем же sid (в любой локации).
const path = require('path');
const fs = require('fs');
const { BLOCKED, TILES } = require('./config');
const DEFAULT_MAP = require('./data/default-map.json');

const MAPS_DIR = path.join(__dirname, 'maps');
const MAP_FILE = path.join(MAPS_DIR, 'world.json');
const TEST_MAP_FILE = path.join(__dirname, '..', 'client-test', 'map-data.js');
const blockedSet = new Set(BLOCKED);

const MAX_TILE = 18;
const START = 'surface';
const GROUND = new Set([0, 1, 4, 15]);          // тайлы пола (трава/вода/тропа/пещера)
function isGround(t) { return GROUND.has(t); }
function deriveFloor(map) { return map.map(row => row.map(t => (isGround(t) ? t : 0))); }
function clone(m) { return m.map(r => r.slice()); }

let locations = {};   // { name: { map, floor, teleports, W, H } }

// --- Дефолтные локации ---
function defaultSurface() {
  const map = clone(DEFAULT_MAP);
  map[3][5] = TILES.STAIRS_DOWN;                // лестница вниз → в Шахты (sid 1)
  return { map, floor: deriveFloor(map), teleports: [{ x: 5, y: 3, sid: 1 }] };
}
function defaultMines() {
  const W = 20, H = 14, map = [], floor = [];
  for (let y = 0; y < H; y++) {
    const mr = [], fr = [];
    for (let x = 0; x < W; x++) {
      const border = (x === 0 || y === 0 || x === W - 1 || y === H - 1);
      mr.push(border ? TILES.WALL : TILES.CAVE);
      fr.push(border ? 0 : TILES.CAVE);          // под объектами в пещере — пещерный пол
    }
    map.push(mr); floor.push(fr);
  }
  [[6, 4], [6, 5], [13, 8], [13, 9], [9, 10]].forEach(([x, y]) => { map[y][x] = TILES.WALL; }); // колонны
  map[3][3] = TILES.STAIRS_UP;                   // лестница наверх → на Поверхность (sid 1)
  return { map, floor, teleports: [{ x: 3, y: 3, sid: 1 }] };
}

function normLoc(L) {
  const map = L.map, floor = Array.isArray(L.floor) ? L.floor : deriveFloor(map);
  return { map, floor, teleports: Array.isArray(L.teleports) ? L.teleports : [], H: map.length, W: map[0].length };
}

function saveToDisk() {
  if (!fs.existsSync(MAPS_DIR)) fs.mkdirSync(MAPS_DIR, { recursive: true });
  const out = {};
  for (const k in locations) out[k] = { map: locations[k].map, floor: locations[k].floor, teleports: locations[k].teleports };
  fs.writeFileSync(MAP_FILE, JSON.stringify({ locations: out }));
}

// Офлайн-тест (file://) — пишем только Поверхность как эффективный массив
function writeTestMapJs() {
  try {
    const dir = path.dirname(TEST_MAP_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TEST_MAP_FILE, 'window.TEST_MAP = ' + JSON.stringify(locations[START].map) + ';\n');
  } catch (e) { /* не критично */ }
}

// Разобрать сохранённое: новый формат {locations}, старый {map,floor}, или массив
function parse(raw) {
  if (raw && raw.locations) { const out = {}; for (const k in raw.locations) out[k] = normLoc(raw.locations[k]); return out; }
  if (raw && Array.isArray(raw.map)) return { surface: normLoc(raw) };
  if (Array.isArray(raw)) return { surface: normLoc({ map: raw }) };
  return null;
}

function load() {
  let parsed = null;
  try { parsed = parse(JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))); } catch (e) { parsed = null; }
  if (!parsed) parsed = { surface: normLoc(defaultSurface()), mines: normLoc(defaultMines()) }; // дефолт только при первом запуске
  if (!parsed[START]) parsed[START] = normLoc(defaultSurface()); // Поверхность обязательна
  locations = parsed;
  saveToDisk();
  writeTestMapJs();
  console.log(`  → Локаций загружено: ${Object.keys(locations).join(', ')}`);
}

function hasLoc(loc) { return !!locations[loc]; }
function startLocation() { return START; }
function tileAt(loc, x, y) { const L = locations[loc]; return (L && L.map[y]) ? L.map[y][x] : 2; }

function isWalkable(loc, x, y) {
  const L = locations[loc];
  if (!L || x < 0 || y < 0 || x >= L.W || y >= L.H) return false;
  return !blockedSet.has(L.map[y][x]);
}

function randomSpawn(loc) {
  const L = locations[loc] || locations[START];
  for (let i = 0; i < 300; i++) {
    const x = 1 + Math.floor(Math.random() * (L.W - 2));
    const y = 1 + Math.floor(Math.random() * (L.H - 2));
    if (isWalkable(loc, x, y)) return { x, y };
  }
  return { x: 1, y: 1 };
}

// Куда ведёт телепорт на (loc,x,y): ищем парный по sid в любой локации
function teleportTarget(loc, x, y) {
  const L = locations[loc]; if (!L) return null;
  const here = (L.teleports || []).find(e => e.x === x && e.y === y);
  if (!here) return null;
  for (const ln in locations)
    for (const e of (locations[ln].teleports || []))
      if (e.sid === here.sid && !(ln === loc && e.x === x && e.y === y)) return { location: ln, x: e.x, y: e.y };
  return null;
}

// Снимок одной локации для игрового клиента
function locState(loc) {
  const L = locations[loc] || locations[START];
  const name = locations[loc] ? loc : START;
  return { location: name, map: L.map, floor: L.floor, width: L.W, height: L.H };
}

// Все локации для редактора
function editorState() {
  const out = {};
  for (const k in locations) out[k] = { map: locations[k].map, floor: locations[k].floor, teleports: locations[k].teleports, width: locations[k].W, height: locations[k].H };
  return { locations: out };
}

function isValidMap(m) {
  if (!Array.isArray(m) || m.length === 0) return false;
  const w = m[0].length;
  for (const row of m) {
    if (!Array.isArray(row) || row.length !== w) return false;
    for (const c of row) if (!Number.isInteger(c) || c < 0 || c > MAX_TILE) return false;
  }
  return true;
}

// Сохранить локации (от редактора). payload = { locations: { name: {map,floor,teleports} } }
function setLocations(payload) {
  const parsed = (payload && payload.locations) ? payload : (payload && payload.map ? { locations: { surface: payload } } : null);
  if (!parsed) return false;
  const next = {};
  for (const k in parsed.locations) {
    const L = parsed.locations[k];
    const map = L.map, floor = Array.isArray(L.floor) ? L.floor : deriveFloor(map);
    if (!isValidMap(map) || !isValidMap(floor)) return false;
    if (map.length !== floor.length || map[0].length !== floor[0].length) return false;
    const teleports = Array.isArray(L.teleports) ? L.teleports.filter(e => Number.isInteger(e.x) && Number.isInteger(e.y) && Number.isInteger(e.sid)) : [];
    next[k] = { map, floor, teleports, H: map.length, W: map[0].length };
  }
  if (!next[START]) return false;                 // Поверхность обязательна (стартовая локация)
  locations = next;
  saveToDisk();
  writeTestMapJs();
  return true;
}

module.exports = { load, isWalkable, randomSpawn, tileAt, teleportTarget, locState, editorState, setLocations, hasLoc, startLocation, isValidMap };
