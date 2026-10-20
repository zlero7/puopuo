// 업데이트 서명 키 만들기(한 번만). 비밀키는 컴퓨터 밖으로 새지 않게, 공개키만 앱에 넣는다.
//   node tools/make-update-key.js
// 결과: update-private-key.pem(비밀, 절대 커밋하지 말 것) · electron/update-public-key.pem(공개, 커밋해서 앱에 넣음)
// 비밀키 내용은 GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret → 이름 UPDATE_SIGNING_KEY 에 붙여 넣는다.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const priv = path.join(process.cwd(), 'update-private-key.pem');
const pub = path.join(__dirname, '..', 'electron', 'update-public-key.pem');
if (fs.existsSync(priv) || fs.existsSync(pub)) { console.error('이미 키가 있어요. 다시 만들면 이미 배포한 앱이 새 업데이트를 못 받아요. 정말 바꾸려면 두 파일을 직접 지운 뒤 다시 실행하세요.\n  ' + priv + '\n  ' + pub); process.exit(1); }
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.writeFileSync(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(pub, publicKey.export({ type: 'spki', format: 'pem' }));
console.log('만들었어요.\n');
console.log('1) 비밀키(' + priv + ')의 내용 전체를 GitHub 비밀값 UPDATE_SIGNING_KEY 로 등록하세요(-----BEGIN PRIVATE KEY----- 줄부터 END 줄까지).');
console.log('   등록한 뒤에는 이 파일을 안전한 곳(USB·비밀번호 관리자)에 따로 보관하고, 저장소 폴더에는 두지 마세요. 잃어버리면 새 키를 만들어 앱을 새로 설치해야 해요.');
console.log('2) 공개키(' + pub + ')를 커밋·푸시하세요(공개해도 안전해요). 이 키가 들어간 앱부터 자동 업데이트를 받아요:\n');
console.log(publicKey.export({ type: 'spki', format: 'pem' }));
