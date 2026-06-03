// Единый реестр текстур мобов. ДОБАВИТЬ НОВУЮ = положить svg в client/assets/ и дописать строку сюда.
// Поля: id (короткий код, латиницей), name (подпись в редакторе), svg (путь к файлу), size (необяз., размер в игре, по умолч. 46).
// Соглашение для SVG: квадратный viewBox, существо по центру, «ноги» у нижнего края, плоские цвета без градиентов.
export const MOB_TEXTURES = [
  { id: 'chicken', name: 'Курица',  svg: '/assets/chicken.svg', size: 30 },
  { id: 'wolf',    name: 'Волк',    svg: '/assets/wolf.svg',    size: 46 },
  { id: 'bear',    name: 'Медведь', svg: '/assets/bear.svg',    size: 62 },
  // --- Добавленные текстуры ---
  { id: 'goblin',        name: 'Гоблин',             svg: '/assets/goblin.svg',         size: 46 },
  { id: 'rat',           name: 'Крыса',              svg: '/assets/rat.svg',            size: 40 },
  { id: 'bat',           name: 'Летучая мышь',       svg: '/assets/bat.svg',            size: 42 },
  { id: 'fireelemental', name: 'Огненный элементаль', svg: '/assets/fire-elemental.svg', size: 52 },
  { id: 'scaretree',     name: 'Жуткое дерево',      svg: '/assets/scare-tree.svg',     size: 62 },
  { id: 'reddragon',     name: 'Красный дракон',     svg: '/assets/red-dragon.svg',     size: 60 },
];
export const MOB_TEX_BY_ID = Object.fromEntries(MOB_TEXTURES.map(t => [t.id, t]));
