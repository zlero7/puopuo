// 데이터 자동 백업(backup.js) 테스트: 복사 · 없는 파일 건너뜀 · 오래된 것 정리 · 권한 · 반쪽짜리 폴더 없음
// 실행: node tests/backup.js
const fs = require('fs'), os = require('os'), path = require('path');
const { backupNow, list } = require('../backup');
let fail = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fail++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-')), data = path.join(tmp, 'data'), dir = path.join(data, 'backups'); fs.mkdirSync(data);
fs.writeFileSync(path.join(data, 'accounts.json'), '{"a":1}'); fs.writeFileSync(path.join(data, 'ranks.json'), '{"r":1}');
const files = ['accounts.json', 'ranks.json', 'auth-secret.key'].map(f => path.join(data, f));      // 비밀키 파일은 아직 없음
let r = backupNow({ files, dir, now: new Date(2026, 9, 21, 3, 0, 0) });
ok(r.join() === 'accounts.json,ranks.json', '있는 파일만 복사(없는 비밀키 파일은 건너뜀)');
ok(fs.readFileSync(path.join(dir, '20261021-030000', 'accounts.json'), 'utf8') === '{"a":1}', '내용이 그대로 복사됨');
if (process.platform !== 'win32') ok((fs.statSync(path.join(dir, '20261021-030000', 'accounts.json')).mode & 0o077) === 0, '백업 파일은 본인만 읽을 수 있음(0600)');
ok(!fs.readdirSync(dir).some(n => n.endsWith('.tmp')), '임시 폴더가 남지 않음');
for (let d = 22; d <= 26; d++) backupNow({ files, dir, keep: 3, now: new Date(2026, 9, d, 3, 0, 0) });
ok(list(dir).join() === '20261024-030000,20261025-030000,20261026-030000', '최근 3개만 보관하고 오래된 것은 지움');
fs.writeFileSync(path.join(data, 'accounts.json'), '{"a":2}'); backupNow({ files, dir, keep: 3, now: new Date(2026, 9, 27, 3, 0, 0) });
ok(fs.readFileSync(path.join(dir, '20261026-030000', 'accounts.json'), 'utf8') === '{"a":1}' && fs.readFileSync(path.join(dir, '20261027-030000', 'accounts.json'), 'utf8') === '{"a":2}', '이전 백업은 그대로, 새 백업엔 바뀐 내용');
ok(backupNow({ files: [path.join(data, 'nope.json')], dir, now: new Date(2026, 9, 28) }).length === 0 && list(dir).length === 3, '복사할 파일이 하나도 없으면 빈 백업 폴더를 만들지 않음');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail}개 실패` : '\n모두 통과'); process.exit(fail ? 1 : 0);
