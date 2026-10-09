// 랭크전 서버 테스트: 대기열 → 매칭 → 결과 보고(엇갈리면 무효) → 배치 10시리즈 → 티어·RP → 순위표, 도중 이탈은 패배
// 실행: node tests/rank.js
const { spawn } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs'), http = require('http');
const WebSocket = require('ws');
const PORT = 4900 + Math.floor(Math.random() * 90), FILE = path.join(os.tmpdir(), `ranks-${PORT}.json`);
const get = (p, cookie) => new Promise(r => http.get(`http://127.0.0.1:${PORT}${p}`, { headers: cookie ? { cookie } : {} }, res => { let b = ''; res.on('data', d => b += d); res.on('end', () => r(JSON.parse(b))); }));
// 계정 만들기: 이름은 토큰의 6번째 글자(A, B, …). 돌려주는 값은 로그인 쿠키
const cookies = {};
function account(token) {
  if (cookies[token]) return Promise.resolve(cookies[token]);
  const body = JSON.stringify({ id: 'user_' + token.slice(5, 6).toLowerCase(), pw: 'pass1234', name: token.slice(5, 6) });
  return new Promise(r => { const q = http.request({ host: '127.0.0.1', port: PORT, path: '/auth/signup', method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
    res.resume(); res.on('end', () => r(cookies[token] = String(res.headers['set-cookie'] || '').split(';')[0])); }); q.end(body); });
}
async function client(token, style) {
  const cookie = await account(token);
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`, { headers: { cookie } }), box = [];
  ws.on('message', m => box.push(JSON.parse(m)));
  const wait = (t, ms = 5000) => new Promise((res, rej) => { const t0 = Date.now(); (function poll() { const i = box.findIndex(x => x.t === t); if (i >= 0) return res(box.splice(i, 1)[0]); if (Date.now() - t0 > ms) return rej(new Error('대기 시간 초과: ' + t)); setTimeout(poll, 10); })(); });
  return new Promise(r => ws.on('open', () => r({ ws, send: o => ws.send(JSON.stringify(o)), wait, token, style, cookie })));
}
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) process.exitCode = 1; };
// 한 시리즈: winner가 2승(중간에 loser가 1승 할 수도)
async function series(W, L, oneLoss) {
  for (const c of [W, L]) c.send({ t: 'rq', token: c.token, style: c.style, name: c.token.slice(5, 6), char: 'kuro' });
  await W.wait('start'); await L.wait('start');
  const games = oneLoss ? [L, W, W] : [W, W];
  for (let i = 0; i < games.length; i++) {
    if (i) { for (const c of [W, L]) c.send({ t: 'ready' }); await W.wait('start'); await L.wait('start'); }
    W.send({ t: 'rres', win: games[i] === W }); L.send({ t: 'rres', win: games[i] === L });
  }
  return [await W.wait('rdone'), await L.wait('rdone')];
}
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, HOST: '127.0.0.1', RANK_FILE: FILE, RANK_OPEN: '1', RANK_BOT_WAIT: '300', RANK_TRUST: '1', SIGNUP_LIMIT: '100', ACCOUNT_FILE: FILE + '.acc' }, stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 600));
  try {
    const A = await client('tokenAAAAAAAAAAAAAAAA', 'puyo'), B = await client('tokenBBBBBBBBBBBBBBBB', 'tetris');
    // 엇갈린 보고는 무효(그 판은 점수에 안 들어감)
    for (const c of [A, B]) c.send({ t: 'rq', token: c.token, style: c.style, name: c.token.slice(5, 6) });
    const sa = await A.wait('start'); await B.wait('start');
    ok(sa.ranked === 1 && sa.board === 'classic' && sa.rule === 'tsu', '매칭: 랭크전 · 6×12 · 통상');
    A.send({ t: 'rres', win: true }); B.send({ t: 'rres', win: true });
    for (let g = 0; g < 2; g++) { for (const c of [A, B]) c.send({ t: 'ready' }); await A.wait('start'); await B.wait('start'); A.send({ t: 'rres', win: true }); B.send({ t: 'rres', win: false }); }
    const [d1a, d1b] = [await A.wait('rdone'), await B.wait('rdone')];
    ok(d1a.score[0] === 2 && d1a.score[1] === 0, '엇갈린 보고는 무효 처리(2:0으로 끝)');
    ok(d1a.placing && d1a.placed === 1 && d1a.text === '배치 1/10' && d1b.text === '배치 1/10', `배치 진행: ${d1a.text}`);
    let last;
    for (let i = 2; i <= 10; i++) last = await series(A, B, i % 3 === 0);
    ok(last[0].event === 'placed' && !last[0].placing, `배치 완료(10승): A → ${last[0].text}`);
    ok(!last[1].placing, `배치 완료(10패): B → ${last[1].text}`);
    const after = await series(A, B);
    ok(after[0].d > 0 && after[1].d < 0 && /RP/.test(after[0].text), `배치 후 시리즈: A ${after[0].d > 0 ? '+' : ''}${after[0].d} RP → ${after[0].text} · B ${after[1].d} RP → ${after[1].text}`);
    ok(after[0].opp && after[0].opp.name === 'B' && after[0].opp.char === 'kuro' && /RP/.test(after[0].opp.text), `결과에 상대 정보: ${after[0].opp.name} · ${after[0].opp.text}`);
    await new Promise(r => setTimeout(r, 500));
    const top = await get('/rank/top?style=puyo'), me = await get('/rank/me?style=tetris', await account('tokenBBBBBBBBBBBBBBBB'));
    ok(top.rows.length === 1 && top.rows[0].name === 'A' && top.rows[0].place === 1, `순위표(뿌요, 플래티넘 이상): 1위 ${top.rows[0] && top.rows[0].name} ${top.rows[0] && top.rows[0].label} ${top.rows[0] && top.rows[0].rp} RP`);
    ok(me.text === after[1].text && /시즌/.test(me.season.name) && me.matches.length === 11 && me.matches[0].opp.name === 'A', `내 정보(B 테트리스): ${me.text} · ${me.season.name} · 랭크 기록 ${me.matches.length}경기`);
    ok(fs.existsSync(FILE), '파일로 저장');
    A.ws.close(); B.ws.close();
    // 도중 이탈은 패배(배치 1판으로 셈)
    const C = await client('tokenCCCCCCCCCCCCCCCC', 'puyo'), D = await client('tokenDDDDDDDDDDDDDDDD', 'puyo');
    for (const c of [C, D]) c.send({ t: 'rq', token: c.token, style: c.style });
    await C.wait('start'); await D.wait('start');
    D.ws.close();
    const dx = await C.wait('rdone');
    ok(dx.win === true && dx.placed === 1, `도중 이탈한 쪽 패배 (C ${dx.text})`);
    C.ws.close();
    // 사람이 없을 때 AI 상대(설정을 켠 사람만): 혼자 기다리면 AI와 매칭, 결과는 사람 쪽 보고로 정함
    const E = await client('tokenEEEEEEEEEEEEEEEE', 'tetris');
    E.send({ t: 'rq', token: E.token, style: E.style, name: 'E', bot: true });
    const se = await E.wait('start', 3000);
    ok(se.ranked === 1 && se.bot && /^AI /.test(se.bot.name) && se.bot.lv >= 0 && se.styles.length === 2, `AI 상대 매칭: ${se.bot && se.bot.name} · 세기 ${se.bot && se.bot.lv.toFixed(2)}`);
    E.send({ t: 'rres', win: false }); E.send({ t: 'ready' }); await E.wait('start'); E.send({ t: 'rres', win: true });
    E.send({ t: 'ready' }); await E.wait('start'); E.send({ t: 'rres', win: true });
    const de = await E.wait('rdone');
    ok(de.win === true && de.score[0] === 2 && de.score[1] === 1 && /^AI /.test(de.opp.name) && de.placed === 1, `AI 상대 결과 반영: 2:1 승 · ${de.text}`);
    const F = await client('tokenFFFFFFFFFFFFFFFF', 'tetris');
    F.send({ t: 'rq', token: F.token, style: F.style, name: 'F' });
    let gotF = null; try { gotF = await F.wait('start', 1200); } catch {}
    ok(!gotF, '설정을 끈 사람은 AI와 매칭되지 않음');
    const tt = await get('/rank/top?style=tetris&q=AI');
    ok(tt.total === 0 || tt.rows.every(r => !/^AI /.test(r.name)), 'AI는 순위표·기록에 저장되지 않음');
    E.ws.close(); F.ws.close();
    // 계정: 로그인 안 하면 랭크전 불가 · 비밀번호 틀림 · 한 계정으로 두 곳 동시 대기 불가
    const anon = new WebSocket(`ws://127.0.0.1:${PORT}`), abox = [];
    anon.on('message', x => abox.push(JSON.parse(x))); await new Promise(r => anon.on('open', r));
    anon.send(JSON.stringify({ t: 'rq', style: 'puyo' })); await new Promise(r => setTimeout(r, 300));
    ok(abox.some(x => x.t === 'error' && x.login), '로그인 안 하면 랭크전 불가');
    anon.close();
    const post = (path, body) => new Promise(r => { const q = http.request({ host: '127.0.0.1', port: PORT, path, method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => { let b = ''; res.on('data', d => b += d); res.on('end', () => r({ code: res.statusCode, body: JSON.parse(b), cookie: res.headers['set-cookie'] })); }); q.end(JSON.stringify(body)); });
    const bad = await post('/auth/login', { id: 'user_a', pw: 'wrong' }), good = await post('/auth/login', { id: 'user_a', pw: 'pass1234' });
    ok(bad.code === 400 && !bad.cookie && good.code === 200 && good.body.user.name === 'A' && !good.body.user.hash, '로그인: 틀린 비밀번호 거부 · 맞으면 쿠키(비밀번호 해시는 안 보냄)');
    const dup = await post('/auth/signup', { id: 'user_a', pw: 'xxxx' });
    ok(dup.code === 400 && /이미/.test(dup.body.error), '같은 아이디로 가입 불가');
    const G1 = await client('tokenGGGGGGGGGGGGGGGG', 'puyo'), G2 = await client('tokenGGGGGGGGGGGGGGGG', 'puyo');
    G1.send({ t: 'rq', style: 'puyo' }); await new Promise(r => setTimeout(r, 200)); G2.send({ t: 'rq', style: 'puyo' });
    const e2 = await G2.wait('error');
    ok(/이미 다른 곳/.test(e2.msg), '한 계정으로 두 곳에서 동시에 랭크전 불가');
    G1.ws.close(); G2.ws.close();
    // 브라우저 토큰 기록을 계정으로 옮기기
    const H = await post('/auth/signup', { id: 'user_h', pw: 'pass1234', name: 'H', old: 'tokenAAAAAAAAAAAAAAAA' });
    ok(H.body.moved === 0, '다른 계정 열쇠는 브라우저 토큰이 아니라서 옮길 기록 없음');
  } catch (e) { ok(false, e.message); }
  finally { srv.kill(); for (const f of [FILE, FILE + '.acc']) try { fs.unlinkSync(f); } catch {} }
})();
