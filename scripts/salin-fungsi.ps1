# Menyalin isi bundel Edge Function ke papan klip, supaya bisa ditempel ke
# editor Edge Functions di dashboard Supabase tanpa membuka berkas 100 KB
# itu satu per satu.
#
#   powershell -ExecutionPolicy Bypass -File scripts\salin-fungsi.ps1 terbit
#
# Cara yang lebih dapat diandalkan tetap lewat CLI (npm run pasang-fungsi),
# tapi itu menuntut `npx supabase login` lebih dulu.

param([string]$Nama = "terbit")

$akar = Split-Path -Parent $PSScriptRoot
$berkas = Join-Path $akar ("supabase\functions\" + $Nama + "\index.ts")

if (-not (Test-Path $berkas)) {
  Write-Host ("Tidak ada berkas: " + $berkas)
  exit 1
}

$isi = Get-Content -Raw -Encoding UTF8 $berkas
Set-Clipboard -Value $isi
$kb = [math]::Round((Get-Item $berkas).Length / 1KB)
Write-Host ("Disalin ke papan klip: " + $berkas + " (" + $kb + " KB, " + $isi.Length + " karakter)")
