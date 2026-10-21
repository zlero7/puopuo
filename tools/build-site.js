// 다운로드 사이트 조립: site/ + 앱에 든 글꼴·그림 일부 → _site/ (GitHub Pages가 올리는 폴더). 실행: node tools/build-site.js [출력 폴더]
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.resolve(process.argv[2] || path.join(ROOT, '_site'));
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'site'), OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'public', 'fonts'), path.join(OUT, 'fonts'), { recursive: true });       // 글꼴은 앱에 든 것을 그대로(외부 접속 없이)
fs.mkdirSync(path.join(OUT, 'img'), { recursive: true });
for (const f of ['chars_icon.webp']) fs.copyFileSync(path.join(ROOT, 'public', 'img', f), path.join(OUT, 'img', f));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log(`사이트를 ${OUT}에 만들었어요.`);
