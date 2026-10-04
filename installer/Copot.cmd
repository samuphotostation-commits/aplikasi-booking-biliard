@echo off
chcp 65001 >nul
setlocal
set "TUJUAN=%LOCALAPPDATA%\SPL Kasir"
echo   Menutup aplikasi bila sedang terbuka...
taskkill /IM "SPL Kasir.exe" /F >nul 2>&1
echo   Menghapus %TUJUAN% ...
rmdir /S /Q "%TUJUAN%" 2>nul
del "%USERPROFILE%\Desktop\SPL Kasir.lnk" 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\SPL Kasir.lnk" 2>nul
echo   SPL Kasir sudah dicopot. Data venue tetap aman di server.
pause
