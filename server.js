// 뿌요뿌요 온라인 대전 서버
// - public/index.html 을 제공하고, 같은 포트에서 WebSocket 으로 방 매칭과 메시지 중계를 한다.
// - 게임 판정은 각 클라이언트가 자기 필드를 직접 계산하고, 서버는 두 사람을 이어 주기만 한다.
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const rank = require('./rank');
const social = require('./social');
const { newMatch } = require('./verify');
const { createBot } = require('./sim');
// 랭크전은 서버가 기록을 다시 계산해서 승패를 정함. RANK_TRUST=1이면(테스트용) 예전처럼 두 사람 보고로 정함
const VERIFY = process.env.RANK_TRUST !== '1';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';   // 모든 네트워크 카드에서 접속 허용

/* ---------- 보안 설정(환경 변수) ----------
   기본값은 '인터넷에 여는 앱 서버' 기준: 로그인 필수 · 앱(puyo://app)에서만 웹소켓 접속 · 게임 화면(웹)은 제공하지 않음
   REQUIRE_AUTH=0     로그인 없이 쓰는 개발·테스트 모드(예전 방식: 브라우저 토큰). 인터넷에 열지 말 것
   SERVE_WEB=1        게임 화면(public/)도 이 서버가 제공(기본은 REQUIRE_AUTH=0일 때만)
   ALLOWED_ORIGINS    웹소켓 접속을 허용할 Origin(쉼표로 여러 개, 기본 puyo://app)
   TRUST_PROXY=1      프록시(Caddy·Nginx) 한 단계 뒤에 있을 때: X-Forwarded-For의 오른쪽에서 N번째를 접속자 주소로 씀
   TLS_CERT·TLS_KEY   프록시 없이 직접 HTTPS(wss)로 열 때 인증서·키 파일 경로
   MIN_CLIENT_VERSION 이보다 낮은 버전의 앱은 접속 거부   MAX_CONNS 동시 접속 상한 */
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== '0';
const SERVE_WEB = process.env.SERVE_WEB != null ? process.env.SERVE_WEB === '1' : !REQUIRE_AUTH;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'puyo://app').split(',').map(x => x.trim()).filter(Boolean);
const TRUST_PROXY = +process.env.TRUST_PROXY || 0;
const MIN_CLIENT_VERSION = process.env.MIN_CLIENT_VERSION || '0.0.0';
const MAX_CONNS = +process.env.MAX_CONNS || 2000;
const TLS = process.env.TLS_CERT && process.env.TLS_KEY ? { cert: fs.readFileSync(process.env.TLS_CERT), key: fs.readFileSync(process.env.TLS_KEY) } : null;
const auth = REQUIRE_AUTH ? require('./auth') : null;
const authApi = REQUIRE_AUTH ? require('./authApi') : null;
const cmpVer = (a, b) => { const x = String(a).split('.').map(n => parseInt(n, 10) || 0), y = String(b).split('.').map(n => parseInt(n, 10) || 0); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
// 접속자 주소: 프록시 뒤에서는 프록시가 붙인 값을 믿음(왼쪽 값은 접속자가 마음대로 적을 수 있어 오른쪽에서 센다)
function clientIp(req) {
  const sock = req.socket.remoteAddress || '';
  if (!TRUST_PROXY) return sock;
  const xs = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  return xs.length >= TRUST_PROXY ? xs[xs.length - TRUST_PROXY] : sock;
}
function secHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
  if (TLS || TRUST_PROXY) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}


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

