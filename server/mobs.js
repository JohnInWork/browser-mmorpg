// Мобы: создание из данных (data/mobs.json), состояние, смерть/респаун.
// Владеет объектом mobs. Типы и расстановка — в data/mobs.json (контент отдельно от кода).
const { RESPAWN_MS } = require('./config');
const world = require('./world');
const { players } = require('./players');
const data = require('./data/mobs.json');

const TYPES = data.types;
const mobs = {}; // id -> { id, x, y, type, hp, maxHp, color, alive }
let seq = 0;

function create() {
  for (const s of data.spawns) {
    const loc = s.location || 'surface';
    if (!world.isWalkable(loc, s.x, s.y)) {
      console.log(`  ⚠ моб на непроходимой клетке ${loc} ${s.x},${s.y} — пропущен`);
      continue;
    }
    const def = TYPES[s.type];
    if (!def) { console.log(`  ⚠ неизвестный тип моба "${s.type}" — пропущен`); continue; }
    const id = 'm' + (seq++);
    mobs[id] = { id, x: s.x, y: s.y, location: s.location || 'surface', type: s.type, hp: def.maxHp, maxHp: def.maxHp, color: def.color, sprite: def.sprite || null, alive: true };
  }
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
  setTimeout(() => {
    m.alive = true; m.hp = m.maxHp;
    io.emit('mobRespawned', { id: m.id, x: m.x, y: m.y, location: m.location, type: m.type, hp: m.hp, maxHp: m.maxHp, color: m.color, sprite: m.sprite, alive: true });
  }, RESPAWN_MS);
}

module.exports = { mobs, TYPES, create, mobAt, playerCanStep, publicMobs, kill };
