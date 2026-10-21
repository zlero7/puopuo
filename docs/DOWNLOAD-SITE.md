# 다운로드 사이트 (puyopuyo.zlero.xyz)

최신 Windows 설치 파일을 받는 한 장짜리 사이트예요. 파일은 **GitHub 릴리스에서만** 받아요(사이트에 복사해 두지 않음).

## 구성
- `site/` — 사이트 본문(`index.html` · `style.css` · `app.js` · `CNAME`)
- `tools/build-site.js` — `site/` + 앱에 든 글꼴·마스코트 그림을 `_site/`로 조립
- `.github/workflows/pages.yml` — 사이트 파일이 바뀌면 GitHub Pages에 배포
- 최신 버전·변경 내용·이전 버전은 페이지가 열릴 때 GitHub 릴리스 API에서 읽어 옴 → 새 릴리스가 나와도 **사이트를 다시 배포할 필요가 없어요**
- 릴리스마다 `PuyoPuyo-Setup.exe`(버전 없는 이름)와 `SHA256SUMS.txt`가 같이 올라가요(CI)
- GitHub 응답이 안 오면(요청 제한 등) 릴리스 페이지(`releases/latest`) 링크로 대체해요

## 처음 한 번 할 일
1. **저장소 Settings → Pages → Build and deployment → Source: GitHub Actions** 로 바꾸기
2. **Settings → Environments → github-pages → Deployment branches** 에 `claude/desktop-app-exe` 추가
   (기본값은 기본 브랜치만 배포할 수 있어서, 이걸 안 하면 배포 단계가 거부돼요)
3. Actions 탭에서 "다운로드 사이트"를 **Run workflow** 로 한 번 실행
4. **DNS**: `zlero.xyz` DNS에 `puyopuyo` 이름으로 **CNAME → `zlero7.github.io`** 추가
   - Cloudflare를 쓰면 처음엔 **프록시 끄기(회색 구름, DNS only)** 로 두세요. 인증서가 발급된 뒤에 켜도 돼요.
5. Settings → Pages → **Custom domain** 에 `puyopuyo.zlero.xyz` 입력(`site/CNAME` 파일이 같은 값을 갖고 있어요) → 인증서가 나오면 **Enforce HTTPS** 체크

> 게임 서버가 있는 PC(`puyo.zlero.xyz` → 38301)와는 완전히 분리돼 있어요. 3000번 포트는 건드리지 않아요.

## 바꾸고 싶을 때
- 문구·디자인: `site/` 를 고치고 푸시하면 자동 배포
- 시험: `npm run test:site` (playwright 필요. GitHub 응답은 가짜로 넣어 검사)
- 로컬 미리보기: `node tools/build-site.js /tmp/site` 후 그 폴더를 아무 정적 서버로 열기

## 알려진 한계
- 설치 파일에 코드 서명이 없어 Windows SmartScreen 경고가 떠요(사이트에 해결 방법을 적어 둠)
- 인증 없는 GitHub API는 IP당 시간당 60번 제한이 있어요(넘으면 대체 링크가 나옴)
- 파일 SHA-256은 GitHub가 릴리스 파일마다 계산해 주는 값(`digest`)을 보여 줘요. 없으면 릴리스의 `SHA256SUMS.txt`를 보게 안내해요
