// 친구·전적 보기 화면 종단 테스트(Linux · xvfb · playwright 필요): 진짜 서버 + 진짜 앱 창
//  - 내 정보 > 친구 탭: 친구 코드 · 요청 보내기 · 받은 요청 수락 · 친구 줄 우클릭 메뉴 · 전적 보기 창 · 삭제
//  - 순위표 줄(친구 코드가 달린 줄) 우클릭 메뉴 · 대표 캐릭터 프로필 카드
// 실행: npm run test:social-e2e
const { chromium } = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path'); const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..'); const sleep = ms => new Promise(r => setTimeout(r, ms)); let fail = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const T = fs.mkdtempSync(path.join(require('os').tmpdir(), 'socui-')), xdg = path.join(T, 'xdg'), data = path.join(T, 'data'); fs.mkdirSync(xdg); fs.mkdirSync(data);
const SP = 4721 + Math.floor(Math.random() * 50), EP = 9900 + Math.floor(Math.random() * 90);
const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: SP, HOST: '127.0.0.1', AUTH_DIR: data, RANK_FILE: path.join(data, 'ranks.json'), RANK_OPEN: '1', AUTH_SECRET: 'soc-ui-secret-soc-ui-secret-soc-ui-secret', BACKUP: '0' }, stdio: 'pipe' }); srv.stdout.on('data', () => {}); srv.stderr.on('data', () => {});
const post = async (p, body, h = {}) => (await fetch(`http://127.0.0.1:${SP}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body) })).json();
(async () => {
  await sleep(1200);
  const app = spawn('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', 'node_modules/electron/dist/electron', '.', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${EP}`], { cwd: ROOT, detached: true,
    env: { ...process.env, PUYO_SERVER: `http://127.0.0.1:${SP}`, XDG_CONFIG_HOME: xdg, PUYO_UPDATE_BASE: 'http://127.0.0.1:1/' }, stdio: 'pipe' });
  let ws2 = null;
  try {
    await sleep(9000);
    const b = await chromium.connectOverCDP(`http://127.0.0.1:${EP}`); const p = b.contexts()[0].pages().find(x => x.url().startsWith('puyo://'));
    p.on('pageerror', e => { console.log('PAGEERR', e.message); fail++; });
    ok((await p.evaluate(() => window.puyoApp.register('me0001', '나나', 'Zx9!kqwe12'))).ok, '가입·로그인');
    await p.evaluate(() => { appCfg.account = { id: 'me0001', name: '나나' }; stats = loadStats(); stats.char = 'bolt'; saveStats(); openMenu('stats'); });
    await p.waitForTimeout(800);
    ok(await p.evaluate(() => document.getElementById('pCharName').textContent === '볼트' && /--n:\s*7/.test(document.getElementById('pPv').style.cssText)), '내 정보 프로필 카드에 대표 캐릭터(볼트)가 나옴');
    await p.evaluate(() => infoTab = 'friends'); await p.evaluate(() => renderInfo()); await p.waitForTimeout(2500);
    ok(await p.evaluate(() => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(document.getElementById('socMine').value)), '친구 탭에 내 친구 코드가 보임');
    // 상대 계정(스크립트로 접속)
    const reg = await post('/auth/register', { id: 'rival02', name: '라이벌', pw: 'Qm7#rtyu45' }), tk = await post('/auth/ticket', {}, { Authorization: 'Bearer ' + reg.session.token });
    ws2 = new WebSocket(`ws://127.0.0.1:${SP}`, { origin: 'puyo://app' }); const got = []; ws2.on('message', d => got.push(JSON.parse(d))); await new Promise(r => ws2.on('open', r));
    ws2.send(JSON.stringify({ t: 'auth', ticket: tk.ticket, ver: '9.9.9' })); await sleep(400);
    ws2.send(JSON.stringify({ t: 'soc', op: 'list' })); await sleep(400);
    const rivalPid = got.find(m => m.t === 'soc' && m.op === 'list').me.pid;
    // 내가 요청
    await p.fill('#socCode', rivalPid); await p.click('[data-sc="add"]'); await p.waitForTimeout(800);
    ok(await p.evaluate(() => /보낸 요청/.test(document.getElementById('iBody').textContent) && /라이벌/.test(document.getElementById('iBody').textContent)), '코드를 넣고 요청하면 "보낸 요청"에 뜸');
    ok(got.some(m => m.t === 'soc' && m.op === 'ping' && m.what === 'request'), '상대에게 요청 알림이 감');
    ws2.send(JSON.stringify({ t: 'soc', op: 'acc', pid: await p.evaluate(() => soc.me.pid) })); await sleep(600);
    ok(await p.evaluate(() => /친구가 됐어요/.test(document.getElementById('socToast').textContent)), '상대가 수락하면 알림창이 뜸');
    await p.evaluate(() => renderInfo()); await p.waitForTimeout(1500);
    ok(await p.evaluate(() => document.querySelectorAll('.frow').length === 1 && /접속 중/.test(document.querySelector('.frow').textContent)), '친구 목록에 상대가 접속 중으로 보임');
    // 우클릭 → 전적 보기
    await p.click('.frow .nm', { button: 'right' }); await p.waitForTimeout(300);
    ok(await p.evaluate(() => !document.getElementById('ctxMenu').classList.contains('hidden') && [...document.querySelectorAll('#ctxMenu button')].map(b => b.textContent).join() === '전적 보기,대전 신청,친구 삭제'), '친구를 우클릭하면 "전적 보기 · 대전 신청 · 친구 삭제" 메뉴');
    await p.click('#ctxMenu button:nth-child(1)'); await p.waitForTimeout(1200);
    ok(await p.evaluate(() => !document.getElementById('profModal').classList.contains('hidden') && /라이벌/.test(document.getElementById('profBody').textContent) && /친구 삭제/.test(document.getElementById('profBody').textContent)), '전적 보기 창이 열림(친구라서 "친구 삭제" 버튼)');
    ok(await p.evaluate(() => /아직 이 종목의 랭크전 기록이 없어요/.test(document.getElementById('profBody').textContent) && document.getElementById('profBody').textContent.indexOf('rival02') < 0), '랭크전 기록이 없으면 안내 · 로그인 아이디는 보이지 않음');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => document.getElementById('profModal').classList.contains('hidden')), 'Esc로 닫힘');
    // 친구에게 대전 신청: 우클릭 → 대전 신청 → 설정 창 → 캐릭터 고르기 → 방이 만들어지고 친구에게 신청이 감
    await p.evaluate(() => { infoTab = 'friends'; renderInfo(); }); await p.waitForTimeout(1200);
    await p.click('.frow .nm', { button: 'right' }); await p.waitForTimeout(200); await p.click('#ctxMenu button:nth-child(2)'); await p.waitForTimeout(400);
    ok(await p.evaluate(() => !document.getElementById('matchModal').classList.contains('hidden') && document.getElementById('mmTitle').textContent === '친구와 대전' && /라이벌/.test(document.getElementById('mmSub').textContent)), '대전 신청을 누르면 대전 설정 창(친구 이름 표시)');
    await p.click('#mmGo'); await p.waitForTimeout(400); await p.click('#cmList .cmbtn:first-child'); await p.waitForTimeout(1500);
    const inv = got.filter(m => m.t === 'soc' && m.what === 'invite').pop();
    ok(inv && /^[A-Z0-9]{4}$/.test(inv.code) && inv.name === '나나', '친구에게 방 코드가 담긴 대전 신청이 감');
    ws2.send(JSON.stringify({ t: 'soc', op: 'dec', pid: await p.evaluate(() => soc.me.pid) })); await sleep(500);
    ok(await p.evaluate(() => /거절/.test(document.getElementById('socToast').textContent) && !net.wait), '친구가 거절하면 알림이 뜨고 기다리던 방이 접힘');
    // 친구가 나에게 신청 → 수락 → 대전 시작
    ws2.send(JSON.stringify({ t: 'create', style: 'puyo', board: 'wide', rule: 'tsu', size: 2 })); await sleep(500);
    const room = got.filter(m => m.t === 'created').pop();
    ws2.send(JSON.stringify({ t: 'soc', op: 'inv', pid: await p.evaluate(() => soc.me.pid), code: room.code, style: 'puyo', rule: 'tsu', board: 'wide' })); await sleep(700);
    ok(await p.evaluate(() => !document.getElementById('invModal').classList.contains('hidden') && /라이벌/.test(document.getElementById('invText').textContent)), '친구의 대전 신청이 오면 수락/거절 창');
    await p.click('#invOk'); await p.waitForTimeout(400); await p.click('#cmList .cmbtn:first-child'); await p.waitForTimeout(2500);
    ok(got.some(m => m.t === 'start') && await p.evaluate(() => game.mode === 'online'), '수락하면 같은 방에 들어가 대전이 시작됨');
    await p.evaluate(() => { nsend({ t: 'leave' }); game.net = false; openMenu('stats'); }); await p.waitForTimeout(500);
    ws2.send(JSON.stringify({ t: 'leave' }));
    // 랭크전 대기열 요청에 'AI와 대전' 설정이 실려 가는지(20초 뒤 AI 상대가 들어오려면 필요)
    const rq = await p.evaluate(async () => { stats = loadStats(); stats.rankBot = true; saveStats(); window.__rq = null; const o = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { try { const m = JSON.parse(d); if (m.t === 'rq') window.__rq = m; } catch (e) {} return o.call(this, d); }; runMatch('ranked'); await new Promise(r => setTimeout(r, 800)); WebSocket.prototype.send = o; cancelWait(); stats.rankBot = false; saveStats(); return window.__rq; });
    ok(rq && rq.bot === true && rq.char, '랭크전 요청에 "AI와 대전" 설정과 캐릭터가 실려 감');
    // 연습 글로벌 순위: 내 기록(이 컴퓨터)이 올라가고 순위표에 (나)로 보임
    await p.evaluate(() => { stats = loadStats(); stats.practice = { ...stats.practice, best: 7777 }; saveStats(); infoTab = 'practice'; renderInfo(); }); await p.waitForTimeout(3500);
    ok(await p.evaluate(() => /7,777점/.test(document.getElementById('iBody').textContent) && /\(나\)/.test(document.getElementById('iBody').textContent) && /내 순위 1위/.test(document.getElementById('iBody').textContent)), '연습 순위 탭: 내 기록이 글로벌 순위(1위)에 올라 보임');
    await p.click('[data-pm="ts"]'); await p.waitForTimeout(1500);
    ok(await p.evaluate(() => /아직 기록이 없어요/.test(document.getElementById('iBody').textContent)), '모드를 바꾸면 그 모드 순위표(기록 없음)');
    // 순위표 줄 우클릭(친구 코드가 달린 줄을 흉내)
    await p.evaluate(() => { infoTab = 'board'; $('iBody').innerHTML = `<div class="lbrow" data-pid="ZZZZ-2222"><div>1</div><div>X</div><div>Y</div><div>Z</div><div class="nm"><b>가짜</b></div><div>1승</div></div>`; });
    await p.click('.lbrow', { button: 'right' }); await p.waitForTimeout(300);
    ok(await p.evaluate(() => [...document.querySelectorAll('#ctxMenu button')].map(b => b.textContent).join() === '전적 보기,친구 추가'), '순위표 줄을 우클릭하면 "전적 보기 · 친구 추가" 메뉴');
    await p.keyboard.press('Escape');
    // 이미 친구인 사람은 순위표 우클릭에서 '친구 추가'가 아니라 '대전 신청'이 뜸(친구 목록을 아직 안 받았어도)
    await p.evaluate(pid => { soc.loaded = false; soc.friends = []; infoTab = 'board'; $('iBody').innerHTML = `<div class="lbrow" data-pid="${pid}"><div>1</div><div>X</div><div>Y</div><div>Z</div><div class="nm"><b>친구</b></div><div>1승</div></div>`; }, rivalPid);
    await p.click('.lbrow', { button: 'right' }); await p.waitForTimeout(1200);
    ok(await p.evaluate(() => [...document.querySelectorAll('#ctxMenu button')].map(b => b.textContent).join() === '전적 보기,대전 신청'), '이미 친구인 사람에게는 "친구 추가"가 뜨지 않음');
    await p.keyboard.press('Escape');
    // 기록 동기화: 이 컴퓨터 기록이 서버에 올라가고, 기록이 없는 새 컴퓨터(저장소 비움)에서 로그인하면 되돌아옴
    await p.evaluate(() => { stats = loadStats(); stats.games = 12; stats.bestChain = 8; stats.practice = { ...stats.practice, best: 4321 }; stats.history = [{ d: 111, m: '연습 · 뿌요뿌요', r: 'p', sc: 4321, ch: 3, k: 'p', cat: 'solo', mc: 'lumi', oc: [], on: '' }]; saveStats(); syncOk = true; });
    await p.evaluate(async () => { await socSyncBoot(); await socAsk({ op: 'sp', data: StatSync.pick(stats) }, 'sp'); }); await p.waitForTimeout(500);
    await p.evaluate(() => { localStorage.removeItem(STATS_KEY); stats = loadStats(); syncOk = false; });
    ok(await p.evaluate(() => stats.games === 0 && stats.practice.best === 0), '새 컴퓨터처럼 로컬 기록을 비움');
    await p.evaluate(async () => { await socSyncBoot(); }); await p.waitForTimeout(800);
    ok(await p.evaluate(() => { const s = loadStats(); return s.games === 12 && s.bestChain === 8 && s.practice.best === 4321 && s.history.length === 1 && s.history[0].sc === 4321; }), '같은 계정으로 로그인하면 서버에서 기록을 받아 와 되살아남');
    await p.evaluate(() => { stats = loadStats(); stats.acct = 'other_acct'; stats.games = 999; localStorage.setItem(STATS_KEY, JSON.stringify(stats)); });
    await p.evaluate(async () => { await socSyncBoot(); }); await p.waitForTimeout(800);
    ok(await p.evaluate(() => { const s = loadStats(); return s.games === 12 && s.acct === 'me0001'; }), '다른 계정 기록이 남아 있던 컴퓨터면 섞지 않고 이 계정 기록으로 바꿈');
    // 대표 캐릭터 동기화
    await p.evaluate(() => { act('char:kuro'); }); await p.waitForTimeout(600);
    ws2.send(JSON.stringify({ t: 'soc', op: 'list' })); await sleep(500);
    ok(got.filter(m => m.t === 'soc' && m.op === 'list').pop().friends[0].char === 'kuro', '대표 캐릭터를 바꾸면 친구 쪽에도 반영');
    // 삭제
    await p.evaluate(() => { infoTab = 'friends'; renderInfo(); }); await p.waitForTimeout(1200);
    p.once('dialog', d => d.accept()); await p.click('.frow [data-sc="del"]'); await p.waitForTimeout(800);
    ok(await p.evaluate(() => document.querySelectorAll('.frow').length === 0), '친구 삭제');
    await b.close();
  } catch (e) { console.error('오류', e); fail++; }
  try { process.kill(-app.pid, 'SIGTERM'); } catch (e) {} await sleep(1000); try { srv.kill('SIGTERM'); } catch (e) {} if (ws2) ws2.close();
  console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exit(fail ? 1 : 0);
})();
