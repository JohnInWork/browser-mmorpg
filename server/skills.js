// Навыки: кривая опыта/уровней + операции. Данные (названия/описания) — в data/skills.json.
const defs = require('./data/skills.json');

const MAX_LEVEL = 50;
const BASE = 40;                                   // крутизна кривой

// Кумулятивный опыт, нужный чтобы СТАТЬ уровнем L (L1 = 0). Треугольная прогрессия.
function xpForLevel(L) { return BASE * (L - 1) * L / 2; }   // = 20*(L-1)*L
// Уровень по накопленному опыту (обратная формула, с потолком)
function levelFromXp(xp) {
  const L = Math.floor((1 + Math.sqrt(1 + (xp || 0) / 5)) / 2);
  return Math.max(1, Math.min(MAX_LEVEL, L));
}

function defaultSkills() {
  const s = {};
  for (const k in defs) if (k !== '_note') s[k] = { xp: 0 };
  return s;
}

function level(p, skill) { return levelFromXp(((p.skills && p.skills[skill]) || {}).xp); }

// Начислить опыт. Возвращает { skill, xp, level, leveledUp }.
function addXp(p, skill, amount) {
  if (!p.skills) p.skills = defaultSkills();
  if (!p.skills[skill]) p.skills[skill] = { xp: 0 };
  const before = levelFromXp(p.skills[skill].xp);
  p.skills[skill].xp += amount;
  const after = levelFromXp(p.skills[skill].xp);
  return { skill, xp: p.skills[skill].xp, level: after, leveledUp: after > before };
}

// Снимок одного навыка для клиента (для полоски опыта)
function one(p, skill) {
  const xp = ((p.skills && p.skills[skill]) || {}).xp || 0;
  const lvl = levelFromXp(xp);
  return { xp, level: lvl, max: MAX_LEVEL, levelXp: xpForLevel(lvl), nextXp: lvl >= MAX_LEVEL ? null : xpForLevel(lvl + 1) };
}

// Полный снимок всех навыков (с названиями/описаниями) — отдаём клиенту в init
function clientSkills(p) {
  const out = {};
  for (const k in defs) if (k !== '_note') out[k] = { name: defs[k].name, desc: defs[k].desc, trains: defs[k].trains, ...one(p, k) };
  return out;
}

module.exports = { defs, MAX_LEVEL, xpForLevel, levelFromXp, defaultSkills, level, addXp, one, clientSkills };
