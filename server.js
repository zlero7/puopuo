// 뿌요뿌요 온라인 대전 서버
// - public/index.html 을 제공하고, 같은 포트에서 WebSocket 으로 방 매칭과 메시지 중계를 한다.
// - 게임 판정은 각 클라이언트가 자기 필드를 직접 계산하고, 서버는 두 사람을 이어 주기만 한다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const rank = require('./rank');

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
  } else if (url === '/rank/top' || url === '/rank/me') {      // 랭크전 순위표 · 내 레이팅
    const q = new URLSearchParams(req.url.split('?')[1] || ''), style = rank.STYLES.includes(q.get('style')) ? q.get('style') : 'puyo';
    let body;
    if (url === '/rank/top') body = rank.top(style, +q.get('season') || 0, +q.get('page') || 1, (q.get('q') || '').slice(0, 20));
    else if (!rank.validToken(q.get('token'))) { res.writeHead(400); res.end(); return; }
    else body = rank.me(q.get('token'), style);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
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
const rooms = new Map();        // code -> { code, size, board, players: [ws], seats: [ws], ready: Set, started }
const quickWaiting = new Map(); // '판크기:인원' -> 아직 다 안 찬 빠른 매칭 방
const BOARD_KEYS = ['wide', 'classic', 'tiny'], RULE_KEYS = ['tsu', 'fever', 'bigbang', 'swap', 'party', 'fusion'];

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let c;
  do { c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); }
  while (rooms.has(c));
  return c;
}
function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
const sizeOf = v => Math.max(2, Math.min(4, Math.floor(+v) || 2));
function newRoom(ws, size, board) {
  const room = { code: newCode(), size, board: board || 'wide', rule: ws.rule || 'tsu', players: [], seats: [], ready: new Set(), started: false };
  rooms.set(room.code, room);
  return room;
}
function lobby(room) { for (const p of room.players) send(p, { t: 'lobby', have: room.players.length, size: room.size }); }
function addPlayer(room, ws) {
  room.players.push(ws); ws.room = room;
  if (room.players.length >= room.size) startRoom(room); else lobby(room);
}

// 판 시작: 자리 번호(seat)는 이 순서. 게임 메시지는 보낸 사람의 자리 번호를 붙여 중계
function startRoom(room) {
  room.ready.clear(); room.started = true; room.seats = room.players.slice();
  for (const [k, r] of quickWaiting) if (r === room) quickWaiting.delete(k);
  const seed = Math.floor(Math.random() * 2 ** 32);
  const styles = room.seats.map(p => p.style || 'puyo');          // 각자 고른 스타일(뿌요뿌요/테트리스)
  const board = room.board;                                        // 판 크기는 방을 만든 사람(빠른 매칭은 같은 크기끼리)
  room.seats.forEach((p, i) => send(p, { t: 'start', seed, you: i, styles, board, rule: room.rule, ranked: room.ranked ? 1 : 0 }));
}

// 방을 떠남: 시작 전이면 대기 인원만 갱신, 게임 중이면 남은 사람에게 누가 나갔는지 알림. 2명 미만이 되면 방을 없앰
function leave(ws) {
  rankQ.delete(ws);
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  room.players = room.players.filter(p => p !== ws); room.ready.delete(ws);
  if (!room.started) {
    if (!room.players.length) { rooms.delete(room.code); for (const [k, r] of quickWaiting) if (r === room) quickWaiting.delete(k); }
    else lobby(room);
    return;
  }
  const who = room.seats.indexOf(ws);
  if (room.ranked && !room.ranked.ended && room.players.length === 1) rankedEnd(room, room.seats.indexOf(room.players[0]));   // 랭크전 도중 나가면 나간 쪽 패배
  for (const p of room.players) send(p, { t: 'left', who, rest: room.players.length });
  if (room.players.length < 2) { rooms.delete(room.code); for (const p of room.players) p.room = null; }
}

/* ---------- 랭크전 ----------
   1:1 · 원작 6×12 판 · 통상 규칙 · 2선승. 기다린 시간만큼 숨은 실력 점수 허용 범위가 넓어짐 */
