# 앱 서버(중앙 서버) 운영 안내

앱(exe)은 화면만 보여 주고, 계정·온라인 대전·랭크는 이 서버가 맡습니다. 서버는 **로그인 필수 · 앱에서만 접속 · 게임 화면(웹)은 제공하지 않는** 상태가 기본입니다.

## 0. 내 PC에서 돌리기 (주소: https://puyo.zlero.xyz)

앱의 기본 서버 주소는 `https://puyo.zlero.xyz` 로 넣어 두었습니다(`electron/app-config.json`). 집 PC로 이 주소를 열려면 **HTTPS로 바깥에 공개하는 방법**을 하나 골라야 해요.

| | A. Cloudflare Tunnel (집 PC 추천) | B. 공유기 포트포워딩 + Caddy |
|---|---|---|
| 공유기 포트 열기 | 필요 없음 | 80 · 443 을 이 PC로 |
| 집 IP | 숨겨짐(디도스·스캔 부담 적음) | 드러남(IP가 바뀌면 DDNS 필요) |
| 필요한 것 | 도메인 DNS를 Cloudflare(무료)에 두기 | 도메인 DNS에 `puyo` A 레코드 → 집 공인 IP |
| 통신사가 80/443을 막은 경우 | 상관없음 | 안 될 수 있음 |

**가장 쉬운 길 (Windows · Docker 없이 한 번에)**: 관리자 PowerShell에서 저장소 폴더로 가서
`powershell -ExecutionPolicy Bypass -File deploy\windows\setup.ps1 -TunnelToken "<터널 토큰>"` 한 줄이면 Node.js 확인 → 의존성 설치 → 서버 자동 시작(로그인할 때마다) → cloudflared 서비스 설치까지 해 줘요. 터널 토큰은 아래 A의 1·2번(Cloudflare 화면에서만 할 수 있는 일)로 받아요. 토큰 없이 실행하면 서버만 켜고, 공개는 아래 A/B로 따로 하면 돼요.

**공통 준비 (서버를 켜는 법 둘 중 하나)**
- Docker Desktop을 쓸 때: `deploy/.env` 만들기(`cp deploy/.env.example deploy/.env`) → `AUTH_SECRET`(= `openssl rand -hex 32`, PowerShell은 `-join ((1..32) | % { '{0:x2}' -f (Get-Random -Max 256) })`) 채우기.
- Docker 없이: Node.js 22를 설치하고 저장소 폴더에서 `powershell -ExecutionPolicy Bypass -File deploy\windows\run-server.ps1`. 이 서버는 PC 안(127.0.0.1:3000)에서만 받으므로, 아래 A 또는 B의 HTTPS 프로그램이 바깥 연결을 받아 넘겨 줍니다.

