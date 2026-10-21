// 친구 · 프로필 테스트: 요청→수락, 서로 알림, 중복·자기 자신·없는 코드, 삭제, 전적 보기(남의 로그인 아이디가 새지 않는지), 순위표 줄의 친구 코드
// 실행: node tests/social.js   (브라우저 필요 없음)
const { spawn } = require('child_process'); const path = require('path'), os = require('os'), fs = require('fs'); const WebSocket = require('ws');
let fail = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'soc-test-')), PORT = 4900 + Math.floor(Math.random() * 90), B = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', AUTH_SECRET: 'soc-secret-soc-secret-soc-secret-0123456789', AUTH_DIR: DIR, RANK_FILE: path.join(DIR, 'ranks.json'), RANK_OPEN: '1', AUTH_RATE_SCALE: '50', BACKUP: '0' }, stdio: 'pipe' });
srv.stdout.on('data', () => {}); srv.stderr.on('data', () => {});
const post = async (p, body, h = {}) => { const r = await fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body) }); return r.json(); };
async function conn(id, name) {
  const reg = await post('/auth/register', { id, name, pw: 'Zx9!kqwe12' });
  const tk = await post('/auth/ticket', {}, { Authorization: 'Bearer ' + reg.session.token });
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin: 'puyo://app' }), msgs = [];
  ws.on('message', d => msgs.push(JSON.parse(d))); await new Promise(r => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'auth', ticket: tk.ticket, ver: '9.9.9' }));
  const c = { ws, msgs, id, name, send: m => ws.send(JSON.stringify({ t: 'soc', ...m })) };
  c.ask = async (m, op) => { const n = msgs.length; c.send(m); for (let i = 0; i < 100; i++) { const x = msgs.slice(n).find(y => y.t === 'soc' && (y.op === op || y.op === 'err')); if (x) return x; await sleep(30); } return null; };
  for (let i = 0; i < 100 && !msgs.some(x => x.t === 'authok'); i++) await sleep(30);
  return c;
}
(async () => {
  try {
    await sleep(1500);
    const A = await conn('alice01', '앨리스'), Bb = await conn('bobby02', '바비');
    const la = await A.ask({ op: 'list' }, 'list'), lb = await Bb.ask({ op: 'list' }, 'list');
    ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(la.me.pid) && la.me.pid !== lb.me.pid, `각자 친구 코드가 있음: ${la.me.pid} / ${lb.me.pid}`);
    ok(JSON.stringify(la).indexOf('alice01') < 0 && JSON.stringify(lb).indexOf('bobby02') < 0, '친구 정보에 로그인 아이디가 들어 있지 않음');
    ok((await A.ask({ op: 'add', pid: la.me.pid }, 'list')).op === 'err', '내 자신은 추가할 수 없음');
    ok((await A.ask({ op: 'add', pid: 'ZZZZ-ZZZZ' }, 'list')).op === 'err', '없는 코드는 오류');
    const n0 = Bb.msgs.length;
    const r1 = await A.ask({ op: 'add', pid: lb.me.pid.toLowerCase().replace('-', '') }, 'list');
    ok(r1.op === 'list' && r1.out.length === 1 && r1.friends.length === 0, '코드(소문자·하이픈 없이도)로 친구 요청을 보냄 → 아직 친구는 아님');
    await sleep(200);
    ok(Bb.msgs.slice(n0).some(m => m.t === 'soc' && m.op === 'ping' && m.what === 'request' && m.name === '앨리스'), '상대가 접속 중이면 요청 알림이 감');
    ok((await A.ask({ op: 'add', pid: lb.me.pid }, 'list')).op === 'err', '같은 요청을 또 보내면 오류');
    const l2 = await Bb.ask({ op: 'list' }, 'list'); ok(l2.inc.length === 1 && l2.inc[0].name === '앨리스', '상대의 받은 요청에 뜸');
    ok((await A.ask({ op: 'acc', pid: lb.me.pid }, 'list')).op === 'err', '내가 보낸 요청은 내가 수락할 수 없음');
    const r2 = await Bb.ask({ op: 'acc', pid: la.me.pid }, 'list');
    ok(r2.friends.length === 1 && r2.friends[0].online === true && r2.inc.length === 0, '수락하면 서로 친구(접속 중 표시)');
    const l3 = await A.ask({ op: 'list' }, 'list'); ok(l3.friends.length === 1 && l3.friends[0].name === '바비' && l3.out.length === 0, '요청한 쪽에도 친구로 보임');
    // 전적 보기
    const pf = await A.ask({ op: 'prof', pid: lb.me.pid, sty: 'puyo' }, 'prof');
    ok(pf.op === 'prof' && pf.rel === 'friend' && pf.user.name === '바비' && pf.profile && pf.profile.has === false && JSON.stringify(pf).indexOf('bobby02') < 0, '친구 전적 보기(아직 랭크전을 안 한 사람은 기록 없음 · 로그인 아이디는 없음)');
    ok((await A.ask({ op: 'prof', pid: 'ZZZZ-ZZZZ' }, 'prof')).op === 'err', '없는 사람의 전적은 오류');
    // 대표 캐릭터
    A.send({ op: 'char', char: 'bolt' }); await sleep(200);
    ok((await Bb.ask({ op: 'list' }, 'list')).friends[0].char === 'bolt', '대표 캐릭터를 바꾸면 친구 목록에 반영');
    A.send({ op: 'char', char: '<x>' }); await sleep(100);
    ok((await Bb.ask({ op: 'list' }, 'list')).friends[0].char === 'bolt', '이상한 캐릭터 값은 무시');
    // 대전 신청
    await Bb.ask({ op: 'add', pid: la.me.pid }, 'list'); await A.ask({ op: 'acc', pid: lb.me.pid }, 'list');
    const n1 = Bb.msgs.length, iv = await A.ask({ op: 'inv', pid: lb.me.pid, code: 'ab12', style: 'puyo', rule: 'tsu', board: 'wide' }, 'inv');
    await sleep(200);
    const ping = Bb.msgs.slice(n1).find(m => m.t === 'soc' && m.what === 'invite');
    ok(iv.op === 'inv' && ping && ping.code === 'AB12' && ping.name === '앨리스' && ping.pid === la.me.pid && ping.rule === 'tsu', '친구에게 대전 신청하면 방 코드가 담긴 알림이 감');
    ok((await A.ask({ op: 'inv', pid: lb.me.pid, code: 'ab12' }, 'inv')).op === 'err', '신청을 연달아 보내면 막음');
    await sleep(3100);
    ok((await A.ask({ op: 'inv', pid: lb.me.pid, code: '<x>' }, 'inv')).op === 'err', '이상한 방 코드는 오류');
    const n2 = A.msgs.length; Bb.send({ op: 'dec', pid: la.me.pid, why: 'busy' }); await sleep(250);
    ok(A.msgs.slice(n2).some(m => m.t === 'soc' && m.what === 'declined' && m.why === 'busy' && m.name === '바비'), '거절하면 신청한 쪽에 알림');
    // 연습 글로벌 순위
    const p1 = await A.ask({ op: 'ps', mode: 'tm', v: 12345 }, 'ps'); ok(p1.rank === 1 && p1.improved && p1.best === 12345, '연습 기록 올리기(1위)');
    await sleep(1600);
    const p2 = await Bb.ask({ op: 'ps', mode: 'tm', v: 20000 }, 'ps'); ok(p2.rank === 1 && p2.total === 2, '더 높은 점수가 1위');
    await sleep(1600);
    const p3 = await A.ask({ op: 'ps', mode: 'tm', v: 100 }, 'ps'); ok(!p3.improved && p3.best === 12345 && p3.rank === 2, '낮은 기록은 최고 기록을 바꾸지 못함');
    await sleep(1600);
    ok((await A.ask({ op: 'ps', mode: 'tm', v: 99999999 }, 'ps')).op === 'err' && (await (async () => { await sleep(1600); return A.ask({ op: 'ps', mode: 'zz', v: 5 }, 'ps'); })()).op === 'err', '있을 수 없는 점수·모르는 모드는 거절');
    await sleep(1600); await A.ask({ op: 'ps', mode: 'ts', v: 65000 }, 'ps'); await sleep(1600);
    const p4 = await Bb.ask({ op: 'ps', mode: 'ts', v: 61000 }, 'ps'); ok(p4.rank === 1, '스프린트는 시간이 짧을수록 1위');
    const lb1 = await A.ask({ op: 'pl', mode: 'tm' }, 'pl');
    ok(lb1.total === 2 && lb1.rows[0].name === '바비' && lb1.rows[0].v === 20000 && lb1.me.place === 2 && lb1.rows[1].me === true && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(lb1.rows[0].pid) && JSON.stringify(lb1).indexOf('bobby02') < 0, '연습 순위표(내 순위 표시 · 친구 코드 포함 · 로그인 아이디 없음)');
    // 삭제
    const r3 = await Bb.ask({ op: 'del', pid: la.me.pid }, 'list'); ok(r3.friends.length === 0, '친구 삭제');
    ok((await A.ask({ op: 'list' }, 'list')).friends.length === 0, '삭제하면 양쪽에서 사라짐');
    // 요청 거절·취소
    await A.ask({ op: 'add', pid: lb.me.pid }, 'list');
    ok((await Bb.ask({ op: 'del', pid: la.me.pid }, 'list')).inc.length === 0 && (await A.ask({ op: 'list' }, 'list')).out.length === 0, '받은 요청을 거절하면 양쪽에서 사라짐');
    // 서로 먼저 요청 → 바로 친구
    await A.ask({ op: 'add', pid: lb.me.pid }, 'list'); const r4 = await Bb.ask({ op: 'add', pid: la.me.pid }, 'list');
    ok(r4.friends.length === 1, '상대가 먼저 보낸 요청이 있는데 내가 추가하면 바로 친구');
    // 파일에 저장되고 다시 켜도 유지
    srv.kill('SIGTERM'); await sleep(800);
    const acc = JSON.parse(fs.readFileSync(path.join(DIR, 'accounts.json'), 'utf8')).accounts, vs = Object.values(acc);
    ok(vs.every(a => /^[A-Z2-9]{8}$/.test(a.pid)) && vs.some(a => (a.friends || []).length === 1), '친구 관계와 친구 코드가 계정 파일에 저장됨');
    A.ws.close(); Bb.ws.close();
  } catch (e) { console.error('오류', e); fail++; }
  try { srv.kill('SIGTERM'); } catch (e) {}
  console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exit(fail ? 1 : 0);
})();
