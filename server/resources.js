// Ресурсы: добываемые ноды из тайлов карты (дерево/камень/руда) + цикл добычи.
const cfg = require('./config');
const { adjOrtho } = require('./util');
const world = require('./world');
const { players, addItem, activeTool } = require('./players');
const { invState } = require('./players');
const quests = require('./quests');
const boardMod = require('./board');
const skills = require('./skills');

// тайл → параметры ноды (kind, инструмент, что даёт, запас, навык, нужный уровень, опыт за ресурс).
// reqLevel: минимальный уровень навыка для добычи (текущие = 1; будущие «крепкие» ноды — выше).
const KINDS = {
  [cfg.TILES.TREE]:  { kind: 'tree',  tool: 'axe',     gives: 'wood',  amount: cfg.NODE_AMOUNT.tree,  skill: 'woodcutting', reqLevel: 1, xp: 10 },
  [cfg.TILES.IRON]:  { kind: 'iron',  tool: 'pickaxe', gives: 'ore',   amount: cfg.NODE_AMOUNT.iron,  skill: 'mining',      reqLevel: 1, xp: 15 },
  [cfg.TILES.SAND]:  { kind: 'sand',  tool: 'shovel',  gives: 'sand',  amount: cfg.NODE_AMOUNT.sand,  skill: 'mining',      reqLevel: 1, xp: 8 },
  [cfg.TILES.SILVER_ORE]: { kind: 'silver', tool: 'pickaxe', gives: 'silverOre', amount: cfg.NODE_AMOUNT.silver, skill: 'mining', reqLevel: 1, xp: 22 },
  [cfg.TILES.GOLD_ORE]: { kind: 'gold', tool: 'pickaxe', gives: 'goldOre', amount: cfg.NODE_AMOUNT.gold, skill: 'mining', reqLevel: 1, xp: 30 },
};

const nodes = {};   // id -> { id, x, y, location, kind, tool, gives, amount, maxAmount, alive } | рыбная нода {kind:'fish', fish:[...]}
const nodeAt = {};  // "loc:x,y" -> node (ключ включает локацию — на разных картах координаты совпадают)
let seq = 0;

const RES_LOCATION = 'surface';     // тайловые ресурсы (деревья/камень/руда) пока только на Поверхности
const key = (loc, x, y) => loc + ':' + x + ',' + y;

function build() {
  for (const k in nodes) delete nodes[k];
  for (const k in nodeAt) delete nodeAt[k];
  // 1) Тайловые ноды (дерево/камень/руда/песок/серебро) — с карты Поверхности
  const { map, width, height } = world.locState(RES_LOCATION);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const def = KINDS[map[y][x]];
      if (!def) continue;
      const id = 'n' + (seq++);
      nodes[id] = { id, x, y, location: RES_LOCATION, kind: def.kind, tool: def.tool, gives: def.gives, amount: def.amount, maxAmount: def.amount,
                    skill: def.skill, reqLevel: def.reqLevel, xp: def.xp, alive: true };
      nodeAt[key(RES_LOCATION, x, y)] = nodes[id];
    }
  }
  // 2) Рыбные ноды — из расставленных в редакторе рыбных мест (любая локация). Не истощаются.
  for (const s of world.allSpots()) {
    const id = 'n' + (seq++);
    nodes[id] = { id, x: s.x, y: s.y, location: s.location, kind: 'fish', tool: 'fishingRod',
                  skill: 'fishing', reqLevel: 1, fish: s.fish || [], alive: true };
    nodeAt[key(s.location, s.x, s.y)] = nodes[id];
  }
}

function getNodeAt(loc, x, y) { return nodeAt[key(loc, x, y)] || null; }
function depletedList() { return Object.values(nodes).filter(n => !n.alive).map(n => `${n.x},${n.y}`); }
// Подходит ли инструмент (id) для ноды
function canGather(tool, node) { return !!(node && tool && tool === node.tool); }

