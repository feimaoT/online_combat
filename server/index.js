import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist');

const PORT = Number(process.env.PORT ?? 8080);
const APP_BASE_PATH = normalizeBasePath(process.env.APP_BASE_PATH ?? '');
const SOCKET_PATH = `${APP_BASE_PATH}/socket.io`;
const MAX_ROOMS = 30;
const ROOM_DURATION_MS = 10 * 60 * 1000;
const INVASION_INTERVAL_MS = 3 * 60 * 1000;
const ROOM_DELETE_AFTER_END_MS = 15 * 1000;

const TEAM_COLORS = [
  { key: 'cyan', name: '青色阵营', color: '#36f0d2' },
  { key: 'amber', name: '金色阵营', color: '#ffd166' },
  { key: 'green', name: '绿色阵营', color: '#a7e65d' },
  { key: 'violet', name: '紫色阵营', color: '#ba7cff' },
  { key: 'red', name: '红色阵营', color: '#ff6961' },
  { key: 'blue', name: '蓝色阵营', color: '#5bc0ff' },
];

const rooms = new Map();

function now() {
  return Date.now();
}

function makeRoom(name = '') {
  const createdAt = now();
  const id = randomUUID().slice(0, 8);
  const scores = Object.fromEntries(TEAM_COLORS.map((team) => [team.key, 0]));

  return {
    id,
    name: name.trim().slice(0, 18) || `战区 ${id.slice(0, 4).toUpperCase()}`,
    createdAt,
    endsAt: createdAt + ROOM_DURATION_MS,
    nextInvasionAt: createdAt + INVASION_INTERVAL_MS,
    players: new Map(),
    userTeams: new Map(),
    scores,
    ended: false,
    deleteAt: 0,
  };
}

function publicRoom(room) {
  const t = now();
  return {
    id: room.id,
    name: room.name,
    players: room.players.size,
    maxPlayers: 60,
    remainingMs: Math.max(0, room.endsAt - t),
    nextInvasionMs: room.ended ? 0 : Math.max(0, room.nextInvasionAt - t),
    scores: room.scores,
    ended: room.ended,
  };
}

function roomList() {
  return [...rooms.values()]
    .filter((room) => !room.ended)
    .map(publicRoom)
    .sort((a, b) => b.remainingMs - a.remainingMs);
}

function assignTeam(room, userId) {
  const existing = room.userTeams.get(userId);
  if (existing) {
    return existing;
  }

  const team = TEAM_COLORS[Math.floor(Math.random() * TEAM_COLORS.length)];
  room.userTeams.set(userId, team);
  return team;
}

function leaveCurrentRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) {
    return;
  }

  const room = rooms.get(roomId);
  if (room) {
    room.players.delete(socket.id);
    socket.to(roomId).emit('room:player-left', { socketId: socket.id });
  }

  socket.leave(roomId);
  socket.data.roomId = undefined;
}

function getWinner(room) {
  return TEAM_COLORS.reduce(
    (best, team) => {
      const score = room.scores[team.key] ?? 0;
      return score > best.score ? { ...team, score } : best;
    },
    { ...TEAM_COLORS[0], score: room.scores[TEAM_COLORS[0].key] ?? 0 },
  );
}

function endRoom(io, room) {
  if (room.ended) {
    return;
  }

  room.ended = true;
  room.deleteAt = now() + ROOM_DELETE_AFTER_END_MS;
  const winner = getWinner(room);
  io.to(room.id).emit('room:end', {
    roomId: room.id,
    winner,
    scores: room.scores,
  });
  io.emit('rooms:list', roomList());
}

function joinPlayerToRoom(io, socket, room, payload = {}, ack) {
  if (!room || room.ended || now() >= room.endsAt) {
    ack?.({ ok: false, error: '房间不存在或已经结束。' });
    return;
  }

  leaveCurrentRoom(socket);

  const userId = String(payload.userId || socket.id).slice(0, 64);
  const name = String(payload.name || 'Player').slice(0, 18);
  const team = assignTeam(room, userId);
  const player = {
    socketId: socket.id,
    userId,
    name,
    teamKey: team.key,
    teamName: team.name,
    color: team.color,
    x: 1500,
    y: 1000,
    angle: 0,
    alive: true,
    updatedAt: now(),
  };

  socket.join(room.id);
  socket.data.roomId = room.id;
  socket.data.userId = userId;
  room.players.set(socket.id, player);

  ack?.({
    ok: true,
    room: publicRoom(room),
    player,
    teams: TEAM_COLORS,
  });
  io.to(room.id).emit('room:state', buildRoomState(room));
  io.emit('rooms:list', roomList());
}

