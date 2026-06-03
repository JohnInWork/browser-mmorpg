// Мир: карта, её загрузка/сохранение, проходимость, спавн-точки.
// Два слоя: MAP — «эффективный» тайл (объект, если есть, иначе пол; id не пересекаются),
// FLOOR — пол под объектом (трава/тропа/вода), чтобы объект не затирал землю под собой.
const path = require('path');
const fs = require('fs');
const { BLOCKED } = require('./config');
const DEFAULT_MAP = require('./data/default-map.json');

const MAPS_DIR = path.join(__dirname, 'maps');
const MAP_FILE = path.join(MAPS_DIR, 'world.json');
const TEST_MAP_FILE = path.join(__dirname, '..', 'client-test', 'map-data.js');
const blockedSet = new Set(BLOCKED);

const MAX_TILE = 12;                          // максимальный id тайла (0..12)
const GROUND = new Set([0, 1, 4]);            // тайлы пола (трава/вода/тропа)
function isGround(t) { return GROUND.has(t); }
function deriveFloor(map) { return map.map(row => row.map(t => (isGround(t) ? t : 0))); } // под объектом по умолчанию — трава
function clone(m) { return m.map(r => r.slice()); }

let MAP = null, FLOOR = null, W = 0, H = 0;

function saveToDisk() {
  if (!fs.existsSync(MAPS_DIR)) fs.mkdirSync(MAPS_DIR, { recursive: true });
  fs.writeFileSync(MAP_FILE, JSON.stringify({ map: MAP, floor: FLOOR }));
}

// Дублируем карту в JS для одиночного теста (открывается без сервера, через file://)
function writeTestMapJs() {
  try {
    const dir = path.dirname(TEST_MAP_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TEST_MAP_FILE, 'window.TEST_MAP = ' + JSON.stringify(MAP) + ';\n');
  } catch (e) { /* не критично для игры */ }
}

// Принять формат: старый (массив тайлов) или новый ({map, floor}). Возвращает {map, floor} или null.
function parseMap(raw) {
  if (Array.isArray(raw)) return { map: raw, floor: deriveFloor(raw) };
  if (raw && Array.isArray(raw.map)) return { map: raw.map, floor: (Array.isArray(raw.floor) ? raw.floor : deriveFloor(raw.map)) };
  return null;
}

function load() {
  let parsed = null;
  try { parsed = parseMap(JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))); } catch (e) { parsed = null; }
  if (!parsed) {
    parsed = { map: clone(DEFAULT_MAP), floor: deriveFloor(DEFAULT_MAP) };
    MAP = parsed.map; FLOOR = parsed.floor; H = MAP.length; W = MAP[0].length;
    saveToDisk();
    console.log('  → Карта world.json не найдена, создана дефолтная');
  } else {
    MAP = parsed.map; FLOOR = parsed.floor;
  }
  H = MAP.length; W = MAP[0].length;
  writeTestMapJs();
}

function isWalkable(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  return !blockedSet.has(MAP[y][x]);
}

function randomSpawn() {
  for (let i = 0; i < 300; i++) {
    const x = 1 + Math.floor(Math.random() * (W - 2));
    const y = 1 + Math.floor(Math.random() * (H - 2));
    if (isWalkable(x, y)) return { x, y };
  }
  return { x: 1, y: 1 };
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

// Сохранить новую карту (от редактора). Принимает {map, floor} (или старый массив). true при успехе.
function setMap(payload) {
  const parsed = parseMap(payload);
  if (!parsed) return false;
  if (!isValidMap(parsed.map) || !isValidMap(parsed.floor)) return false;
  if (parsed.map.length !== parsed.floor.length || parsed.map[0].length !== parsed.floor[0].length) return false;
  MAP = parsed.map; FLOOR = parsed.floor; H = MAP.length; W = MAP[0].length;
  saveToDisk();
  writeTestMapJs();
  return true;
}

// Снимок карты для отправки клиентам (оба слоя)
function getState() { return { map: MAP, floor: FLOOR, width: W, height: H }; }

module.exports = { load, isWalkable, randomSpawn, isValidMap, setMap, getState };