const rankQ = new Set();
// 숨은 실력 점수 차이 허용 범위: ±100에서 10초마다 +50, 배치 중이면 +150, 30초 넘게 기다리면(또는 RANK_OPEN=1) 제한 없음
const rankWindow = ws => {
  const waited = Date.now() - ws.rank.since;
  if (process.env.RANK_OPEN === '1' || waited > 30000) return Infinity;
  return 100 + 50 * Math.floor(waited / 10000) + (rank.placing(ws.rank.rec) ? 150 : 0);
};
function matchRanked() {
  const list = [...rankQ].filter(w => w.readyState === 1).sort((a, b) => a.rank.since - b.rank.since);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (!rankQ.has(a) || !rankQ.has(b) || a.rank.token === b.rank.token) continue;
    const d = Math.abs(rank.mmr(a.rank.rec) - rank.mmr(b.rank.rec));
    if (d > rankWindow(a) || d > rankWindow(b)) continue;
    rankQ.delete(a); rankQ.delete(b);
    const room = newRoom(a, 2, 'classic'); room.rule = 'tsu';
    room.ranked = { score: [0, 0], rep: {}, ended: false };
    a.style = a.rank.style; b.style = b.rank.style;
    addPlayer(room, a); addPlayer(room, b);
  }
}
setInterval(matchRanked, 2000);
// 랭크전 끝: 레이팅 계산 후 두 사람에게 결과
function rankedEnd(room, w) {
  const R = room.ranked; if (!R || R.ended) return;
  R.ended = true;
  const W = room.seats[w], L = room.seats[1 - w];
  if (!W || !W.rank || !L || !L.rank) return;
  const score = [Math.max(2, R.score[w]), R.score[1 - w]];          // 상대가 나가서 끝났으면 2승으로 침
  const res = rank.report(W.rank.rec, L.rank.rec, score);
  [[W, true, res[0]], [L, false, res[1]]].forEach(([p, win, r]) => { const v = rank.view(p.rank.rec); send(p, { t: 'rdone', win, d: r.d, event: r.event, opp: r.opp, score: win ? score : [score[1], score[0]], ...v }); });
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (m.style === 'puyo' || m.style === 'tetris') ws.style = m.style;
    if (BOARD_KEYS.includes(m.board)) ws.board = m.board;
    if (RULE_KEYS.includes(m.rule)) ws.rule = m.rule;

    switch (m.t) {
      case 'create': {
        leave(ws);
        const room = newRoom(ws, sizeOf(m.size), ws.board);
        addPlayer(room, ws);
        send(ws, { t: 'created', code: room.code, size: room.size });
        break;
      }
      case 'join': {
        const room = rooms.get(String(m.code || '').toUpperCase());
        if (!room) { send(ws, { t: 'error', msg: '방을 찾을 수 없습니다. 코드를 확인하세요.' }); return; }
        if (room.players.includes(ws)) return;
        if (room.started || room.players.length >= room.size) { send(ws, { t: 'error', msg: '이미 사람이 다 찬 방입니다.' }); return; }
        leave(ws);
        addPlayer(room, ws);
        break;
      }
      case 'quick': {        // 같은 판 크기·인원끼리 모아서 다 차면 시작
        leave(ws);
        const size = sizeOf(m.size), key = `${ws.board || 'wide'}:${ws.rule || 'tsu'}:${size}`;
        let room = quickWaiting.get(key);
        if (!room || room.started) { room = newRoom(ws, size, ws.board); quickWaiting.set(key, room); }
        addPlayer(room, ws);
        if (!room.started) send(ws, { t: 'waiting', have: room.players.length, size });
        break;
      }
      case 'rq': {           // 랭크전 대기열(레이팅이 가까운 사람끼리)
        if (!rank.validToken(m.token) || !rank.STYLES.includes(m.style)) { send(ws, { t: 'error', msg: '랭크전 정보가 올바르지 않습니다.' }); return; }
        leave(ws);
        ws.rank = { token: m.token, style: m.style, rec: rank.get(m.token, m.style, m.name, m.char), since: Date.now() };
        rankQ.add(ws);
        send(ws, { t: 'rwait', text: rank.labelOf(rank.view(ws.rank.rec)) });
        matchRanked();
        break;
      }
      case 'rres': {         // 랭크전 한 판 결과: 두 사람 보고가 맞을 때만 인정
        const room = ws.room, R = room && room.ranked;
        if (!R || R.ended || !room.started) return;
        const i = room.seats.indexOf(ws); if (i < 0) return;
        R.rep[i] = !!m.win;
        if (Object.keys(R.rep).length < 2) return;
        const wins = [0, 1].filter(k => R.rep[k]);
        R.rep = {};
        if (wins.length !== 1) return;                     // 엇갈리면 이 판은 무효
        R.score[wins[0]]++;
        if (R.score[wins[0]] >= 2) rankedEnd(room, wins[0]);
        break;
      }
      case 'ready': {        // 게임이 끝난 뒤 '다시 하기': 남은 사람이 모두 누르면 새 판
        const room = ws.room;
        if (!room || !room.started || room.players.length < 2) return;
        if (room.ranked && room.ranked.ended) return;     // 끝난 랭크전은 다시 하기 없음
        room.ready.add(ws);
        if (room.players.every(p => room.ready.has(p))) startRoom(room);
        else room.players.forEach(p => { if (p !== ws) send(p, { t: 'oppReady', have: room.ready.size, size: room.players.length }); });
        break;
      }
      case 'leave': leave(ws); break;
      case 'g': {            // 게임 메시지는 다른 사람들에게 보낸 사람 자리 번호를 붙여 중계
        const room = ws.room;
        if (!room || !room.started) return;
        const f = room.seats.indexOf(ws);
        for (const p of room.players) if (p !== ws) send(p, { t: 'g', d: m.d, f });
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
