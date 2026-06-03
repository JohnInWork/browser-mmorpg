// Бой: пошагово, ОДИН удар за тик, по очереди. Первым бьёт инициатор боя.
const cfg = require('./config');
const { rnd, adjOrtho } = require('./util');
const { players, respawn, armorValue, addItem, invState, ITEMS, weaponDamage } = require('./players');
const mobsMod = require('./mobs');
const quests = require('./quests');
const skills = require('./skills');

// Продвинуть квесты игрока по убийству моба типа mobType
function questProgress(io, pid, p, mobType) {
  const results = quests.recordKill(p, mobType);
  if (!results.length) return;
  let changed = false;
  for (const r of results) {
    if (r.done) {
      if (r.rewardItem) addItem(p, r.rewardItem.id, r.rewardItem.qty); // награда-предмет (авторские квесты)
      io.to(pid).emit('questDone', { title: r.quest.title, reward: r.reward });
      changed = true;
    }
  }
  if (changed) io.to(pid).emit('inventoryUpdate', invState(p)); // обновить золото/предметы
  io.to(pid).emit('questUpdate', quests.clientState(p));
}

// Выдать лут моба сразу в инвентарь убийце (как собранный ресурс — не падает на землю)
function grantMobLoot(io, pid, p, m) {
  const loot = mobsMod.TYPES[m.type] && mobsMod.TYPES[m.type].loot;
  if (!loot) return;
  const drops = Array.isArray(loot) ? loot : [loot];
  for (const d of drops) {
    addItem(p, d.id, d.qty || 1);
    io.to(pid).emit('loot', { id: d.id, qty: d.qty || 1 });
  }
  io.to(pid).emit('inventoryUpdate', invState(p));
}

function start(io) {
  const mobs = mobsMod.mobs;
  setInterval(() => {
    // 1) агрессивные мобы цепляют тех, кто стоит на прямой соседней клетке (моб начал → его ход).
    //    Пропускаем моба, на которого игрок сам идёт драться (player.engaging) — тогда первым бьёт игрок.
    for (const id in mobs) {
      const m = mobs[id];
      if (!m.alive || !mobsMod.TYPES[m.type].aggressive) continue;
      for (const pid in players) {
        const p = players[pid];
        if (p.hp > 0 && !p.target && p.engaging !== m.id && p.location === m.location && adjOrtho(p.x, p.y, m.x, m.y)) {
          p.target = m.id; p.turn = 'mob';
          io.to(pid).emit('aggro', { mobId: m.id });       // остановить героя
        }
      }
    }
    // 2) по каждому игроку с целью — РОВНО ОДИН удар того, чей сейчас ход
    for (const pid in players) {
      const p = players[pid];
      if (!p.target) continue;
      const m = mobs[p.target];
      if (!m || !m.alive || m.location !== p.location || !adjOrtho(p.x, p.y, m.x, m.y)) { p.target = null; p.turn = null; continue; }

      if (p.turn === 'player') {
        const mobArmor = mobsMod.TYPES[m.type].armor || 0;       // броня моба снижает урон (мин 1)
        const dmg = Math.max(1, rnd(cfg.PLAYER_DMG_MIN, cfg.PLAYER_DMG_MAX) + weaponDamage(p) - mobArmor);
        m.hp = Math.max(0, m.hp - dmg);
        io.emit('combatHit', { target: 'mob', id: m.id, hp: m.hp, dmg });
        // Опыт боя: за удар + бонус за добивание
        let cup = skills.addXp(p, 'combat', 2 + dmg * 2);
        // Артефакт: шлем, лечащий носителя за каждый удар по врагу
        const helmet = p.equipment.helmet, onHit = helmet && ITEMS[helmet] && ITEMS[helmet].onHitHeal;
        if (onHit && p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + onHit); io.emit('playerHp', { id: pid, hp: p.hp, heal: onHit }); }
        if (m.hp <= 0) {
          const kb = skills.addXp(p, 'combat', Math.round(m.maxHp / 2)); if (kb.leveledUp) cup = kb; // бонус-опыт за добивание
          io.to(pid).emit('skillUpdate', { skill: 'combat', ...skills.one(p, 'combat'), leveledUp: cup.leveledUp });
          grantMobLoot(io, pid, p, m); questProgress(io, pid, p, m.type); mobsMod.kill(io, m); continue;
        }
        io.to(pid).emit('skillUpdate', { skill: 'combat', ...skills.one(p, 'combat'), leveledUp: cup.leveledUp });
        p.turn = 'mob';
      } else {
        const def = mobsMod.TYPES[m.type];
        const raw = rnd(def.dmgMin, def.dmgMax);
        const dmg = Math.max(0, raw - armorValue(p)); // броня: 1 брони = −1 урон
        p.hp = Math.max(0, p.hp - dmg);
        io.emit('combatHit', { target: 'player', id: pid, hp: p.hp, dmg });
        if (p.hp <= 0) { respawn(io, p); continue; }
        p.turn = 'player';
      }
    }
    // 3) синхронизируем цель боя клиентам (для панели HP врага у игрока)
    for (const pid in players) {
      const p = players[pid];
      if (p.target !== p._sentTarget) { p._sentTarget = p.target; io.to(pid).emit('combatTarget', p.target); }
    }
  }, cfg.COMBAT_TICK_MS);
}

module.exports = { start };
