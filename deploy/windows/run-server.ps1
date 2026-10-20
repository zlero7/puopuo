# Windows PC에서 Docker 없이 서버 켜기(꺼지면 3초 뒤 자동으로 다시 켬)
#   1) Node.js 22 설치(https://nodejs.org)   2) 이 저장소 폴더에서 PowerShell을 열고:  powershell -ExecutionPolicy Bypass -File deploy\windows\run-server.ps1
#   HTTPS는 이 서버 앞에 Cloudflare Tunnel(cloudflared) 또는 Caddy를 두세요(docs/SERVER.md). 이 서버는 이 PC 안(127.0.0.1)에서만 받습니다.
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..'))
if (-not (Test-Path node_modules\ws)) { npm ci --omit=dev --ignore-scripts }
$data = Join-Path $PWD 'data'; New-Item -ItemType Directory -Force $data | Out-Null
$env:REQUIRE_AUTH = '1'; $env:SERVE_WEB = '0'
$env:HOST = '127.0.0.1'; $env:PORT = '3000'
$env:TRUST_PROXY = '1'                     # 앞에 프록시(터널/Caddy)가 한 단계 있음
$env:AUTH_DIR = $data; $env:RANK_FILE = Join-Path $data 'ranks.json'
# 비밀키: 없으면 data\auth-secret.key 를 만들어 씀. 환경 변수 AUTH_SECRET을 직접 정해 두면 그것을 우선함(32자 이상)
while ($true) {
  Write-Host "뿌요뿌요 서버를 켭니다 (Ctrl+C로 끄기)"
  node server.js
  Write-Host "서버가 멈췄어요. 3초 뒤 다시 켭니다."
  Start-Sleep -Seconds 3
}
