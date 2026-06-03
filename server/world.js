// Мир: НЕСКОЛЬКО локаций (карт). Каждая локация = { map, floor, teleports }.
// MAP — «эффективный» тайл (объект или пол; id не пересекаются), FLOOR — пол под объектом.
// Телепорты (лестницы) связаны по sid: наступив на один, попадаешь к другому с тем же sid (в любой локации).
const path = require('path');
const fs = require('fs');
const { BLOCKED, TILES } = require('./config');
const DEFAULT_MAP = require('./data/default-map.json');
const MOB_DATA = require('./data/mobs.json');
const MOB_TYPES = new Set(Object.keys(MOB_DATA.types || {}));           // допустимые типы мобов
const DEFAULT_SURFACE_MOBS = (MOB_DATA.spawns || []).map(s => ({ x: s.x, y: s.y, type: s.type })); // стартовые мобы Поверхности
const questsMod = require('./quests');                                  // реестр авторских квестов (с НПС)

// Собрать все авторские квесты с НПС всех локаций в реестр движка квестов
function rebuildQuestRegistry() {
  const defs = {};
  for (const ln in locations) for (const n of (locations[ln].npcs || [])) for (const q of (n.quests || [])) defs[q.id] = { ...q, npc: n.name, location: ln };
  questsMod.setAuthored(defs);
}

const MAPS_DIR = path.join(__dirname, 'maps');
const MAP_FILE = path.join(MAPS_DIR, 'world.json');
const TEST_MAP_FILE = path.join(__dirname, '..', 'client-test', 'map-data.js');
const blockedSet = new Set(BLOCKED);

const MAX_TILE = 31;
const SPAWN_TILE = 19;
const START = 'surface';
const GROUND = new Set([0, 1, 4, 15, 20, 21, 22, 23, 31]); // полы: трава/вода/тропа/пещера/земля/тёмн.трава/цветы/брусчатка/песок
function isGround(t) { return GROUND.has(t); }
function deriveFloor(map) { return map.map(row => row.map(t => (isGround(t) ? t : 0))); }
function clone(m) { return m.map(r => r.slice()); }

let locations = {};   // { name: { map, floor, teleports, W, H } }

// --- Дефолтные локации ---
function defaultSurface() {
  const map = clone(DEFAULT_MAP);
  map[3][5] = TILES.STAIRS_DOWN;                // лестница вниз → в Шахты (sid 1)
  return { map, floor: deriveFloor(map), teleports: [{ x: 5, y: 3, sid: 1 }], mobs: DEFAULT_SURFACE_MOBS.map(m => ({ ...m })) };
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
  return { map, floor, teleports: [{ x: 3, y: 3, sid: 1 }], mobs: [] };
}

const EQUIP_SLOTS = ['helmet', 'chest', 'gloves', 'pants', 'boots', 'cloak', 'mainHand', 'offHand'];
const QUEST_TYPES = new Set(['gather', 'kill', 'talk']);

// Нормализовать один квест НПС (стабильный id с индексом)
function normQuest(q, loc, x, y, i) {
  if (!q || typeof q !== 'object' || !QUEST_TYPES.has(q.type)) return null;
  return {
    id: `q_${loc}_${x}_${y}_${i}`,
    title: String(q.title || 'Задание').slice(0, 60),
    desc: String(q.desc || '').slice(0, 300),
    type: q.type,
    target: String(q.target || ''),            // gather: itemId; kill: тип моба; talk: метка/имя НПС
    count: q.type === 'talk' ? 1 : Math.max(1, q.count | 0),
    reward: Math.max(0, q.reward | 0),          // золото
    rewardItem: (q.rewardItem && q.rewardItem.id) ? { id: String(q.rewardItem.id), qty: Math.max(1, q.rewardItem.qty | 0) } : null,
    thanks: String(q.thanks || 'Спасибо за помощь!').slice(0, 300),
    repeatable: !!q.repeatable,                 // повторяемый — можно брать снова после выполнения
  };
}

