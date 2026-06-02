// MMORPG — точка входа. Только подключение модулей и запуск.
// Логика разнесена: world.js (карта), players.js, mobs.js, combat.js, net.js.
// Контент (мобы, карта, предметы) — в data/*.json.
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const cfg = require('./config');
const world = require('./world');
const mobsMod = require('./mobs');
const resources = require('./resources');
const combat = require('./combat');
const net = require('./net');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Статика: игра на "/", редактор на "/admin"
app.use('/admin', express.static(path.join(__dirname, '..', 'client-admin')));
app.use(express.static(path.join(__dirname, '..', 'client')));

// Порядок важен: карта → мобы/ресурсы (нужна карта) → сеть → циклы
world.load();
mobsMod.create();
resources.build();
net.setup(io);
combat.start(io);
resources.start(io);

server.listen(cfg.PORT, () => {
  console.log(`\n  🎮 MMORPG сервер запущен`);
  console.log(`  → Игра:     http://localhost:${cfg.PORT}`);
  console.log(`  → Редактор: http://localhost:${cfg.PORT}/admin   (пароль: ${cfg.ADMIN_PASSWORD})`);
  console.log('');
});
