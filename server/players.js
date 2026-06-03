// Игроки: хранилище, инвентарь/хотбар, операции. Владеет объектом players.
const { PLAYER_MAX_HP } = require('./config');
const world = require('./world');
const ITEMS = require('./data/items.json').items;

const COLORS = ['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#e67e22','#1abc9c','#ff6b9d'];

const players = {}; // socketId -> player

function create(id) {
  const spawn = world.randomSpawn();
  const player = {
    id,
    name: 'Игрок',
    x: spawn.x, y: spawn.y,
    color: COLORS[Object.keys(players).length % COLORS.length],
    hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
    appearance: { skin:'#f3cfa6', hair:'#6e4426', hairStyle:'short', top:'#3f7aa8', bottom:'#5a4636' },
    gold: 0,
    // стартовый инвентарь: топор + комплект брони (чтобы было что надеть)
    inventory: [
      { id: 'axe', qty: 1 }, { id: 'pickaxe', qty: 1 },
      { id: 'helmet', qty: 1 }, { id: 'chest', qty: 1 }, { id: 'gloves', qty: 1 },
      { id: 'pants', qty: 1 }, { id: 'boots', qty: 1 }, { id: 'cloak', qty: 1 },
      { id: 'bearHelmet', qty: 1 }, { id: 'ironSword', qty: 1 }, { id: 'ironGreatsword', qty: 1 }, { id: 'ironShield', qty: 1 },
    ],
    hotbar: [null, null, null, null, null, null], // 6 слотов: id предмета или null
    activeSlot: null,  // индекс активного слота хотбара (предмет «в руке»)
    activeInvId: null, // id инструмента, активированного прямо из рюкзака (без переноса в слот)
    // надетая экипировка (id предмета или null) — задел: статы/характеристики добавим позже
    equipment: { helmet: null, chest: null, gloves: null, pants: null, boots: null, cloak: null, mainHand: null, offHand: null },
    target: null,      // id моба, которого бьём
    turn: null,        // 'player' | 'mob' — чей удар
    gathering: null,   // id ресурс-ноды (дерева), которую рубим
    quests: { story: 0, progress: 0, completed: [], active: {} }, // story-цепочка + npc-квесты (active: id→прогресс)
  };
  players[id] = player;
  return player;
}

function remove(id) { delete players[id]; }
function count() { return Object.keys(players).length; }

// Добавить предмет в инвентарь (стакается, если stackable)
function addItem(p, id, qty = 1) {
  const def = ITEMS[id];
  if (def && def.stackable) {
    const stack = p.inventory.find(s => s.id === id);
    if (stack) { stack.qty += qty; return; }
  }
  p.inventory.push({ id, qty });
}
function hasItem(p, id) { return p.inventory.some(s => s.id === id); }
function countItem(p, id) { let n = 0; for (const s of p.inventory) if (s.id === id) n += s.qty || 1; return n; }
function removeItems(p, id, qty) {
  let need = qty;
  for (let i = p.inventory.length - 1; i >= 0 && need > 0; i--) {
    const s = p.inventory[i];
    if (s.id !== id) continue;
    const take = Math.min(need, s.qty || 1);
    s.qty -= take; need -= take;
    if (s.qty <= 0) p.inventory.splice(i, 1);
  }
}
// Крафт по рецепту {out, outQty, in:[{id,qty}]}: проверка ингредиентов, расход, выдача
function craft(p, recipe) {
  if (!recipe || !recipe.in.every(ing => countItem(p, ing.id) >= ing.qty)) return false;
  recipe.in.forEach(ing => removeItems(p, ing.id, ing.qty));
  addItem(p, recipe.out, recipe.outQty || 1);
  return true;
}

// id предмета «в руке»: из активного слота хотбара ИЛИ инструмент, выбранный прямо в рюкзаке.
function activeTool(p) {
  if (p.activeSlot != null && p.hotbar[p.activeSlot]) return p.hotbar[p.activeSlot].id;
  if (p.activeInvId && hasItem(p, p.activeInvId)) return p.activeInvId;
  return null;
}

// Активировать инструмент прямо из рюкзака (не переносит в слот, только «берёт в руку»). Повторно — снять.
function activateInv(p, invIndex) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return false;
  const item = p.inventory[invIndex];
  const def = ITEMS[item.id];
  if (!def || def.type !== 'tool') return false;          // «в руку» из рюкзака — только инструмент
  p.activeInvId = (p.activeInvId === item.id) ? null : item.id;
  if (p.activeInvId != null) p.activeSlot = null;          // выбор из рюкзака снимает выбор хотбара
  return true;
}