// Нормализовать одного НПС (приводим к безопасному виду; квестам даём стабильные id)
function normNpc(n, loc, idx) {
  const x = n.x | 0, y = n.y | 0;
  const appearance = (n.appearance && typeof n.appearance === 'object') ? { ...n.appearance } : {};
  const equipment = {};
  if (n.equipment && typeof n.equipment === 'object') for (const s of EQUIP_SLOTS) if (n.equipment[s]) equipment[s] = String(n.equipment[s]);
  // Квесты: новый формат — массив quests; легаси — одиночный quest
  const rawQuests = Array.isArray(n.quests) ? n.quests : (n.quest ? [n.quest] : []);
  const quests = rawQuests.map((q, i) => normQuest(q, loc, x, y, i)).filter(Boolean);
  const sells = Array.isArray(n.sells) ? [...new Set(n.sells.map(String))] : [];   // товары (игрок покупает)
  return {
    id: `n_${loc}_${x}_${y}`,
    x, y,
    name: String(n.name || 'НПС').slice(0, 24),
    link: String(n.link || '').slice(0, 24),     // метка для talk-квестов (пусто → используется имя)
    description: String(n.description || '').slice(0, 300), // вступительный текст в окне разговора
    appearance, equipment,
    trader: !!n.trader,                          // принимает на продажу (игрок продаёт ему)
    sells,                                       // продаёт игроку эти предметы (Купить)
    dialogue: String(n.dialogue || '').slice(0, 300),
    talkText: String(n.talkText || '').slice(0, 300), // финальный диалог, если этот НПС завершает talk-квест
    quests,
  };
}

function normLoc(L, locName) {
  const map = L.map, floor = Array.isArray(L.floor) ? L.floor : deriveFloor(map);
  // mobs: undefined = поле отсутствовало (легаси, подсеем позже); массив = используем как есть
  const mobs = Array.isArray(L.mobs) ? L.mobs.map(m => ({ x: m.x, y: m.y, type: m.type })) : undefined;
  const signs = Array.isArray(L.signs) ? L.signs.map(s => ({ x: s.x, y: s.y, text: String(s.text || '') })) : [];
  const npcs = Array.isArray(L.npcs) ? L.npcs.map((n, i) => normNpc(n, locName || 'loc', i)) : [];
  return { map, floor, teleports: Array.isArray(L.teleports) ? L.teleports : [], mobs, signs, npcs, H: map.length, W: map[0].length };
}

function saveToDisk() {
  if (!fs.existsSync(MAPS_DIR)) fs.mkdirSync(MAPS_DIR, { recursive: true });
  const out = {};
  for (const k in locations) out[k] = { map: locations[k].map, floor: locations[k].floor, teleports: locations[k].teleports, mobs: locations[k].mobs || [], signs: locations[k].signs || [], npcs: locations[k].npcs || [] };
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
  if (raw && raw.locations) { const out = {}; for (const k in raw.locations) out[k] = normLoc(raw.locations[k], k); return out; }
  if (raw && Array.isArray(raw.map)) return { surface: normLoc(raw, 'surface') };
  if (Array.isArray(raw)) return { surface: normLoc({ map: raw }, 'surface') };
  return null;
}

function load() {
  let parsed = null;
  try { parsed = parse(JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))); } catch (e) { parsed = null; }
  if (!parsed) parsed = { surface: normLoc(defaultSurface(), 'surface'), mines: normLoc(defaultMines(), 'mines') }; // дефолт только при первом запуске
  if (!parsed[START]) parsed[START] = normLoc(defaultSurface(), START); // Поверхность обязательна
  // Миграция: если у локации не было поля mobs (старый формат) — подсеять (Поверхности — стартовых мобов)
  for (const k in parsed) if (parsed[k].mobs === undefined) parsed[k].mobs = (k === START ? DEFAULT_SURFACE_MOBS.map(m => ({ ...m })) : []);
  locations = parsed;
  rebuildQuestRegistry();
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

// Расставленные в редакторе точки спавна локации (тайл 19)
function spawnPoints(loc) {
  const L = locations[loc]; if (!L) return [];
  const pts = [];
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) if (L.map[y][x] === SPAWN_TILE) pts.push({ x, y });
  return pts;
}
// Выбрать точку появления: случайная из расставленных, иначе любая проходимая
function pickSpawn(loc) {
  const pts = spawnPoints(loc);
  if (pts.length) return pts[Math.floor(Math.random() * pts.length)];
  return randomSpawn(loc);
}

