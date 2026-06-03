// Мобы: создание из данных (data/mobs.json), состояние, смерть/респаун.
// Владеет объектом mobs. Типы и расстановка — в data/mobs.json (контент отдельно от кода).
const { RESPAWN_MS } = require('./config');
const world = require('./world');
const { players } = require('./players');
const data = require('./data/mobs.json');

const TYPES = data.types;
const mobs = {}; // id -> { id, x, y, type, hp, maxHp, color, alive }
let seq = 0;

// Спавн мобов из карт (расставлены в редакторе, хранятся по локациям в world)
function create() {
  for (const s of world.mobSpawns()) {
    if (!world.isWalkable(s.location, s.x, s.y)) continue;     // на непроходимой клетке — пропустить
    const def = TYPES[s.type];
    if (!def) continue;
    const id = 'm' + (seq++);
    mobs[id] = { id, x: s.x, y: s.y, location: s.location, type: s.type, hp: def.maxHp, maxHp: def.maxHp, color: def.color, sprite: def.sprite || null, alive: true };
  }
}

// Очистить всех мобов (и отменить таймеры респауна) — перед пересборкой
function clear() {
  for (const id in mobs) { if (mobs[id]._respawn) clearTimeout(mobs[id]._respawn); delete mobs[id]; }
}

// Пересобрать мобов после правки карт в редакторе + разослать клиентам
function rebuild(io) {
  clear();
  create();
  for (const pid in players) { players[pid].target = null; players[pid].turn = null; }
  io.emit('mobsReset', publicMobs());
}

function mobAt(loc, x, y) {
  for (const id in mobs) { const m = mobs[id]; if (m.alive && m.location === loc && m.x === x && m.y === y) return m; }
  return null;
}

// Клетка проходима для игрока в его локации: карта проходима И нет живого моба той же локации
function playerCanStep(loc, x, y) { return world.isWalkable(loc, x, y) && !mobAt(loc, x, y); }

// Снимок мобов для клиентов
function publicMobs() {
  const out = {};
  for (const id in mobs) {
    const m = mobs[id];
    out[id] = { id: m.id, x: m.x, y: m.y, location: m.location, type: m.type, hp: m.hp, maxHp: m.maxHp, color: m.color, sprite: m.sprite, alive: m.alive };
  }
  return out;
}

function kill(io, m) {
  m.alive = false;
  io.emit('mobDied', { id: m.id });
  for (const pid in players) {
    if (players[pid] && players[pid].target === m.id) { players[pid].target = null; players[pid].turn = null; }
  }
  m._respawn = setTimeout(() => {
    m._respawn = null; m.alive = true; m.hp = m.maxHp;
    io.emit('mobRespawned', { id: m.id, x: m.x, y: m.y, location: m.location, type: m.type, hp: m.hp, maxHp: m.maxHp, color: m.color, sprite: m.sprite, alive: true });
  }, RESPAWN_MS);
}

module.exports = { mobs, TYPES, create, clear, rebuild, mobAt, playerCanStep, publicMobs, kill };
