// 앱 종단 테스트(Linux · xvfb · playwright 필요): 진짜 서버 + 진짜 앱 창으로 가입 · 로그인 · 온라인 대전 · 랭크 조회 · 로그아웃을 확인
// 실행: npm run test:app   (이미지는 임시 폴더에 저장)
const { chromium } = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path'); const ROOT = path.join(__dirname, '..'); const WebSocket = require(path.join(ROOT, 'node_modules', 'ws'));
const D = fs.mkdtempSync(path.join(require('os').tmpdir(), 'app-e2e-')); const sleep = ms => new Promise(r => setTimeout(r, ms));
let fail = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const SP = 4601, EP = 9334;
(async () => {
  const dir = fs.mkdtempSync(path.join(D, 'e2e-')); const xdg = path.join(dir, 'xdg'); fs.mkdirSync(xdg);
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: SP, HOST: '127.0.0.1', AUTH_DIR: dir, RANK_FILE: path.join(dir, 'ranks.json'), RANK_OPEN: '1', AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret' }, stdio: 'pipe' });
  let slog = ''; srv.stdout.on('data', d => slog += d); srv.stderr.on('data', d => slog += d);
  await sleep(900);
  const app = spawn('xvfb-run', ['-a', '-s', '-screen 0 1400x900x24', 'node_modules/electron/dist/electron', '.', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${EP}`], { cwd: ROOT, detached: true, env: { ...process.env, PUYO_SERVER: `http://127.0.0.1:${SP}`, XDG_CONFIG_HOME: xdg }, stdio: 'pipe' });
  let alog = ''; app.stdout.on('data', d => alog += d); app.stderr.on('data', d => alog += d);
  await sleep(7000);
  try {
    const b = await chromium.connectOverCDP(`http://127.0.0.1:${EP}`); const pg = b.contexts()[0].pages().find(p => p.url().startsWith('puyo://')); 
    const cons = []; pg.on('console', m => { if (m.type() === 'error' || /Content Security|Refused/i.test(m.text())) cons.push(m.text()); });
    await pg.evaluate(() => { try { dlgClose(); } catch (e) {} });
    await pg.waitForTimeout(800);
    ok(await pg.evaluate(() => location.origin === 'puyo://app' && APP && appCfg.server.startsWith('http://127.0.0.1')), '앱이 puyo://app 화면으로 뜨고 서버 주소를 받음');
    ok((await pg.textContent('#bAcct')).trim() === '로그인', '위쪽에 로그인 버튼이 보임');
    ok(await pg.evaluate(() => $('srv').parentElement.classList.contains('hidden')), '앱은 서버 주소 입력 칸을 화면에서 숨김');
    // 온라인 대전을 누르면 로그인 창이 먼저 뜸
    await pg.evaluate(() => showScreen('vs')); await pg.waitForTimeout(300);
    await pg.click('#t-quick'); await pg.waitForTimeout(500);
    ok(await pg.evaluate(() => !$('acct').classList.contains('hidden')), '로그인 전에 온라인 대전을 누르면 로그인 창이 뜸');
    await pg.screenshot({ path: path.join(D, 'e2e_login.png') });
    // 가입
    await pg.click('#acTabReg'); await pg.fill('#acId', 'tester01'); await pg.fill('#acNick', '테스터'); await pg.fill('#acPw', 'Zx9!kqwe12'); await pg.fill('#acPw2', 'Zx9!kqwe12');
    await pg.click('#acGo'); await pg.waitForTimeout(1500);
    ok(await pg.evaluate(() => appCfg.account && appCfg.account.id === 'tester01' && $('acct').classList.contains('hidden')), '가입하면 로그인되고 창이 닫힘');
    ok((await pg.textContent('#bAcct')).trim() === '테스터', '위쪽 버튼에 닉네임이 보임');
    ok(await pg.evaluate(() => JSON.stringify(window.puyoApp).indexOf('token') < 0 && typeof require === 'undefined'), '화면에는 토큰도 Node도 없음');
    // 상대(다른 계정)가 같은 빠른 매칭에 들어옴
    const reg = await (await fetch(`http://127.0.0.1:${SP}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'rival002', name: '라이벌', pw: 'Qm7#rtyu45' }) })).json();
    const tk = await (await fetch(`http://127.0.0.1:${SP}/auth/ticket`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + reg.session.token }, body: '{}' })).json();
    const ws = new WebSocket(`ws://127.0.0.1:${SP}`, { origin: 'puyo://app' }); const got = []; ws.on('message', d => got.push(JSON.parse(d)));
    await new Promise(r => ws.on('open', r)); ws.send(JSON.stringify({ t: 'auth', ticket: tk.ticket, ver: '1.0.0' })); await sleep(300);
    await pg.waitForTimeout(500);
    // 로그인 직후 하려던 일(빠른 매칭)이 이어서 실행됨
    await pg.waitForTimeout(1500);
    ok(await pg.evaluate(() => !!(net.ws && net.ws.readyState === 1 && net.authed)), '로그인 뒤 서버에 접속하고 접속표 인증을 마침');
    ws.send(JSON.stringify({ t: 'quick', style: 'puyo', board: 'wide', rule: 'tsu', size: 2 })); await sleep(2500);
    ok(got.some(m => m.t === 'start'), '두 사람이 만나 대전이 시작됨(서버 쪽 확인)');
    ok(await pg.evaluate(() => game.mode === 'online' && game.fields.length === 2), '앱에서도 온라인 대전 화면으로 들어감');
    ok(await pg.evaluate(() => game.fields[1].name) !== '' , '상대 이름 표시: ' + await pg.evaluate(() => game.fields[1].name));
    await pg.screenshot({ path: path.join(D, 'e2e_online.png') });
    // 랭크 조회(본체를 거침)
    const me = await pg.evaluate(() => apiGet('/rank/me', { style: 'puyo' }).then(m => m.text, e => 'ERR ' + e.message));
    ok(typeof me === 'string' && !me.startsWith('ERR'), '랭크 조회가 본체를 거쳐 됨: ' + me);
    // 로그아웃
    await pg.evaluate(() => { game.net = false; openMenu('main'); }); await pg.click('#bAcct'); await pg.click('#acLogout'); await pg.waitForTimeout(500);
    ok(await pg.evaluate(() => !appCfg.account && !net.ws), '로그아웃하면 서버 연결도 끊김');
    ok(cons.filter(c => /Content Security|Refused to/i.test(c)).length === 0, 'CSP 위반 없음' + (cons.length ? ' ' + cons.slice(0, 2).join(' | ') : ''));
    await b.close();
  } catch (e) { console.error('E2E 오류', e); fail++; }
  try { process.kill(-app.pid, 'SIGTERM'); } catch (e) {} srv.kill('SIGTERM');
  console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); if (fail) console.log('--- server log ---\n' + slog.split('\n').slice(-8).join('\n'));
  process.exit(fail ? 1 : 0);
})();
