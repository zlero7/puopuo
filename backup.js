// 데이터 자동 백업 — 계정·랭크·비밀키 파일을 하루에 한 번 data/backups/<날짜-시간>/ 에 복사하고 오래된 것은 지움
// 같은 디스크 안의 백업은 파일이 깨졌을 때를 막아 줌. 디스크가 고장 나는 것까지 막으려면 이 폴더를 가끔 다른 드라이브·USB로 복사해 두세요.
'use strict';
const fs = require('fs');
const path = require('path');

const STAMP = /^\d{8}-\d{6}$/;
const pad = n => String(n).padStart(2, '0');
const stampOf = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const list = dir => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && STAMP.test(e.name)).map(e => e.name).sort(); } catch (e) { return []; } };

// 파일들을 새 폴더에 복사. 없는 파일은 건너뜀. 하나도 복사하지 못하면 폴더를 만들지 않음. 복사한 파일 이름 목록을 돌려줌
function backupNow({ files, dir, keep = 14, now = new Date() }) {
  const name = stampOf(now), dest = path.join(dir, name), tmp = dest + '.tmp', done = [];
  fs.mkdirSync(tmp, { recursive: true, mode: 0o700 });
  for (const f of files) {
    try { if (fs.statSync(f).isDirectory()) { fs.cpSync(f, path.join(tmp, path.basename(f)), { recursive: true }); done.push(path.basename(f) + '/'); continue; } } catch (e) {}
    try { if (fs.statSync(f).isFile()) { fs.copyFileSync(f, path.join(tmp, path.basename(f))); try { fs.chmodSync(path.join(tmp, path.basename(f)), 0o600); } catch (e) {} done.push(path.basename(f)); } } catch (e) {}
  }
  if (!done.length) { fs.rmSync(tmp, { recursive: true, force: true }); return []; }
  fs.rmSync(dest, { recursive: true, force: true }); fs.renameSync(tmp, dest);      // 다 복사한 뒤에 이름을 바꿈(복사 중에 끊겨도 반쪽짜리가 남지 않음)
  for (const old of list(dir).slice(0, Math.max(0, list(dir).length - keep))) fs.rmSync(path.join(dir, old), { recursive: true, force: true });
  return done;
}
// 서버를 켤 때 마지막 백업이 오래됐으면 바로 하고, 그 뒤로는 한 시간마다 확인해서 intervalH 시간이 지났으면 백업
function start({ files, dir, keep = +process.env.BACKUP_KEEP || 14, intervalH = 24, log = console.log }) {
  const last = () => { const l = list(dir).pop(); if (!l) return 0; const m = l.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/); return +new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]); };
  const tick = () => {
    if (Date.now() - last() < intervalH * 3600 * 1000) return;
    try { const r = backupNow({ files, dir, keep }); if (r.length) log(`  데이터를 백업했습니다: ${dir} (${r.join(', ')}, 최근 ${keep}개 보관)`); } catch (e) { log('  백업에 실패했습니다:', e.message); }
  };
  setTimeout(tick, 5000).unref(); const t = setInterval(tick, 3600 * 1000); t.unref(); return t;
}
module.exports = { backupNow, start, list };
