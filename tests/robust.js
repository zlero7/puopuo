// 서버 안전 테스트: 잘못된 메시지로 서버가 꺼지지 않는지 · 랭크전 규칙 구멍(판 중간 다시 시작 · 스타일 바꾸기 · 다음 판 안 하고 버티기)
// 실행: node tests/robust.js
const { spawn } = require('child_process');
const path = require('path'), os = require('os'), net = require('net'), http = require('http');
const WebSocket = require('ws');
const PORT = 5600 + Math.floor(Math.random() * 300), FILE = path.join(os.tmpdir(), `ranks-robust-${PORT}.json`);
const health = () => new Promise(r => { const q = http.get(`http://127.0.0.1:${PORT}/health`, res => r(res.statusCode === 200)); q.on('error', () => r(false)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`), box = [];
  ws.on('message', m => box.push(JSON.parse(m)));
  ws.on('error', () => {});
  const wait = (t, ms = 5000) => new Promise((res, rej) => { const t0 = Date.now(); (function poll() { const i = box.findIndex(x => x.t === t); if (i >= 0) return res(box.splice(i, 1)[0]); if (Date.now() - t0 > ms) return rej(new Error('대기 시간 초과: ' + t)); setTimeout(poll, 10); })(); });
  const has = t => box.some(x => x.t === t);
  return new Promise(r => ws.on('open', () => r({ ws, box, has, send: o => ws.send(typeof o === 'string' ? o : JSON.stringify(o)), wait })));
}
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) process.exitCode = 1; };
const tok = c => 'robust' + c.repeat(14);

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, REQUIRE_AUTH: '0', PORT, HOST: '127.0.0.1', RANK_FILE: FILE, RANK_OPEN: '1', RANK_BOT_WAIT: '300', RANK_READY_MS: '2500' }, stdio: 'pipe' });
  let errs = ''; srv.stderr.on('data', d => { errs += d; });
  await sleep(700);
  try {
    // ① 잘못된 데이터: 너무 큰 메시지 · 규격에 안 맞는 프레임 · 숫자/문자 변환을 망가뜨린 값
    const big = await client(); big.send('x'.repeat(70 * 1024)); await sleep(200);
    ok(await health(), '64KB 넘는 메시지를 받아도 서버가 켜져 있음');
    await new Promise(r => { const s = net.connect(PORT, '127.0.0.1', () => { s.write(`GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`); setTimeout(() => { s.write(Buffer.from([0x83, 0x80, 1, 2, 3, 4])); setTimeout(() => { s.destroy(); r(); }, 200); }, 200); }); s.on('error', r); });
    ok(await health(), '규격에 안 맞는 프레임을 받아도 서버가 켜져 있음');
    const P = { toString: 1, valueOf: 1 }, bad = await client();
    for (const m of [{ t: 'create', size: P }, { t: 'quick', size: P }, { t: 'join', code: P }, { t: 'rq', token: tok('Z'), style: 'puyo', name: P, char: P }, { t: 'g', d: { t: P } }, { t: P }]) bad.send(m);
    await sleep(300);
    ok(await health(), '숫자·문자로 바꿀 수 없는 값을 받아도 서버가 켜져 있음');
    bad.ws.close(); big.ws.close(); await sleep(100);   // 대기열에 들어간 것 정리

    // ② AI 랭크전: 판이 끝나기 전 '준비'로 판을 다시 시작할 수 없음 · 경기 중 기록이 이상하면 그쪽 패배
    const H = await client();
    H.send({ t: 'rq', token: tok('H'), style: 'puyo', name: 'H', bot: true });
    const s1 = await H.wait('start', 4000);
    ok(!!s1.bot, 'AI 상대와 매칭');
    await sleep(2300);
    for (let i = 0; i < 3; i++) H.send({ t: 'ready' });
    await sleep(400);
    ok(!H.has('start'), '판이 끝나기 전엔 준비를 보내도 새 판이 시작되지 않음');
    H.send({ t: 'g', d: { t: 'lock', at: P, n: P, x: P, y: P, o: P, a: P, b: P } });
    const j = await H.wait('rjudge', 3000);
    ok(j.loser === s1.you && await health(), `이상한 기록을 보낸 쪽이 그 판 패배(${j.reason}), 서버는 그대로`);
    H.send({ t: 'ready' });
    ok(!!(await H.wait('start', 3000)), '판정이 난 뒤엔 준비로 다음 판 시작');
    H.send({ t: 'leave' });

    // ③ 사람끼리: 시리즈 중간에 스타일을 바꿔도 처음 고른 스타일 그대로 · 다음 판을 안 하고 버티면 준비한 쪽이 이김
    const A = await client(), B = await client();
    A.send({ t: 'rq', token: tok('A'), style: 'puyo', name: 'A' }); B.send({ t: 'rq', token: tok('B'), style: 'puyo', name: 'B' });
    const sa = await A.wait('start'); await B.wait('start');
    const [first, other] = sa.you === 0 ? [A, B] : [B, A];
    // 상대 화면을 멈추게 하려는 값은 서버가 고쳐서 보내거나 버림
    await sleep(2100);
    other.box.length = 0;
    first.send({ t: 'g', d: 'junk' }); first.send({ t: 'g', d: null });
    first.send({ t: 'g', d: { t: 'st', pc: { x: 1e9, y: 'a', o: 9, a: 99, b: 1 }, pe: 1e300, sc: null } });
    first.send({ t: 'g', d: { t: 'hi', name: '<img src=x onerror=alert(1)>길고긴이름입니다', char: '"><b>' } });
    await sleep(300);
    const got = other.box.filter(x => x.t === 'g').map(x => x.d);
    const st = got.find(d => d.t === 'st'), hi = got.find(d => d.t === 'hi');
    ok(got.length === 2 && st && st.pe <= 999 && typeof st.sc === 'number' && st.pc === null && hi.name.length <= 10 && hi.char === '', `상대에게는 고친 기록만 감: ${JSON.stringify(got)}`);
    first.send({ t: 'g', d: { t: 'dead' } });           // 첫 판: first가 탈락
    await A.wait('rjudge'); await B.wait('rjudge');
    first.send({ t: 'style', style: 'tetris' });
    for (const c of [A, B]) c.send({ t: 'ready', style: 'tetris' });
    const s2 = await A.wait('start'); await B.wait('start');
    ok(s2.styles.every(s => s === 'puyo'), `시리즈 중 스타일을 바꿔도 그대로: ${s2.styles.join(', ')}`);
    other.send({ t: 'g', d: { t: 'dead' } });           // 둘째 판: other가 탈락 → 1:1
    await A.wait('rjudge'); await B.wait('rjudge');
    first.send({ t: 'ready' });                           // other는 다음 판을 시작하지 않고 버팀
    const rf = await first.wait('rdone', 9000), ro = await other.wait('rdone', 1000);
    ok(rf.win && !ro.win && rf.why, `다음 판을 안 하고 버틴 쪽이 시리즈 패배(${rf.why})`);
    // ④ 메시지 폭주: 한 사람이 2만 개를 쏟아부어도 상대에게는 초당 60개 정도만 가고 서버는 그대로
    const X = await client(), Y = await client();
    X.send({ t: 'create', size: 2 }); const cr = await X.wait('created'); Y.send({ t: 'join', code: cr.code });
    await X.wait('start'); await Y.wait('start'); Y.box.length = 0;
    for (let i = 0; i < 20000; i++) X.send({ t: 'g', d: { t: 'st', sc: i } });
    await sleep(1000);
    const flood = Y.box.filter(x => x.t === 'g').length;
    ok(flood < 400 && await health(), `메시지 폭주를 막음: 2만 개 중 ${flood}개만 전달`);
    ok(await health(), '끝까지 서버가 켜져 있음');
  } catch (e) { ok(false, e.message); }
  finally {
    srv.kill(); await sleep(200);
    if (/처리하지 못한 오류/.test(errs)) ok(false, '처리하지 못한 오류 로그: ' + errs.slice(0, 300));
    process.exit();
  }
})();
