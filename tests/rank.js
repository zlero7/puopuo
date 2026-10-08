// 랭크전 서버 테스트: 대기열 → 매칭 → 결과 보고(엇갈림은 무효) → 레이팅 반영 → 순위표, 도중 이탈은 패배
// 실행: node tests/rank.js
const { spawn } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs'), http = require('http');
const WebSocket = require('ws');
const PORT = 4900 + Math.floor(Math.random() * 90), FILE = path.join(os.tmpdir(), `ranks-${PORT}.json`);
const get = p => new Promise(r => http.get(`http://127.0.0.1:${PORT}${p}`, res => { let b = ''; res.on('data', d => b += d); res.on('end', () => r(JSON.parse(b))); }));
function client(token, style) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`), box = [];
  ws.on('message', m => box.push(JSON.parse(m)));
  const wait = (t, ms = 5000) => new Promise((res, rej) => { const t0 = Date.now(); (function poll() { const i = box.findIndex(x => x.t === t); if (i >= 0) return res(box.splice(i, 1)[0]); if (Date.now() - t0 > ms) return rej(new Error('대기 시간 초과: ' + t)); setTimeout(poll, 20); })(); });
  return new Promise(r => ws.on('open', () => r({ ws, send: o => ws.send(JSON.stringify(o)), wait, token, style })));
}
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) process.exitCode = 1; };
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, HOST: '127.0.0.1', RANK_FILE: FILE }, stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 600));
  try {
    const A = await client('tokenAAAAAAAAAAAAAAAA', 'puyo'), B = await client('tokenBBBBBBBBBBBBBBBB', 'tetris');
    for (const c of [A, B]) c.send({ t: 'rq', token: c.token, style: c.style, name: c.token.slice(5, 6) });
    const [sa, sb] = [await A.wait('start'), await B.wait('start')];
    ok(sa.ranked === 1 && sb.ranked === 1 && sa.board === 'classic' && sa.rule === 'tsu', '매칭: 랭크전·6×12·통상으로 시작');
    const ia = sa.you;   // A의 자리
    // 1판: 엇갈린 보고(둘 다 이겼다고) → 무효
    A.send({ t: 'rres', win: true }); B.send({ t: 'rres', win: true });
    // 2·3판: A 승
    for (let g = 0; g < 2; g++) {
      for (const c of [A, B]) c.send({ t: 'ready' });
      await A.wait('start'); await B.wait('start');
      A.send({ t: 'rres', win: true }); B.send({ t: 'rres', win: false });
    }
    // 1판이 무효라 아직 1:0 → 한 판 더
    let da = await A.wait('rdone', 800).catch(() => null);
    if (!da) { for (const c of [A, B]) c.send({ t: 'ready' }); await A.wait('start'); await B.wait('start'); A.send({ t: 'rres', win: true }); B.send({ t: 'rres', win: false }); da = await A.wait('rdone'); }
    const db = await B.wait('rdone');
    ok(da.win && !db.win && da.d > 0 && db.d < 0, `시리즈 결과: A +${da.d} (${da.r}, ${da.tier}) · B ${db.d} (${db.r})`);
    ok(da.score[ia] === 2, '엇갈린 보고는 무효 처리');
    await new Promise(r => setTimeout(r, 500));
    const top = await get('/rank/top?style=puyo'), me = await get('/rank/me?style=tetris&token=tokenBBBBBBBBBBBBBBBB');
    ok(top.length === 1 && top[0].r === da.r && top[0].w === 1, '순위표(뿌요)에 A');
    ok(me.l === 1 && me.r === db.r, '내 레이팅(B 테트리스)');
    ok(fs.existsSync(FILE) && Object.keys(JSON.parse(fs.readFileSync(FILE, 'utf8'))).length === 2, '파일로 저장');
    A.ws.close(); B.ws.close();
    // 도중 이탈: 새 두 사람(레이팅 1500끼리)이 만나서 D가 나가면 D 패배
    const C = await client('tokenCCCCCCCCCCCCCCCC', 'puyo'), D = await client('tokenDDDDDDDDDDDDDDDD', 'puyo');
    for (const c of [C, D]) c.send({ t: 'rq', token: c.token, style: c.style });
    await C.wait('start'); await D.wait('start');
    D.ws.close();
    const dx = await C.wait('rdone');
    ok(dx.win === true && dx.d > 0, `도중 이탈한 쪽 패배 (C +${dx.d})`);
    C.ws.close();
  } catch (e) { ok(false, e.message); }
  finally { srv.kill(); try { fs.unlinkSync(FILE); } catch {} }
})();
