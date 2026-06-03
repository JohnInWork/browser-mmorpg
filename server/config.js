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
  NODE_AMOUNT: { tree: 30, stone: 20, iron: 12, sand: 25 }, // ресурса за ноду (запас)
  // Шанс получить ресурс за удар: растёт с уровнем навыка (удар не всегда успешен)
  GATHER_BASE_CHANCE: 0.45,    // шанс на минимально нужном уровне
  GATHER_PER_LEVEL: 0.035,     // +шанс за уровень выше требуемого
  GATHER_MIN_CHANCE: 0.30,
  GATHER_MAX_CHANCE: 0.92,

  // Тайлы карты
  TILES: {
    GRASS: 0, WATER: 1, WALL: 2, TREE: 3, PATH: 4, STONE: 5, IRON: 6, ANVIL: 7, SMELTER: 8, CAMPFIRE: 9, CHEST: 10, SAND: 11, WELL: 12, STAIRS_DOWN: 13, STAIRS_UP: 14, CAVE: 15, PORTAL_BLUE: 16, PORTAL_PURPLE: 17, PORTAL_GREEN: 18, SPAWN: 19,
    // --- Новый набор (декор и рельеф) ---
    DIRT: 20, DARK_GRASS: 21, FLOWERS: 22, COBBLE: 23,   // полы (проходимы)
    MOUNTAIN: 24, BUSH: 25, BOULDER: 26, FENCE: 27, LAMP: 28, BRIDGE: 29, SIGN: 30, // объекты
    SAND_FLOOR: 31, // песчаный пол (пустыня) — проходим
    CAVE_WALL: 32,  // пещерная скала-стена (объёмная), непроходима
    WORKBENCH: 33,  // верстак (станция крафта — кожа и пр.)
  },
  // Порталы (13,14,16,17,18), пещерный пол 15, точка спавна 19, полы 20-23/31 и мост 29 — проходимы.
  BLOCKED: [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 24, 25, 26, 27, 28, 30, 32, 33],

  // Хранилище (банк): база + апгрейды за золото
  BANK_BASE: 48,                          // базовый размер (> 32 ячеек рюкзака)
  BANK_PER_LEVEL: 8,                      // +1 ряд за уровень
  BANK_UPGRADE_COST: [200, 500, 1000, 2000, 4000], // цена апгрейда 0→1 … 4→5 (5 уровней)
};
