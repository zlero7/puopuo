// 다운로드 사이트 시험: 사이트를 조립해 띄우고(GitHub 응답은 가짜로) 최신 버전 표시 · 다운로드 주소 · 변경 내용 · 안전한 표시 · 실패 시 대체를 확인
// 실행: node tests/site.js   (playwright 필요)
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path'); const os = require('os'); const { execFileSync } = require('child_process');
let fail = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'site-')); execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'build-site.js'), OUT], { stdio: 'ignore' });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, s) => { const f = path.join(OUT, q.url === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); s.end(b); }); }).listen(4790);
const DL = 'https://github.com/zlero7/puopuo/releases/download/';
const rel = (tag, name, date, body, files) => ({ tag_name: tag, name, published_at: date, draft: false, prerelease: false, html_url: `https://github.com/zlero7/puopuo/releases/tag/${tag}`, body, assets: files });
const A = (tag, n, size, digest) => ({ name: n, size, browser_download_url: `${DL}${tag}/${n}`, digest });
const API = [
  rel('v1.3.1', 'v1.3.1 · 사소한 변경', '2026-10-21T04:54:25Z', '랭크전 AI 상대 수정\n\n- 설정 값이 빠져 있었음 <img src=x onerror="window.__xss=1">\n- 종단 테스트 추가\n\nCo-Authored-By: Claude <x@y>\nClaude-Session: https://claude.ai/code/session_1',
    [A('v1.3.1', 'PuyoPuyo-Setup.exe', 94371840, 'sha256:' + 'ab'.repeat(32)), A('v1.3.1', 'PuyoPuyo-Setup-1.3.1.exe', 94371840), A('v1.3.1', 'PuyoPuyo-1.3.1-portable.exe', 90000000), { name: 'ui-manifest.json', size: 1, browser_download_url: DL + 'v1.3.1/ui-manifest.json' }]),
  rel('v1.3.0', 'v1.3.0 · 적당한 변경', '2026-10-21T04:48:43Z', '친구 대전\n\n- 대전 신청', [A('v1.3.0', 'PuyoPuyo-Setup-1.3.0.exe', 94000000)]),
  { ...rel('v1.2.9', 'v1.2.9', '2026-10-20T00:00:00Z', 'x', [A('v1.2.9', 'PuyoPuyo-Setup-1.2.9.exe', 1)]), prerelease: true },
];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
  const ext = []; let csp = 0;
  const open = async (api, ua) => {
    const ctx = await b.newContext({ viewport: { width: 1100, height: 800 }, userAgent: ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36' }); const pg = await ctx.newPage();
    pg.on('console', m => { if (/Content Security Policy/i.test(m.text())) csp++; });
    pg.on('request', r => { const u = r.url(); if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:')) ext.push(u); });
    await pg.route('https://api.github.com/**', r => api ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(api) }) : r.fulfill({ status: 403, body: '{}' }));
    await pg.goto('http://127.0.0.1:4790/'); await pg.waitForTimeout(800); return { pg, ctx };
  };
  let { pg, ctx } = await open(API);
  ok(/Windows용 다운로드/.test(await pg.textContent('#dlBtn')) && (await pg.title()) === '뿌요뿌요 다운로드', '제목과 다운로드 버튼');
  ok((await pg.getAttribute('#dlBtn', 'href')) === DL + 'v1.3.1/PuyoPuyo-Setup.exe', '버튼이 최신 버전의 고정 이름 설치 파일로 연결됨(휴대용·매니페스트가 아님)');
  ok(/v1\.3\.1 · 90MB · 2026\.10\.21/.test(await pg.textContent('#dlSub')), '버전 · 용량 · 날짜 표시: ' + (await pg.textContent('#dlSub')));
  ok(/랭크전 AI 상대 수정/.test(await pg.textContent('#relHead')) && (await pg.locator('#notes li').count()) === 2 && !/Co-Authored|Claude-Session/.test(await pg.textContent('#whatsnew')), '변경 내용 표시(공동 작성자·세션 줄은 뺌)');
  ok(await pg.textContent('#kind') === '사소한 변경', '변경 단계 배지');
  ok(!(await pg.evaluate(() => window.__xss)) && (await pg.locator('#notes img').count()) === 0, '릴리스 설명 속 HTML은 글자로만 보임(실행되지 않음)');
  ok((await pg.textContent('#hashVal')) === 'AB'.repeat(32), '파일 SHA-256 표시');
  ok((await pg.locator('#olds li').count()) === 1 && /v1\.3\.0/.test(await pg.textContent('#olds')) && !/1\.2\.9/.test(await pg.textContent('#olds')), '이전 버전 목록(시험판 제외)');
  ok(await pg.locator('#notWin').isHidden(), 'Windows에서는 컴퓨터 안내가 안 보임');
  await pg.screenshot({ path: process.env.SHOT || path.join(OUT, 'shot.png'), fullPage: true }); await ctx.close();
  ({ pg, ctx } = await open(null));
  ok((await pg.getAttribute('#dlBtn', 'href')) === 'https://github.com/zlero7/puopuo/releases/latest' && /GitHub/.test(await pg.textContent('#dlSub')), 'GitHub 응답이 실패하면 릴리스 페이지 링크로 대체');
  await ctx.close();
  ({ pg, ctx } = await open(API, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1'));
  ok(await pg.locator('#notWin').isVisible(), 'Windows가 아니면 "컴퓨터에서 열어 주세요" 안내');
  await ctx.close();
  ok(ext.every(u => u.startsWith('https://api.github.com/')) && csp === 0, `외부 접속은 GitHub API뿐, CSP 위반 없음 (${ext.length}건)`);
  await b.close(); srv.close(); fs.rmSync(OUT, { recursive: true, force: true });
  console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exit(fail ? 1 : 0);
})();
