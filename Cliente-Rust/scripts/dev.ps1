param()

function Cleanup {
    Write-Host "`nCleaning up processes..." -ForegroundColor Yellow
    $ports = @(5174, 1420, 8787)
    foreach ($port in $ports) {
        Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | ForEach-Object {
            try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*vite*" } | Stop-Process -Force -ErrorAction SilentlyContinue
}

Cleanup

Write-Host "Starting Tauri dev..." -ForegroundColor Cyan
try {
    Push-Location backend
    cargo tauri dev
} finally {
    Pop-Location
    Cleanup
}
