// Сетевой слой: обработка подключений и событий сокетов (игрок + админ-редактор).
const cfg = require('./config');
const { adjOrtho } = require('./util');
const world = require('./world');
const playersMod = require('./players');
const mobsMod = require('./mobs');
const resources = require('./resources');
const RECIPES = require('./data/recipes.json');
const quests = require('./quests');
const QUESTS = quests.QUESTS;
const STATION_TILE = { smelter: cfg.TILES.SMELTER, anvil: cfg.TILES.ANVIL, campfire: cfg.TILES.CAMPFIRE };

function setup(io) {
  io.on('connection', (socket) => {
    const isAdminClient = socket.handshake.query.mode === 'admin';
    socket.isAdmin = false;

    // --- Админ-редактор ---
    if (isAdminClient) {
      socket.emit('mapData', world.getState());

      socket.on('adminAuth', (password) => {
        if (password === cfg.ADMIN_PASSWORD) {
          socket.isAdmin = true;
          socket.emit('adminAuthResult', { ok: true });
          console.log('  ✔ Админ авторизовался');
        } else {
          socket.emit('adminAuthResult', { ok: false });
          console.log('  ✖ Неверный пароль админа');
        }
      });

      socket.on('saveMap', (newMap) => {
        if (!socket.isAdmin) return;                 // ГЛАВНАЯ защита: без прав — игнор
        if (!world.setMap(newMap)) { socket.emit('saveResult', { ok: false }); return; }
        resources.build();                           // деревья на карте изменились — пересобрать ноды
        socket.emit('saveResult', { ok: true });
        io.emit('mapUpdated', world.getState());     // живое обновление у игроков
        console.log('  💾 Карта сохранена админом');
      });

      socket.on('disconnect', () => {});
      return;
    }

    // --- Обычный игрок ---
    const player = playersMod.create(socket.id);

    socket.emit('init', { ...world.getState(), you: { ...player, activeTool: playersMod.activeTool(player) }, players: playersMod.players, mobs: mobsMod.publicMobs(), depleted: resources.depletedList(), recipes: RECIPES, mobTypes: mobsMod.TYPES, items: playersMod.ITEMS, questDefs: QUESTS });
    socket.broadcast.emit('playerJoined', player);
    io.emit('count', playersMod.count());

    let announced = false; // объявили ли вход игрока в чат (после первого setName = вход в игру)
    socket.on('setName', (name) => {
      if (typeof name === 'string' && name.trim()) {
        player.name = name.trim().slice(0, 16);
        io.emit('playerUpdated', { id: socket.id, name: player.name });
        if (!announced) { announced = true; io.emit('chatMessage', { cat: 'system', text: `${player.name} зашёл в игру` }); }
      }
    });

    // Сообщение в общий чат
    socket.on('chat', (text) => {
      if (typeof text !== 'string') return;
      const t = text.trim().slice(0, 200);
      if (!t) return;
      io.emit('chatMessage', { cat: 'chat', name: player.name, text: t, color: player.color });
    });

    // Внешность персонажа (из окна создания)
    socket.on('setAppearance', (a) => {
      if (!a || typeof a !== 'object') return;
      const hex = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(v);
      const styles = ['short', 'long', 'mohawk', 'topknot', 'bald'];
      const ap = player.appearance;
      if (hex(a.skin)) ap.skin = a.skin;
      if (hex(a.hair)) ap.hair = a.hair;
      if (hex(a.top)) ap.top = a.top;
      if (hex(a.bottom)) ap.bottom = a.bottom;
      if (styles.includes(a.hairStyle)) ap.hairStyle = a.hairStyle;
      io.emit('playerAppearance', { id: socket.id, appearance: ap });
    });

    socket.on('move', ({ x, y }) => {
      if (typeof x !== 'number' || typeof y !== 'number') return;
      // Невалидный ход — откатываем клиента к серверной позиции (защита от рассинхрона)
      if (Math.abs(x - player.x) + Math.abs(y - player.y) !== 1 || !mobsMod.playerCanStep(x, y)) {
        socket.emit('playerMoved', { id: socket.id, x: player.x, y: player.y });
        return;
      }
      player.x = x; player.y = y;
      io.emit('playerMoved', { id: socket.id, x, y });
      // Прошёл вплотную к агрессивному мобу (не тому, на кого сам идёт драться) — моб нападает первым и останавливает героя
      if (!player.target) {
        for (const mid in mobsMod.mobs) {
          const mob = mobsMod.mobs[mid];
          if (mob.alive && mobsMod.TYPES[mob.type].aggressive && mob.id !== player.engaging && adjOrtho(x, y, mob.x, mob.y)) {
            player.target = mob.id; player.turn = 'mob'; player.gathering = null;
            socket.emit('aggro', { mobId: mob.id });       // клиент: стоп движение, завязать бой
            break;
          }
        }
      }
    });

    // Игрок выбрал моба для атаки (клик) — намерение драться: этот моб не бьёт первым
    socket.on('engage', (mobId) => {
      const m = mobsMod.mobs[mobId];
      if (!m || !m.alive || !mobsMod.TYPES[m.type].canAttack) return;
      player.engaging = mobId;
    });

    // Игрок атакует моба (клиент подвёл персонажа вплотную и шлёт mobId)
    socket.on('attack', (mobId) => {
      const m = mobsMod.mobs[mobId];
      if (!m || !m.alive) return;
      if (!mobsMod.TYPES[m.type].canAttack) return;       // дружественных бить нельзя
      if (!adjOrtho(player.x, player.y, m.x, m.y)) return; // только вплотную
      player.gathering = null;                             // бой прерывает рубку
      player.engaging = null;
      // Я кликнул и подошёл — напал первым: мой ход ВСЕГДА первый
      player.target = mobId; player.turn = 'player';
    });

    socket.on('stopAttack', () => { player.target = null; player.turn = null; player.gathering = null; player.engaging = null; });

    // --- Торговля (рядом с торговцем можно продать предметы) ---
    const nearTrader = () => {
      for (const id in mobsMod.mobs) {
        const m = mobsMod.mobs[id];
        if (m.alive && m.type === 'trader' && adjOrtho(player.x, player.y, m.x, m.y)) return true;
      }
      return false;
    };
    const priceOf = (id) => (playersMod.ITEMS[id] && playersMod.ITEMS[id].price) || 0;

    // Продать выделенные предметы (массив индексов рюкзака)
    socket.on('sellItems', (indices) => {
      if (!nearTrader() || !Array.isArray(indices)) return;
      const set = new Set(indices.filter(i => Number.isInteger(i)));
      let g = 0;
      player.inventory.forEach((it, i) => {
        if (it && set.has(i)) { g += priceOf(it.id) * (it.qty || 1); player.inventory[i] = null; }
      });
      if (g <= 0) return;
      player.gold += g;
      socket.emit('inventoryUpdate', playersMod.invState(player));
      socket.emit('loot', { gold: g });
    });

    // --- Крафт у станции (плавильня/наковальня) ---
    const nearStation = (tile) => {
      const m = world.getState().map;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = player.x + dx, y = player.y + dy;
        if (m[y] && m[y][x] === tile) return true;
      }
      return false;
    };
    socket.on('craft', ({ station, recipe }) => {
      const list = RECIPES[station];
      const tile = STATION_TILE[station];
      if (!list || tile == null) return;
      if (!nearStation(tile)) return;
      const r = list[recipe];
      if (!r) return;
      if (playersMod.craft(player, r)) {
        socket.emit('inventoryUpdate', playersMod.invState(player));
        socket.emit('loot', { id: r.out, qty: r.outQty || 1 });
      }
    });

    // Игрок рубит дерево (подошёл вплотную, активен топор)
    socket.on('gather', ({ x, y }) => {
      const n = resources.getNodeAt(x, y);
      if (!n || !n.alive) return;
      if (!adjOrtho(player.x, player.y, n.x, n.y)) return;
      if (!resources.canGather(playersMod.activeTool(player), n)) return; // нужен подходящий инструмент
      player.target = null; player.turn = null; // рубка прерывает бой
      io.to(socket.id).emit('combatTarget', null);
      player.gathering = n.id;
    });

    // Предмет «в руке» (для отрисовки на персонаже у всех игроков)
    const sendHeld = () => io.emit('playerHeld', { id: socket.id, held: playersMod.activeTool(player) });

    // Перенос предмета из рюкзака в слот хотбара (предмет уходит из рюкзака)
    socket.on('invToHotbar', ({ invIndex, slot }) => {
      if (playersMod.invToHotbar(player, invIndex, slot)) {
        socket.emit('inventoryUpdate', playersMod.invState(player));
        sendHeld();
      }
    });

    // Возврат предмета из слота хотбара в рюкзак (в выбранную клетку, если указана)
    socket.on('hotbarToInv', ({ slot, invIndex } = {}) => {
      if (playersMod.hotbarToInv(player, slot, invIndex)) {
        socket.emit('inventoryUpdate', playersMod.invState(player));
        sendHeld();
      }
    });

    // Перемещение/обмен предметов внутри рюкзака (drag-n-drop в любую клетку)
    socket.on('moveItem', ({ from, to } = {}) => {
      if (playersMod.moveItem(player, from, to))
        socket.emit('inventoryUpdate', playersMod.invState(player));
    });

    // --- Сундук-хранилище (банк): доступен, когда игрок стоит рядом с сундуком ---
    const nearChest = () => {
      const m = world.getState().map;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = player.x + dx, y = player.y + dy;
        if (m[y] && m[y][x] === cfg.TILES.CHEST) return true;
      }
      return false;
    };
    const sendBank = () => { socket.emit('bankState', playersMod.bankStateOf(player)); socket.emit('inventoryUpdate', playersMod.invState(player)); };

    socket.on('openBank', () => { if (nearChest()) socket.emit('bankState', playersMod.bankStateOf(player)); });

    socket.on('bankMove', ({ src, from, dst, to } = {}) => {
      if (nearChest() && playersMod.bankMove(player, src, from, dst, to)) sendBank();
    });

    socket.on('bankQuick', ({ src, index } = {}) => {
      if (nearChest() && playersMod.bankQuick(player, src, index)) sendBank();
    });

    socket.on('bankUpgrade', () => {
      if (nearChest() && playersMod.upgradeBank(player)) sendBank();
    });

    // Надеть броню из рюкзака
    socket.on('equip', (invIndex) => {
      if (playersMod.equipItem(player, invIndex)) {
        socket.emit('inventoryUpdate', playersMod.invState(player));
        io.emit('playerEquipment', { id: socket.id, equipment: player.equipment }); // видно всем
      }
    });
    // Снять броню в рюкзак
    socket.on('unequip', (slot) => {
      if (playersMod.unequipItem(player, slot)) {
        socket.emit('inventoryUpdate', playersMod.invState(player));
        io.emit('playerEquipment', { id: socket.id, equipment: player.equipment });
      }
    });

    // Активация слота хотбара (взять предмет «в руки») — в т.ч. по клавишам 1–6
    socket.on('activateSlot', (slot) => {
      if (!Number.isInteger(slot) || slot < 0 || slot >= player.hotbar.length) return;
      player.activeInvId = null;                          // выбор хотбара снимает «рюкзачную» активность
      if (!player.hotbar[slot]) { player.activeSlot = null; }
      else { player.activeSlot = (player.activeSlot === slot) ? null : slot; }
      socket.emit('inventoryUpdate', playersMod.invState(player));
      sendHeld();
    });

    // Активировать инструмент прямо из рюкзака (без переноса в слот — просто «в руку» + подсветка)
    socket.on('activateInv', (invIndex) => {
      if (playersMod.activateInv(player, invIndex)) {
        socket.emit('inventoryUpdate', playersMod.invState(player));
        sendHeld();
      }
    });

    // Взять НПС-квест (из диалога)
    socket.on('acceptQuest', (id) => {
      if (typeof id === 'string' && quests.acceptNpc(player, id)) {
        socket.emit('questUpdate', quests.clientState(player));
      }
    });

    // Съесть еду из рюкзака (восполняет HP). Сырое/ингредиенты не лечат.
    socket.on('eat', (invIndex) => {
      const healed = playersMod.eat(player, invIndex);
      if (healed > 0) {
        socket.emit('inventoryUpdate', playersMod.invState(player));
        io.emit('playerHp', { id: socket.id, hp: player.hp, heal: healed });
      }
    });

    socket.on('splitStack', ({ invIndex, amount } = {}) => {
      if (playersMod.splitStack(player, invIndex, amount))
        socket.emit('inventoryUpdate', playersMod.invState(player));
    });

    socket.on('destroyStack', ({ invIndex } = {}) => {
      if (playersMod.destroyStack(player, invIndex))
        socket.emit('inventoryUpdate', playersMod.invState(player));
    });

    socket.on('disconnect', () => {
      if (announced) io.emit('chatMessage', { cat: 'system', text: `${player.name} вышел из игры` });
      playersMod.remove(socket.id);
      io.emit('playerLeft', socket.id);
      io.emit('count', playersMod.count());
    });
  });
}

module.exports = { setup };