// Перенести предмет из рюкзака в слот хотбара (исчезает из рюкзака). Занятый слот — обмен.
function invToHotbar(p, invIndex, slot) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return false;
  if (!Number.isInteger(slot) || slot < 0 || slot >= p.hotbar.length) return false;
  const item = p.inventory.splice(invIndex, 1)[0];
  const prev = p.hotbar[slot];
  p.hotbar[slot] = item;
  if (prev) p.inventory.push(prev); // то, что лежало в слоте, возвращается в рюкзак
  if (p.activeInvId === item.id) p.activeInvId = null; // активный инструмент уехал в слот — снять «рюкзачную» активность
  return true;
}

// Вернуть предмет из слота хотбара в рюкзак
function hotbarToInv(p, slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= p.hotbar.length) return false;
  const item = p.hotbar[slot];
  if (!item) return false;
  p.hotbar[slot] = null;
  p.inventory.push(item);
  if (p.activeSlot === slot) p.activeSlot = null;
  return true;
}

// Съесть еду из рюкзака (по индексу): только type==='food' с heal. Возвращает фактически вылеченное HP (0 — нельзя).
function eat(p, invIndex) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return 0;
  const item = p.inventory[invIndex];
  const def = ITEMS[item.id];
  if (!def || def.type !== 'food' || !def.heal) return 0; // сырое/не-еда не лечит (это ингредиент)
  if (p.hp >= p.maxHp) return 0;                          // уже полное HP — не тратим еду
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + def.heal);
  removeItems(p, item.id, 1);
  return p.hp - before;
}

// Суммарная защита от надетой брони
function armorValue(p) {
  let a = 0;
  for (const slot in p.equipment) {
    const id = p.equipment[slot];
    if (id && ITEMS[id]) a += ITEMS[id].armor || 0;
  }
  return a;
}

// Надеть броню/оружие/щит из рюкзака (по индексу). Занятый слот — обмен. Двуручное оружие занимает обе руки.
function equipItem(p, invIndex) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return false;
  const item = p.inventory[invIndex];
  const def = ITEMS[item.id];
  if (!def || !def.slot || !['armor', 'weapon', 'shield'].includes(def.type)) return false;
  if (!(def.slot in p.equipment)) return false;
  p.inventory.splice(invIndex, 1);
  const back = (id) => { if (id) p.inventory.push({ id, qty: 1 }); };
  // Двуручное оружие — освободить вторую руку; щит/одноручное — снять двуручное, если оно надето
  if (def.slot === 'mainHand' && def.hands === 2) { back(p.equipment.offHand); p.equipment.offHand = null; }
  if (def.slot === 'offHand') { const mh = ITEMS[p.equipment.mainHand]; if (mh && mh.hands === 2) { back(p.equipment.mainHand); p.equipment.mainHand = null; } }
  const prev = p.equipment[def.slot];
  p.equipment[def.slot] = item.id;
  back(prev);
  return true;
}

// Бонус урона от оружия в правой руке
function weaponDamage(p) {
  const w = p.equipment.mainHand;
  return (w && ITEMS[w] && ITEMS[w].damage) || 0;
}

// Снять предмет из слота брони в рюкзак
function unequipItem(p, slot) {
  if (!p.equipment[slot]) return false;
  p.inventory.push({ id: p.equipment[slot], qty: 1 });
  p.equipment[slot] = null;
  return true;
}

// Разделить стак: отнять amount у стака и положить новый стак тем же предметом
const INV_CAP = 32;
function splitStack(p, invIndex, amount) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return false;
  if (p.inventory.length >= INV_CAP) return false;          // нет свободной клетки под новый стак
  const s = p.inventory[invIndex];
  amount = Math.floor(Number(amount));
  if (!s || !(s.qty > 1) || !(amount >= 1) || amount >= s.qty) return false;
  s.qty -= amount;
  p.inventory.push({ id: s.id, qty: amount });
  return true;
}

// Уничтожить стак целиком
function destroyStack(p, invIndex) {
  if (!Number.isInteger(invIndex) || invIndex < 0 || invIndex >= p.inventory.length) return false;
  p.inventory.splice(invIndex, 1);
  return true;
}

// Снимок инвентаря/экипировки/статов для клиента
function invState(p) {
  return {
    inventory: p.inventory, hotbar: p.hotbar, activeSlot: p.activeSlot,
    activeInvId: p.activeInvId, activeTool: activeTool(p), gold: p.gold,
    equipment: p.equipment, armor: armorValue(p), hp: p.hp, maxHp: p.maxHp,
  };
}

// Смерть → респаун с полным HP в новой точке
function respawn(io, p) {
  const s = world.randomSpawn();
  p.x = s.x; p.y = s.y; p.hp = PLAYER_MAX_HP;
  p.target = null; p.turn = null; p.gathering = null;
  io.emit('playerRespawn', { id: p.id, x: p.x, y: p.y, hp: p.hp });
}

module.exports = { players, create, remove, count, respawn, addItem, hasItem, countItem, removeItems, craft, eat, activeTool, activateInv, invToHotbar, hotbarToInv, equipItem, unequipItem, armorValue, weaponDamage, splitStack, destroyStack, invState, ITEMS };
