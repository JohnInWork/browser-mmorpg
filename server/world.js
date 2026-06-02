// Мир: карта, её загрузка/сохранение, проходимость, спавн-точки.
// Владеет состоянием карты (MAP/W/H). Наружу — только функции (MAP переприсваивается).
const path = require('path');
const fs = require('fs');
const { BLOCKED } = require('./config');
const DEFAULT_MAP = require('./data/default-map.json');

const MAPS_DIR = path.join(__dirname, 'maps');
const MAP_FILE = path.join(MAPS_DIR, 'world.json');
const TEST_MAP_FILE = path.join(__dirname, '..', 'client-test', 'map-data.js');
const blockedSet = new Set(BLOCKED);

let MAP = null, W = 0, H = 0;

function saveToDisk() {
  if (!fs.existsSync(MAPS_DIR)) fs.mkdirSync(MAPS_DIR, { recursive: true });
  fs.writeFileSync(MAP_FILE, JSON.stringify(MAP));
}

// Дублируем карту в JS для одиночного теста (открывается без сервера, через file://)
function writeTestMapJs() {
  try {
    const dir = path.dirname(TEST_MAP_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TEST_MAP_FILE, 'window.TEST_MAP = ' + JSON.stringify(MAP) + ';\n');
  } catch (e) { /* не критично для игры */ }
}

function load() {
  try {
    MAP = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
  } catch (e) {
    MAP = DEFAULT_MAP;
    H = MAP.length; W = MAP[0].length;
    saveToDisk();
    console.log('  → Карта world.json не найдена, создана дефолтная');
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
    for (const c of row) if (!Number.isInteger(c) || c < 0 || c > 9) return false;
  }
  return true;
}

// Сохранить новую карту (от редактора). Возвращает true при успехе.
function setMap(newMap) {
  if (!isValidMap(newMap)) return false;
  MAP = newMap; H = MAP.length; W = MAP[0].length;
  saveToDisk();
  writeTestMapJs();
  return true;
}

// Снимок карты для отправки клиентам
function getState() { return { map: MAP, width: W, height: H }; }

module.exports = { load, isWalkable, randomSpawn, isValidMap, setMap, getState };
