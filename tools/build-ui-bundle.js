// 화면(UI) 업데이트 파일 만들기: dist/ui/ui-manifest.json · ui-manifest.sig · ui-bundle.json.gz
//   UPDATE_SIGNING_KEY(비밀키 PEM 내용) 환경 변수가 있어야 서명함. 없으면 아무것도 만들지 않고 알림만 하고 끝냄(잘못된 업데이트가 나가지 않게)
//   node tools/build-ui-bundle.js [버전]   버전을 안 주면 package.json 의 version
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../electron/update-core');
const root = path.join(__dirname, '..');
const key = process.env.UPDATE_SIGNING_KEY;
if (!key || !/BEGIN PRIVATE KEY/.test(key)) { console.log('UPDATE_SIGNING_KEY가 없어서 업데이트 파일은 만들지 않아요(설치 파일만 배포돼요).'); process.exit(0); }
const version = process.argv[2] || require(path.join(root, 'package.json')).version;
const shellApi = require(path.join(root, 'electron', 'shell-api.json')).api;
// 이전 릴리스의 매니페스트(PREV_MANIFEST 파일)가 있으면 바뀐 파일만 담은 작은 패치도 만듦(앱이 한 단계 전 버전이면 이것만 받음). 없거나 깨졌으면 전체 묶음만
let prevFiles = null;
try { const pm = JSON.parse(fs.readFileSync(process.env.PREV_MANIFEST || path.join(root, 'dist', 'prev-manifest.json'), 'utf8')); if (pm && pm.files && typeof pm.files === 'object') prevFiles = pm.files; } catch (e) {}
const r = core.buildBundle({ publicDir: path.join(root, 'public'), version, shellApi, privatePem: key, prevFiles, notes: (process.env.UPDATE_NOTES || '').split('\n').filter(l => !/^(Co-Authored-By|Claude-Session):/i.test(l)).join('\n').trim().slice(0, 1500) });
// 만든 것을 공개키로 다시 확인(키가 짝이 안 맞으면 여기서 멈춤)
const pubPath = path.join(root, 'electron', 'update-public-key.pem');
if (!fs.existsSync(pubPath)) { console.error('electron/update-public-key.pem이 없어요. node tools/make-update-key.js 로 만들고 커밋해 주세요.'); process.exit(1); }
if (!core.verifySig(r.manifestBytes, r.sigB64, fs.readFileSync(pubPath, 'utf8'))) { console.error('비밀키가 앱에 들어 있는 공개키와 짝이 안 맞아요. 서명 키를 확인해 주세요.'); process.exit(1); }
const out = path.join(root, 'dist', 'ui'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'ui-manifest.json'), r.manifestBytes);
fs.writeFileSync(path.join(out, 'ui-manifest.sig'), r.sigB64);
fs.writeFileSync(path.join(out, 'ui-bundle.json.gz'), r.bundleBytes);
try { fs.rmSync(path.join(out, 'ui-patch.json.gz'), { force: true }); } catch (e) {}
if (r.patchBytes) fs.writeFileSync(path.join(out, 'ui-patch.json.gz'), r.patchBytes);
console.log(`화면 업데이트 ${version} 파일을 만들었어요: 파일 ${Object.keys(r.manifest.files).length}개, 번들 ${(r.bundleBytes.length / 1048576).toFixed(1)}MB${r.patchBytes ? `, 패치 ${(r.patchBytes.length / 1024).toFixed(0)}KB` : ''} → ${out}`);
