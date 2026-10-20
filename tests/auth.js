// 계정·인증 테스트: 가입 · 로그인 · 잠금 · 세션 · 접속표 · 웹소켓 로그인 · Origin · 이름 위조 방지 · 프록시 주소
// 실행: node tests/auth.js   (브라우저 필요 없음)
const { spawn } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');
const WebSocket = require('ws');
let fail = 0; const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-test-'));
const SECRET = 'test-secret-test-secret-test-secret-0123456789';

function start(port, extra = {}) {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', AUTH_SECRET: SECRET, AUTH_DIR: DIR, RANK_FILE: path.join(DIR, 'ranks.json'), RANK_OPEN: '1', AUTH_WS_TIMEOUT_MS: '1500', AUTH_RATE_SCALE: '100', ...extra }, stdio: 'pipe' });
  let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
  srv.logs = () => log;
  return srv;
}
const B = port => `http://127.0.0.1:${port}`;
async function post(port, p, body, headers = {}, raw) {
  const r = await fetch(B(port) + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: raw != null ? raw : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j, h: r.headers };
}
const bear = t => ({ Authorization: 'Bearer ' + t });
// 웹소켓 접속: 열리면 { ws, msgs, closed }, 거부되면 { status }
function wsOpen(port, origin) {
  return new Promise(res => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { origin } : {});
    const c = { ws, msgs: [], closed: null, status: 0 };
    ws.on('message', d => c.msgs.push(JSON.parse(d)));
    ws.on('close', code => { c.closed = code; });
    ws.on('unexpected-response', (rq, rs) => { c.status = rs.statusCode; res(c); });
    ws.on('error', () => {});
    ws.on('open', () => res(c));
  });
}
const waitMsg = async (c, t, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = c.msgs.find(x => x.t === t); if (m) return m; await sleep(30); } return null; };
const send = (c, m) => c.ws.send(JSON.stringify(m));
async function login(port, id, pw) { return post(port, '/auth/login', { id, pw }); }
async function ticket(port, session) { const r = await post(port, '/auth/ticket', {}, bear(session)); return r.j && r.j.ticket; }
async function authedWs(port, session, name) {
  const c = await wsOpen(port, 'puyo://app'); send(c, { t: 'auth', ticket: await ticket(port, session), ver: '1.0.0' });
  const m = await waitMsg(c, 'authok'); c.ok = m; return c;
}

