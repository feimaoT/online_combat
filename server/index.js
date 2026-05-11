import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '..', 'dist');

const PORT = Number(process.env.PORT ?? 8080);
const APP_BASE_PATH = normalizeBasePath(process.env.APP_BASE_PATH ?? '');
const SOCKET_PATH = `${APP_BASE_PATH}/socket.io`;
const ROOM_COUNT = 5;
const ROOM_DURATION_MS = 10 * 60 * 1000;
const LATE_JOIN_LOCK_MS = 2 * 60 * 1000;
const INVASION_INTERVAL_MS = 3 * 60 * 1000;
const TEAM_SUMMON_COOLDOWN_MS = 3 * 60 * 1000;
const WORLD_WIDTH = 5200;
const WORLD_HEIGHT = 3600;

const TEAM_COLORS = [
  { key: 'A', name: 'A 阵营', color: '#36f0d2', spawnX: 850, spawnY: 820 },
  { key: 'B', name: 'B 阵营', color: '#ff6961', spawnX: 4350, spawnY: 820 },
  { key: 'C', name: 'C 阵营', color: '#ffd166', spawnX: 2600, spawnY: 2850 },
];
const TEAM_BY_KEY = new Map(TEAM_COLORS.map((team) => [team.key, team]));
const ROOM_NAMES = ['阿尔法战区', '贝塔战区', '伽马战区', '德尔塔战区', '欧米伽战区'];

const rooms = new Map();
const userCrowns = new Map();

function now() {
  return Date.now();
}

function makeRoom(index) {
  const createdAt = now();
  const scores = makeScoreBoard();

  return {
    id: `room-${index + 1}`,
    name: ROOM_NAMES[index] ?? `固定战区 ${index + 1}`,
    round: 1,
    createdAt,
    endsAt: createdAt + ROOM_DURATION_MS,
    nextInvasionAt: createdAt + INVASION_INTERVAL_MS,
    players: new Map(),
    deadUserIds: new Set(),
    teamLeaders: makeTeamValueMap(null),
    teamSummonReadyAt: makeTeamValueMap(createdAt),
    scores,
    settling: false,
  };
}

function makeScoreBoard() {
  return Object.fromEntries(TEAM_COLORS.map((team) => [team.key, 0]));
}

function makeTeamValueMap(value) {
  return Object.fromEntries(TEAM_COLORS.map((team) => [team.key, value]));
}

function publicRoom(room) {
  const t = now();
  const realPlayers = getRealPlayerCount(room);
  return {
    id: room.id,
    name: room.name,
    round: room.round,
    players: realPlayers,
    socketPlayers: room.players.size,
    maxPlayers: 0,
    unlimitedPlayers: true,
    teamCounts: getTeamCounts(room),
    remainingMs: Math.max(0, room.endsAt - t),
    joinLocked: room.settling || room.endsAt - t <= LATE_JOIN_LOCK_MS,
    nextInvasionMs: room.settling ? 0 : Math.max(0, room.nextInvasionAt - t),
    scores: room.scores,
    ended: false,
  };
}

function roomList() {
  return [...rooms.values()]
    .map(publicRoom)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function getTeamCounts(room) {
  const counts = Object.fromEntries(TEAM_COLORS.map((team) => [team.key, 0]));
  const seenByTeam = Object.fromEntries(TEAM_COLORS.map((team) => [team.key, new Set()]));
  for (const player of room.players.values()) {
    const teamSeen = seenByTeam[player.teamKey];
    if (teamSeen && !teamSeen.has(player.userId)) {
      teamSeen.add(player.userId);
      counts[player.teamKey] = (counts[player.teamKey] ?? 0) + 1;
    }
  }
  return counts;
}

function getRealPlayerCount(room) {
  return new Set([...room.players.values()].map((player) => player.userId)).size;
}

function leaveCurrentRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) {
    return;
  }

  const room = rooms.get(roomId);
  if (room) {
    room.players.delete(socket.id);
    reassignTeamLeader(room, socket.data.teamKey);
    socket.to(roomId).emit('room:player-left', { socketId: socket.id });
  }

  socket.leave(roomId);
  socket.data.roomId = undefined;
  socket.data.teamKey = undefined;
}

