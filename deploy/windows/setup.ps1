# 내 Windows PC에 서버를 한 번에 설치하기 (관리자 PowerShell에서 한 번만 실행)
#   cd 저장소폴더
#   powershell -ExecutionPolicy Bypass -File deploy\windows\setup.ps1 -TunnelToken "<Cloudflare 터널 토큰>"
# 하는 일: Node.js 설치 확인 → 서버 의존성 설치 → 로그인할 때마다 서버 자동 시작(작업 스케줄러) → (토큰을 줬다면) cloudflared를 서비스로 설치해 https://puyo.zlero.xyz 로 공개
#Requires -RunAsAdministrator
param([string]$TunnelToken = '')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root

function Has($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
if (-not (Has 'node')) {
  Write-Host 'Node.js를 설치합니다(winget)...'
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (Has 'node')) { throw 'Node.js 설치 뒤 PowerShell을 새로 열고 이 스크립트를 다시 실행해 주세요.' }
}
Write-Host "Node $(node -v)"
npm ci --omit=dev --ignore-scripts

# 서버 자동 시작: 이 PC에 로그인할 때마다, 멈추면 다시 켬(run-server.ps1이 알아서 재시작)
$task = 'PuyoPuyoServer'
$act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$root\deploy\windows\run-server.ps1`"" -WorkingDirectory $root
$trg = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $task -Action $act -Trigger $trg -Settings $set -User $env:USERNAME -RunLevel Limited -Force | Out-Null
Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName $task
Write-Host "서버를 켰습니다(작업 스케줄러: $task). 로그인할 때마다 자동으로 켜져요."

# 서버가 떴는지 확인
$ok = $false
for ($i = 0; $i -lt 20 -and -not $ok; $i++) { Start-Sleep -Seconds 1; try { $ok = (Invoke-RestMethod http://127.0.0.1:3000/health).ok } catch {} }
if (-not $ok) { throw '서버가 켜지지 않았어요. deploy\windows\run-server.ps1 을 직접 실행해서 오류를 확인해 주세요.' }
Write-Host 'OK: http://127.0.0.1:3000/health'

# HTTPS 공개(Cloudflare Tunnel): 터널 토큰이 있으면 cloudflared를 윈도우 서비스로 설치
if ($TunnelToken) {
  if (-not (Has 'cloudflared')) {
    winget install -e --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  }
  cloudflared service install $TunnelToken
  Write-Host 'cloudflared 서비스를 설치했어요. 잠시 뒤 https://puyo.zlero.xyz/health 를 폰 데이터에서 열어 보세요.'
} else {
  Write-Host '터널 토큰 없이 설치했어요. 바깥 공개는 docs/SERVER.md의 A(터널) 또는 B(포트포워딩)를 따라 주세요.'
}
