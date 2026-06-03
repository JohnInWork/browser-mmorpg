// Сетевой слой клиента: подписка на события сервера и обновление состояния.
import { S } from './state.js';
import { addFloater, updateHpHud, updateTargetHud, updateGold, renderInventory, renderHotbar, renderEquipment, updateStats, renderTrade, renderCraft, openBank, renderBank, renderSkills, chatPlayerMsg, chatSystem, chatLoot, chatCombat, TYPE_NAMES, renderQuests } from './ui.js';
import { itemName } from './items.js';

// Запасной вывод слоя пола из эффективной карты (под объектами — трава), если сервер не прислал floor
const GROUND_TILES = new Set([0, 1, 4, 15, 20, 21, 22, 23]);
function floorFrom(map) { return map.map(row => row.map(t => (GROUND_TILES.has(t) ? t : 0))); }

export function setupNet() {
  const socket = S.socket;
  const onlineEl = document.getElementById('online');

  socket.on('init', (data) => {
    if (data.items) Object.assign(S.items, data.items);   // единый источник данных предметов (наполняем, НЕ переприсваиваем — ссылку держит items.js)
    S.MAP = data.map; S.FLOOR = data.floor || floorFrom(data.map); S.mapW = data.width; S.mapH = data.height; S.myId = data.you.id;
    S.location = data.location || 'surface';
    S.signs = data.signs || [];
    for (const id in data.players) {
      const p = data.players[id];
      S.players[id] = { ...p, rx: p.x, ry: p.y, held: (p.activeSlot != null && p.hotbar) ? p.hotbar[p.activeSlot] : null };
    }
    for (const id in (data.mobs || {})) S.mobs[id] = { ...data.mobs[id], flash: 0 };
    // инвентарь/снаряжение свои
    S.inventory = data.you.inventory || [];
    S.hotbar = data.you.hotbar || S.hotbar;
    S.activeSlot = data.you.activeSlot ?? null;
    S.activeInvId = data.you.activeInvId ?? null;
    S.activeTool = data.you.activeTool ?? null;
    if (data.you.equipment) S.equipment = data.you.equipment;
    S.depletedNodes = new Set(data.depleted || []);
    if (data.recipes) S.recipes = data.recipes;
    if (data.skills) S.skills = data.skills;
    if (data.mobTypes) S.mobTypes = data.mobTypes;
    if (data.questDefs) S.questDefs = data.questDefs;
    if (data.you.quests) S.quests = data.you.quests;
    updateHpHud(); updateGold(); renderInventory(); renderHotbar(); renderEquipment(); updateStats(); renderSkills();
  });

  socket.on('mapUpdated', (data) => {
    S.MAP = data.map; S.FLOOR = data.floor || floorFrom(data.map); S.mapW = data.width; S.mapH = data.height;
    if (data.location) S.location = data.location;
    S.signs = data.signs || [];
    S.depletedNodes.clear(); // деревья пересозданы редактором
  });

  // Переход в другую локацию (по лестнице): заменить карту, переставить себя
  socket.on('changeLocation', (data) => {
    S.location = data.location; S.MAP = data.map; S.FLOOR = data.floor || floorFrom(data.map); S.mapW = data.width; S.mapH = data.height;
    S.signs = data.signs || [];
    const me = S.players[S.myId];
    if (me) { me.x = data.x; me.y = data.y; me.rx = data.x; me.ry = data.y; me.location = data.location; }
    S.path = []; S.targetTile = null; S.pendingAction = null;
    S.combatTargetId = null; updateTargetHud();
  });

  // Другой игрок сменил локацию (телепорт) — обновить его локацию/позицию
  socket.on('playerLocation', ({ id, location, x, y }) => {
    const p = S.players[id];
    if (p) { p.location = location; p.x = x; p.y = y; p.rx = x; p.ry = y; }
  });

  // Инвентарь обновился (рубка, перенос в хотбар, активация)
  socket.on('inventoryUpdate', (st) => {
    S.inventory = st.inventory; S.hotbar = st.hotbar; S.activeSlot = st.activeSlot;
    if (st.activeInvId !== undefined) S.activeInvId = st.activeInvId;
    if (st.activeTool !== undefined) S.activeTool = st.activeTool;
    if (st.equipment) { S.equipment = st.equipment; if (S.players[S.myId]) S.players[S.myId].equipment = st.equipment; }
    if (st.armor != null) S.armor = st.armor;
    if (st.gold != null && S.players[S.myId]) S.players[S.myId].gold = st.gold;
    renderInventory(); renderHotbar(); renderEquipment(); updateStats(); updateGold(); renderTrade(); renderCraft(); renderBank();
  });

  // Сундук-хранилище: пришло состояние банка → открыть/обновить панель
  socket.on('bankState', (data) => { openBank(data); });

  // Навыки: пришло обновление (опыт/уровень)
  socket.on('skillUpdate', (s) => {
    const prev = S.skills[s.skill] || {};
    S.skills[s.skill] = { ...prev, xp: s.xp, level: s.level, levelXp: s.levelXp, nextXp: s.nextXp, max: s.max };
    if (s.leveledUp) {
      const nm = (prev.name) || s.skill;
      chatSystem(`Навык повышен: ${nm} — уровень ${s.level}`);
      const me = S.players[S.myId];
      if (me) addFloater(me.x, me.y, `${nm} ур. ${s.level}`, '#f1c40f');
    }
    renderSkills();
  });

  // Добыча
  socket.on('gatherHit', ({ x, y }) => { addFloater(x, y, '+1', '#c98a4b'); });
  socket.on('gatherMiss', ({ x, y }) => { addFloater(x, y, '·', 'rgba(255,255,255,.45)'); }); // промах удара
  socket.on('nodeDepleted', ({ x, y }) => { S.depletedNodes.add(`${x},${y}`); });
  socket.on('nodeRespawned', ({ x, y }) => { S.depletedNodes.delete(`${x},${y}`); });

  // Чат / лента событий
  socket.on('chatMessage', (m) => {
    if (m.cat === 'chat') chatPlayerMsg(m.name, m.text, m.color);
    else chatSystem(m.text);
  });
  socket.on('loot', (l) => {
    if (l && l.gold != null) chatLoot(`+${l.gold} золота`);
    else if (l && l.id) chatLoot(`+${l.qty || 1} ${itemName(l.id)}`);
  });

  // Квесты
  socket.on('questUpdate', (st) => { S.quests = st; renderQuests(); });
  socket.on('questDone', ({ title, reward }) => { chatLoot(`Квест выполнен: ${title} (+${reward} золота)`); });

  socket.on('playerJoined', (p) => { S.players[p.id] = { ...p, rx: p.x, ry: p.y, held: (p.activeSlot != null && p.hotbar) ? p.hotbar[p.activeSlot] : null }; });
  socket.on('playerMoved', ({ id, x, y }) => { const p = S.players[id]; if (p) { p.x = x; p.y = y; } });
  socket.on('playerUpdated', ({ id, name }) => {
    if (S.players[id]) S.players[id].name = name;
    if (id === S.myId) updateHpHud(); // обновить имя в панели
  });
  socket.on('playerAppearance', ({ id, appearance }) => { if (S.players[id]) S.players[id].appearance = appearance; });
  socket.on('playerEquipment', ({ id, equipment }) => { if (S.players[id]) S.players[id].equipment = equipment; });
  socket.on('playerHeld', ({ id, held }) => { if (S.players[id]) S.players[id].held = held; });
  socket.on('playerLeft', (id) => { delete S.players[id]; });
  socket.on('count', (n) => { if (onlineEl) onlineEl.textContent = 'Онлайн: ' + n; });

  // Мобы и бой
  socket.on('mobDied', ({ id }) => {
    const m = S.mobs[id];
    if (id === S.combatTargetId && m) chatCombat(`Вы победили: ${TYPE_NAMES[m.type] || 'существо'}`);
    if (m) m.alive = false;
    if (id === S.combatTargetId) updateTargetHud();
  });
  socket.on('mobRespawned', (m) => { S.mobs[m.id] = { ...m, alive: true, flash: 0 }; });
  // Мобы пересобраны (правка карт в редакторе) — заменить весь набор
  socket.on('mobsReset', (mobs) => {
    S.mobs = {};
    for (const id in mobs) S.mobs[id] = { ...mobs[id], flash: 0 };
    S.combatTargetId = null; updateTargetHud();
  });
  socket.on('combatTarget', (mobId) => { S.combatTargetId = mobId; updateTargetHud(); });

  // Агрессивный моб напал (проход мимо) — остановить героя и завязать бой
  socket.on('aggro', ({ mobId }) => {
    S.path = []; S.targetTile = null; S.pendingAction = null;
    S.combatTargetId = mobId; updateTargetHud();
  });

  socket.on('combatHit', ({ target, id, hp, dmg }) => {
    if (target === 'mob') {
      const m = S.mobs[id];
      if (m) { m.hp = hp; m.flash = 0.18; addFloater(m.x, m.y, '-' + dmg, '#fff'); if (id === S.combatTargetId) updateTargetHud(); }
    } else {
      const p = S.players[id];
      if (p) {
        p.hp = hp;
        addFloater(p.x, p.y, '-' + dmg, '#ff5b5b');
        if (id === S.myId) { updateHpHud(); updateStats(); S.hurtFlash = 0.25; }
      }
    }
  });

  // Лечение (съел еду) — обновить HP и показать зелёную цифру
  socket.on('playerHp', ({ id, hp, heal }) => {
    const p = S.players[id];
    if (!p) return;
    p.hp = hp;
    addFloater(p.x, p.y, '+' + heal, '#3ad07a');
    if (id === S.myId) { updateHpHud(); updateStats(); }
  });

  socket.on('playerRespawn', ({ id, x, y, hp, location }) => {
    const p = S.players[id];
    if (!p) return;
    p.x = x; p.y = y; p.rx = x; p.ry = y; p.hp = hp;
    if (location) p.location = location;
    if (id === S.myId) {
      S.path = []; S.targetTile = null; S.pendingAction = null;
      updateHpHud(); updateStats(); S.deathFlash = 1.0;
      chatCombat('Вы погибли');
    }
  });
}
