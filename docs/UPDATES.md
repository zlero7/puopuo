# 앱 업데이트 (설치 파일을 다시 받지 않고 화면만 갈아끼우기)

앱은 **본체**(Electron·보안 설정, 설치 파일 안)와 **화면**(`public/` 의 게임 화면)으로 나뉩니다. 게임 화면 수정은 대부분 화면만 바뀌므로, 앱이 새 화면을 내려받아 바꿔 끼웁니다. 사용자는 앱을 다시 설치하지 않아도 됩니다. 앱을 켜면 **시작 화면**이 먼저 업데이트를 확인하고(최대 12초), 새 화면이 있으면 받아서 바로 적용한 뒤 메인으로 들어갑니다. 켜 둔 채로도 6시간마다 확인해서 "새 버전 준비 완료 → 지금 적용" 알림을 보여 줍니다.

## 안전장치
- **서명**: 매니페스트(`ui-manifest.json`)에 Ed25519 서명(`ui-manifest.sig`)이 있고, 앱에 들어 있는 공개키(`electron/update-public-key.pem`)로 맞아야만 씁니다. 비밀키는 GitHub 비밀값 `UPDATE_SIGNING_KEY` 에만 둡니다(저장소·채팅에 올리지 마세요).
- **해시 대조**: 묶음·파일마다 SHA-512 가 매니페스트와 정확히 같아야 하고, 파일 목록도 더도 덜도 안 됩니다. 경로·확장자·크기에 상한이 있습니다.
- **되돌리기 방지**: 지금 버전보다 **높은** 버전만 받습니다.
- **재확인**: 저장한 뒤에도 켤 때마다 서명·해시를 다시 확인하고, 망가졌으면 지웁니다.
- **자동 복귀**: 새 화면이 20초 안에 "잘 떴다"(`ui:ready`)고 알리지 못하면 그 버전을 버리고 이전(또는 내장) 화면으로 돌아갑니다.
- **받는 곳 고정**: `github.com/zlero7/puopuo` 릴리스(와 GitHub 파일 서버)에서만 받습니다. 서버 주소가 잠긴 것처럼 업데이트 주소도 앱에 고정입니다.

## 처음 한 번 하는 설정
1. 내 PC 저장소 폴더에서 `node tools/make-update-key.js` → `update-private-key.pem`(비밀, git 무시됨)과 `electron/update-public-key.pem`(공개) 생성.
2. GitHub → 저장소 Settings → Secrets and variables → Actions → New secret: 이름 `UPDATE_SIGNING_KEY`, 값은 `update-private-key.pem` 파일 **전체 내용**.
3. `electron/update-public-key.pem` 을 커밋·푸시(공개키라 올려도 안전).
4. 이 공개키가 들어간 exe를 **한 번만** 새로 설치(이후 화면 업데이트는 자동).

## 새 버전 내는 법 (자동)
앱 브랜치(`claude/desktop-app-exe`)에 푸시하면 CI가 알아서 배포합니다.
1. 서버 테스트 · 도커 확인 · exe 빌드 · exe 스모크 테스트가 모두 통과해야 합니다.
2. 앱 파일(`public/` `electron/` `build/` `tools/` `package.json`)이 바뀐 푸시만 배포합니다(문서·서버·테스트만 바뀌면 배포 안 함. 커밋 제목에 `[skip release]`를 넣으면 건너뜀. Actions 탭 Run workflow에서 release를 체크하면 앱 파일이 안 바뀌어도 배포).
3. 버전은 `1.1.<실행번호>` 로 자동으로 올라가고, exe와 서명한 업데이트 파일(`ui-manifest.json` · `ui-manifest.sig` · `ui-bundle.json.gz`)이 릴리스에 붙습니다.
4. 사용자 앱은 켤 때 시작 화면에서 새 버전을 받아 바로 적용합니다.

직접 올리고 싶으면 예전처럼 태그를 푸시해도 됩니다: `git tag v1.2.0 && git push origin v1.2.0`.

## 화면만 바뀐 게 아닐 때
`electron/` 안(본체)을 바꿔서 새 설치 파일이 꼭 필요하면 `electron/shell-api.json` 의 `api` 숫자를 올립니다. 오래된 앱은 그 업데이트를 받지 않고 "앱을 새로 설치해야 해요 → 받으러 가기" 알림만 보여 줍니다.

서버 규칙·프로토콜이 바뀌어 오래된 앱을 막으려면 서버의 `MIN_CLIENT_VERSION` 을 올리세요(비교하는 값은 **화면 버전**).

## 개발 시험용
`PUYO_UPDATE_BASE` · `PUYO_UPDATE_PUBKEY` · `PUYO_UPDATE_BOOT_MS` 는 **설치본이 아닐 때만**(개발 실행) 먹습니다.