function start(io) {
  setInterval(() => {
    for (const pid in players) {
      const p = players[pid];
      if (!p.gathering) continue;
      const n = nodes[p.gathering];
      if (!n || !n.alive || n.location !== p.location || !adjOrtho(p.x, p.y, n.x, n.y) || !canGather(activeTool(p), n)) {
        p.gathering = null;
        continue;
      }
      // Удар не всегда успешен: шанс растёт с уровнем навыка (прогрессия добычи)
      const lvl = skills.level(p, n.skill);
      const chance = Math.max(cfg.GATHER_MIN_CHANCE, Math.min(cfg.GATHER_MAX_CHANCE,
        cfg.GATHER_BASE_CHANCE + (lvl - n.reqLevel) * cfg.GATHER_PER_LEVEL));
      if (Math.random() >= chance) { io.emit('gatherMiss', { x: n.x, y: n.y, kind: n.kind }); continue; } // промах — клёва/удара нет

      // --- Рыбалка: какая рыба попалась — зависит от УРОВНЯ (фильтр minLevel) и МЕСТА (своя таблица) ---
      if (n.kind === 'fish') {
        const pool = (n.fish || []).filter(f => lvl >= (f.minLevel || 1));   // доступная по уровню рыба этого места
        if (!pool.length) { io.emit('gatherMiss', { x: n.x, y: n.y, kind: 'fish' }); continue; }
        const total = pool.reduce((a, f) => a + f.chance, 0);                 // взвешенный выбор по шансу
        let r = Math.random() * total, pick = pool[pool.length - 1];
        for (const f of pool) { r -= f.chance; if (r <= 0) { pick = f; break; } }
        addItem(p, pick.id, 1);
        const fup = skills.addXp(p, 'fishing', pick.xp || 12);
        io.to(pid).emit('skillUpdate', { skill: 'fishing', ...skills.one(p, 'fishing'), leveledUp: fup.leveledUp });
        const fq = quests.recordGather(p, pick.id);                          // рыба тоже двигает квесты на сбор
        if (fq && fq.done && fq.rewardItem) addItem(p, fq.rewardItem.id, fq.rewardItem.qty);
        boardMod.notify(io, pid, p, boardMod.recordGather(p, pick.id, 1));    // объявления доски на «добыть N»
        io.to(pid).emit('inventoryUpdate', invState(p));
        io.to(pid).emit('loot', { id: pick.id, qty: 1 });
        if (fq) {
          io.to(pid).emit('questUpdate', quests.clientState(p));
          if (fq.done) io.to(pid).emit('questDone', { title: fq.quest.title, reward: fq.reward });
        }
        io.emit('gatherHit', { x: n.x, y: n.y, kind: 'fish' });
        continue;                                                            // рыбное место не истощается — ловим дальше
      }

      n.amount -= 1;
      addItem(p, n.gives, 1);
      const up = skills.addXp(p, n.skill, n.xp);            // опыт навыка за добытый ресурс
      io.to(pid).emit('skillUpdate', { skill: up.skill, ...skills.one(p, up.skill), leveledUp: up.leveledUp });
      const qg = quests.recordGather(p, n.gives);          // продвинуть НПС-квест на сбор (награда внутри)
      if (qg && qg.done && qg.rewardItem) addItem(p, qg.rewardItem.id, qg.rewardItem.qty); // награда-предмет
      boardMod.notify(io, pid, p, boardMod.recordGather(p, n.gives, 1));   // объявления доски на «добыть N»
      io.to(pid).emit('inventoryUpdate', invState(p));      // включает золото-награду, если квест выполнен
      io.to(pid).emit('loot', { id: n.gives, qty: 1 });
      if (qg) {
        io.to(pid).emit('questUpdate', quests.clientState(p));
        if (qg.done) io.to(pid).emit('questDone', { title: qg.quest.title, reward: qg.reward });
      }
      io.emit('gatherHit', { x: n.x, y: n.y, kind: n.kind });
      if (n.amount <= 0) {
        n.alive = false;
        p.gathering = null;
        io.emit('nodeDepleted', { x: n.x, y: n.y });
        setTimeout(() => {
          n.alive = true; n.amount = n.maxAmount;
          io.emit('nodeRespawned', { x: n.x, y: n.y });
        }, cfg.RESOURCE_RESPAWN_MS);
      }
    }
  }, cfg.GATHER_TICK_MS);
}

module.exports = { build, getNodeAt, depletedList, canGather, start };
