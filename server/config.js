// Все настройки игры в одном месте — баланс правится здесь.
module.exports = {
  PORT: process.env.PORT || 3000,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',

  // Игрок
  PLAYER_MAX_HP: 30,
  PLAYER_DMG_MIN: 2,
  PLAYER_DMG_MAX: 5,

  // Бой
  COMBAT_TICK_MS: 650,   // интервал между ударами (1 удар за тик, по очереди)
  RESPAWN_MS: 10000,     // респаун моба через 10 сек

  // Добыча ресурсов
  GATHER_TICK_MS: 700,         // интервал между ударами
  RESOURCE_RESPAWN_MS: 15000,  // ресурс восстанавливается через 15 сек
  NODE_AMOUNT: { tree: 30, stone: 20, iron: 12 }, // ресурса за ноду (= число ударов)

  // Тайлы карты
  TILES: { GRASS: 0, WATER: 1, WALL: 2, TREE: 3, PATH: 4, STONE: 5, IRON: 6, ANVIL: 7, SMELTER: 8, CAMPFIRE: 9 },
  BLOCKED: [1, 2, 3, 5, 6, 7, 8, 9], // непроходимые (вода, стена, дерево, камень, руда, наковальня, плавильня, костёр)
};
