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
  appearance: { skin:'#f3cfa6', hair:'#6e4426', hairStyle:'short', top:'#3f7aa8', bottom:'#5a4636' },

  // инвентарь / снаряжение
  inventory: [],          // [{ id, qty }]
  hotbar: [null, null, null, null, null, null],
  activeSlot: null,
  activeInvId: null,      // id инструмента, активированного прямо в рюкзаке (подсветка)
  activeTool: null,       // id предмета «в руке» (с сервера: из слота или из рюкзака)
  equipment: { helmet:null, chest:null, gloves:null, pants:null, boots:null, cloak:null, mainHand:null, offHand:null },
  armor: 0,
  bank: { slots: [], level: 0, maxLevel: 5, nextCost: null }, // личное хранилище (сундук)
  depletedNodes: new Set(), // "x,y" истощённых ресурсов (пень/обломки)
  items: {},              // данные предметов (с сервера — единый источник; см. items.js для иконок/цветов)
  recipes: { smelter: [], anvil: [], campfire: [] }, // рецепты крафта (с сервера)
  mobTypes: {},           // типы мобов с сервера (для энциклопедии)
  guideNav: [],           // стек навигации энциклопедии: [{kind:'index'|'item'|'mob', id}]
  questDefs: { story: [], side: [] }, // определения квестов (с сервера)
  quests: { story: 0, progress: 0, completed: [], active: {} }, // прогресс игрока (story + npc active id→прогресс)

  // ввод
  keys: {},
  touchDir: { dx: 0, dy: 0 },

  // эффекты
  floaters: [],   // всплывающие цифры урона
  hurtFlash: 0,
  deathFlash: 0,
};
