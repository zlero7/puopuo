// 다음 버전 정하기(자동 배포용): 마지막 릴리스 태그를 기준으로 변경량에 따라 큰 숫자를 올림
//   크게 바뀜(x.0.0)  : 변경이 아주 많을 때(기본 바뀐 글자 6만 자 이상 또는 파일 60개 이상) 또는 커밋 제목에 [major]
//   적당히 바뀜(0.x.0): 변경이 꽤 있을 때(기본 8천 자 이상 또는 파일 6개 이상, 앱 본체 호환 번호가 바뀐 경우) 또는 [minor]
//   (줄 수가 아니라 '바뀐 글자 수'로 잼: 이 프로젝트 코드는 한 줄이 길어서 줄 수로는 변경량이 작게 나옴)
//   사소한 변경(0.0.x): 그 밖의 경우 또는 [patch]
// 사용: node tools/next-version.js [--level auto|major|minor|patch]   (출력: 한 줄 "버전 단계")
'use strict';
const { execFileSync } = require('child_process');

const TH = { majorChars: +process.env.BUMP_MAJOR_CHARS || 60000, majorFiles: +process.env.BUMP_MAJOR_FILES || 60, minorChars: +process.env.BUMP_MINOR_CHARS || 8000, minorFiles: +process.env.BUMP_MINOR_FILES || 6 };
const SEMVER = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/;

// 변경량(줄 수·파일 수·본체 호환 번호 변경 여부)과 제목 표시로 올릴 단계를 정함
function pickLevel({ forced, title = '', chars = 0, files = 0, shellChanged = false }) {
  if (['major', 'minor', 'patch'].includes(forced)) return forced;
  const m = String(title).match(/\[(major|minor|patch)\]/i); if (m) return m[1].toLowerCase();
  if (chars >= TH.majorChars || files >= TH.majorFiles) return 'major';
  if (chars >= TH.minorChars || files >= TH.minorFiles || shellChanged) return 'minor';
  return 'patch';
}
function bump(last, level) {
  const m = SEMVER.exec(last || '1.0.0'); if (!m) throw new Error('버전 모양이 이상해요: ' + last);
  let [a, b, c] = m.slice(1).map(Number);
  if (level === 'major') { a++; b = 0; c = 0; } else if (level === 'minor') { b++; c = 0; } else c++;
  return `${a}.${b}.${c}`;
}
const cmp = (x, y) => { const p = v => v.split('.').map(Number); const A = p(x), B = p(y); for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return A[i] - B[i]; return 0; };
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

function fromGit(forced) {
  const tags = git('tag', '-l', 'v[0-9]*.[0-9]*.[0-9]*').split('\n').map(t => t.trim().replace(/^v/, '')).filter(t => SEMVER.test(t)).sort(cmp);
  const last = tags.length ? tags[tags.length - 1] : '1.0.0', has = new Set(tags);
  let chars = 0, files = 0, shellChanged = false;
  const paths = ['public', 'electron', 'build', 'tools', 'package.json', ':!public/img', ':!public/fonts'];
  try {
    for (const l of git('diff', '--numstat', 'v' + last, 'HEAD', '--', ...paths).split('\n')) if (/^\d+\t\d+\t/.test(l)) files++;      // 그림·글꼴 같은 이진 파일은 뺌
    for (const l of git('diff', '-U0', '--no-color', 'v' + last, 'HEAD', '--', ...paths).split('\n')) if (/^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l)) chars += l.length - 1;   // 추가·삭제된 글자 수
    shellChanged = git('diff', '--name-only', 'v' + last, 'HEAD', '--', 'electron/shell-api.json').trim() !== '';
  } catch (e) { /* 기준 태그가 없으면 변경량 없이 사소한 변경으로 */ }
  const title = (() => { try { return git('log', '-1', '--format=%s'); } catch (e) { return ''; } })();
  const level = pickLevel({ forced, title, chars, files, shellChanged });
  let v = bump(last, level); while (has.has(v)) v = bump(v, 'patch');                     // 이미 있는 버전이면 건너뜀
  return { version: v, level, last, chars, files, shellChanged };
}
module.exports = { pickLevel, bump, TH };

if (require.main === module) {
  const i = process.argv.indexOf('--level'), forced = i > 0 ? process.argv[i + 1] : 'auto';
  const r = fromGit(forced);
  console.log(`${r.version} ${r.level}`);
  console.error(`마지막 ${r.last} → ${r.version} (${r.level}) · 바뀐 글자 ${r.chars}자 · 파일 ${r.files}개${r.shellChanged ? ' · 앱 본체 호환 번호 변경' : ''}`);
}
