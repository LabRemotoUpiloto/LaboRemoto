# Captura UNA ventana (no el escritorio entero) a un PNG, aunque otra ventana la tape.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/capturar-ventana.ps1 `
#       -Titulo "Laboratorio remoto Unipiloto" -Salida ../docs/imagenes/terminal.png
#
# Usa PrintWindow: le pide a la propia ventana que se dibuje, asi que NO copia lo que haya encima en la pantalla
# (una version anterior copiaba pixeles del escritorio y, con otra ventana delante, fotografiaba esa otra).
# Revisa cada captura antes de subirla: puede mostrar nombres, correos, direcciones IP o texto de la terminal.
# (Archivo en ASCII a proposito: Windows PowerShell 5 lee mal los acentos de un UTF-8 sin BOM.)

param(
    [string]$Titulo = 'Laboratorio remoto Unipiloto',
    [Parameter(Mandatory = $true)][string]$Salida
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Ventana {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
}
"@

[void][Ventana]::SetProcessDPIAware()

$proceso = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$Titulo*" } | Select-Object -First 1
if (-not $proceso) {
    Write-Error "No hay ninguna ventana con '$Titulo' en el titulo."
    exit 1
}

$h = $proceso.MainWindowHandle
if ([Ventana]::IsIconic($h)) {
    # Minimizada: no se puede dibujar. Se restaura SIN pedir el foco y se espera a que pinte.
    [void][Ventana]::ShowWindow($h, 4)   # SW_SHOWNOACTIVATE
    Start-Sleep -Milliseconds 800
}

# Rectangulo completo de la ventana (con los bordes invisibles) y rectangulo visible (sin sombra)
$total = New-Object Ventana+RECT
[void][Ventana]::GetWindowRect($h, [ref]$total)
$visible = New-Object Ventana+RECT
[void][Ventana]::DwmGetWindowAttribute($h, 9, [ref]$visible, [System.Runtime.InteropServices.Marshal]::SizeOf($visible))

$anchoTotal = $total.Right - $total.Left
$altoTotal = $total.Bottom - $total.Top
$bmp = New-Object System.Drawing.Bitmap $anchoTotal, $altoTotal
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
# 2 = PW_RENDERFULLCONTENT: incluye el contenido de WebView2 / composicion de DWM
$ok = [Ventana]::PrintWindow($h, $hdc, 2)
$g.ReleaseHdc($hdc)
$g.Dispose()
if (-not $ok) {
    $bmp.Dispose()
    Write-Error 'PrintWindow no pudo dibujar la ventana.'
    exit 2
}

# Recortar a la parte visible
$x = $visible.Left - $total.Left
$y = $visible.Top - $total.Top
$ancho = $visible.Right - $visible.Left
$alto = $visible.Bottom - $visible.Top
$rect = New-Object System.Drawing.Rectangle $x, $y, $ancho, $alto
$recorte = $bmp.Clone($rect, $bmp.PixelFormat)
$bmp.Dispose()

$carpeta = Split-Path -Parent $Salida
if ($carpeta -and -not (Test-Path $carpeta)) { New-Item -ItemType Directory -Path $carpeta | Out-Null }
$recorte.Save($Salida, [System.Drawing.Imaging.ImageFormat]::Png)
$recorte.Dispose()
Write-Output ("Guardada {0} ({1}x{2}) - ventana: {3}" -f $Salida, $ancho, $alto, $proceso.MainWindowTitle)
