// 시작하자마자 메뉴 그림이 그려지는지(그림이 준비 전에 읽혀도 준비 뒤 다시 그림). 실행: node tests/art-ready.js (playwright 필요)
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const R = require('path').join(__dirname, '..', 'public'); const mime = { '.html': 'text/html', '.js': 'text/javascript', '.webp': 'image/webp', '.woff2': 'font/woff2', '.css': 'text/css' };
const srv = http.createServer((q, s) => { const f = path.join(R, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); s.end(b); }); }).listen(4774);
let fail = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM }); const pg = await b.newPage({ viewport: { width: 1280, height: 760 } }); pg.on('pageerror', e => { console.log('PAGEERR', e.message); fail++; });
  await pg.goto('http://127.0.0.1:4774/'); await pg.waitForTimeout(2000); await pg.evaluate(() => { try { dlgClose(); } catch (e) {} });
  const px = () => pg.evaluate(() => { const c = document.querySelector('#t-chars canvas.art'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  ok(await px() > 1000, '처음 화면에 캐릭터 그림이 그려져 있음');
  // 그림이 준비 전에 읽혀 다시 그리기가 건너뛰어진 상황을 흉내: 지우고, 준비 전 표시만 남기고, 준비 뒤 decode 경로로 복구
  await pg.evaluate(() => { const c = document.querySelector('#t-chars canvas.art'); c.getContext('2d').clearRect(0, 0, c.width, c.height); window.gameReady = false; onArtImage(); });
  ok(await px() === 0 && await pg.evaluate(() => window.artPending === true), '준비 전에 읽힌 그림은 표시만 해 두고 그리지 않음(예전엔 여기서 영영 잊어버렸음)');
  await pg.evaluate(() => { window.gameReady = true; Object.values(CHAR_IMG).forEach(i => { if (i.src) i.decode().then(onArtImage, () => {}); }); }); await pg.waitForTimeout(600);
  ok(await px() > 1000, '준비된 뒤 그림이 풀리면 다시 그려져 그림이 나타남');
  await b.close(); srv.close(); console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exit(fail ? 1 : 0);
})();