const handler = (req, res) => {
  const url = req.url.split('?')[0];
  secHeaders(res);
  if (REQUIRE_AUTH && url.startsWith('/auth/')) {      // 계정 API(가입·로그인·접속표)
    authApi.handle(req, res, url, clientIp(req)).catch(e => { console.error('계정 API 오류:', e && e.message); if (!res.headersSent) res.writeHead(500); res.end(); });
    return;
  }
  if (SERVE_WEB && (url === '/' || url === '/index.html')) {
    fs.readFile(INDEX, (err, data) => {
      if (err) { res.writeHead(500); res.end('index.html 을 읽을 수 없습니다'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  } else if (SERVE_WEB && /^\/js\/[\w-]+\.js$/.test(url)) {      // 게임 스크립트(경로 탈출 불가: 영문·숫자·-·_ 파일 이름만)
    fs.readFile(path.join(__dirname, 'public', url), (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(data);
    });
  } else if (SERVE_WEB && /^\/fonts\/[\w.-]+\.(woff2|css)$/.test(url)) {    // 내장 글꼴(슬래시가 없어 경로 탈출 불가)
    fs.readFile(path.join(__dirname, 'public', url), (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': url.endsWith('.css') ? 'text/css; charset=utf-8' : 'font/woff2', 'Cache-Control': 'public, max-age=86400' });
      res.end(data);
    });
  } else if (SERVE_WEB && /^\/img\/[\w-]+\.(webp|png)$/.test(url)) {   // 그림(티어 엠블럼 등). 경로 탈출 불가: 영문·숫자·-·_ 이름만
    fs.readFile(path.join(__dirname, 'public', url), (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': url.endsWith('.webp') ? 'image/webp' : 'image/png', 'Cache-Control': 'public, max-age=86400' });
      res.end(data);
    });
  } else if (url === '/rank/top' || url === '/rank/me') {      // 랭크전 순위표 · 내 레이팅
    const q = new URLSearchParams(req.url.split('?')[1] || ''), style = rank.STYLES.includes(q.get('style')) ? q.get('style') : 'puyo';
    let body, me;
    if (REQUIRE_AUTH) { const a = authApi.authed(req); me = a ? a.uid : ''; if (url === '/rank/me' && !a) { res.writeHead(401, { 'Cache-Control': 'no-store' }); res.end(); return; } }   // 로그인한 사람만 '내 것'을 봄(토큰을 주소에 싣지 않음)
    else { me = rank.validToken(q.get('token')) ? q.get('token') : ''; if (url === '/rank/me' && !me) { res.writeHead(400); res.end(); return; } }
    if (url === '/rank/top') body = rank.top(style, +q.get('season') || 0, +q.get('page') || 1, (q.get('q') || '').slice(0, 20), me, REQUIRE_AUTH ? uid => { const a = auth.byUid(uid); return a ? social.fmtPid(auth.ensurePid(a)) : null; } : null);
    else body = rank.me(me, style);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': url === '/rank/me' ? 'no-store' : 'no-cache' });
    res.end(JSON.stringify(body));
  } else if (SERVE_WEB && url === '/info') {          // 게임 화면에 '다른 사람 접속 주소'를 보여주기 위함
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ port: PORT, lan: HOST === '127.0.0.1' || HOST === 'localhost' ? [] : lanAddresses().map(a => a.url) }));   // 이 컴퓨터에서만 열었으면(데스크톱 앱 기본) 다른 사람 접속 주소는 없음
  } else if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(REQUIRE_AUTH ? { ok: true } : { ok: true, rooms: rooms.size }));   // 로그인 서버는 방 수 같은 내부 정보를 밖에 알리지 않음
  } else {
    res.writeHead(404); res.end();
  }
};
const server = TLS ? https.createServer(TLS, handler) : http.createServer(handler);

