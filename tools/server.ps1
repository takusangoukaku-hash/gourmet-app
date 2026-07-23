# =====================================================
# グルメ記録アプリ用 簡易静的ファイルサーバー
#   Node.js / Python 不要。PowerShell の HttpListener のみで動作。
#   使い方: powershell -NoProfile -ExecutionPolicy Bypass -File tools\server.ps1
# =====================================================
param(
  [int]$Port = 5959,
  [string]$Root = (Split-Path $PSScriptRoot -Parent)
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Root)) {
  Write-Host "公開フォルダが見つかりません: $Root" -ForegroundColor Red
  exit 1
}
$Root = (Resolve-Path $Root).Path

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.webp' = 'image/webp'
  '.ico'  = 'image/x-icon'
  '.txt'  = 'text/plain; charset=utf-8'
}

# LAN 全体で待ち受け(+)を試し、権限が無ければ localhost のみにフォールバック
$listener = New-Object System.Net.HttpListener
$lanOk = $true
try {
  $listener.Prefixes.Add("http://+:$Port/")
  $listener.Start()
} catch {
  $lanOk = $false
  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Add("http://localhost:$Port/")
  try {
    $listener.Start()
  } catch {
    Write-Host "ポート $Port を開けませんでした。既にサーバーが起動している可能性があります。" -ForegroundColor Red
    exit 1
  }
}

$lanIp = $null
try {
  $lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Sort-Object -Property InterfaceMetric |
    Select-Object -First 1).IPAddress
} catch { }

Write-Host ""
Write-Host "  グルメ記録アプリ サーバー起動" -ForegroundColor Green
Write-Host "  Root:      $Root"
Write-Host "  Local URL: http://localhost:$Port/" -ForegroundColor Cyan
if ($lanOk -and $lanIp) {
  Write-Host "  Phone URL: http://${lanIp}:$Port/" -ForegroundColor Cyan
} elseif (-not $lanOk) {
  Write-Host "  (LAN公開なし: スマホから使うには管理者PowerShellで setup-smartphone.ps1 を実行)" -ForegroundColor DarkYellow
}
Write-Host "  停止するには Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
      $rel = $rel -replace '/', '\'
      # .git など隠しフォルダは配信しない（LAN公開時の情報漏れ防止）
      if (($rel -split '\\') | Where-Object { $_.StartsWith('.') }) {
        $res.StatusCode = 403
        $res.Close()
        continue
      }
      $path = Join-Path $Root $rel

      # ディレクトリトラバーサル対策: 公開フォルダの外は拒否
      $full = [System.IO.Path]::GetFullPath($path)
      if (-not $full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
        $res.StatusCode = 403
        $res.Close()
        continue
      }
      if ((Test-Path $full) -and (Get-Item $full).PSIsContainer) {
        $full = Join-Path $full 'index.html'
      }

      if (Test-Path $full -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        # 編集がすぐ反映されるようキャッシュ無効化
        $res.Headers.Add('Cache-Control', 'no-store, no-cache, must-revalidate')
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        $res.StatusCode = 200
      } else {
        $body = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
        $res.StatusCode = 404
        $res.ContentType = 'text/plain; charset=utf-8'
        $res.ContentLength64 = $body.Length
        $res.OutputStream.Write($body, 0, $body.Length)
      }
      Write-Host ("  {0} {1} -> {2}" -f $req.HttpMethod, $req.Url.AbsolutePath, $res.StatusCode) -ForegroundColor DarkGray
    } catch {
      try { $res.StatusCode = 500 } catch { }
    } finally {
      try { $res.Close() } catch { }
    }
  }
} finally {
  try { $listener.Stop(); $listener.Close() } catch { }
}
