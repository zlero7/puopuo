# Windows PC에서 Docker 없이 서버 켜기(꺼지면 3초 뒤 자동으로 다시 켬)
#   1) Node.js 22 설치(https://nodejs.org)   2) 이 저장소 폴더에서 PowerShell을 열고:  powershell -ExecutionPolicy Bypass -File deploy\windows\run-server.ps1
#   포트는 기본 38301(다른 프로그램과 겹치기 어려운 번호). 바꾸려면 -Port 번호. Cloudflare 터널의 서비스 주소(HTTP · localhost:포트)도 같은 번호여야 해요.
#   HTTPS는 이 서버 앞에 Cloudflare Tunnel(cloudflared) 또는 Caddy를 두세요(docs/SERVER.md). 이 서버는 이 PC 안(127.0.0.1)에서만 받습니다.
param([int]$Port = 38301)
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..'))
if (-not (Test-Path node_modules\ws)) { npm ci --omit=dev --ignore-scripts }
$data = Join-Path $PWD 'data'; New-Item -ItemType Directory -Force $data | Out-Null
$log = Join-Path $data 'server.log'
if ((Test-Path $log) -and ((Get-Item $log).Length -gt 5MB)) { Move-Item $log "$log.old" -Force }   # 로그가 너무 커지지 않게
$env:REQUIRE_AUTH = '1'; $env:SERVE_WEB = '0'
$env:HOST = '127.0.0.1'; $env:PORT = "$Port"
$env:TRUST_PROXY = '1'                     # 앞에 프록시(터널/Caddy)가 한 단계 있음
$env:AUTH_DIR = $data; $env:RANK_FILE = Join-Path $data 'ranks.json'
# 비밀키: 없으면 data\auth-secret.key 를 만들어 씀. 환경 변수 AUTH_SECRET을 직접 정해 두면 그것을 우선함(32자 이상)
while ($true) {
  $own = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($own) {                              # 다른 프로그램이 이 포트를 쓰고 있으면 켜지 않고 알림(남의 서비스를 건드리거나 겹치지 않게)
    $who = (Get-Process -Id $own.OwningProcess -ErrorAction SilentlyContinue).ProcessName
    "$(Get-Date -Format s) 포트 $Port 를 이미 '$who' 가 쓰고 있어요. -Port 로 다른 번호를 쓰세요." | Tee-Object -FilePath $log -Append
    exit 1
  }
  Write-Host "뿌요뿌요 서버를 켭니다: 127.0.0.1:$Port (Ctrl+C로 끄기, 로그: $log)"
  node server.js 2>&1 | Tee-Object -FilePath $log -Append
  Write-Host "서버가 멈췄어요. 3초 뒤 다시 켭니다."
  Start-Sleep -Seconds 3
}