const wss = new WebSocketServer({
  server, maxPayload: 64 * 1024,
  // 연결을 받기 전에 걸러냄: 동시 접속 상한 · 허용한 Origin(앱)이 아니면 거부
  verifyClient: (info, cb) => {
    if (wss.clients.size >= MAX_CONNS) { cb(false, 503, 'busy'); return; }
    if (REQUIRE_AUTH && !ALLOWED_ORIGINS.includes(info.origin)) { cb(false, 403, 'forbidden'); return; }
    cb(true);
  },
});
const online = new Map();       // 계정 uid → 지금 접속 중인 연결(한 계정은 한 곳에서만)
if (authApi.hooks) authApi.hooks.onLogin = uid => {      // 다른 컴퓨터에서 로그인하면 지금 접속 중인 연결을 끊고 알림(한 계정은 한 곳에서만)
  const old = online.get(uid);
  if (old) { send(old, { t: 'error', code: 'dup', msg: '다른 곳에서 로그인해서 접속이 종료됐어요.' }); old.close(4409, 'dup'); }
};
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
// 받는 쪽이 못 따라오면(1MB 넘게 밀림) 게임 메시지는 버림(서버 메모리가 끝없이 늘지 않게). 중요한 알림은 그래도 보냄
function send(ws, msg) {
  if (!ws || ws.readyState !== 1) return;
  if (msg.t === 'g' && ws.bufferedAmount > 1 << 20) return;
  ws.send(JSON.stringify(msg));
}
const sizeOf = v => Math.max(2, Math.min(4, Math.floor(typeof v === 'number' ? v : 2) || 2));
// 받은 메시지 정리: Object 기본 이름(toString·valueOf 등)을 덮어쓴 값은 숫자·문자로 바꿀 때 오류를 내서 서버가 죽으므로 빼 버림
const BAD_KEYS = new Set(Object.getOwnPropertyNames(Object.prototype));
function clean(v, depth = 0) {
  if (v === null || typeof v !== 'object') return v;
  if (depth > 6) return null;
  if (Array.isArray(v)) return v.map(x => clean(x, depth + 1));
  const o = {};
  for (const k of Object.keys(v)) if (!BAD_KEYS.has(k)) o[k] = clean(v[k], depth + 1);
  return o;
}
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
  const styles = room.seats.map(p => (room.ranked && p.rank ? p.rank.style : p.style) || 'puyo');   // 각자 고른 스타일(랭크전은 대기열에 들어갈 때 고른 것으로 고정)
  const board = room.board;                                        // 판 크기는 방을 만든 사람(빠른 매칭은 같은 크기끼리)
  const ranks = room.ranked ? room.seats.map(p => { if (!p.rank) return null; const v = rank.view(p.rank.rec); return { group: v.group, div: v.div, text: v.text }; }) : null;   // 랭크전: 게임 중 이름표에 띄울 티어
  const bot = room.seats.find(p => p.bot);         // AI 상대: 상대 판은 각자 브라우저에서 CPU로 돌림
  const botInfo = bot ? { name: bot.rank.rec.name, char: bot.rank.rec.char, lv: rank.botLevel(bot.rank.rec) } : undefined;
  room.seats.forEach((p, i) => send(p, { t: 'start', seed, you: i, styles, board, rule: room.rule, ranked: room.ranked ? 1 : 0, ranks, bot: botInfo }));
  if (room.ranked && VERIFY) {                     // 이번 판 검증 시작(준비 연출 2초 뒤부터 진행 시간이 흐름)
    const R = room.ranked, now = Date.now();
    R.match = newMatch({ seed, styles, rule: room.rule, board }); R.t0 = now + 2000; R.judged = false; R.judgedAt = 0; R.lastAct = [now + 2000, now + 2000];
    if (bot) startBot(room, seed, styles, board, botInfo.lv);
  }
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
  if (room.ranked && !room.ranked.ended && room.players.length === 1) rankedEnd(room, room.seats.indexOf(room.players[0]), '나감');   // 랭크전 도중 나가면 나간 쪽 패배(기권)
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
  for (const a of rankQ) if (a.rank.bot && a.readyState === 1 && Date.now() - a.rank.since >= BOT_WAIT && botRooms() < BOT_MAX) botMatch(a);
}
// 서버에서 동시에 돌리는 AI 대전 수 제한(서버가 너무 무거워지지 않게, RANK_BOT_MAX, 기본 20). 넘으면 사람이 올 때까지 계속 기다림
const BOT_MAX = process.env.RANK_BOT_MAX != null ? +process.env.RANK_BOT_MAX : 20;
const botRooms = () => { let n = 0; for (const r of rooms.values()) if (r.ranked && r.ranked.bot && !r.ranked.ended) n++; return n; };
// 사람이 없을 때 AI 상대: 설정에서 켠 사람만, 이만큼 기다려도 못 찾으면(RANK_BOT_WAIT, 기본 20초)
const BOT_WAIT = process.env.RANK_BOT_WAIT != null ? +process.env.RANK_BOT_WAIT : 20000;
function botMatch(a) {
  rankQ.delete(a);
  const rec = rank.bot(a.rank.rec), seat = { bot: true, readyState: 0, style: a.rank.style, rank: { rec, style: a.rank.style } };
  const room = newRoom(a, 2, 'classic'); room.rule = 'tsu';
  room.ranked = { score: [0, 0], rep: {}, ended: false, bot: true };
  a.style = a.rank.style;
  room.players.push(a); a.room = room; room.players.push(seat);
  startRoom(room);
}
setInterval(matchRanked, 1000);   // 매칭은 1초마다 한 번(대기열 메시지마다 돌리지 않음)
// AI 상대를 서버에서 돌림: 16ms마다 한 걸음, 생긴 기록은 검증기에 넣고 사람에게 중계(사람 상대와 똑같이 보임)
function startBot(room, seed, styles, board, lv) {
  const R = room.ranked, bs = room.seats.findIndex(p => p.bot), hs = 1 - bs;
  if (R.botLoop) clearInterval(R.botLoop.t);
  const bot = createBot({ seed, style: styles[bs], oppStyle: styles[hs], board, rule: room.rule, lv });
  const L = R.botLoop = { bot, inbox: [], last: R.t0, stT: 0, chainN: 0 };
  L.t = setInterval(() => { try { botTick(); } catch (e) { clearInterval(L.t); console.error('AI 오류:', e && e.message); } }, 16);   // 멈춘 AI는 60초 뒤 '오래 두지 않음'으로 짐
  function botTick() {
    const now = Date.now();
    if (R.judged || R.ended || !rooms.has(room.code) || R.botLoop !== L || !R.match) { clearInterval(L.t); return; }
    if (now < R.t0) return;
    const dt = Math.min(100, now - L.last); L.last = now;
    for (let i = L.inbox.length - 1; i >= 0; i--) if (L.inbox[i].at <= now) { bot.hit(L.inbox[i].n, L.inbox[i].chain === L.chainN); L.inbox.splice(i, 1); }
    const el = now - R.t0, out = bot.step(dt, el);
    L.stT += dt; if (L.stT >= 50) { L.stT = 0; out.push(bot.state()); }
    const human = room.seats[hs];
    for (const d0 of out) {
      const d = { ...d0, to: d0.to != null ? hs : undefined, at: Math.round(el) };
      if (d.t !== 'st') { R.match.feed(bs, d, el); if (/lock|hold|garb/.test(d.t)) R.lastAct[bs] = now; }
      send(human, { t: 'g', d, f: bs });
      if (R.match.loser != null) { judge(room, R.match.loser, R.match.reason); break; }
    }
  }
}
// 한 판 판정(서버 기준): 진 자리 · 이유. 두 사람에게 알리고, 2승이면 랭크전 끝
function judge(room, loser, reason) {
  const R = room.ranked; if (!R || R.judged || R.ended) return;
  R.judged = true; R.judgedAt = Date.now(); const w = 1 - loser;
  if (process.env.VDEBUG) console.log('[판정]', room.code, '진 자리', loser, reason, R.match ? JSON.stringify(R.match.seats.map(s => ({ locks: s.locks.length, lastAt: s.lastAt, phase: s.f.phase, dead: s.dead, idle: Date.now() - R.lastAct[s.i] }))) : '');
  R.score[w]++;
  for (const p of room.players) send(p, { t: 'rjudge', loser, reason, score: R.score });
  if (R.score[w] >= 2) rankedEnd(room, w);
}
// 오래 두지 않으면(60초) 그 판 패배(둘 다면 더 오래 안 둔 쪽)
// 판이 끝난 뒤 다음 판을 60초 안에 시작하지 않으면 시리즈 패배(지고 있는 쪽이 버텨서 상대가 나가게 만드는 것 막기)
const IDLE_MS = 60000, READY_MS = +process.env.RANK_READY_MS || 60000;
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const R = room.ranked; if (!R || !R.match || R.ended) continue;
    if (!R.judged) {
      const i = R.lastAct[0] <= R.lastAct[1] ? 0 : 1;
      if (now - R.lastAct[i] > IDLE_MS) judge(room, i, '오래 두지 않음');
    } else if (!R.bot && now - R.judgedAt > READY_MS) {
      const ok = room.seats.map(p => room.ready.has(p));
      if (ok[0] !== ok[1]) rankedEnd(room, ok[0] ? 0 : 1, '다음 판을 시작하지 않음');   // 준비한 쪽이 시리즈 승리
      else if (!ok[0] && R.score[0] !== R.score[1]) rankedEnd(room, R.score[0] > R.score[1] ? 0 : 1, '다음 판을 시작하지 않음');
    }
  }
}, 5000);
// 랭크전 끝: 레이팅 계산 후 두 사람에게 결과
function rankedEnd(room, w, why) {
  const R = room.ranked; if (!R || R.ended) return;
  R.ended = true;
  const W = room.seats[w], L = room.seats[1 - w];
  if (W && W.rank && L && L.rank) {
    const score = [Math.max(2, R.score[w]), R.score[1 - w]];          // 상대가 나가서 끝났으면 2승으로 침
    const res = rank.report(W.rank.rec, L.rank.rec, score);
    [[W, true, res[0]], [L, false, res[1]]].forEach(([p, win, r]) => { const v = rank.view(p.rank.rec); send(p, { t: 'rdone', win, why, d: r.d, event: r.event, opp: r.opp, score: win ? score : [score[1], score[0]], ...v }); });
  }
  // 끝난 랭크전 방은 바로 정리(검증기·AI도 함께 버림). 남은 사람은 방 없는 상태가 됨
  if (R.botLoop) clearInterval(R.botLoop.t);
  R.match = null; R.botLoop = null;
  rooms.delete(room.code);
  for (const p of room.players) if (p.room === room) p.room = null;
}

