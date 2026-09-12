Add-Type -AssemblyName System.Net.WebSockets.Client

$PageId = "7CEA995F4BEE1AA1CC20C95B3FEAAE6E"
$WsUrl = "ws://localhost:9222/devtools/page/$PageId"

Write-Host "=== CDP Check ===" -ForegroundColor Cyan

# Get fresh page info
Write-Host "`n--- Page Info ---"
$tabs = Invoke-RestMethod -Uri "http://localhost:9222/json" -TimeoutSec 3
$page = $tabs | Where-Object { $_.url -like "*14065*" }
if ($page) {
    Write-Host "Page: $($page.title)"
    Write-Host "URL: $($page.url)"
    $PageId = $page.id
    $WsUrl = $page.webSocketDebuggerUrl
}

# Connect
Write-Host "`n--- Connecting ---"
$ws = New-Object System.Net.WebSockets.ClientWebSocket
$token = [Threading.CancellationToken]::None
$connectTask = $ws.ConnectAsync([Uri]"$WsUrl", $token)
$connectTask.Wait(5000) | Out-Null
if (-not $connectTask.IsCompleted) {
    Write-Host "Connect FAILED"; exit 1
}
Write-Host "Connected!"

function Send-Cdp {
    param($Method, $Params, $TimeoutMs = 8000)
    $id = Get-Random
    $json = @{ id = $id; method = $Method; params = $Params } | ConvertTo-Json -Depth 10
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $seg = New-Object System.ArraySegment`1[Byte](@($bytes), 0, $bytes.Length)
    $sendTask = $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, [System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, $token)
    $sendTask.Wait(3000) | Out-Null
    $buf = New-Object byte[](65536)
    $recvTask = $ws.ReceiveAsync([Ref]$buf, $token)
    $recvTask.Wait($TimeoutMs) | Out-Null
    if (-not $recvTask.IsCompleted) {
        Write-Host "  [TIMEOUT $Method]"
        return $null
    }
    $r = $recvTask.Result
    if ($r.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
        Write-Host "  [WS Closed]"
        return $null
    }
    $str = [Text.Encoding]::UTF8.GetString($buf, 0, $r.Count)
    try { return $str | ConvertFrom-Json }
    catch { Write-Host "  [Parse error: $($_.Message)]"; return $null }
}

# Test
Write-Host "`n--- Test: title ---"
$r = Send-Cdp -Method "Runtime.evaluate" -Params @{ expression = 'document.title'; returnByValue = $true }
if ($r) { Write-Host "Title: $($r.result.result)" }

# Spine state
Write-Host "`n--- Spine State ---"
$expr = '(function(){var r={};r.spineElExists=!!window.spineEl;r.spineElType=typeof window.spineEl;r.spineDesktopExists=!!document.querySelector("#spine-desktop");r.spineDesktopNode=document.querySelector("#spine-desktop")?"found":"not found";r.getCurrentAnim=typeof window.getCurrentAnimation==="function"?window.getCurrentAnimation():"N/A";r.currentBg=window.currentBg||"undefined";r.isLoading=window.isLoading;r.containerDisplay=document.querySelector("#spine-desktop")?document.querySelector("#spine-desktop").style.display:"none";r.containerChildren=document.querySelector("#spine-desktop")?document.querySelector("#spine-desktop").children.length:0;r.hasSpinePlayer=document.querySelector("spine-player")?"yes":"no";return JSON.stringify(r,null,2);})()'
$cr = Send-Cdp -Method "Runtime.evaluate" -Params @{ expression = $expr; returnByValue = $true }
if ($cr) { Write-Host $cr.result.result }

# Console
Write-Host "`n--- Console Messages ---"
Send-Cdp -Method "Runtime.enable" -Params @{} | Out-Null
Start-Sleep -Milliseconds 200
$logs = Send-Cdp -Method "Runtime.getConsoleMessages" -Params @{}
if ($logs) {
    $msgs = $logs.result.messages
    Write-Host "Total: $($msgs.Count)"
    $msgs[-15..-1] | ForEach-Object {
        $args = ($_.args | ForEach-Object { $_.value -or $_.description }) -join " "
        Write-Host "  [$($_.type)] $args"
    }
}

# Network
Write-Host "`n--- Spine Network ---"
$expr2 = '(function(){var perf=performance.getEntriesByType("resource");var sp=perf.filter(function(e){return e.name.includes("spine")||e.name.includes("skel")||e.name.includes("atlas")||e.name.includes("player");});return JSON.stringify({spineRequests:sp.map(function(e){return{name:e.name.split("/").pop(),status:e.transferSize>0?"loaded("+e.transferSize+"b)":"failed"};}),totalResources:perf.length,spineResourceCount:sp.length});})()'
$nr = Send-Cdp -Method "Runtime.evaluate" -Params @{ expression = $expr2; returnByValue = $true }
if ($nr) { Write-Host $nr.result.result }

# Screenshot
Write-Host "`n--- Screenshot ---"
$sr = Send-Cdp -Method "Page.captureScreenshot" -Params @{ format = "png" } -TimeoutMs 15000
if ($sr -and $sr.result.data) {
    $data = [Convert]::FromBase64String($sr.result.data)
    $path = "C:\Users\Administrator\Documents\trae_projects\new\screenshot1.png"
    [IO.File]::WriteAllBytes($path, $data)
    Write-Host "OK: Screenshot saved to $path"
} else {
    Write-Host "Screenshot failed"
}

$ws.Dispose()
Write-Host "`n=== Done ==="