function reassignTeamLeader(room, teamKey) {
  if (!teamKey || !room.teamLeaders[teamKey]) {
    return;
  }

  const leaderStillPresent = [...room.players.values()].some(
    (player) => player.teamKey === teamKey && player.userId === room.teamLeaders[teamKey],
  );
  if (leaderStillPresent) {
    return;
  }

  const nextLeader = [...room.players.values()].find((player) => player.teamKey === teamKey);
  room.teamLeaders[teamKey] = nextLeader?.userId ?? null;
  if (nextLeader) {
    nextLeader.teamLeader = true;
  }
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
  if (room.settling) {
    return;
  }

  room.settling = true;
  const winner = getWinner(room);
  for (const player of room.players.values()) {
    if (player.teamKey !== winner.key) {
      continue;
    }
    const nextCount = Math.min(9, (userCrowns.get(player.userId) ?? 0) + 1);
    userCrowns.set(player.userId, nextCount);
    player.crown = nextCount;
  }
  io.to(room.id).emit('room:end', {
    roomId: room.id,
    winner,
    scores: room.scores,
  });

  restartRoomRound(room);
  io.to(room.id).emit('room:state', buildRoomState(room));
  io.emit('rooms:list', roomList());
}

function restartRoomRound(room) {
  const createdAt = now();
  room.round += 1;
  room.createdAt = createdAt;
  room.endsAt = createdAt + ROOM_DURATION_MS;
  room.nextInvasionAt = createdAt + INVASION_INTERVAL_MS;
  room.scores = makeScoreBoard();
  room.deadUserIds.clear();
  room.teamSummonReadyAt = makeTeamValueMap(createdAt);
  room.settling = false;

  const teamIndexes = makeScoreBoard();
  for (const player of room.players.values()) {
    const index = teamIndexes[player.teamKey] ?? 0;
    const spawn = getSpawnPoint(player.teamKey, index);
    player.x = spawn.x;
    player.y = spawn.y;
    player.angle = 0;
    player.alive = true;
    player.maxHp = player.maxHp ?? 120;
    player.hp = player.maxHp;
    player.crown = userCrowns.get(player.userId) ?? 0;
    player.updatedAt = createdAt;
    teamIndexes[player.teamKey] = index + 1;
  }
}

function joinPlayerToRoom(io, socket, room, payload = {}, ack) {
  if (!room) {
    ack?.({ ok: false, error: '房间不存在。' });
    return;
  }

  const rejoiningSameRoom = socket.data.roomId === room.id;
  const userId = String(payload.userId || socket.id).slice(0, 64);
  const remainingMs = room.endsAt - now();
  if (!rejoiningSameRoom && remainingMs <= LATE_JOIN_LOCK_MS) {
    ack?.({ ok: false, error: '本局最后 2 分钟不能加入，请等待下一局。' });
    return;
  }

  const name = String(payload.name || 'Player').slice(0, 18);
  const requestedTeamKey = String(payload.teamKey || '').toUpperCase();
  const team = TEAM_BY_KEY.get(requestedTeamKey);
  if (!team) {
    ack?.({ ok: false, error: '请选择 A / B / C 阵营。' });
    return;
  }
  if (!rejoiningSameRoom && room.deadUserIds.has(userId)) {
    ack?.({ ok: false, error: '本局已经失败，不能复活，请等待下一局。' });
    return;
  }
  leaveCurrentRoom(socket);

  const firstLeader = !room.teamLeaders[team.key];
  if (firstLeader) {
    room.teamLeaders[team.key] = userId;
  }
  const isTeamLeader = room.teamLeaders[team.key] === userId;

  const spawn = getSpawnPoint(team.key, getTeamCounts(room)[team.key] ?? 0);
  const player = {
    socketId: socket.id,
    userId,
    name,
    teamKey: team.key,
    teamName: team.name,
    color: team.color,
    crown: userCrowns.get(userId) ?? 0,
    teamLeader: isTeamLeader,
    hp: 120,
    maxHp: 120,
    x: spawn.x,
    y: spawn.y,
    angle: 0,
    alive: true,
    updatedAt: now(),
  };

  socket.join(room.id);
  socket.data.roomId = room.id;
  socket.data.userId = userId;
  socket.data.teamKey = team.key;
  room.players.set(socket.id, player);

  ack?.({
    ok: true,
    room: publicRoom(room),
    player,
    teams: TEAM_COLORS,
  });
  io.to(room.id).emit('room:state', buildRoomState(room));
  socket.to(room.id).emit('room:player-joined', {
    player: publicPlayer(player),
    message: `真人加入：${name}`,
  });
  io.emit('rooms:list', roomList());
}