// 한 주소(IP)에서 동시에 접속할 수 있는 수(학교처럼 여러 명이 같은 주소일 수 있어 넉넉히, MAX_CONN_PER_IP)
const MAX_CONN_PER_IP = +process.env.MAX_CONN_PER_IP || 64;
const perIp = new Map();
// 메시지 속도 제한(연결마다): 게임 메시지는 초당 60개(잠깐 몰리면 120개까지), 나머지는 초당 5개(10개까지). 넘으면 버리고, 계속 넘기면 연결을 끊음
const RATE = { g: [60, 120], other: [5, 10] };
function allow(ws, kind) {
  const [per, burst] = RATE[kind], b = ws.bucket[kind], now = Date.now();
  b.n = Math.min(burst, b.n + (now - b.at) * per / 1000); b.at = now;
  if (b.n >= 1) { b.n--; return true; }
  if (++ws.dropped > 2000) ws.terminate();
  return false;
}
wss.on('connection', (ws, req) => {
  const ip = clientIp(req);
  if ((perIp.get(ip) || 0) >= MAX_CONN_PER_IP) { ws.close(1013, 'too many'); return; }
  perIp.set(ip, (perIp.get(ip) || 0) + 1);
  ws.on('close', () => {
    const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
    clearTimeout(ws.authTimer); if (ws.acct && online.get(ws.acct.uid) === ws) online.delete(ws.acct.uid);
  });
  if (REQUIRE_AUTH) ws.authTimer = setTimeout(() => { if (!ws.acct) ws.close(4401, 'auth'); }, +process.env.AUTH_WS_TIMEOUT_MS || 8000);   // 8초 안에 로그인(접속표)하지 않으면 끊음
  ws.bucket = { g: { n: RATE.g[1], at: Date.now() }, other: { n: RATE.other[1], at: Date.now() } }; ws.dropped = 0;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // 잘못된 데이터(너무 큰 메시지·규격에 안 맞는 프레임)는 그 연결만 끊음. 이 처리가 없으면 서버 전체가 꺼짐
  ws.on('error', () => ws.terminate());
  ws.on('message', raw => {
    let m;
    try { m = clean(JSON.parse(raw)); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    if (!allow(ws, m.t === 'g' ? 'g' : 'other')) return;
    if (REQUIRE_AUTH && !ws.acct) { if (m.t === 'auth') doAuth(ws, m); return; }   // 로그인 전에는 auth 말고는 전부 무시
    try { onMessage(ws, m); } catch (e) { console.error('메시지 처리 오류:', m.t, e && e.message); }
  });

  ws.on('close', () => leave(ws));
});

// 웹소켓 로그인: 앱 본체가 세션으로 받아 온 1회용 접속표를 첫 메시지로 보냄. 접속표는 30초 · 한 번만 쓸 수 있음
function doAuth(ws, m) {
  const a = auth.useTicket(m.ticket);
  if (!a) { send(ws, { t: 'autherr', msg: '로그인 정보가 올바르지 않거나 만료됐어요. 다시 로그인해 주세요.' }); ws.close(4401, 'auth'); return; }
  if (cmpVer(typeof m.ver === 'string' ? m.ver.slice(0, 20) : '0', MIN_CLIENT_VERSION) < 0) { send(ws, { t: 'autherr', code: 'old', msg: '앱이 너무 오래돼서 접속할 수 없어요. 새 버전으로 업데이트해 주세요.' }); ws.close(4426, 'old'); return; }
  const old = online.get(a.uid);
  if (old && old !== ws) { send(old, { t: 'error', msg: '다른 곳에서 같은 계정으로 접속해서 이 연결을 끊었어요.' }); old.close(4409, 'dup'); }
  online.set(a.uid, ws); ws.acct = { uid: a.uid, name: a.name }; clearTimeout(ws.authTimer);
  send(ws, { t: 'authok', name: a.name });
}

function onMessage(ws, m) {
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
      const room = typeof m.code === 'string' && rooms.get(m.code.toUpperCase());
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
    case 'soc': {          // 친구 · 프로필(로그인한 사람만)
      if (!REQUIRE_AUTH || !ws.acct) return;
      const a = auth.byUid(ws.acct.uid); if (!a) return;
      const r = social.handle(a, m, { renamed: (uid, n) => { const o = online.get(uid); if (o && o.acct) o.acct.name = n; }, isOnline: uid => online.has(uid), notify: (uid, msg) => { const o = online.get(uid); if (o) send(o, { t: 'soc', ...msg }); } });
      if (r) send(ws, { t: 'soc', ...r });
      break;
    }
    case 'rq': {           // 랭크전 대기열(레이팅이 가까운 사람끼리)
      const token = REQUIRE_AUTH ? ws.acct.uid : m.token, nick = REQUIRE_AUTH ? ws.acct.name : typeof m.name === 'string' ? m.name : '';   // 로그인 서버는 계정이 곧 신원 · 이름도 계정 것
      if (!rank.validToken(token) || !rank.STYLES.includes(m.style)) { send(ws, { t: 'error', msg: '랭크전 정보가 올바르지 않습니다.' }); return; }
      leave(ws);
      ws.rank = { token, style: m.style, rec: rank.get(token, m.style, nick, REQUIRE_AUTH ? (auth.byUid(ws.acct.uid) || {}).char : m.char), since: Date.now(), bot: !!m.bot };
      for (const o of rankQ) if (o !== ws && o.rank.token === token) { rankQ.delete(o); send(o, { t: 'error', msg: '다른 창에서 랭크전 대기를 시작해서 이 창의 대기는 취소됐어요.' }); }   // 한 사람은 대기열에 한 번만
      rankQ.add(ws);
      send(ws, { t: 'rwait', text: rank.labelOf(rank.view(ws.rank.rec)), botIn: ws.rank.bot ? Math.ceil(BOT_WAIT / 1000) : 0 });
      break;
    }
    case 'rres': {         // 랭크전 한 판 결과: 두 사람 보고가 맞을 때만 인정
      const room = ws.room, R = room && room.ranked;
      if (!R || R.ended || !room.started || R.match) return;      // 검증하는 랭크전은 서버가 정함(보고는 무시)
      const i = room.seats.indexOf(ws); if (i < 0) return;
      R.rep[i] = !!m.win;
      if (R.bot) R.rep[1 - i] = !m.win;                  // AI 상대(RANK_TRUST 테스트용): 사람 쪽 보고로 정함
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
      if (room.ranked && room.ranked.match && !room.ranked.judged) return;   // 랭크전: 서버가 이번 판을 판정하기 전엔 다음 판 없음
      room.ready.add(ws);
      if (room.players.every(p => p.bot || room.ready.has(p))) startRoom(room);
      else room.players.forEach(p => { if (p !== ws) send(p, { t: 'oppReady', have: room.ready.size, size: room.players.length }); });
      break;
    }
    case 'leave': leave(ws); break;
    case 'g': {            // 게임 메시지는 다른 사람들에게 보낸 사람 자리 번호를 붙여 중계
      const room = ws.room;
      if (!room || !room.started) return;
      const f = room.seats.indexOf(ws);
      let d = m.d;
      if (!d || typeof d !== 'object' || Array.isArray(d) || typeof d.t !== 'string') return;
      const R = room.ranked;
      if (R && VERIFY && (!R.match || R.judged)) return;   // 랭크전: 판정이 난 뒤의 기록은 상대에게 보내지 않음
      if (R && R.match) {    // 랭크전: 서버가 다시 계산해 보고 맞는 것만, 서버가 새로 만든 기록으로 상대에게
        const res = R.match.feed(f, d, Date.now() - R.t0);
        if (/lock|hold|garb/.test(d.t)) R.lastAct[f] = Date.now();
        if (R.match.loser != null) judge(room, R.match.loser, R.match.reason);
        if (!res.relay) return;
        d = res.relay;
        if (R.botLoop && d.t === 'atk') R.botLoop.inbox.push({ n: d.n, at: Date.now() + 500, chain: R.botLoop.chainN });   // AI에게 공격이 날아가는 시간
        if (R.botLoop && d.t === 'ce') { R.botLoop.chainN++; R.botLoop.bot.release(); }   // 사람 연쇄 끝: AI 쪽에 붙잡혀 있던 방해가 떨어질 수 있음
      }
      if (d.t === 'hi') d = { t: 'hi', name: REQUIRE_AUTH && ws.acct ? ws.acct.name : rank.cleanName(d.name), char: typeof d.char === 'string' ? d.char.slice(0, 12) : '' };   // 로그인 서버는 이름을 계정 것으로 고정(위조 방지), 아니면 닉네임 필터
      for (const p of room.players) if (p !== ws) send(p, { t: 'g', d, f });
      break;
    }
  }
}

