#!/bin/bash
# Двойной клик в Finder → запускает сервер MMORPG и открывает игру в браузере.
# Окно Терминала держит сервер живым. Чтобы остановить — закрой окно или нажми Ctrl+C.

# PATH для Finder (там node не виден по умолчанию)
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

SERVER_DIR="/Users/ivankuznecov/Desktop/MMORPG/server"
cd "$SERVER_DIR" || { echo "Не найдена папка server: $SERVER_DIR"; exit 1; }

# Проверка node
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js не найден. Установи Node (https://nodejs.org) и запусти снова."
  echo "Нажми любую клавишу для выхода..."; read -n 1; exit 1
fi

# Зависимости (ставятся один раз)
if [ ! -d node_modules ]; then
  echo "📦 Первый запуск — устанавливаю зависимости..."
  npm install || { echo "Ошибка npm install"; read -n 1; exit 1; }
fi

# Если порт 3000 занят (сервер уже запущен) — просто открыть браузер
if lsof -ti:3000 >/dev/null 2>&1; then
  echo "ℹ️  Сервер уже запущен. Открываю игру в браузере."
  open "http://localhost:3000"
  echo "Нажми любую клавишу для выхода..."; read -n 1; exit 0
fi

echo "🎮 Запускаю сервер MMORPG..."
echo "   Игра откроется в браузере. Это окно не закрывай — оно держит сервер."
echo "   Остановить: закрой окно или Ctrl+C."
echo ""

# Открыть браузер чуть позже, когда сервер поднимется
( sleep 1.5; open "http://localhost:3000" ) &

# Запуск сервера (в этом же окне)
node server.js