function pickQuickRoom() {
  const t = now();
  return [...rooms.values()]
    .filter((room) => room.endsAt - t > LATE_JOIN_LOCK_MS)
    .sort((a, b) => getRealPlayerCount(a) - getRealPlayerCount(b) || a.endsAt - b.endsAt)[0];
}

function getSpawnPoint(teamKey, index) {
  const team = TEAM_BY_KEY.get(teamKey) ?? TEAM_COLORS[0];
  const column = index % 5;
  const row = Math.floor(index / 5);
  return {
    x: clampNumber(team.spawnX + column * 52 - 104, 80, WORLD_WIDTH - 80),
    y: clampNumber(team.spawnY + row * 52 - 52, 80, WORLD_HEIGHT - 80),
  };
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: SOCKET_PATH,
  cors: {
    origin: '*',
  },
});

for (let i = 0; i < ROOM_COUNT; i += 1) {
  const room = makeRoom(i);
  rooms.set(room.id, room);
}

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

  socket.on('room:create', (_payload = {}, ack) => {
    ack?.({ ok: false, error: '当前版本固定 5 个房间，直接选择房间进入。' });
  });

  socket.on('room:quick-join', (payload = {}, ack) => {
    const room = pickQuickRoom();
    if (!room) {
      ack?.({ ok: false, error: '所有房间都进入最后 2 分钟，请等待下一局。' });
      return;
    }

    joinPlayerToRoom(io, socket, room, payload, ack);
  });

  socket.on('room:join', (payload = {}, ack) => {
    const room = rooms.get(payload.roomId);
    joinPlayerToRoom(io, socket, room, payload, ack);
  });

  socket.on('room:leave', (_payload = {}, ack) => {
    leaveCurrentRoom(socket);
    ack?.({ ok: true });
    io.emit('rooms:list', roomList());
  });

  socket.on('player:state', (payload = {}) => {
    const room = rooms.get(socket.data.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player) {
      return;
    }

    player.x = clampNumber(payload.x, 0, WORLD_WIDTH);
    player.y = clampNumber(payload.y, 0, WORLD_HEIGHT);
    player.angle = clampNumber(payload.angle, -Math.PI * 2, Math.PI * 2);
    player.maxHp = clampNumber(payload.maxHp, 1, 10000);
    player.hp = clampNumber(payload.hp, 0, player.maxHp);
    if (payload.alive === false) {
      player.alive = false;
      room.deadUserIds.add(player.userId);
    } else if (!room.deadUserIds.has(player.userId)) {
      player.alive = true;
    }
    player.updatedAt = now();
  });

  socket.on('player:defeated', (payload = {}) => {
    const room = rooms.get(socket.data.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player) {
      return;
    }

    player.alive = false;
    room.deadUserIds.add(player.userId);
    const defeatedBy = String(payload.defeatedBy || '未知单位').slice(0, 32);
    io.to(room.id).emit('room:player-defeated', {
      socketId: socket.id,
      name: player.name,
      teamKey: player.teamKey,
      defeatedBy,
      message: `${player.name} 被 ${defeatedBy} 击败`,
    });
  });

  socket.on('team:summon', (_payload = {}, ack) => {
    const room = rooms.get(socket.data.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player) {
      ack?.({ ok: false, error: '还没有加入房间。' });
      return;
    }

    if (room.teamLeaders[player.teamKey] !== player.userId) {
      ack?.({ ok: false, error: '只有本阵营第一个玩家可以召集。' });
      return;
    }

    const t = now();
    const readyAt = room.teamSummonReadyAt[player.teamKey] ?? 0;
    if (t < readyAt) {
      ack?.({ ok: false, error: '技能冷却中。', remainingMs: readyAt - t });
      return;
    }

    room.teamSummonReadyAt[player.teamKey] = t + TEAM_SUMMON_COOLDOWN_MS;
    io.to(room.id).emit('team:summon', {
      teamKey: player.teamKey,
      leaderSocketId: socket.id,
      leaderName: player.name,
      x: player.x,
      y: player.y,
      cooldownMs: TEAM_SUMMON_COOLDOWN_MS,
      message: `${player.name} 召集了 ${player.teamName}`,
    });
    ack?.({ ok: true, cooldownMs: TEAM_SUMMON_COOLDOWN_MS });
  });

  socket.on('team:heal', (payload = {}) => {
    const room = rooms.get(socket.data.roomId);
    const healer = room?.players.get(socket.id);
    if (!room || !healer || !healer.alive) {
      return;
    }

    const targetSocketId = String(payload.targetSocketId || '');
    const target = room.players.get(targetSocketId);
    if (!target || !target.alive || target.teamKey !== healer.teamKey) {
      return;
    }

    const amount = clampNumber(payload.amount, 0, 200);
    io.to(targetSocketId).emit('team:heal-applied', {
      amount,
      healerSocketId: socket.id,
      healerName: healer.name,
    });
  });

  socket.on('score:add', (payload = {}) => {
    const room = rooms.get(socket.data.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player) {
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
    players: [...room.players.values()].map(publicPlayer),
    scores: room.scores,
    remainingMs: Math.max(0, room.endsAt - t),
    nextInvasionMs: room.settling ? 0 : Math.max(0, room.nextInvasionAt - t),
  };
}

function publicPlayer(player) {
  return {
    socketId: player.socketId,
    userId: player.userId,
    name: player.name,
    teamKey: player.teamKey,
    teamName: player.teamName,
    color: player.color,
    crown: player.crown ?? 0,
    teamLeader: Boolean(player.teamLeader),
    hp: player.hp ?? 120,
    maxHp: player.maxHp ?? 120,
    x: player.x,
    y: player.y,
    angle: player.angle,
    alive: player.alive,
  };
}

setInterval(() => {
  const t = now();

  for (const room of rooms.values()) {
    if (!room.settling && t >= room.endsAt) {
      endRoom(io, room);
      continue;
    }

    if (!room.settling && t >= room.nextInvasionAt) {
      room.nextInvasionAt += INVASION_INTERVAL_MS;
      io.to(room.id).emit('room:invasion', {
        roomId: room.id,
        wave: Math.max(1, Math.floor((t - room.createdAt) / INVASION_INTERVAL_MS)),
        nextInvasionMs: Math.max(0, room.nextInvasionAt - t),
      });
    }
  }

  io.emit('rooms:list', roomList());
}, 1000);

setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.settling) {
      io.to(room.id).emit('room:state', buildRoomState(room));
    }
  }
}, 200);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mech Harvest server listening on http://0.0.0.0:${PORT}${APP_BASE_PATH || '/'}`);
});