// 끊긴 연결 정리
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000);

// 서버를 끌 때 랭크 기록을 바로 저장(모아서 저장하는 중이던 결과가 날아가지 않게)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { rank.flush(); if (auth) auth.flush(); process.exit(0); });
// 예상 못 한 오류가 나도 서버 전체가 꺼지지 않게(기록만 남김)
process.on('uncaughtException', e => console.error('처리하지 못한 오류:', e && e.stack || e));

server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`포트 ${PORT} 를 이미 다른 프로그램이 쓰고 있습니다. 예: PORT=3001 npm start`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const lan = lanAddresses();
  if (REQUIRE_AUTH && process.env.BACKUP !== '0') {       // 계정·랭크·비밀키를 하루에 한 번 data/backups 에 복사(BACKUP=0이면 끔, BACKUP_DIR·BACKUP_KEEP으로 바꿈)
    const dataDir = process.env.AUTH_DIR || path.join(__dirname, 'data');
    const files = [process.env.ACCOUNTS_FILE || path.join(dataDir, 'accounts.json'), process.env.RANK_FILE || path.join(__dirname, 'data', 'ranks.json'), process.env.AUTH_SECRET_FILE || path.join(dataDir, 'auth-secret.key'), path.join(dataDir, 'sync')];   // sync: 계정별 기록 동기화 폴더
    require('./backup').start({ files, dir: process.env.BACKUP_DIR || path.join(dataDir, 'backups') });
  }
  console.log('');
  console.log('  뿌요뿌요 서버가 켜졌습니다');
  console.log(`  ${TLS ? 'HTTPS' : 'HTTP'} · ${REQUIRE_AUTH ? `로그인 필수 · 접속 허용 Origin: ${ALLOWED_ORIGINS.join(', ')}` : '로그인 없음(개발·테스트용, 인터넷에 열지 마세요)'}${SERVE_WEB ? ' · 웹 화면 제공' : ''}${TRUST_PROXY ? ` · 프록시 ${TRUST_PROXY}단계 신뢰` : ''}`);
  if (REQUIRE_AUTH && !TLS && !TRUST_PROXY && HOST !== '127.0.0.1' && HOST !== 'localhost') console.log('  ⚠ 암호화 없이 열려 있어요. 인터넷에 열 때는 HTTPS(Caddy 같은 프록시 + TRUST_PROXY=1, 또는 TLS_CERT·TLS_KEY)를 쓰세요.');
  console.log('');
  console.log(`  이 컴퓨터       http://localhost:${PORT}`);
  if (HOST === '127.0.0.1' || HOST === 'localhost') {
    console.log('  (이 컴퓨터에서만 접속할 수 있게 열었습니다)');
  } else if (lan.length) {
    console.log('  같은 네트워크   ' + lan.map(a => `${a.url}  (${a.name})`).join('\n                  '));
  } else {
    console.log('  같은 네트워크   (네트워크에 연결된 IPv4 주소를 찾지 못했습니다)');
  }
  console.log('');
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.log('  다른 사람이 접속이 안 되면');
    console.log('   - Windows: 방화벽 알림에서 Node.js 를 허용하세요(개인 네트워크).');
    console.log('     이미 거부했다면 "Windows Defender 방화벽 > 앱 허용"에서 Node.js 를 체크하세요.');
    console.log('   - 같은 와이파이/공유기에 있는지 확인하세요. 학교·회사 와이파이는 기기끼리 통신을 막아 둔 경우가 있습니다.');
    console.log('');
  }
});