// Все размещения мобов из карт (по всем локациям) — для спавна
function mobSpawns() {
  const out = [];
  for (const ln in locations) for (const m of (locations[ln].mobs || [])) out.push({ location: ln, x: m.x, y: m.y, type: m.type });
  return out;
}

// Куда ведёт телепорт на (loc,x,y): ищем парный по sid в любой локации
function teleportTarget(loc, x, y) {
  const L = locations[loc]; if (!L) return null;
  const here = (L.teleports || []).find(e => e.x === x && e.y === y);
  if (!here) return null;
  for (const ln in locations)
    for (const e of (locations[ln].teleports || []))
      if (String(e.sid) === String(here.sid) && !(ln === loc && e.x === x && e.y === y)) return { location: ln, x: e.x, y: e.y };
  return null;
}

// Публичный вид НПС для игрока (talkText не отдаём — он выдаётся сервером при завершении talk-квеста)
function publicNpc(n) {
  return { id: n.id, x: n.x, y: n.y, name: n.name, link: n.link, description: n.description, appearance: n.appearance, equipment: n.equipment, trader: n.trader, sells: n.sells || [], dialogue: n.dialogue, quests: n.quests || [] };
}
function npcsOf(loc) { const L = locations[loc]; return L ? (L.npcs || []).map(publicNpc) : []; }
function npcAt(loc, x, y) { const L = locations[loc]; if (!L) return null; return (L.npcs || []).find(n => n.x === x && n.y === y) || null; }
// Найти НПС по метке связи (или имени) в указанной локации (для talk-квестов)
function npcByLink(loc, label) {
  const L = locations[loc]; if (!L || !label) return null;
  const t = String(label).trim();
  return (L.npcs || []).find(n => String(n.link || '').trim() === t || String(n.name || '').trim() === t) || null;
}

// Снимок одной локации для игрового клиента
function locState(loc) {
  const L = locations[loc] || locations[START];
  const name = locations[loc] ? loc : START;
  return { location: name, map: L.map, floor: L.floor, signs: L.signs || [], npcs: (L.npcs || []).map(publicNpc), width: L.W, height: L.H };
}

// Все локации для редактора
function editorState() {
  const out = {};
  for (const k in locations) out[k] = { map: locations[k].map, floor: locations[k].floor, teleports: locations[k].teleports, mobs: locations[k].mobs || [], signs: locations[k].signs || [], npcs: locations[k].npcs || [], width: locations[k].W, height: locations[k].H };
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
    const teleports = Array.isArray(L.teleports)
      ? L.teleports.filter(e => Number.isInteger(e.x) && Number.isInteger(e.y) && e.sid != null && String(e.sid).trim() !== '')
          .map(e => ({ x: e.x, y: e.y, sid: String(e.sid).trim() }))   // связь — строка-метка (число или слово)
      : [];
    const mobs = Array.isArray(L.mobs)
      ? L.mobs.filter(m => Number.isInteger(m.x) && Number.isInteger(m.y) && MOB_TYPES.has(m.type)).map(m => ({ x: m.x, y: m.y, type: m.type }))
      : [];
    const signs = Array.isArray(L.signs)
      ? L.signs.filter(s => Number.isInteger(s.x) && Number.isInteger(s.y) && typeof s.text === 'string').map(s => ({ x: s.x, y: s.y, text: s.text.slice(0, 300) }))
      : [];
    const npcs = Array.isArray(L.npcs)
      ? L.npcs.filter(n => Number.isInteger(n.x) && Number.isInteger(n.y)).map(n => normNpc(n, k))
      : [];
    next[k] = { map, floor, teleports, mobs, signs, npcs, H: map.length, W: map[0].length };
  }
  if (!next[START]) return false;                 // Поверхность обязательна (стартовая локация)
  locations = next;
  rebuildQuestRegistry();
  saveToDisk();
  writeTestMapJs();
  return true;
}

module.exports = { load, isWalkable, randomSpawn, pickSpawn, spawnPoints, mobSpawns, tileAt, teleportTarget, locState, editorState, setLocations, hasLoc, startLocation, isValidMap, npcsOf, npcAt, npcByLink };
