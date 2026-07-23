# =====================================================
# スマホ（同じWi-Fi）からアクセスするための初回設定
#   管理者PowerShellで1回だけ実行する:
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\setup-smartphone.ps1
# =====================================================
param([int]$Port = 5959)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "管理者権限が必要です。PowerShellを「管理者として実行」して再度実行してください。" -ForegroundColor Red
  exit 1
}

# 1) http://+:PORT/ を非管理者ユーザーでも待ち受けられるようにする
Write-Host "URL予約を登録中 (http://+:$Port/) ..." -ForegroundColor Cyan
$user = "$env:USERDOMAIN\$env:USERNAME"
netsh http delete urlacl url="http://+:$Port/" | Out-Null
netsh http add urlacl url="http://+:$Port/" user="$user"

# 2) ファイアウォールで受信を許可
$ruleName = "Gourmet App Server ($Port)"
Write-Host "ファイアウォール規則を登録中 ($ruleName) ..." -ForegroundColor Cyan
try { Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction Stop } catch { }
New-NetFirewallRule -DisplayName $ruleName `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port `
  -Profile Private | Out-Null

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Sort-Object -Property InterfaceMetric | Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "設定完了。server.ps1 を起動し直してください。" -ForegroundColor Green
if ($ip) { Write-Host "スマホ（同じWi-Fi）で開くURL: http://${ip}:$Port/" -ForegroundColor Cyan }
