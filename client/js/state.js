// Общее изменяемое состояние клиента. Все модули читают/пишут поля этого объекта
// (так избегаем проблем с live-bindings ES-модулей при переприсваивании).
export const S = {
  socket: null,
  canvas: null,
  ctx: null,

  // мир
  MAP: null, mapW: 0, mapH: 0,
  myId: null,
  players: {},   // id -> { id,name,x,y,color,rx,ry,hp,maxHp }
  mobs: {},      // id -> { id,x,y,type,hp,maxHp,color,alive,flash }

  // камера (origin пересчитывается каждый кадр)
  originX: 0, originY: 0,

  // перемещение/действие (локальное)
  path: [],
  targetTile: null,
  pendingAction: null,    // намерение по прибытии: {kind:'attack',id} | {kind:'gather',x,y}
  combatTargetId: null,   // id моба, с которым сейчас бой (для панели HP врага)

  // внешность персонажа (создание)
  appearance: { skin:'#f3cfa6', hair:'#4a3525', hairStyle:'h1' },

  // инвентарь / снаряжение
  inventory: [],          // [{ id, qty }]
  hotbar: [null, null, null, null, null, null],
  handR: null,            // id предмета в правой руке (оружие/инструмент)
  handL: null,            // id предмета в левой руке (щит)
  equipment: { helmet:null, chest:null, gloves:null, pants:null, boots:null, cloak:null },
  armor: 0,
  location: 'surface',    // текущая локация игрока (рендерим только объекты/мобов/игроков этой локации)
  FLOOR: [],              // слой пола (трава/тропа/вода) под объектами; MAP — «эффективный» тайл
  bank: { slots: [], level: 0, maxLevel: 5, nextCost: null }, // личное хранилище (сундук)
  depletedNodes: new Set(), // "x,y" истощённых ресурсов (пень/обломки)
  signs: [],              // таблички текущей локации: [{x,y,text}] (текст для игрока по клику)
  npcs: [],               // НПС текущей локации: [{id,x,y,name,link,appearance,equipment,trader,dialogue,quest}]
  spots: [],              // рыбные места текущей локации: [{x,y,name}] (на воде, ловим удочкой)
  stones: [],             // камни возвращения текущей локации: [{x,y,name}]
  returnPoint: null,      // привязанная точка возврата игрока: {location,x,y,name} | null
  returnCdUntil: 0,       // timestamp окончания кулдауна камня возвращения (для счётчика на предмете)
  items: {},              // данные предметов (с сервера — единый источник; см. items.js для иконок/цветов)
  skills: {},             // навыки игрока (с сервера): { key: {name,desc,trains,xp,level,levelXp,nextXp,max} }
  recipes: { smelter: [], anvil: [], campfire: [] }, // рецепты крафта (с сервера)
  mobTypes: {},           // типы мобов с сервера (для энциклопедии)
  guideNav: [],           // стек навигации энциклопедии: [{kind:'index'|'item'|'mob', id}]
  questDefs: { story: [], side: [] }, // определения квестов (с сервера)
  quests: { story: 0, progress: 0, completed: [], active: {} }, // прогресс игрока (story + npc active id→прогресс)

  // настройки клиента (хранятся в localStorage)
  settings: { outline: (() => { try { return localStorage.getItem('opt_outline') === '1'; } catch (e) { return false; } })() },

  // ввод
  keys: {},
  touchDir: { dx: 0, dy: 0 },

  // эффекты
  floaters: [],   // всплывающие цифры урона
  hurtFlash: 0,
  deathFlash: 0,
};
