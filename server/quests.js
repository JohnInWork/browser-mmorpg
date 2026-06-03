// Квесты: сюжетная цепочка (убийства) + квесты от НПС.
// Типы НПС-квестов: gather (собрать ресурс), kill (убить мобов), talk (поговорить с другим НПС).
// Статические квесты — в data/quests.json; авторские (созданные в редакторе на НПС) — в authored.
const QUESTS = require('./data/quests.json');

let authored = {};                                  // { qid: def } — квесты, заданные на НПС в редакторе
function setAuthored(defs) { authored = defs || {}; }
function npcDefs() { return { ...QUESTS.npc, ...authored }; }   // объединённый реестр НПС-квестов
function npcDef(id) { return authored[id] || (QUESTS.npc && QUESTS.npc[id]) || null; }

// Унификация целей квеста (статический формат quests.json и авторский {type,target})
function gatherTarget(def) { return def.type === 'gather' ? def.target : (def.type ? null : def.gather); }
function killTarget(def)   { return def.type === 'kill'   ? def.target : null; }
function talkTarget(def)   { return def.type === 'talk'   ? def.target : null; }

function defaultState() { return { story: 0, progress: 0, completed: [], active: {} }; }
function activeStory(p) { return QUESTS.story[p.quests.story] || null; }

// Завершить НПС-квест: выдать золото. Повторяемый — НЕ уходит в completed (можно взять снова).
function finishNpc(p, id, def) {
  delete p.quests.active[id];
  if (!def.repeatable && !p.quests.completed.includes(id)) p.quests.completed.push(id);
  p.gold += def.reward || 0;
  return { quest: def, done: true, reward: def.reward || 0, rewardItem: def.rewardItem || null, repeatable: !!def.repeatable };
}

// Засчитать убийство моба mobType: сюжет + активные НПС-квесты типа kill. Возвращает массив результатов.
function recordKill(p, mobType) {
  const out = [];
  const q = activeStory(p);
  if (q && q.kill === mobType) {
    p.quests.progress++;
    if (p.quests.progress < q.count) out.push({ quest: q, done: false });
    else { p.quests.completed.push(q.id); p.quests.story++; p.quests.progress = 0; p.gold += q.reward; out.push({ quest: q, done: true, reward: q.reward }); }
  }
  for (const id in p.quests.active) {
    const d = npcDef(id);
    if (!d || killTarget(d) !== mobType) continue;
    p.quests.active[id]++;
    if (p.quests.active[id] < d.count) out.push({ quest: d, done: false });
    else out.push(finishNpc(p, id, d));
  }
  return out;
}

// Статус НПС-квеста для игрока: 'done' | 'active' | 'offer' | null
function npcStatus(p, id) {
  if (!npcDef(id)) return null;
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

// Засчитать сбор ресурса itemId — продвигает активные gather-квесты. Возвращает результат | null.
function recordGather(p, itemId) {
  for (const id in p.quests.active) {
    const d = npcDef(id);
    if (!d || gatherTarget(d) !== itemId) continue;
    p.quests.active[id]++;
    if (p.quests.active[id] < d.count) return { quest: d, done: false };
    return finishNpc(p, id, d);
  }
  return null;
}

// Поговорил с НПС (метка link/имя). Завершает активный talk-квест с такой целью. Результат | null.
function recordTalk(p, label) {
  const t = String(label || '').trim();
  if (!t) return null;
  for (const id in p.quests.active) {
    const d = npcDef(id);
    if (!d || talkTarget(d) !== t) continue;
    return finishNpc(p, id, d);
  }
  return null;
}

// Состояние квестов игрока для клиента
function clientState(p) {
  return { story: p.quests.story, progress: p.quests.progress, completed: p.quests.completed.slice(), active: { ...p.quests.active } };
}
// Определения квестов для клиента (сюжет + побочные + НПС с авторскими)
function clientDefs() { return { story: QUESTS.story, side: QUESTS.side || [], npc: npcDefs() }; }

module.exports = { QUESTS, setAuthored, npcDefs, npcDef, defaultState, activeStory, recordKill, recordGather, recordTalk, npcStatus, acceptNpc, clientState, clientDefs };
