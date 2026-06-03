// Мобы: создание из данных (data/mobs.json), состояние, смерть/респаун.
// Владеет объектом mobs. Типы и расстановка — в data/mobs.json (контент отдельно от кода).
const { RESPAWN_MS } = require('./config');
const world = require('./world');
const { players } = require('./players');
const data = require('./data/mobs.json');

const TYPES = data.types;
const mobs = {}; // id -> резолвнутый рантайм-моб (свои hp/урон/лут/...)
let seq = 0;

const SPRITE_NAMES = { chicken: 'Курица', wolf: 'Волк', bear: 'Медведь' };
const SPRITE_COLOR = { chicken: '#f1c40f', wolf: '#888c94', bear: '#6b4a2b' };

// Резолвнуть спавн (s = location + поля) в рантайм-моба с готовыми параметрами боя
function resolveMob(s) {
  if (s.sprite || s.aggro || s.hp != null) {                   // кастомный моб (из конструктора)
    const aggro = s.aggro || 'aggressive';
    const loot = Array.isArray(s.loot) ? s.loot.map(l => ({ id: l.id, qty: l.qty || 1, chance: l.chance != null ? l.chance : 1 })) : [];
    return {
      name: s.name || '', sprite: s.sprite || 'wolf', kind: s.sprite || 'wolf',
      canAttack: aggro !== 'friendly', aggressive: aggro === 'aggressive',
      maxHp: s.hp || 20, armor: s.armor || 0, dmgMin: s.dmgMin || 0, dmgMax: s.dmgMax || 0,
      respawnMs: (s.respawn || 10) * 1000, size: s.size || 0, loot,
      color: SPRITE_COLOR[s.sprite] || '#888', label: s.name || SPRITE_NAMES[s.sprite] || 'Существо',
    };
  }
  const t = TYPES[s.type] || {};                               // легаси-пресет из data/mobs.json
  const loot = t.loot ? (Array.isArray(t.loot) ? t.loot : [t.loot]).map(l => ({ id: l.id, qty: l.qty || 1, chance: 1 })) : [];
  return {
    name: t.name || '', sprite: t.sprite || null, kind: t.sprite || s.type,
    canAttack: t.canAttack !== false, aggressive: !!t.aggressive,
    maxHp: t.maxHp || 20, armor: t.armor || 0, dmgMin: t.dmgMin || 0, dmgMax: t.dmgMax || 0,
    respawnMs: RESPAWN_MS, size: 0, loot,
    color: t.color || '#888', label: t.name || 'Существо',
  };
}

// Спавн мобов из карт (расставлены в редакторе, хранятся по локациям в world)
function create() {
  for (const s of world.mobSpawns()) {
    if (!world.isWalkable(s.location, s.x, s.y)) continue;     // на непроходимой клетке — пропустить
    const r = resolveMob(s);
    const id = 'm' + (seq++);
    mobs[id] = { id, x: s.x, y: s.y, location: s.location, ...r, hp: r.maxHp, alive: true };
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
function playerCanStep(loc, x, y) { return world.isWalkable(loc, x, y) && !mobAt(loc, x, y) && !world.npcAt(loc, x, y); }

// Снимок мобов для клиентов
function publicMobs() {
  const out = {};
  for (const id in mobs) {
    const m = mobs[id];
    out[id] = { id: m.id, x: m.x, y: m.y, location: m.location, sprite: m.sprite, size: m.size, hp: m.hp, maxHp: m.maxHp, color: m.color, alive: m.alive, aggressive: m.aggressive, canAttack: m.canAttack, label: m.label };
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
    io.emit('mobRespawned', { id: m.id, x: m.x, y: m.y, location: m.location, sprite: m.sprite, size: m.size, hp: m.hp, maxHp: m.maxHp, color: m.color, alive: true, aggressive: m.aggressive, canAttack: m.canAttack, label: m.label });
  }, m.respawnMs || RESPAWN_MS);
}

module.exports = { mobs, TYPES, create, clear, rebuild, mobAt, playerCanStep, publicMobs, kill };
