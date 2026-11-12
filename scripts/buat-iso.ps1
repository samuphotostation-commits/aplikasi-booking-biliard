# Membuat berkas ISO dari folder, memakai IMAPI2 bawaan Windows (tanpa aplikasi tambahan).
#   powershell -ExecutionPolicy Bypass -File scripts\buat-iso.ps1 -Sumber release\iso-isi -Hasil release\SPL-Kasir-1.1.0.iso -Label SPL_KASIR
param(
  [Parameter(Mandatory = $true)][string]$Sumber,
  [Parameter(Mandatory = $true)][string]$Hasil,
  [string]$Label = "SPL_KASIR"
)
$ErrorActionPreference = "Stop"

if (-not ("IsoTulis" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices.ComTypes;
public static class IsoTulis {
  public static void Simpan(object aliran, string berkas) {
    IStream s = (IStream)aliran;
    using (FileStream f = File.Create(berkas)) {
      byte[] buf = new byte[1 << 20];
      IntPtr baca = System.Runtime.InteropServices.Marshal.AllocHGlobal(4);
      try {
        while (true) {
          s.Read(buf, buf.Length, baca);
          int n = System.Runtime.InteropServices.Marshal.ReadInt32(baca);
          if (n <= 0) break;
          f.Write(buf, 0, n);
        }
      } finally { System.Runtime.InteropServices.Marshal.FreeHGlobal(baca); }
    }
  }
}
"@
}

$fs = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
$fs.FileSystemsToCreate = 3          # ISO9660 + Joliet (nama panjang terbaca di Windows)
$fs.VolumeName = $Label
$fs.FreeMediaBlocks = 0              # tanpa batas ukuran keping
$fs.Root.AddTree((Resolve-Path $Sumber).Path, $false)
$img = $fs.CreateResultImage()
$tujuan = Join-Path (Resolve-Path (Split-Path $Hasil -Parent)).Path (Split-Path $Hasil -Leaf)
[IsoTulis]::Simpan($img.ImageStream, $tujuan)
Write-Output ("ISO siap: " + $tujuan + " (" + [math]::Round((Get-Item $tujuan).Length / 1MB, 1) + " MB)")
