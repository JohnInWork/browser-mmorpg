// Квесты: сюжетная цепочка (убийства) + квесты от НПС (сбор ресурсов, берутся через диалог).
const QUESTS = require('./data/quests.json');

function defaultState() { return { story: 0, progress: 0, completed: [], active: {} }; }
function activeStory(p) { return QUESTS.story[p.quests.story] || null; }

// Засчитать убийство моба типа mobType. Возвращает {quest, done, reward} если был прогресс, иначе null.
function recordKill(p, mobType) {
  const q = activeStory(p);
  if (!q || q.kill !== mobType) return null;
  p.quests.progress++;
  if (p.quests.progress < q.count) return { quest: q, done: false };
  p.quests.completed.push(q.id);
  p.quests.story++;
  p.quests.progress = 0;
  p.gold += q.reward;
  return { quest: q, done: true, reward: q.reward };
}

// Статус НПС-квеста для игрока: 'done' | 'active' | 'offer'
function npcStatus(p, id) {
  if (!QUESTS.npc[id]) return null;
  if (p.quests.completed.includes(id)) return 'done';
  if (p.quests.active[id] != null) return 'active';
  return 'offer';
}

// Взять НПС-квест
function acceptNpc(p, id) {
  if (npcStatus(p, id) !== 'offer') return false;
  p.quests.active[id] = 0;
  return true;
}

// Засчитать сбор ресурса itemId — продвигает активные НПС-квесты на сбор. {quest, done, reward} | null
function recordGather(p, itemId) {
  for (const id in p.quests.active) {
    const d = QUESTS.npc[id];
    if (!d || d.gather !== itemId) continue;
    p.quests.active[id]++;
    if (p.quests.active[id] < d.count) return { quest: d, done: false };
    delete p.quests.active[id];
    p.quests.completed.push(id);
    p.gold += d.reward;
    return { quest: d, done: true, reward: d.reward };
  }
  return null;
}

// Состояние квестов для клиента
function clientState(p) {
  return { story: p.quests.story, progress: p.quests.progress, completed: p.quests.completed.slice(), active: { ...p.quests.active } };
}

module.exports = { QUESTS, defaultState, activeStory, recordKill, npcStatus, acceptNpc, recordGather, clientState };
