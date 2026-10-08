// 뿌요뿌요 온라인 대전 서버
// - public/index.html 을 제공하고, 같은 포트에서 WebSocket 으로 방 매칭과 메시지 중계를 한다.
// - 게임 판정은 각 클라이언트가 자기 필드를 직접 계산하고, 서버는 두 사람을 이어 주기만 한다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';   // 모든 네트워크 카드에서 접속 허용


// 같은 내부망(공유기·학교망)에서 다른 사람이 들어올 수 있는 주소 목록
function lanAddresses() {
  const list = [];
  for (const [name, infos] of Object.entries(os.networkInterfaces())) {
    for (const i of infos || []) {
      if (i.family !== 'IPv4' && i.family !== 4) continue;
      if (i.internal) continue;
      if (i.address.startsWith('169.254.')) continue;          // 연결 안 된 어댑터
      if (/vEthernet|VirtualBox|VMware|WSL|Docker|Hyper-V|vboxnet|docker|br-|veth/i.test(name)) continue;  // 가상 어댑터
      list.push({ name, url: `http://${i.address}:${PORT}` });
    }
  }
  return list;
}
const INDEX = path.join(__dirname, 'public', 'index.html');

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') {
    fs.readFile(INDEX, (err, data) => {
      if (err) { res.writeHead(500); res.end('index.html 을 읽을 수 없습니다'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  } else if (/^\/js\/[\w-]+\.js$/.test(url)) {      // 게임 스크립트(경로 탈출 불가: 영문·숫자·-·_ 파일 이름만)
    fs.readFile(path.join(__dirname, 'public', url), (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(data);
    });
  } else if (url === '/info') {          // 게임 화면에 '다른 사람 접속 주소'를 보여주기 위함
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ port: PORT, lan: lanAddresses().map(a => a.url) }));
  } else if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
  } else {
    res.writeHead(404); res.end();
  }
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
const rooms = new Map();      // code -> { code, players: [ws, ws], ready: [bool, bool] }
let quickWaiting = null;      // 빠른 매칭 대기자

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let c;
  do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); }
  while (rooms.has(c));
  return c;
}
function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function startRoom(room) {
  room.ready = [false, false];
  const seed = Math.floor(Math.random() * 2 ** 32);
  const styles = room.players.map(p => p.style || 'puyo');        // 각자 고른 스타일(뿌요뿌요/테트리스)
  room.players.forEach((p, i) => send(p, { t: 'start', seed, you: i, styles }));
}

// 방을 떠나면 방을 없애고 남은 사람에게 알린다
function leave(ws) {
  if (quickWaiting === ws) quickWaiting = null;
  const room = ws.room;
  if (!room) return;
  rooms.delete(room.code);
  for (const p of room.players) {
    p.room = null;
    if (p !== ws) send(p, { t: 'left' });
  }
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.style === 'puyo' || m.style === 'tetris') ws.style = m.style;

    switch (m.t) {
      case 'create': {
        leave(ws);
        const room = { code: newCode(), players: [ws], ready: [false, false] };
        rooms.set(room.code, room); ws.room = room;
        send(ws, { t: 'created', code: room.code });
        break;
      }
      case 'join': {
        const room = rooms.get(String(m.code || '').toUpperCase());
        if (!room) { send(ws, { t: 'error', msg: '방을 찾을 수 없습니다. 코드를 확인하세요.' }); return; }
        if (room.players.includes(ws)) return;
        if (room.players.length >= 2) { send(ws, { t: 'error', msg: '이미 두 명이 들어간 방입니다.' }); return; }
        leave(ws);
        room.players.push(ws); ws.room = room;
        startRoom(room);
        break;
      }
      case 'quick': {
        leave(ws);
        if (quickWaiting && quickWaiting !== ws && quickWaiting.readyState === 1) {
          const room = { code: newCode(), players: [quickWaiting, ws], ready: [false, false] };
          rooms.set(room.code, room);
          quickWaiting.room = room; ws.room = room; quickWaiting = null;
          startRoom(room);
        } else {
          quickWaiting = ws;
          send(ws, { t: 'waiting' });
        }
        break;
      }
      case 'ready': {        // 게임이 끝난 뒤 '다시 하기'
        const room = ws.room;
        if (!room || room.players.length < 2) return;
        room.ready[room.players.indexOf(ws)] = true;
        if (room.ready.every(Boolean)) startRoom(room);
        else room.players.forEach(p => { if (p !== ws) send(p, { t: 'oppReady' }); });
        break;
      }
      case 'leave': leave(ws); break;
      case 'g': {            // 게임 메시지는 상대에게 그대로 중계
        const room = ws.room;
        if (!room) return;
        for (const p of room.players) if (p !== ws) send(p, { t: 'g', d: m.d });
        break;
      }
    }
  });

  ws.on('close', () => leave(ws));
});

// 끊긴 연결 정리
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000);

server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`포트 ${PORT} 를 이미 다른 프로그램이 쓰고 있습니다. 예: PORT=3001 npm start`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const lan = lanAddresses();
  console.log('');
  console.log('  뿌요뿌요 서버가 켜졌습니다');
  console.log('');
  console.log(`  이 컴퓨터       http://localhost:${PORT}`);
  if (lan.length) {
    console.log('  같은 네트워크   ' + lan.map(a => `${a.url}  (${a.name})`).join('\n                  '));
  } else {
    console.log('  같은 네트워크   (네트워크에 연결된 IPv4 주소를 찾지 못했습니다)');
  }
  console.log('');
  console.log('  다른 사람이 접속이 안 되면');
  console.log('   - Windows: 방화벽 알림에서 Node.js 를 허용하세요(개인 네트워크).');
  console.log('     이미 거부했다면 "Windows Defender 방화벽 > 앱 허용"에서 Node.js 를 체크하세요.');
  console.log('   - 같은 와이파이/공유기에 있는지 확인하세요. 학교·회사 와이파이는 기기끼리 통신을 막아 둔 경우가 있습니다.');
  console.log('');
});