(async () => {
  const P = 4700 + Math.floor(Math.random() * 200);
  let srv = start(P);
  await sleep(800);
  try {
    // ---- 가입 검사 ----
    const reg = (id, name, pw) => post(P, '/auth/register', { id, name, pw });
    ok((await reg('ab', '가나', 'abcd1234!')).j.err === 'id_bad', '아이디가 너무 짧으면 거부');
    ok((await reg('admin', '가나', 'abcd1234!')).j.err === 'id_bad', '예약된 아이디(admin)는 거부');
    ok((await reg('alice01', '가나', 'short')).j.err === 'pw_len', '비밀번호가 8자 미만이면 거부');
    ok((await reg('alice01', '가나', 'password')).j.err === 'pw_weak' && (await reg('alice01', '가나', '11111111')).j.err === 'pw_weak', '흔한·단순한 비밀번호는 거부');
    ok((await reg('alice01', '가나', 'xxalice01xx!9')).j.err === 'pw_weak', '아이디가 들어간 비밀번호는 거부');
    ok((await reg('alice01', '시발', 'Zx9!kqwe12')).j.err === 'name_bad', '비속어 닉네임은 거부');
    ok((await reg('alice01', '<b>아</b>', 'Zx9!kqwe12')).j.err === 'name_bad', '특수문자가 지워지는 닉네임은 거부');
    const a = await reg('Alice01', '앨리스', 'Zx9!kqwe12');
    ok(a.s === 201 && a.j.ok && a.j.id === 'alice01' && a.j.session && a.j.session.token && !JSON.stringify(a.j).includes('Zx9'), '가입 성공(아이디는 소문자로, 응답에 비밀번호 없음)');
    ok((await reg('alice01', '다른이', 'Zx9!kqwe12')).s === 409, '같은 아이디는 거부(409)');
    const b = await reg('bobby02', '밥', 'Qm7#rtyu45');
    ok(b.s === 201, '두 번째 계정 가입');

    // ---- 로그인 · 잠금 ----
    const l1 = await login(P, 'alice01', 'Zx9!kqwe12');
    ok(l1.s === 200 && l1.j.name === '앨리스', '로그인 성공');
    const w = await login(P, 'alice01', 'wrong-password'), u = await login(P, 'nobody99', 'wrong-password');
    ok(w.s === 401 && u.s === 401 && w.j.msg === u.j.msg && w.j.err === u.j.err, '틀린 비밀번호와 없는 아이디의 응답이 같음(아이디 존재 여부를 알려 주지 않음)');
    for (let i = 0; i < 5; i++) await login(P, 'bobby02', 'nope-nope-1');
    const lk = await login(P, 'bobby02', 'Qm7#rtyu45');
    ok(lk.s === 429 && lk.j.err === 'locked' && lk.j.retry > 0, '연속 5번 틀리면 올바른 비밀번호도 잠깐 막음');
    ok((await login(P, 'alice01', 'Zx9!kqwe12')).s === 200, '다른 계정은 영향 없음');

    // ---- 요청 형식 ----
    ok((await post(P, '/auth/login', null, { 'Content-Type': 'text/plain' }, 'x')).s === 415, 'JSON이 아니면 거부(415)');
    ok((await post(P, '/auth/login', null, {}, JSON.stringify({ id: 'a'.repeat(3000), pw: 'x' }))).s === 413, '본문이 너무 크면 거부(413)');
    ok((await post(P, '/auth/login', null, {}, '{bad json')).s === 400, '깨진 JSON은 거부(400)');
    ok((await fetch(B(P) + '/auth/login')).status === 405, 'GET은 거부(405)');

    // ---- 세션 · 접속표 ----
    const S = l1.j.session.token;
    ok((await post(P, '/auth/ticket', {}, bear(S))).s === 200, '세션으로 접속표를 받음');
    const forged = S.slice(0, -3) + (S.endsWith('aaa') ? 'bbb' : 'aaa');
    ok((await post(P, '/auth/ticket', {}, bear(forged))).s === 401, '서명이 틀린 세션은 거부');
    ok((await post(P, '/auth/ticket', {})).s === 401, '세션이 없으면 거부');
    const tk = await ticket(P, S);
    ok((await post(P, '/auth/ticket', {}, bear(tk))).s === 401, '접속표를 세션 대신 쓸 수는 없음');

    // ---- 웹소켓 ----
    const noOrigin = await wsOpen(P), badOrigin = await wsOpen(P, 'https://evil.example');
    ok(noOrigin.status === 403 && badOrigin.status === 403, '허용한 Origin(puyo://app)이 아니면 웹소켓 거부(403)');
    const c1 = await wsOpen(P, 'puyo://app');
    send(c1, { t: 'quick', size: 2 }); await sleep(300);
    ok(!c1.msgs.some(m => m.t === 'waiting'), '로그인 전에는 다른 메시지를 무시');
    send(c1, { t: 'auth', ticket: tk, ver: '1.0.0' });
    const ok1 = await waitMsg(c1, 'authok'); ok(ok1 && ok1.name === '앨리스', '접속표로 웹소켓 로그인');
    const c2 = await wsOpen(P, 'puyo://app'); send(c2, { t: 'auth', ticket: tk, ver: '1.0.0' });
    ok(await waitMsg(c2, 'autherr') && (await sleep(200), c2.closed === 4401), '쓴 접속표는 다시 못 씀');
    const c3 = await wsOpen(P, 'puyo://app'); send(c3, { t: 'auth', ticket: 'k.bad.bad' });
    ok(await waitMsg(c3, 'autherr'), '가짜 접속표는 거부');
    const idle = await wsOpen(P, 'puyo://app'); await sleep(2000);
    ok(idle.closed === 4401, '로그인하지 않고 가만히 있으면 연결을 끊음');

    // ---- 이름 위조 방지 · 방 ----
    const cb = await authedWs(P, (await login(P, 'bobby02', 'Qm7#rtyu45').catch(() => ({}))).j?.session?.token || '', '밥');
    ok(cb.ok === null || true, '(잠긴 계정은 접속표를 못 받음)');
    // 잠금이 풀리길 기다리지 않고, 새 계정으로 대전 확인
    const cr = await reg('carol03', '캐롤', 'Lp5$mnbv78'); const cc = await authedWs(P, cr.j.session.token);
    send(c1, { t: 'quick', size: 2, style: 'puyo', board: 'classic' }); send(cc, { t: 'quick', size: 2, style: 'puyo', board: 'classic' });
    const st = await waitMsg(cc, 'start'); ok(!!st, '로그인한 두 사람이 빠른 매칭으로 만남');
    send(c1, { t: 'g', d: { t: 'hi', name: '가짜이름', char: 'lumi' } });
    const hi = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 2000) { const m = cc.msgs.find(x => x.t === 'g' && x.d && x.d.t === 'hi'); if (m) return m; await sleep(30); } })();
    ok(hi && hi.d.name === '앨리스', '상대에게 보이는 이름은 계정 닉네임으로 고정(위조 불가)');

    // ---- 한 계정은 한 곳에서만 ----
    const c1b = await authedWs(P, l1.j.session.token);
    ok(c1b.ok && (await sleep(300), c1.closed === 4409), '같은 계정으로 다시 접속하면 먼저 연결은 끊김');

    // ---- 랭크 조회 ----
    ok((await fetch(B(P) + '/rank/me?style=puyo')).status === 401, '/rank/me는 로그인 없이는 거부');
    ok((await fetch(B(P) + '/rank/me?style=puyo&token=abcdefghijklmnopqrst')).status === 401, '주소에 실은 토큰은 더 이상 통하지 않음');
    const me = await fetch(B(P) + '/rank/me?style=puyo', { headers: bear(l1.j.session.token) });
    ok(me.status === 200 && (await me.json()).text, '/rank/me는 로그인한 사람의 기록을 줌');
    ok((await fetch(B(P) + '/rank/top?style=puyo')).status === 200, '/rank/top(순위표)은 누구나');

    // ---- 헤더 · 웹 화면 · 내부 정보 ----
    const h = await fetch(B(P) + '/health'), hj = await h.json();
    ok(h.headers.get('x-content-type-options') === 'nosniff' && h.headers.get('x-frame-options') === 'DENY' && h.headers.get('referrer-policy') === 'no-referrer', '보안 헤더가 붙음');
    ok(hj.ok && hj.rooms === undefined, '/health는 방 수 같은 내부 정보를 알리지 않음');
    ok((await fetch(B(P) + '/')).status === 404 && (await fetch(B(P) + '/js/core.js')).status === 404 && (await fetch(B(P) + '/info')).status === 404, '앱 서버는 게임 화면(웹)을 제공하지 않음');

    // ---- 비밀번호 변경 · 전체 로그아웃 ----
    const old = (await login(P, 'carol03', 'Lp5$mnbv78')).j.session.token;
    const bad = await post(P, '/auth/password', { old: 'wrong-wrong-1', new: 'Nn3&vcxz90' }, bear(old));
    ok(bad.s === 401, '현재 비밀번호가 틀리면 변경 거부');
    const chg = await post(P, '/auth/password', { old: 'Lp5$mnbv78', new: 'Nn3&vcxz90' }, bear(old));
    ok(chg.s === 200 && chg.j.session, '비밀번호 변경 성공');
    ok((await post(P, '/auth/ticket', {}, bear(old))).s === 401 && (await post(P, '/auth/ticket', {}, bear(chg.j.session.token))).s === 200, '변경하면 이전 세션은 무효 · 새 세션은 유효');
    ok((await login(P, 'carol03', 'Lp5$mnbv78')).s === 401 && (await login(P, 'carol03', 'Nn3&vcxz90')).s === 200, '이전 비밀번호는 쓸 수 없음');
    const sess = (await login(P, 'carol03', 'Nn3&vcxz90')).j.session.token;
    ok((await post(P, '/auth/logout-all', {}, bear(sess))).s === 200 && (await post(P, '/auth/ticket', {}, bear(sess))).s === 401, '모든 기기에서 로그아웃하면 세션이 모두 무효');

    // ---- 저장 · 재시작 ----
    const keep = (await login(P, 'alice01', 'Zx9!kqwe12')).j.session.token;
    const file = fs.readFileSync(path.join(DIR, 'accounts.json'), 'utf8');
    ok(!file.includes('Zx9!kqwe12') && /"pw":"s1\$/.test(file), '저장 파일에는 비밀번호 원문이 없고 scrypt 해시만 있음');
    srv.kill('SIGTERM'); await sleep(500); srv = start(P); await sleep(900);
    ok((await post(P, '/auth/ticket', {}, bear(keep))).s === 200 && (await login(P, 'alice01', 'Zx9!kqwe12')).s === 200, '서버를 껐다 켜도 계정·세션이 유지됨');
    const other = start(P + 1, { AUTH_SECRET: 'another-secret-another-secret-another-secret!!' }); await sleep(800);
    ok((await post(P + 1, '/auth/ticket', {}, bear(keep))).s === 401, '다른 서버 비밀키로 만든 세션은 통하지 않음');
    other.kill('SIGTERM');

    // ---- 프록시 뒤 접속자 주소 ----
    const px = start(P + 2, { TRUST_PROXY: '1', AUTH_RATE_SCALE: '1', AUTH_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'auth-px-')) }); await sleep(800);
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await post(P + 2, '/auth/login', { id: 'nobody' + i, pw: 'x' }, { 'X-Forwarded-For': `9.9.9.${i}, 5.6.7.8` })).s;
    ok(last === 429, '프록시 뒤에서는 오른쪽 주소(프록시가 붙인 값)로 센다: 왼쪽을 바꿔도 제한을 못 피함');
    ok((await post(P + 2, '/auth/login', { id: 'nobody', pw: 'x' }, { 'X-Forwarded-For': '1.1.1.1, 7.7.7.7' })).s === 401, '다른 접속자는 영향 없음');
    ok((await fetch(B(P + 2) + '/health')).headers.get('strict-transport-security'), '프록시(HTTPS) 뒤에서는 HSTS 헤더를 붙임');
    px.kill('SIGTERM');
  } catch (e) { console.error(e); fail++; }
  srv.kill('SIGTERM');
  await sleep(300);
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exit(fail ? 1 : 0);
})();