function pickQuickRoom() {
  return [...rooms.values()]
    .filter((room) => !room.ended && now() < room.endsAt && room.players.size < 60)
    .sort((a, b) => b.players.size - a.players.size || b.endsAt - a.endsAt)[0];
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: SOCKET_PATH,
  cors: {
    origin: '*',
  },
});

if (APP_BASE_PATH) {
  app.get('/', (_req, res) => {
    res.redirect(`${APP_BASE_PATH}/`);
  });
  app.use(APP_BASE_PATH, express.static(distDir));
  app.get(new RegExp(`^${escapeRegExp(APP_BASE_PATH)}(?:/.*)?$`), (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  app.use(express.static(distDir));
}

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

io.on('connection', (socket) => {
  socket.emit('rooms:list', roomList());

  socket.on('rooms:list', () => {
    socket.emit('rooms:list', roomList());
  });

  socket.on('room:create', (payload = {}, ack) => {
    const activeRooms = [...rooms.values()].filter((room) => !room.ended).length;
    if (activeRooms >= MAX_ROOMS) {
      ack?.({ ok: false, error: '房间已满，最多只能同时存在 30 个房间。' });
      return;
    }

    const room = makeRoom(payload.name);
    rooms.set(room.id, room);
    io.emit('rooms:list', roomList());
    ack?.({ ok: true, room: publicRoom(room) });
  });

  socket.on('room:quick-join', (payload = {}, ack) => {
    let room = pickQuickRoom();
    if (!room) {
      const activeRooms = [...rooms.values()].filter((entry) => !entry.ended).length;
      if (activeRooms >= MAX_ROOMS) {
        ack?.({ ok: false, error: '房间已满，请稍后再试。' });
        return;
      }

      room = makeRoom('快速战区');
      rooms.set(room.id, room);
    }

    joinPlayerToRoom(io, socket, room, payload, ack);
  });

  socket.on('room:join', (payload = {}, ack) => {
    const room = rooms.get(payload.roomId);
    joinPlayerToRoom(io, socket, room, payload, ack);
  });

  socket.on('player:state', (payload = {}) => {
    const room = rooms.get(socket.data.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player || room.ended) {
      return;
    }

    player.x = clampNumber(payload.x, 0, 3000);
    player.y = clampNumber(payload.y, 0, 2000);
    player.angle = clampNumber(payload.angle, -Math.PI * 2, Math.PI * 2);
    player.alive = payload.alive !== false;
    player.updatedAt = now();
  });

  socket.on('score:add', (payload = {}) => {
    const room = rooms.get(socket.data.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player || room.ended) {
      return;
    }

    const amount = clampNumber(payload.amount, 0, 1000);
    room.scores[player.teamKey] = Math.round((room.scores[player.teamKey] ?? 0) + amount);
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom(socket);
    io.emit('rooms:list', roomList());
  });
});

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.max(min, Math.min(max, number));
}

function normalizeBasePath(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRoomState(room) {
  const t = now();
  return {
    room: publicRoom(room),
    players: [...room.players.values()].map((player) => ({
      socketId: player.socketId,
      userId: player.userId,
      name: player.name,
      teamKey: player.teamKey,
      teamName: player.teamName,
      color: player.color,
      x: player.x,
      y: player.y,
      angle: player.angle,
      alive: player.alive,
    })),
    scores: room.scores,
    remainingMs: Math.max(0, room.endsAt - t),
    nextInvasionMs: room.ended ? 0 : Math.max(0, room.nextInvasionAt - t),
  };
}

setInterval(() => {
  const t = now();

  for (const room of rooms.values()) {
    if (!room.ended && t >= room.endsAt) {
      endRoom(io, room);
      continue;
    }

    if (!room.ended && t >= room.nextInvasionAt) {
      room.nextInvasionAt += INVASION_INTERVAL_MS;
      io.to(room.id).emit('room:invasion', {
        roomId: room.id,
        wave: Math.max(1, Math.floor((t - room.createdAt) / INVASION_INTERVAL_MS)),
        nextInvasionMs: Math.max(0, room.nextInvasionAt - t),
      });
    }

    if (room.ended && room.deleteAt > 0 && t >= room.deleteAt) {
      rooms.delete(room.id);
    }
  }

  io.emit('rooms:list', roomList());
}, 1000);

setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.ended) {
      io.to(room.id).emit('room:state', buildRoomState(room));
    }
  }
}, 200);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mech Harvest server listening on http://0.0.0.0:${PORT}${APP_BASE_PATH || '/'}`);
});
