@echo off
chcp 65001 >nul
setlocal
set "TUJUAN=%LOCALAPPDATA%\SPL Kasir"

echo.
echo   Memasang SPL Kasir ke:
echo   %TUJUAN%
echo.

robocopy "%~dp0." "%TUJUAN%" /E /NFL /NDL /NJH /NJS /NP /XF Pasang.cmd Copot.cmd >nul
if %ERRORLEVEL% GEQ 8 (
  echo   GAGAL menyalin berkas. Coba klik kanan berkas ini lalu "Run as administrator".
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$w = New-Object -ComObject WScript.Shell;" ^
  "$exe = Join-Path $env:LOCALAPPDATA 'SPL Kasir\SPL Kasir.exe';" ^
  "foreach ($folder in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) {" ^
  "  $s = $w.CreateShortcut((Join-Path $folder 'SPL Kasir.lnk'));" ^
  "  $s.TargetPath = $exe; $s.WorkingDirectory = (Split-Path $exe); $s.Description = 'Panel kasir SPL Sports Pool Lounge'; $s.Save() }"

echo   Selesai. Ikon "SPL Kasir" sudah ada di Desktop dan Start Menu.
echo   Membuka aplikasinya...
start "" "%TUJUAN%\SPL Kasir.exe"
timeout /t 3 >nul
