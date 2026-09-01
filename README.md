**English** · [Русский](README.ru.md)

# Browser MMORPG

A multiplayer online RPG in the browser: an isometric tile map, players seeing each other in real time, fighting mobs, loot, inventory, gear and levelling. The reference in spirit and gameplay is RPG MO.

![Browser MMORPG](screenshots/gameplay.jpg)

## Architecture

- **Server** (`server/`) — Node.js + Socket.IO. Holds the state of the world: the map, mobs, players, combat, loot. The client decides nothing on its own.
- **Client** (`client/`) — HTML5 Canvas and plain JS, no engine. Draws the isometric view, sprites and interface.
- **Map editor** (`client-admin/`) — a separate admin panel at `/admin`, described below.

## Map editor — the admin panel at `/admin`

The world isn't defined in code: everything in the game is painted and configured in a browser admin panel at `<server address>/admin`. Changes are sent to the server and applied live, with no restart and no hand-editing of json.

![Map editor](screenshots/editor.jpg)

What it can do:

- **Paint the world with a brush** — ground, walls, water, resources, nature, workbenches; several maps (surface, mines, desert, forest) linked together, with stairs and portals joined by a "link ID".
- **Mob builder** — build a mob once, it lands in the library and becomes available on every map; editing it propagates to all copies at once.
- **NPC builder** — dialogue, trade, hostility; its own library, just like mobs.
- **Items and crafting** — a registry of things and recipes; the gear lists in the editor are built from the registry by type and slot, so a new item shows up in the interface by itself, with no list to update.
- **Quests** — kill-quest targets are picked from your own mobs and hostile NPCs.
- **Fishing spots** — set the fish table once and stamp it around.
- Eyedropper, eraser, wheel zoom, right-drag panning.

⚠️ **The admin panel is currently wide open** — the server lets in anyone who knows the address (`ADMIN_PASSWORD` is declared in `server/config.js` but never checked). Handy for local development, but a lock is mandatory before any public launch.

## What already works

- An isometric tile map with player movement synced over WebSocket
- Combat, respawning mobs, loot drops and pickup
- Inventory, gear slots, stats and levels
- The item registry as the single source of truth — editor lists are built from it rather than hard-coded
- An economy balance system (`BALANCE.md`): price and sell price follow from the tier × category pair

## Running it

```bash
cd server && npm install && node server.js
```

The client opens at the server address, the map editor at `/admin`. The port is set by the `PORT` variable (3000 by default).

## Stack

Node.js, Socket.IO, HTML5 Canvas. Graphics are SVG assets in `client/assets/`.

## Status

A working prototype, playable over the network. Not done yet: accounts, saved progress and a lock on the admin panel — all of which must be closed before any public launch.
