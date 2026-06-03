// Единый реестр текстур мобов. ДОБАВИТЬ НОВУЮ = положить svg в client/assets/ и дописать строку сюда.
// Поля: id (короткий код, латиницей), name (подпись в редакторе), svg (путь к файлу), size (необяз., размер в игре, по умолч. 46).
// Соглашение для SVG: квадратный viewBox, существо по центру, «ноги» у нижнего края, плоские цвета без градиентов.
export const MOB_TEXTURES = [
  { id: 'chicken', name: 'Курица',  svg: '/assets/chicken.svg', size: 30 },
  { id: 'wolf',    name: 'Волк',    svg: '/assets/wolf.svg',    size: 46 },
  { id: 'bear',    name: 'Медведь', svg: '/assets/bear.svg',    size: 62 },
  // Примеры для будущих (раскомментируй, когда добавишь файл):
  // { id: 'goblin', name: 'Гоблин', svg: '/assets/goblin.svg' },
  // { id: 'slime',  name: 'Слизень', svg: '/assets/slime.svg' },
];
export const MOB_TEX_BY_ID = Object.fromEntries(MOB_TEXTURES.map(t => [t.id, t]));
