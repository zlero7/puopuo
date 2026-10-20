# 내 Windows PC에 서버를 한 번에 설치하기 (관리자 PowerShell에서 한 번만 실행)
#   cd 저장소폴더
#   powershell -ExecutionPolicy Bypass -File deploy\windows\setup.ps1 -TunnelToken "<Cloudflare 터널 토큰>"
# 하는 일: Node.js 설치 확인 → 서버 의존성 설치 → 로그인할 때마다 서버 자동 시작(작업 스케줄러) → (토큰을 줬다면) cloudflared를 서비스로 설치
# 포트는 기본 38301(-Port로 바꿈). Cloudflare 터널의 Public Hostname 서비스 주소는 반드시  HTTP · localhost:38301  이어야 해요.
#Requires -RunAsAdministrator
param([string]$TunnelToken = '', [int]$Port = 38301)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root

function Has($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function Health { try { (Invoke-RestMethod "http://127.0.0.1:$Port/health" -TimeoutSec 3).ok -eq $true } catch { $false } }
if (-not (Has 'node')) {
  Write-Host 'Node.js를 설치합니다(winget)...'
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (Has 'node')) { throw 'Node.js 설치 뒤 PowerShell을 새로 열고 이 스크립트를 다시 실행해 주세요.' }
}
Write-Host "Node $(node -v)"
npm ci --omit=dev --ignore-scripts

$task = 'PuyoPuyoServer'
Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue      # 예전에 켜 둔 것이 있으면 먼저 멈춤
# 포트를 다른 프로그램(예: 다른 웹사이트)이 쓰고 있으면 멈춤 — 그 서비스를 터널로 잘못 공개하지 않게
$own = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($own) {
  $who = (Get-Process -Id $own.OwningProcess -ErrorAction SilentlyContinue).ProcessName
  throw "포트 $Port 를 이미 '$who' 가 쓰고 있어요. -Port 로 다른 번호(예: 38302)를 정해 다시 실행하세요."
}

# 서버 자동 시작: 이 PC에 로그인할 때마다, 멈추면 다시 켬(run-server.ps1이 알아서 재시작)
$act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$root\deploy\windows\run-server.ps1`" -Port $Port" -WorkingDirectory $root
$trg = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $task -Action $act -Trigger $trg -Settings $set -User $env:USERNAME -RunLevel Limited -Force | Out-Null
Start-ScheduledTask -TaskName $task
Write-Host "서버를 켰습니다(작업 스케줄러: $task). 로그인할 때마다 자동으로 켜져요."

# 서버가 떴는지 확인: 우리 서버만 {"ok":true} 로 답함(다른 프로그램의 화면이면 실패로 봄)
$ok = $false
for ($i = 0; $i -lt 25 -and -not $ok; $i++) { Start-Sleep -Seconds 1; $ok = Health }
if (-not $ok) { throw "서버가 켜지지 않았어요. data\server.log 를 확인하거나 deploy\windows\run-server.ps1 -Port $Port 를 직접 실행해 보세요." }
Write-Host "OK: http://127.0.0.1:$Port/health"

# HTTPS 공개(Cloudflare Tunnel)
if (Get-Service cloudflared -ErrorAction SilentlyContinue) {
  Write-Host 'cloudflared 서비스가 이미 있어요(토큰 설치는 건너뜀).'
} elseif ($TunnelToken) {
  if (-not (Has 'cloudflared')) {
    winget install -e --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  }
  cloudflared service install $TunnelToken
  Write-Host 'cloudflared 서비스를 설치했어요.'
} else {
  Write-Host '터널 토큰 없이 설치했어요. 바깥 공개는 docs/SERVER.md의 A(터널) 또는 B(포트포워딩)를 따라 주세요.'
}
Write-Host ''
Write-Host "★ Cloudflare 터널의 Public Hostname(puyo.zlero.xyz) 서비스 주소가  HTTP · localhost:$Port  인지 꼭 확인하세요. 다른 번호면 다른 프로그램이 공개돼요."
