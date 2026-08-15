# PowerShell static server (no Node/Python required).
# Usage:  powershell -ExecutionPolicy Bypass -File .\serve.ps1 [-Port 8765]
# Then open the printed URL in your browser.
#
# Besides serving static files, it provides a /proxy?url=<encoded> route that
# fetches a remote URL server-side and returns it same-origin. This bypasses
# browser CORS/ORB restrictions for environments where direct cross-origin
# requests are blocked. (Used automatically by js/jsonp.js as a fallback.)
#
# If the requested port is busy (e.g. a previous instance left a ghost
# http.sys listener), the script automatically tries the next few ports.
param(
  [int]$Port = 8765
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Start-Listener([int]$p) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  $l.Start()
  return $l
}

$listener = $null
$chosenPort = $Port
$maxTries = 10
for ($i = 0; $i -lt $maxTries; $i++) {
  $tryPort = $Port + $i
  try {
    $listener = Start-Listener $tryPort
    $chosenPort = $tryPort
    break
  } catch {
    Write-Host "Port $tryPort unavailable ($($_.Exception.Message.Trim())). Trying next..." -ForegroundColor Yellow
  }
}
if (-not $listener) {
  Write-Host "Could not bind to any port in range $Port..$($Port + $maxTries - 1). Aborting." -ForegroundColor Red
  exit 1
}

Write-Host "Serving $root" -ForegroundColor Green
Write-Host "Open http://localhost:$chosenPort/ in your browser." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $resp = $ctx.Response
    $p = $req.Url.AbsolutePath

    # ---- /proxy?url=<remote> ----
    if ($p -like '/proxy') {
      $target = $req.QueryString['url']
      if ($target) {
        try {
          $pr = Invoke-WebRequest -Uri $target -UseBasicParsing -TimeoutSec 15
          $bytes = $pr.RawContentStream.ToArray()
          $resp.ContentType = 'application/json; charset=utf-8'
          $resp.Headers.Add('Access-Control-Allow-Origin', '*')
          $resp.ContentLength64 = $bytes.Length
          $resp.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
          $resp.StatusCode = 502
          $b = [System.Text.Encoding]::UTF8.GetBytes('proxy error')
          $resp.OutputStream.Write($b, 0, $b.Length)
        }
      } else {
        $resp.StatusCode = 400
      }
      $resp.Close()
      continue
    }

    # ---- static file ----
    if ($p -eq '/') { $p = '/index.html' }
    $f = Join-Path $root ($p.TrimStart('/').Replace('/', '\'))
    if (Test-Path -LiteralPath $f -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($f)
      $ext = [System.IO.Path]::GetExtension($f).ToLower()
      $ct = switch ($ext) { '.html' {'text/html; charset=utf-8'} '.js' {'application/javascript; charset=utf-8'} '.css' {'text/css; charset=utf-8'} default {'application/octet-stream'} }
      $resp.ContentType = $ct
      $resp.ContentLength64 = $bytes.Length
      $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $resp.StatusCode = 404
      $b = [System.Text.Encoding]::UTF8.GetBytes('404 not found')
      $resp.OutputStream.Write($b, 0, $b.Length)
    }
    $resp.Close()
  } catch {
    Start-Sleep -Milliseconds 100
  }
}
