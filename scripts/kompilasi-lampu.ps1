# Memasang core ESP32 lalu MENGOMPILASI firmware lampu meja.
#
# Dipakai untuk membuktikan firmware benar-benar bisa di-build sebelum
# di-upload ke alat, bukan hanya "kelihatannya benar".
#
#   powershell -ExecutionPolicy Bypass -File scripts\kompilasi-lampu.ps1
#
# Unduhan core ESP32 besar (ratusan MB) dan hanya sekali per komputer.
# Sesudah ini, Arduino IDE di komputer yang sama juga sudah punya core-nya.
#
# CATATAN: berkas ini sengaja memakai ASCII saja. Windows PowerShell 5.1
# membaca .ps1 sebagai ANSI, jadi satu tanda pisah panjang pun membuat
# seluruh skrip gagal diurai.

$ErrorActionPreference = "Continue"

$akar = Split-Path -Parent $PSScriptRoot
$sketsa = Join-Path $akar "perangkat\lampu-esp32"
$log = Join-Path $akar "release\kompilasi-lampu.log"
New-Item -ItemType Directory -Force (Split-Path -Parent $log) | Out-Null

function Catat($teks) {
  $baris = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $teks
  Write-Host $baris
  Add-Content -Path $log -Value $baris -Encoding utf8
}

# arduino-cli baru dipasang: shell yang sedang jalan belum tentu melihat PATH-nya.
$cli = $null
$ada = Get-Command "arduino-cli" -ErrorAction SilentlyContinue
if ($ada) { $cli = $ada.Source }
if (-not $cli) {
  $kandidat = @(
    (Join-Path $env:ProgramFiles "Arduino CLI\arduino-cli.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Arduino CLI\arduino-cli.exe"),
    (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\arduino-cli.exe")
  )
  foreach ($k in $kandidat) { if (Test-Path $k) { $cli = $k; break } }
}
if (-not $cli) {
  Catat "GAGAL: arduino-cli tidak ditemukan. Jalankan dulu: winget install ArduinoSA.CLI"
  exit 1
}
Catat ("arduino-cli: " + $cli)

$URL = "https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json"

Catat "Menyiapkan arduino-cli..."
& $cli config init --overwrite 2>&1 | Tee-Object -Append -FilePath $log
& $cli config set board_manager.additional_urls $URL 2>&1 | Tee-Object -Append -FilePath $log

Catat "Mengambil daftar board (butuh internet)..."
& $cli core update-index 2>&1 | Tee-Object -Append -FilePath $log

# Unduhan toolchain-nya ratusan MB dan diambil dari GitHub. Di koneksi yang
# tidak stabil, sambungannya sering diputus di tengah jalan ("An existing
# connection was forcibly closed"). Sekali gagal bukan berarti tidak bisa,
# jadi dicoba lagi beberapa kali sebelum menyerah.
$MAKS = 10
for ($n = 1; $n -le $MAKS; $n++) {
  Catat ("Memasang core esp32, percobaan {0} dari {1}. INI UNDUHAN BESAR, bisa lama." -f $n, $MAKS)
  & $cli core install esp32:esp32 2>&1 | Tee-Object -Append -FilePath $log
  $terpasang = & $cli core list 2>&1 | Select-String "esp32:esp32"
  if ($terpasang) { Catat "Core esp32 terpasang."; break }
  if ($n -lt $MAKS) { Catat "Gagal, mencoba lagi 10 detik lagi..."; Start-Sleep -Seconds 10 }
}

Catat "Core yang terpasang:"
& $cli core list 2>&1 | Tee-Object -Append -FilePath $log

Catat "Mengompilasi firmware lampu untuk ESP32-S3..."
& $cli compile --fqbn esp32:esp32:esp32s3 $sketsa 2>&1 | Tee-Object -Append -FilePath $log
$kode = $LASTEXITCODE

if ($kode -eq 0) {
  Catat "BERHASIL. Firmware bisa dikompilasi dan siap di-upload."
} else {
  Catat ("GAGAL KOMPILASI, kode {0}. Lihat pesan di atas." -f $kode)
}
Catat ("Catatan lengkap: " + $log)
exit $kode
