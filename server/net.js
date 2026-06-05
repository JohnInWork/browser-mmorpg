// Сетевой слой: обработка подключений и событий сокетов (игрок + админ-редактор).
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { adjOrtho } = require('./util');
const world = require('./world');
const playersMod = require('./players');
const mobsMod = require('./mobs');
const resources = require('./resources');
const RECIPES = require('./data/recipes.json');
const quests = require('./quests');
const skillsMod = require('./skills');
const QUESTS = quests.QUESTS;
const STATION_TILE = { smelter: cfg.TILES.SMELTER, anvil: cfg.TILES.ANVIL, campfire: cfg.TILES.CAMPFIRE, workbench: cfg.TILES.WORKBENCH };

function setup(io) {
  io.on('connection', (socket) => {
    const isAdminClient = socket.handshake.query.mode === 'admin';
    socket.isAdmin = false;

    // --- Админ-редактор ---
    if (isAdminClient) {
      socket.isAdmin = true;                 // вход в редактор пока без пароля (локальная разработка)
      socket.emit('mapData', world.editorState());
      socket.emit('itemsData', { items: playersMod.ITEMS, recipes: RECIPES });  // данные для редактора предметов/крафта

      // Редактор предметов и крафта: записываем на диск + обновляем живую игру без перезапуска
      socket.on('saveItemsData', (payload) => {
        if (!socket.isAdmin || !payload || typeof payload !== 'object') { socket.emit('itemsSaveResult', { ok: false }); return; }
        const items = payload.items, recipes = payload.recipes;
        if (!items || typeof items !== 'object' || !recipes || typeof recipes !== 'object') { socket.emit('itemsSaveResult', { ok: false }); return; }
        try {
          // 1) items.json (сохраняем служебный _note)
          const itemsFile = path.join(__dirname, 'data', 'items.json');
          const itemsDoc = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
          itemsDoc.items = items;
          fs.writeFileSync(itemsFile, JSON.stringify(itemsDoc, null, 2));
          // 2) recipes.json (сохраняем _note, перезаписываем только известные станции)
          const recFile = path.join(__dirname, 'data', 'recipes.json');
          const recDoc = JSON.parse(fs.readFileSync(recFile, 'utf8'));
          for (const st of ['smelter', 'anvil', 'campfire', 'workbench']) if (Array.isArray(recipes[st])) recDoc[st] = recipes[st];
          fs.writeFileSync(recFile, JSON.stringify(recDoc, null, 2));
          // 3) Обновить состояние в памяти (ITEMS — общий объект; мутируем на месте, ссылку держат все модули)
          for (const k in playersMod.ITEMS) if (!(k in items)) delete playersMod.ITEMS[k];   // удалённые
          for (const k in items) playersMod.ITEMS[k] = items[k];                              // изменённые/новые
          for (const st of ['smelter', 'anvil', 'campfire', 'workbench']) if (Array.isArray(recipes[st])) RECIPES[st] = recipes[st];
          // 4) Разослать живым игрокам (цены/крафт/характеристики обновятся на лету)
          io.emit('contentUpdate', { items: playersMod.ITEMS, recipes: RECIPES });
          socket.emit('itemsSaveResult', { ok: true });
          console.log('  💾 Предметы и крафт сохранены админом');
        } catch (e) {
          console.error('  ⚠ Ошибка сохранения предметов:', e.message);
          socket.emit('itemsSaveResult', { ok: false });
        }
      });

      socket.on('adminAuth', () => {         // совместимость: подтверждаем вход
        socket.isAdmin = true;
        socket.emit('adminAuthResult', { ok: true });
      });

      socket.on('saveMap', (payload) => {
        if (!socket.isAdmin) return;                 // ГЛАВНАЯ защита: без прав — игнор
        if (!world.setLocations(payload)) { socket.emit('saveResult', { ok: false }); return; }
        resources.build();                           // карта изменилась — пересобрать ноды
        mobsMod.rebuild(io);                          // и мобов (расставлены в редакторе)
        socket.emit('saveResult', { ok: true });
        io.emit('questDefs', quests.clientDefs());    // авторские квесты могли измениться
        for (const pid in playersMod.players)         // каждому игроку — свежая карта его локации
          io.to(pid).emit('mapUpdated', world.locState(playersMod.players[pid].location));
        console.log('  💾 Карты сохранены админом');
      });

      socket.on('disconnect', () => {});
      return;
    }

    // --- Обычный игрок ---
    const player = playersMod.create(socket.id);

    socket.emit('init', { ...world.locState(player.location), you: { ...player, handR: playersMod.handItem(player, 'R'), handL: playersMod.handItem(player, 'L') }, players: playersMod.players, mobs: mobsMod.publicMobs(), depleted: resources.depletedList(), recipes: RECIPES, mobTypes: mobsMod.TYPES, items: playersMod.ITEMS, skills: skillsMod.clientSkills(player), questDefs: quests.clientDefs() });
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
      const ap = player.appearance;
      if (hex(a.skin)) ap.skin = a.skin;
      if (hex(a.hair)) ap.hair = a.hair;
      if (typeof a.hairStyle === 'string' && /^[a-z0-9]{0,12}$/i.test(a.hairStyle)) ap.hairStyle = a.hairStyle; // id причёски (или '' — без причёски)
      io.emit('playerAppearance', { id: socket.id, appearance: ap });
    });

    // Перенос игрока в другую локацию (по лестнице-телепорту)
    const teleport = (target) => {
      player.location = target.location; player.x = target.x; player.y = target.y;
      player.target = null; player.turn = null; player.gathering = null; player.engaging = null;
      socket.emit('changeLocation', { ...world.locState(player.location), x: player.x, y: player.y });
      io.emit('playerLocation', { id: socket.id, location: player.location, x: player.x, y: player.y });
    };

    socket.on('move', ({ x, y }) => {
      if (typeof x !== 'number' || typeof y !== 'number') return;
      // Невалидный ход — откатываем клиента к серверной позиции (защита от рассинхрона)
      if (Math.abs(x - player.x) + Math.abs(y - player.y) !== 1 || !mobsMod.playerCanStep(player.location, x, y)) {
        socket.emit('playerMoved', { id: socket.id, x: player.x, y: player.y });
        return;
      }
      player.x = x; player.y = y;
      io.emit('playerMoved', { id: socket.id, x, y });
      // Наступил на лестницу-телепорт → переход в связанную локацию
      const tt = world.teleportTarget(player.location, x, y);
      if (tt) { teleport(tt); return; }
      // Прошёл вплотную к агрессивному мобу той же локации — моб нападает первым и останавливает героя
      if (!player.target) {
        for (const mid in mobsMod.mobs) {
          const mob = mobsMod.mobs[mid];
          if (mob.alive && mob.location === player.location && mob.aggressive && mob.id !== player.engaging && adjOrtho(x, y, mob.x, mob.y)) {
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
      if (!m || !m.alive || m.location !== player.location || !m.canAttack) return;
      player.engaging = mobId;
    });

    // Игрок атакует моба (клиент подвёл персонажа вплотную и шлёт mobId)
    socket.on('attack', (mobId) => {
      const m = mobsMod.mobs[mobId];
      if (!m || !m.alive || m.location !== player.location) return;
      if (!m.canAttack) return;                            // дружественных бить нельзя
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
        if (m.alive && m.type === 'trader' && m.location === player.location && adjOrtho(player.x, player.y, m.x, m.y)) return true;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {   // авторские НПС-торговцы
        const n = world.npcAt(player.location, player.x + dx, player.y + dy);
        if (n && n.trader) return true;
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
        if (!it || !set.has(i)) return;
        if (playersMod.ITEMS[it.id] && playersMod.ITEMS[it.id].nosell) return;   // непродаваемое (камень возвращения) — пропускаем
        g += priceOf(it.id) * (it.qty || 1); player.inventory[i] = null;
      });
      if (g <= 0) return;
      player.gold += g;
      socket.emit('inventoryUpdate', playersMod.invState(player));
      socket.emit('loot', { gold: g });
    });

    // Цена покупки у НПС-продавца — с наценкой ×2 от базовой
    const buyPrice = (id) => Math.max(1, ((playersMod.ITEMS[id] && playersMod.ITEMS[id].price) || 0) * 2);
    // НПС-продавец рядом, у которого товар id (Купить)
    const sellerNear = (id) => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = world.npcAt(player.location, player.x + dx, player.y + dy);
        if (n && Array.isArray(n.sells) && n.sells.includes(id)) return n;
      }
      return null;
    };
    // Купить предмет у НПС
    socket.on('buyItem', ({ id } = {}) => {
      if (typeof id !== 'string' || !sellerNear(id)) return;
      const price = buyPrice(id);
      if (player.gold < price) { socket.emit('buyResult', { ok: false, reason: 'gold' }); return; }
      if (!playersMod.addItem(player, id, 1)) { socket.emit('buyResult', { ok: false, reason: 'full' }); return; }
      player.gold -= price;
      socket.emit('inventoryUpdate', playersMod.invState(player));
      socket.emit('buyResult', { ok: true, id, price });
    });

    // --- Крафт у станции (плавильня/наковальня) ---
    const nearTile = (tile) => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (world.tileAt(player.location, player.x + dx, player.y + dy) === tile) return true;
      return false;
    };
    const nearStation = (tile) => nearTile(tile);
    socket.on('craft', ({ station, recipe }) => {
      const list = RECIPES[station];
      const tile = STATION_TILE[station];
      if (!list || tile == null) return;
      if (!nearStation(tile)) return;
      const r = list[recipe];
      if (!r) return;
      if (playersMod.craft(player, r)) {
        socket.emit('loot', { id: r.out, qty: r.outQty || 1 });
        const q = quests.recordGather(player, r.out, r.outQty || 1);   // крафт двигает квесты на «принеси предмет»
        quests.applyGatherResult(io, socket.id, player, q, playersMod.addItem);
        socket.emit('inventoryUpdate', playersMod.invState(player));   // после возможной награды
        // Опыт навыка за крафт: костёр → кулинария, плавильня/наковальня → кузнечное дело
        const skill = station === 'campfire' ? 'cooking' : 'smithing';
        const xp = station === 'smelter' ? 15 : station === 'campfire' ? 12 : 25;
        const up = skillsMod.addXp(player, skill, xp);
        socket.emit('skillUpdate', { skill, ...skillsMod.one(player, skill), leveledUp: up.leveledUp });
      }
    });

    // Игрок рубит дерево (подошёл вплотную, активен топор)
    socket.on('gather', ({ x, y }) => {
      const n = resources.getNodeAt(player.location, x, y);
      if (!n || !n.alive) return;
      if (!adjOrtho(player.x, player.y, n.x, n.y)) return;
      if (!resources.canGather(playersMod.activeTool(player), n)) return; // нужен подходящий инструмент
      player.target = null; player.turn = null; // рубка прерывает бой
      io.to(socket.id).emit('combatTarget', null);
      player.gathering = n.id;
    });

    // --- Камень возвращения ---
    // Привязать/сменить точку возврата (подошёл вплотную к камню). Подтверждение — на клиенте.
    socket.on('bindStone', ({ x, y } = {}) => {
      const st = world.stoneAt(player.location, x, y);
      if (!st || !adjOrtho(player.x, player.y, st.x, st.y)) return;
      const r = playersMod.bindReturnStone(player, { location: player.location, x: st.x, y: st.y, name: st.name });
      if (!r.ok) { socket.emit('chatMessage', { cat: 'system', text: 'В рюкзаке нет места для камня возвращения.' }); return; }
      socket.emit('inventoryUpdate', playersMod.invState(player));
      socket.emit('chatMessage', { cat: 'system', text: `Точка возврата привязана: «${st.name}». Используй камень в рюкзаке, чтобы вернуться.` });
    });

    // Телепорт к точке возврата (общая логика для камня из рюкзака и из хотбара)
    const returnTeleport = () => {
      if (!player.returnPoint) { socket.emit('chatMessage', { cat: 'system', text: 'Камень ни к чему не привязан.' }); return; }
      const now = Date.now();
      if (now < player.returnCdUntil) {
        const left = Math.ceil((player.returnCdUntil - now) / 1000);
        socket.emit('chatMessage', { cat: 'system', text: `Камень возвращения перезаряжается: ${left} c.` });
        return;
      }
      const rp = player.returnPoint;
      let tx = rp.x, ty = rp.y, found = false;        // камень непроходим → ищем клетку рядом
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        if (world.isWalkable(rp.location, rp.x + dx, rp.y + dy)) { tx = rp.x + dx; ty = rp.y + dy; found = true; break; }
      }
      if (!found) { const s = world.randomSpawn(rp.location); tx = s.x; ty = s.y; }
      player.returnCdUntil = now + cfg.RETURN_COOLDOWN_MS;
      teleport({ location: rp.location, x: tx, y: ty });
      socket.emit('inventoryUpdate', playersMod.invState(player));   // обновить кулдаун на предмете
      socket.emit('chatMessage', { cat: 'system', text: `Возвращение к «${rp.name}».` });
    };
    // Использовать камень возвращения из рюкзака
    socket.on('useReturnStone', ({ invIndex } = {}) => {
      const it = player.inventory[invIndex];
      if (!it || it.id !== playersMod.RETURN_STONE_ID) return;
      returnTeleport();
    });

    // Использовать предмет из слота хотбара по «горячему» использованию (еда — съесть, камень — телепорт)
    socket.on('useHotbar', (slot) => {
      if (!Number.isInteger(slot) || slot < 0 || slot >= player.hotbar.length) return;
      const it = player.hotbar[slot];
      if (!it) return;
      if (it.id === playersMod.RETURN_STONE_ID) { returnTeleport(); return; }
      const def = playersMod.ITEMS[it.id];
      if (def && def.type === 'food' && def.heal) {
        const healed = playersMod.eatHotbar(player, slot);
        if (healed > 0) {
          socket.emit('inventoryUpdate', playersMod.invState(player));
          io.emit('playerHp', { id: socket.id, hp: player.hp, heal: healed });
        }
      }
    });

    // Предметы «в руках» (правая/левая) — для отрисовки на персонаже у всех игроков
    const sendHands = () => io.emit('playerHands', { id: socket.id, right: playersMod.handItem(player, 'R'), left: playersMod.handItem(player, 'L') });

    // Перенос предмета из рюкзака в слот хотбара (предмет уходит из рюкзака)
    socket.on('invToHotbar', ({ invIndex, slot }) => {
      if (playersMod.invToHotbar(player, invIndex, slot)) {
        socket.emit('inventoryUpdate', playersMod.invState(player));
        sendHands();
      }
    });

    // Возврат предмета из слота хотбара в рюкзак (в выбранную клетку, если указана)
    socket.on('hotbarToInv', ({ slot, invIndex } = {}) => {
      if (playersMod.hotbarToInv(player, slot, invIndex)) {
        socket.emit('inventoryUpdate', playersMod.invState(player));
        sendHands();
      }
    });

    // Перемещение/обмен предметов между слотами хотбара
    socket.on('moveHotbar', ({ from, to } = {}) => {
      if (playersMod.moveHotbar(player, from, to)) {
        socket.emit('inventoryUpdate', playersMod.invState(player));
        sendHands();
      }
    });

    // Надеть броню/оружие/щит прямо из слота хотбара
    socket.on('equipHotbar', (slot) => {
      if (playersMod.equipHotbar(player, slot)) {
        socket.emit('inventoryUpdate', playersMod.invState(player));
        io.emit('playerEquipment', { id: socket.id, equipment: player.equipment });
        sendHands();
      }
    });

    // Перемещение/обмен предметов внутри рюкзака (drag-n-drop в любую клетку)
    socket.on('moveItem', ({ from, to } = {}) => {
      if (playersMod.moveItem(player, from, to))
        socket.emit('inventoryUpdate', playersMod.invState(player));
    });

    // --- Сундук-хранилище (банк): доступен, когда игрок стоит рядом с сундуком ---
    const nearChest = () => nearTile(cfg.TILES.CHEST);
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

    // --- Колодец: наполнить пустые колбы водой (рядом с колодцем) ---
    const nearWell = () => nearTile(cfg.TILES.WELL);
    socket.on('fillWater', () => {
      if (!nearWell()) return;
      const n = playersMod.fillFlasks(player);
      socket.emit('inventoryUpdate', playersMod.invState(player));
      socket.emit('chatMessage', { cat: 'system', text: n > 0 ? `Колодец: наполнено колб водой — ${n}` : 'Нет пустых колб для наполнения.' });
    });

    // --- Админ-сундук (тест): взять любой предмет / очистить рюкзак (рядом с сундуком) ---
    const nearAdminChest = () => nearTile(cfg.TILES.ADMIN_CHEST);
    socket.on('creativeTake', ({ id } = {}) => {
      if (!nearAdminChest() || !playersMod.ITEMS[id]) return;
      const qty = playersMod.ITEMS[id].stackable ? 10 : 1;
      if (playersMod.addItem(player, id, qty)) { socket.emit('inventoryUpdate', playersMod.invState(player)); socket.emit('loot', { id, qty }); }
    });
    socket.on('creativeClear', () => {
      if (!nearAdminChest()) return;
      for (let i = 0; i < player.inventory.length; i++) player.inventory[i] = null;
      socket.emit('inventoryUpdate', playersMod.invState(player));
    });

    // Вылить колбу (ПКМ → «Вылить»): waterFlask → emptyFlask
    socket.on('pourFlask', ({ invIndex } = {}) => {
      if (playersMod.pourFlask(player, invIndex)) socket.emit('inventoryUpdate', playersMod.invState(player));
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

    // Взять «в руку» предмет из слота хотбара (оружие/инструмент → правая, щит → левая) — в т.ч. по клавишам 1–6
    socket.on('activateSlot', (slot) => {
      if (playersMod.wieldHotbar(player, slot)) {
        socket.emit('inventoryUpdate', playersMod.invState(player));
        sendHands();
      }
    });

    // Взять «в руку» предмет прямо из рюкзака (без переноса в слот)
    socket.on('activateInv', (invIndex) => {
      if (playersMod.activateInv(player, invIndex)) {
        socket.emit('inventoryUpdate', playersMod.invState(player));
        sendHands();
      }
    });

    // Взять НПС-квест (из диалога)
    socket.on('acceptQuest', (id) => {
      if (typeof id === 'string' && quests.acceptNpc(player, id)) {
        socket.emit('questUpdate', quests.clientState(player));
      }
    });

    // Поговорить с НПС (подошёл вплотную) — завершает активный talk-квест, если этот НПС его цель
    socket.on('talkNpc', ({ x, y } = {}) => {
      const npc = world.npcAt(player.location, x, y);
      if (!npc || !adjOrtho(player.x, player.y, npc.x, npc.y)) return;
      const label = (npc.link && npc.link.trim()) ? npc.link.trim() : npc.name;
      const r = quests.recordTalk(player, label) || (npc.link ? quests.recordTalk(player, npc.name) : null);
      if (r && r.done) {
        if (r.rewardItem) playersMod.addItem(player, r.rewardItem.id, r.rewardItem.qty);
        socket.emit('inventoryUpdate', playersMod.invState(player));
        socket.emit('questUpdate', quests.clientState(player));
        socket.emit('questDone', { title: r.quest.title, reward: r.reward });
        socket.emit('talkResult', { x: npc.x, y: npc.y, completed: true, text: npc.talkText || r.quest.thanks });
      } else {
        socket.emit('talkResult', { x: npc.x, y: npc.y, completed: false });
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
