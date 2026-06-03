// Ресурсы: добываемые ноды из тайлов карты (дерево/камень/руда) + цикл добычи.
const cfg = require('./config');
const { adjOrtho } = require('./util');
const world = require('./world');
const { players, addItem, activeTool } = require('./players');
const { invState } = require('./players');
const quests = require('./quests');
const skills = require('./skills');

// тайл → параметры ноды (kind, инструмент, что даёт, запас, навык, нужный уровень, опыт за ресурс).
// reqLevel: минимальный уровень навыка для добычи (текущие = 1; будущие «крепкие» ноды — выше).
const KINDS = {
  [cfg.TILES.TREE]:  { kind: 'tree',  tool: 'axe',     gives: 'wood',  amount: cfg.NODE_AMOUNT.tree,  skill: 'woodcutting', reqLevel: 1, xp: 10 },
  [cfg.TILES.STONE]: { kind: 'stone', tool: 'pickaxe', gives: 'stone', amount: cfg.NODE_AMOUNT.stone, skill: 'mining',      reqLevel: 1, xp: 8 },
  [cfg.TILES.IRON]:  { kind: 'iron',  tool: 'pickaxe', gives: 'ore',   amount: cfg.NODE_AMOUNT.iron,  skill: 'mining',      reqLevel: 1, xp: 15 },
  [cfg.TILES.SAND]:  { kind: 'sand',  tool: 'shovel',  gives: 'sand',  amount: cfg.NODE_AMOUNT.sand,  skill: 'mining',      reqLevel: 1, xp: 8 },
};

const nodes = {};   // id -> { id, x, y, kind, tool, gives, amount, maxAmount, alive }
const nodeAt = {};  // "x,y" -> node
let seq = 0;

function build() {
  for (const k in nodes) delete nodes[k];
  for (const k in nodeAt) delete nodeAt[k];
  const { map, width, height } = world.getState();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const def = KINDS[map[y][x]];
      if (!def) continue;
      const id = 'n' + (seq++);
      nodes[id] = { id, x, y, kind: def.kind, tool: def.tool, gives: def.gives, amount: def.amount, maxAmount: def.amount,
                    skill: def.skill, reqLevel: def.reqLevel, xp: def.xp, alive: true };
      nodeAt[x + ',' + y] = nodes[id];
    }
  }
}

function getNodeAt(x, y) { return nodeAt[x + ',' + y] || null; }
function depletedList() { return Object.values(nodes).filter(n => !n.alive).map(n => `${n.x},${n.y}`); }
// Подходит ли инструмент (id) для ноды
function canGather(tool, node) { return !!(node && tool && tool === node.tool); }

function start(io) {
  setInterval(() => {
    for (const pid in players) {
      const p = players[pid];
      if (!p.gathering) continue;
      const n = nodes[p.gathering];
      if (!n || !n.alive || !adjOrtho(p.x, p.y, n.x, n.y) || !canGather(activeTool(p), n)) {
        p.gathering = null;
        continue;
      }
      // Удар не всегда успешен: шанс растёт с уровнем навыка (прогрессия добычи)
      const lvl = skills.level(p, n.skill);
      const chance = Math.max(cfg.GATHER_MIN_CHANCE, Math.min(cfg.GATHER_MAX_CHANCE,
        cfg.GATHER_BASE_CHANCE + (lvl - n.reqLevel) * cfg.GATHER_PER_LEVEL));
      if (Math.random() >= chance) { io.emit('gatherMiss', { x: n.x, y: n.y, kind: n.kind }); continue; } // промах — ресурс не получен

      n.amount -= 1;
      addItem(p, n.gives, 1);
      const up = skills.addXp(p, n.skill, n.xp);            // опыт навыка за добытый ресурс
      io.to(pid).emit('skillUpdate', { skill: up.skill, ...skills.one(p, up.skill), leveledUp: up.leveledUp });
      const qg = quests.recordGather(p, n.gives);          // продвинуть НПС-квест на сбор (награда внутри)
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