**A. Cloudflare Tunnel**
1. [Cloudflare](https://dash.cloudflare.com) 무료 계정에 `zlero.xyz` 를 추가하고, 도메인을 산 곳에서 네임서버를 Cloudflare가 알려 주는 것으로 바꿉니다(적용까지 몇 분~몇 시간. 이미 쓰는 다른 DNS 레코드는 옮겨 오도록 확인).
2. Zero Trust → Networks → Tunnels → 터널 만들기 → 토큰 복사. Public hostname: `puyo.zlero.xyz` → Service `HTTP` · `localhost:3000`(Docker 쓰면 `puyo:3000`).
3. Docker: `deploy/.env` 에 `TUNNEL_TOKEN` 도 넣고 `cd deploy && docker compose -f docker-compose.tunnel.yml up -d --build`.
   Docker 없이: `run-server.ps1` 을 켜 두고, Windows용 `cloudflared` 를 설치해 터널을 서비스로 등록(대시보드가 명령을 알려 줌).

**B. 포트포워딩 + Caddy**
1. 도메인 DNS에 `puyo` **A 레코드**를 집 공인 IP로(IP가 바뀌는 집이면 DDNS 사용).
2. 공유기에서 **80 · 443 포트를 이 PC로** 포트포워딩하고, 이 PC의 IP를 고정(DHCP 예약).
3. `deploy/.env` 에 `DOMAIN=puyo.zlero.xyz` · `AUTH_SECRET` → `cd deploy && docker compose up -d --build` (Caddy가 인증서를 자동 발급).

**확인**: 다른 네트워크(폰 데이터)에서 `https://puyo.zlero.xyz/health` 를 열어 `{"ok":true}` 가 보이면 됩니다. 앱을 켜서 가입·로그인되면 끝.

**집 PC에서 지킬 것**
- 서버가 켜져 있는 동안에만 접속돼요. 절전·최대 절전을 끄고(전원 옵션), Windows 업데이트 자동 재부팅 시간을 조정하세요.
- 공유기 포트는 **80 · 443 말고는 열지 마세요**(3000번을 직접 열면 HTTPS가 없어서 비밀번호가 그대로 오가요). A안은 아무것도 열지 않아도 됩니다.
- `data` 폴더(`accounts.json` · `ranks.json` · `auth-secret.key`)를 주기적으로 다른 곳에 복사해 두세요. `AUTH_SECRET` 도 따로 적어 두세요.
- 이 PC에 다른 사람이 접속하지 못하게 Windows 계정 비밀번호·방화벽을 지키세요(서버 데이터에 계정 해시가 있어요).

## 1. 일반 서버(VPS): Docker + 자동 HTTPS

필요한 것: 리눅스 서버(VPS) 1대, Docker, **도메인**(A 레코드가 서버 IP를 가리킴), 80·443 포트 열기.

```bash
git clone <저장소> && cd puopuo/deploy
cp .env.example .env
#  .env 를 열어 DOMAIN 과 AUTH_SECRET 을 채움  (AUTH_SECRET: openssl rand -hex 32)
docker compose up -d --build
curl https://<도메인>/health        # {"ok":true}
```

앱의 서버 주소는 `https://<도메인>` 입니다. 배포용 앱을 만들 땐 `electron/app-config.json` 에 넣고 잠가 두세요.

```json
{ "serverUrl": "https://puyo.example.com", "allowServerChange": false }
```

`deploy/` 구성: `docker-compose.yml`(서버 + Caddy), `Caddyfile`(HTTPS · 웹소켓 프록시 · 요청 크기 제한), `.env.example`.
서버 컨테이너는 읽기 전용 파일 시스템 · 일반 사용자 · 모든 권한 제거 · 외부 포트 없음(Caddy만 접근)으로 돕니다.

## 2. 환경 변수

| 이름 | 기본 | 설명 |
|---|---|---|
| `AUTH_SECRET` | (없으면 `AUTH_DIR/auth-secret.key` 자동 생성) | 세션 서명·비밀번호 보호 비밀키, 32자 이상. **환경 변수로 따로 두는 것을 권장**(데이터 폴더만 유출돼도 비밀번호를 풀 수 없게). 잃어버리면 모두 다시 로그인·기존 비밀번호 사용 불가 |
| `REQUIRE_AUTH` | `1` | `0`이면 로그인 없는 개발·테스트 모드(**인터넷에 열지 말 것**) |
| `ALLOWED_ORIGINS` | `puyo://app` | 웹소켓 접속을 허용할 Origin(쉼표로 여러 개) |
| `TRUST_PROXY` | `0` (Docker는 `1`) | 프록시 몇 단계 뒤에 있는지. 접속자 주소를 `X-Forwarded-For` 오른쪽에서 N번째로 씀(주소별 제한이 프록시 주소 하나로 뭉치지 않게). **프록시 없이 직접 열 땐 0** |
| `TLS_CERT` · `TLS_KEY` | - | 프록시 없이 직접 HTTPS로 열 때 인증서·키 파일 경로 |
| `MIN_CLIENT_VERSION` | `0.0.0` | 이보다 낮은 앱은 접속 거부(강제 업데이트) |
| `MAX_CONNS` | `2000` | 동시 접속 상한 |
| `MAX_CONN_PER_IP` | `64` | 한 주소당 동시 접속 |
| `AUTH_DIR` · `RANK_FILE` | `./data` | 계정(`accounts.json`)·랭크(`ranks.json`) 저장 위치 |
| `SERVE_WEB` | `0` | `1`이면 게임 화면(웹)도 제공(개발용) |
| `RANK_OPEN` · `RANK_BOT_WAIT` · `RANK_BOT_MAX` | - | 랭크 매칭 범위·AI 상대 설정(README 참고) |

## 3. 지켜야 할 것

- **HTTPS 필수**: 비밀번호가 오가므로 암호화 없이 인터넷에 열지 마세요. 서버가 켜질 때 암호화 없이 열려 있으면 경고를 띄웁니다.
- **백업**: `/data`(Docker는 `puyo-data` 볼륨)의 `accounts.json` · `ranks.json` 과 `AUTH_SECRET` 을 함께 보관하세요. `accounts.json` 에는 비밀번호 해시가 있으니 권한을 좁게(서버가 0600으로 만듦) 두고, 백업도 안전한 곳에.
- **한 서버 한 개 프로세스**: 방·대기열·랭크 상태가 메모리에 있어서 서버를 여러 개로 나눠 돌리면 안 됩니다(재시작하면 진행 중인 방은 끊김. 계정·랭크·세션은 유지).
- **로그**: 가입·로그인 실패·비밀번호 변경이 접속 주소와 함께 남습니다(비밀번호는 기록하지 않음). 로그인 실패가 몰리면 주소를 방화벽에서 막으세요.
- **앱 업데이트**: 규칙·프로토콜이 바뀌면 `MIN_CLIENT_VERSION` 을 올려 오래된 앱을 막고, 새 exe를 배포하세요(코드 서명과 자동 업데이트는 아직 없음).

## 4. 지금 구조가 막아 주는 것 / 못 막는 것

막아 주는 것: 비밀번호·토큰 유출(해시 저장·세션은 앱 본체만 보관·1회용 접속표), 무차별 대입(계정 잠금 + 주소 제한 + 느린 해시), 남의 이름으로 대전(서버가 이름 고정), 웹페이지에서의 접속(Origin 검사), 주소 위장으로 인한 제한 우회(프록시 오른쪽 주소), 앱 화면의 변조된 외부 접속(CSP·요청 차단), 랭크전 점수 조작(서버가 규칙대로 다시 계산).

못 막는 것(알고 쓰기):
- **일반 대전(비랭크)은 각자 컴퓨터가 계산한 결과를 믿습니다.** 앱을 고쳐 쓰는 사람이 연쇄 같은 걸 조작할 수 있어요. 랭크전은 서버가 다시 계산하므로 안전합니다.
- 앱 파일은 사용자 컴퓨터에 있으므로 완전히 숨기거나 변조를 100% 막을 수는 없습니다(퓨즈·asar 무결성은 가벼운 변조를 막는 정도). 그래서 중요한 판정은 전부 서버에서 합니다.
- 계정 복구(비밀번호 찾기)는 없습니다(이메일을 받지 않으므로). 잃어버리면 새 계정을 만들어야 해요.
- 코드 서명이 없어서 Windows가 "알 수 없는 게시자" 경고를 띄웁니다.
