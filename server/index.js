import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { RoomManager } from './RoomManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const DIST = path.join(__dirname, '../dist');
const rooms = new RoomManager();

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(DIST, urlPath);
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (urlPath !== '/index.html') {
        fs.readFile(path.join(DIST, 'index.html'), (err2, indexData) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(indexData);
        });
        return;
      }
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.rooms.size }));
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      rooms.send(ws, { type: 'error', code: 'BAD_JSON', message: 'Invalid message.' });
      return;
    }

    switch (msg.type) {
      case 'create_room': {
        const snapshot = rooms.createRoom({ name: msg.name, laps: msg.laps, hostWs: ws });
        rooms.send(ws, { type: 'room_created', ...snapshot, invitePath: `/?room=${snapshot.roomId}` });
        break;
      }
      case 'join_room': {
        const result = rooms.joinRoom({ roomId: msg.roomId, name: msg.name, ws });
        if (result.error) {
          rooms.send(ws, { type: 'error', code: result.error, message: result.message });
          break;
        }
        rooms.send(ws, { type: 'room_joined', ...result, invitePath: `/?room=${result.roomId}` });
        break;
      }
      case 'leave_room':
        if (ws.playerId) rooms.leaveRoom(ws.playerId);
        break;
      case 'start_race': {
        const result = rooms.startRace(ws.playerId);
        if (result?.error) {
          rooms.send(ws, { type: 'error', code: result.error, message: result.message });
        }
        break;
      }
      case 'state_update':
        if (ws.playerId) {
          rooms.relayState(ws.playerId, {
            s: msg.s,
            lateral: msg.lateral,
            v: msg.v,
            progress: msg.progress,
            lap: msg.lap,
            finishedLaps: msg.finishedLaps,
          });
        }
        break;
      case 'ping':
        rooms.send(ws, { type: 'pong', t: msg.t });
        break;
      default:
        rooms.send(ws, { type: 'error', code: 'UNKNOWN', message: 'Unknown message type.' });
    }
  });

  ws.on('close', () => {
    if (ws.playerId) rooms.handleDisconnect(ws.playerId);
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
  rooms.cleanupIdleRooms();
}, 30_000);

server.listen(PORT, () => {
  console.log(`Cursor F1 server http+ws://localhost:${PORT}`);
  console.log(`  WebSocket path: /ws`);
  console.log(`  Health: /health`);
});
