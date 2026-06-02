// Ресурсы: добываемые ноды из тайлов карты (дерево/камень/руда) + цикл добычи.
const cfg = require('./config');
const { adjOrtho } = require('./util');
const world = require('./world');
const { players, addItem, activeTool } = require('./players');
const { invState } = require('./players');
const quests = require('./quests');

// тайл → параметры ноды (kind, нужный инструмент, что даёт, сколько)
const KINDS = {
  [cfg.TILES.TREE]:  { kind: 'tree',  tool: 'axe',     gives: 'wood',  amount: cfg.NODE_AMOUNT.tree },
  [cfg.TILES.STONE]: { kind: 'stone', tool: 'pickaxe', gives: 'stone', amount: cfg.NODE_AMOUNT.stone },
  [cfg.TILES.IRON]:  { kind: 'iron',  tool: 'pickaxe', gives: 'ore',   amount: cfg.NODE_AMOUNT.iron },
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
      nodes[id] = { id, x, y, kind: def.kind, tool: def.tool, gives: def.gives, amount: def.amount, maxAmount: def.amount, alive: true };
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
      n.amount -= 1;
      addItem(p, n.gives, 1);
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
