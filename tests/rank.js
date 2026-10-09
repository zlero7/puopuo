// 랭크전 서버 테스트: 대기열 → 매칭 → 결과 보고(엇갈리면 무효) → 배치 10시리즈 → 티어·RP → 순위표, 도중 이탈은 패배
// 실행: node tests/rank.js
const { spawn } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs'), http = require('http');
const WebSocket = require('ws');
const PORT = 4900 + Math.floor(Math.random() * 90), FILE = path.join(os.tmpdir(), `ranks-${PORT}.json`);
const get = p => new Promise(r => http.get(`http://127.0.0.1:${PORT}${p}`, res => { let b = ''; res.on('data', d => b += d); res.on('end', () => r(JSON.parse(b))); }));
function client(token, style) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`), box = [];
  ws.on('message', m => box.push(JSON.parse(m)));
  const wait = (t, ms = 5000) => new Promise((res, rej) => { const t0 = Date.now(); (function poll() { const i = box.findIndex(x => x.t === t); if (i >= 0) return res(box.splice(i, 1)[0]); if (Date.now() - t0 > ms) return rej(new Error('대기 시간 초과: ' + t)); setTimeout(poll, 10); })(); });
  return new Promise(r => ws.on('open', () => r({ ws, send: o => ws.send(JSON.stringify(o)), wait, token, style })));
}
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) process.exitCode = 1; };
// 한 시리즈: winner가 2승(중간에 loser가 1승 할 수도)
async function series(W, L, oneLoss) {
  for (const c of [W, L]) c.send({ t: 'rq', token: c.token, style: c.style, name: c.token.slice(5, 6) });
  await W.wait('start'); await L.wait('start');
  const games = oneLoss ? [L, W, W] : [W, W];
  for (let i = 0; i < games.length; i++) {
    if (i) { for (const c of [W, L]) c.send({ t: 'ready' }); await W.wait('start'); await L.wait('start'); }
    W.send({ t: 'rres', win: games[i] === W }); L.send({ t: 'rres', win: games[i] === L });
  }
  return [await W.wait('rdone'), await L.wait('rdone')];
}
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, HOST: '127.0.0.1', RANK_FILE: FILE, RANK_OPEN: '1' }, stdio: 'pipe' });
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
    await new Promise(r => setTimeout(r, 500));
    const top = await get('/rank/top?style=puyo'), me = await get('/rank/me?style=tetris&token=tokenBBBBBBBBBBBBBBBB');
    ok(top.length === 1 && top[0].text === after[0].text, `순위표(뿌요) 1위: ${top[0] && top[0].text}`);
    ok(me.text === after[1].text && me.season && /시즌/.test(me.season.name), `내 정보(B 테트리스): ${me.text} · ${me.season.name} ${me.season.daysLeft}일 남음`);
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
  } catch (e) { ok(false, e.message); }
  finally { srv.kill(); try { fs.unlinkSync(FILE); } catch {} }
})();
