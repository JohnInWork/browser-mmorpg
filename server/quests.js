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

// Сколько единиц предмета id лежит в рюкзаке игрока (для gather-квестов: цель проверяется по факту в инвентаре).
function invCount(p, id) { let n = 0; for (const s of p.inventory || []) if (s && s.id === id) n += s.qty || 1; return n; }

// Завершить НПС-квест: выдать золото. Повторяемый — НЕ уходит в completed (можно взять снова).
function finishNpc(p, id, def) {
  delete p.quests.active[id];
  if (!def.repeatable && !p.quests.completed.includes(id)) p.quests.completed.push(id);
  p.gold += def.reward || 0;
  return { quest: def, done: true, reward: def.reward || 0, rewardItem: def.rewardItem || null, repeatable: !!def.repeatable };
}

// Готов ли НПС-квест к сдаче (цель достигнута, но игрок ещё не сдал его НПС).
// kill — по счётчику убийств; gather — по фактическому наличию предметов в рюкзаке.
function questReady(p, id) {
  const d = npcDef(id);
  if (!d || p.quests.active[id] == null) return false;
  if (d.type === 'kill')   return p.quests.active[id] >= d.count;
  if (d.type === 'gather') return invCount(p, gatherTarget(d)) >= d.count;
  return false;   // talk завершается самим фактом разговора (recordTalk), отдельной сдачи нет
}

// Сдать готовый НПС-квест (игрок стоит у НПС-выдавшего). За gather забираем предметы. removeItems из players.js.
function turnIn(p, id, removeItems) {
  if (!questReady(p, id)) return null;
  const d = npcDef(id);
  if (d.type === 'gather' && removeItems) removeItems(p, gatherTarget(d), d.count);
  return finishNpc(p, id, d);
}

// Засчитать убийство моба mobType: сюжет + активные НПС-квесты типа kill. Возвращает массив результатов.
// СЮЖЕТ авто-продвигается; НПС-квесты только КОПЯТ прогресс (сдаются вручную у НПС) — ready=true при достижении цели.
function recordKill(p, kind, name) {
  const out = [];
  const q = activeStory(p);
  if (q && q.kill === kind) {
    p.quests.progress++;
    if (p.quests.progress < q.count) out.push({ quest: q, done: false });
    else { p.quests.completed.push(q.id); p.quests.story++; p.quests.progress = 0; p.gold += q.reward; out.push({ quest: q, done: true, reward: q.reward }); }
  }
  for (const id in p.quests.active) {
    const d = npcDef(id);
    const tgt = d && killTarget(d);
    if (!d || (tgt !== kind && tgt !== name)) continue;   // совпадение по типу-спрайту ИЛИ по имени конкретного моба
    if (p.quests.active[id] >= d.count) continue;          // цель уже набрана — ждёт сдачи у НПС
    p.quests.active[id]++;
    const ready = p.quests.active[id] >= d.count;
    out.push({ quest: d, done: false, ready });            // НЕ завершаем — игрок сам сдаёт квест НПС
  }
  return out;
}

// Статус НПС-квеста для игрока: 'done' | 'ready' | 'active' | 'offer' | null
function npcStatus(p, id) {
  if (!npcDef(id)) return null;
  if (p.quests.completed.includes(id)) return 'done';
  if (p.quests.active[id] != null) return questReady(p, id) ? 'ready' : 'active';
  return 'offer';
}

// Взять НПС-квест
function acceptNpc(p, id) {
  if (npcStatus(p, id) !== 'offer') return false;
  p.quests.active[id] = 0;
  return true;
}

// Получен предмет itemId — есть ли активный gather-квест на него (для обновления прогресса в панели).
// Прогресс gather считается по факту наличия в рюкзаке, поэтому здесь НИЧЕГО не начисляем и не завершаем:
// квест сдаётся вручную у НПС (turnIn). Возвращаем сам квест (если есть активный на этот предмет) | null.
// Вызывается при ЛЮБОМ способе получить предмет: добыча, рыбалка, лут с моба, крафт.
function recordGather(p, itemId, qty = 1) {
  for (const id in p.quests.active) {
    const d = npcDef(id);
    if (!d || gatherTarget(d) !== itemId) continue;
    return { quest: d, done: false, ready: questReady(p, id) };
  }
  return null;
}

// Применить результат recordGather: только обновить прогресс квестов на клиенте (награда — при сдаче у НПС).
function applyGatherResult(io, pid, p, q /* , addItem */) {
  if (!q) return false;
  io.to(pid).emit('questUpdate', clientState(p));
  return true;
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

module.exports = { QUESTS, setAuthored, npcDefs, npcDef, defaultState, activeStory, recordKill, recordGather, applyGatherResult, recordTalk, npcStatus, questReady, turnIn, acceptNpc, clientState, clientDefs };
