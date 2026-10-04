> **LAMPIRAN TEKNIS — bukan dokumen keputusan.**
> Jika isi berkas ini bertentangan dengan `PRD-SPL-BOOKING.md`, **PRD master yang menang.**
> Registri Keputusan Kanonik (§4) dan Konstanta Global (§5) di PRD master mengesampingkan angka apa pun di sini.

## 5. Dashboard Keuangan, Laporan & Rekonsiliasi

### 5.0 Ringkasan Keputusan Seksi Ini

| # | Keputusan | Pilihan | Alasan singkat |
|---|---|---|---|
| F-D01 | Sumber kebenaran laporan | **`revenue_ledger`** (append-only), bukan `SUM(bookings.total_amount)` | Refund parsial, MDR, dan diskon tidak terwakili di tabel booking |
| F-D02 | Pemisahan lima lapis uang | Gross / Pajak / Service charge / MDR / Net — **lima kolom independen**, bukan satu `amount` | Mencampurnya membuat owner salah baca untung (lihat §5.1) |
| F-D03 | Batas hari laporan | `business_date` generated dengan potong **02:00 WIB** | Sesi 00:30 milik hari operasional sebelumnya |
| F-D04 | Basis waktu laporan | **Dua view terpisah**: basis tanggal transaksi & basis tanggal settlement | Analisis penjualan ≠ rekonsiliasi bank |
| F-D05 | Tipe data uang | `integer` Rupiah penuh (tanpa sen) | Tidak pernah `float`; `numeric(14,2)` hanya untuk parsing `gross_amount` Midtrans |
| F-D06 | Rekonsiliasi MVP | **Manual-assisted**: upload CSV settlement gateway + mutasi rekening, sistem yang mencocokkan | Iris/Payout API otomatis = Fase 3 (sejalan FIN-11) |
| F-D07 | Utilisasi meja | Penyebut = **jam-meja tersedia**, bukan 24 jam × jumlah meja | Angka 24 jam membuat utilisasi selalu terlihat buruk dan tidak bisa ditindaklanjuti |

---

### 5.1 Prinsip Akuntansi Ringan — Lima Lapis Uang yang Haram Dicampur

Ini bagian yang menentukan apakah owner percaya pada dashboard-nya sendiri setelah bulan pertama. Satu transaksi pelanggan menghasilkan **satu angka yang dilihat pelanggan** dan **lima angka berbeda yang harus dilihat owner**.

#### 5.1.1 Anatomi satu transaksi

Contoh konkret: booking 2 jam prime weekend + satu platter smokehouse. Harga tayang **tax-inclusive** (keputusan TAX-03 dari riset operasional).

| Lapis | Nama | Nilai | Sifat | Milik siapa |
|---|---|---|---|---|
| (a) | **GROSS** — yang dibayar pelanggan | Rp 200.000 | Uang yang keluar dari dompet pelanggan | Belum tentu milik venue |
| (d) | **PAJAK dipungut** (PBJT/PB1) | Rp 18.182 | **Titipan**. Venue hanya memungut & menyetor ke Pemda | **Pemerintah Daerah** |
| (e) | **SERVICE CHARGE** (jika ada) | Rp 0 (ASUMSI belum diterapkan) | Pendapatan venue **atau** dana tip staf, tergantung kebijakan | Venue / staf |
| — | **DPP (Dasar Pengenaan Pajak)** | Rp 181.818 | Nilai jual sesungguhnya | Venue |
| (b) | **MDR gateway** | Rp 1.400 (0,7%) | **Beban**, dipotong otomatis oleh gateway | Midtrans |
| (c) | **NET settlement** — yang masuk rekening | Rp 198.600 | Uang riil yang mendarat di bank, T+2/T+3 | Venue (tapi masih mengandung titipan pajak) |
| — | **Pendapatan Bersih Venue** | Rp 180.418 | Yang benar-benar boleh dianggap penghasilan | Venue |

Perhatikan: **NET settlement (Rp 198.600) BUKAN pendapatan venue.** Di dalamnya masih ada Rp 18.182 titipan pajak yang wajib disetor ke Bapenda. Ini jebakan nomor satu.

#### 5.1.2 Rumus rantai penuh

```
GROSS                         = harga tayang yang dibayar pelanggan
DPP                           = GROSS / (1 + tarif_pajak)          [jika tax-inclusive]
PAJAK_DIPUNGUT                = GROSS − DPP
MDR                           = GROSS × tarif_mdr
NET_SETTLEMENT                = GROSS − MDR                        [yang masuk rekening]
PENDAPATAN_BERSIH_VENUE       = DPP − MDR                          [= NET − PAJAK]
```

Verifikasi angka di atas: `181.818 − 1.400 = 180.418` dan `198.600 − 18.182 = 180.418`. Cocok. **Kalau dua jalur perhitungan ini tidak menghasilkan angka yang sama, ada bug — sistem harus punya assertion untuk ini.**

#### 5.1.3 Kenapa mencampur kelimanya fatal

Empat mode kegagalan nyata, masing-masing pernah membunuh kepercayaan owner pada sistemnya:

| ID | Kesalahan | Yang terjadi di kepala owner | Kerugian nyata |
|---|---|---|---|
| ERR-01 | **Menampilkan GROSS sebagai "Omzet"** tanpa baris pajak | "Bulan ini saya dapat Rp 157 juta." Padahal Rp 14,3 juta milik Pemda. | Owner membelanjakan uang pajak. Saat SPTPD jatuh tempo, kas tidak cukup. Ini penyebab tunggakan pajak daerah paling umum di UMKM F&B. |
| ERR-02 | **Menampilkan NET settlement sebagai "Pendapatan"** | "Untung saya Rp 155,9 juta." Padahal pajak belum dikeluarkan. | Sama seperti ERR-01, hanya lebih halus karena angkanya sudah dikurangi MDR sehingga terasa "sudah bersih". |
| ERR-03 | **MDR tidak dicatat sebagai beban** | Buku selisih Rp 1,1 juta/bulan dengan mutasi rekening, tanpa penjelasan. | Owner menyimpulkan "sistemnya salah hitung" dan berhenti memakainya dalam 30 hari. Ini kematian produk. |
| ERR-04 | **Service charge dianggap pendapatan padahal dijanjikan ke staf** | Margin terlihat lebih tinggi dari sebenarnya. | Saat bagi hasil service charge dibayarkan, laba anjlok tiba-tiba dan owner tidak tahu dari mana. |
| ERR-05 | **Mencatat pendapatan pada tanggal transaksi tapi mencocokkan dengan bank pada tanggal yang sama** | Selisih T+2/T+3 dibaca sebagai "uang hilang". | Owner menelepon gateway menuduh dana ditahan, padahal itu jadwal settlement normal. |

**Aturan tak bisa ditawar untuk desain UI:** angka besar tunggal di dashboard **dilarang** berlabel "Omzet" atau "Pendapatan" tanpa kualifikasi. Minimal harus ada **tiga angka berdampingan**: Omzet Kotor, Pajak Dipungut (titipan), Pendapatan Bersih Venue.

| ID | Requirement | MoSCoW |
|---|---|---|
| FN-01 | Sistem menyimpan `gross_amount`, `tax_amount`, `service_charge_amount`, `mdr_fee`, `net_amount` sebagai **kolom terpisah** di level transaksi, tidak pernah sebagai satu nilai gabungan | **Must** |
| FN-02 | Dashboard **wajib** menampilkan Omzet Kotor, Pajak Dipungut, dan Pendapatan Bersih Venue **berdampingan** di layar yang sama, tidak pernah salah satu saja | **Must** |
| FN-03 | Pajak yang dipungut ditampilkan dengan label eksplisit **"Titipan Pajak — bukan pendapatan"** dan diberi warna netral (bukan warna pendapatan) | **Must** |
| FN-04 | MDR gateway dicatat sebagai **baris beban** di ledger (`entry_type='gateway_fee'`, `amount` negatif), bukan disembunyikan di selisih | **Must** |
| FN-05 | Assertion harian otomatis: `SUM(dpp) − SUM(mdr) = SUM(net) − SUM(tax)`. Selisih > Rp 0 → alert ke admin | **Should** |
| FN-06 | Service charge (jika nanti diterapkan) punya flag `is_staff_pool` yang menentukan apakah masuk pendapatan venue atau kewajiban ke staf | **Could** (Fase 2) |
| FN-07 | Semua nilai uang bertipe `integer` Rupiah penuh; pembulatan pajak di level **total order**, bukan per item | **Must** |

#### 5.1.4 Struktur `revenue_ledger` yang diperluas

Melanjutkan DDL dari Seksi 4, dengan penambahan yang dibutuhkan seksi ini:

```sql
-- entry_type yang berlaku (lengkap):
--   'sale_table'    : penjualan sesi meja, nilai DPP (positif)
--   'sale_fnb'      : penjualan F&B, nilai DPP (positif)
--   'tax_collected' : pajak dipungut (positif) — LIABILITAS, bukan pendapatan
--   'service_fee'   : service charge (positif)
--   'discount'      : diskon (negatif)
--   'gateway_fee'   : MDR gateway (negatif)
--   'payout_fee'    : biaya pencairan Rp 5.000/transfer (negatif)
--   'refund'        : pengembalian dana (negatif)
--   'adjustment'    : koreksi manual (positif/negatif, wajib memo)

alter table public.revenue_ledger
  add column channel text not null default 'qris_online'
      check (channel in ('qris_online','cash','edc_debit','edc_credit',
                         'qris_static_kasir','transfer','store_credit','void')),
  add column tax_category text
      check (tax_category in ('fnb','entertainment','non_taxable')),
  add column settlement_batch_id text,          -- diisi saat rekonsiliasi
  add column settlement_date     date,          -- tanggal dana efektif masuk rekening
  add column recon_status text not null default 'unmatched'
      check (recon_status in ('unmatched','matched','disputed','written_off'));

create index revenue_ledger_recon_idx
  on public.revenue_ledger (recon_status, settlement_date)
  where recon_status <> 'matched';

create index revenue_ledger_report_idx
  on public.revenue_ledger (business_date, entry_type, channel);
```

**Kenapa `tax_collected` masuk ledger sebagai entri terpisah dan bukan sekadar kolom:** karena tarif PBJT F&B (mis. 10%) dan hiburan (mis. 10%, atau 40% kalau diklasifikasikan bar) bisa **berbeda dan bisa berubah lewat Perda**. Dengan entri terpisah ber-`tax_category`, laporan rekap pajak (FN-38) tinggal `GROUP BY tax_category` tanpa menghitung ulang apa pun. Kalau tarif berubah 1 Januari, transaksi Desember tetap memakai tarif lama karena nilainya sudah tersimpan sebagai angka, bukan dihitung ulang dari persentase.

---

### 5.2 Definisi Metrik — Rumus Presisi

Semua metrik didefinisikan atas **`business_date`** (batas 02:00 WIB) kecuali disebutkan lain, dan dihitung dari `revenue_ledger` kecuali disebutkan lain.

#### 5.2.1 Metrik Uang

| ID | Metrik | Rumus | Catatan penting |
|---|---|---|---|
| M-01 | **Omzet Kotor** (Gross Revenue) | `SUM(gross_amount)` seluruh transaksi berstatus `paid` pada periode | Termasuk pajak. **Bukan** pendapatan. Ini angka "yang dibayar pelanggan". |
| M-02 | **Pajak Dipungut** | `SUM(ledger.amount) WHERE entry_type='tax_collected'` | Liabilitas ke Pemda. Wajib tampil terpisah. |
| M-03 | **Nilai Penjualan (DPP)** | `SUM(amount) WHERE entry_type IN ('sale_table','sale_fnb','service_fee') + SUM(amount) WHERE entry_type='discount'` | Diskon sudah negatif sehingga langsung dijumlahkan |
| M-04 | **Beban Gateway** | `−SUM(amount) WHERE entry_type IN ('gateway_fee','payout_fee')` | Ditampilkan sebagai angka positif berlabel "Beban" |
| M-05 | **Pendapatan Bersih Venue** | `M-03 − M-04 − |SUM(refund)|` | **Ini satu-satunya angka yang boleh disebut "pendapatan"** |
| M-06 | **Net Settlement (dana masuk rekening)** | `M-01 − M-04 − |refund|` | Untuk rekonsiliasi bank. Masih mengandung titipan pajak. |
| M-07 | **Omzet Sewa Meja** | `SUM(amount) WHERE entry_type='sale_table'` | Dipisah dari F&B — ini yang dilakukan Kasirbox dan terbukti dibutuhkan |
| M-08 | **Omzet F&B** | `SUM(amount) WHERE entry_type='sale_fnb'` | |
| M-09 | **Rasio Meja : F&B** | `M-07 : M-08` | Metrik strategis. Kalau F&B < 30% dari total, ada masalah di cross-sell atau menu. |

**Kesalahan yang harus dicegah di level query:** jangan pernah menghitung M-01 dengan `SUM(bookings.total_amount)`. Booking yang di-refund parsial akan tetap terhitung penuh, dan pembayaran cash yang tidak terkait booking (walk-in beli makanan saja) tidak akan terhitung sama sekali.

#### 5.2.2 Metrik Operasional Meja

| ID | Metrik | Rumus | Catatan |
|---|---|---|---|
| M-10 | **Omzet per Meja** | `SUM(sale_table WHERE table_id=X) / 1` per meja per periode | Ranking meja terlaris. Bandingkan antar meja untuk deteksi meja rusak/tidak disukai. |
| M-11 | **Jam-Meja Tersedia** (penyebut utilisasi) | `Σ over hari, over meja: durasi_jam_operasional(hari) − jam_maintenance(meja, hari)` | **Lihat §5.2.3** — ini definisi paling rawan salah |
| M-12 | **Jam-Meja Terjual** | `SUM(EXTRACT(epoch FROM (ends_at − starts_at))/3600) WHERE status IN ('confirmed','seated','completed','no_show')` | `no_show` **dihitung terjual** karena sudah dibayar dan meja memang tidak bisa dijual ulang sebagai booking online |
| M-13 | **Utilisasi Meja (%)** | `M-12 / M-11 × 100` | Target realistis venue biliar: 35–55% keseluruhan; 70%+ di jam prime |
| M-14 | **Utilisasi per Slot Jam** | `M-12(jam h) / M-11(jam h) × 100` | Input untuk heatmap. **Ini metrik yang menghasilkan uang** — dasar keputusan happy hour. |
| M-15 | **Rata-rata Durasi Sesi** | `AVG(EXTRACT(epoch FROM (ends_at − starts_at))/3600)` untuk booking `completed` | Dipisah per kanal: online vs walk-in. Walk-in biasanya lebih panjang. |
| M-16 | **Pendapatan per Jam-Meja Tersedia** (RevPATH) | `M-05 / M-11` | Analog RevPAR di hotel. **Metrik tunggal terbaik untuk mengukur kesehatan bisnis** karena menggabungkan harga dan okupansi. |
| M-17 | **Pendapatan per Jam Operasional** | `M-05 / total_jam_buka_periode` | Untuk menjawab "apakah buka sampai jam 2 pagi masih untung?" |

#### 5.2.3 Definisi Penyebut Utilisasi — Detail yang Sering Dirusak

Ini paragraf paling penting di §5.2. Salah menentukan penyebut membuat metrik utilisasi tidak berguna sama sekali.

**Yang SALAH:**

| Penyebut salah | Kenapa salah |
|---|---|
| `24 jam × jumlah meja × jumlah hari` | Venue tutup 08:00–10:00 dan 02:00–10:00. Utilisasi akan selalu terlihat ~25% dan owner menyimpulkan bisnisnya gagal padahal jam bukanya penuh. |
| `jam operasional × jumlah meja` tanpa mengurangi maintenance | Meja rusak 3 hari dihitung sebagai kapasitas yang gagal dijual. Menghukum owner atas kejadian di luar kendali penjualan. |
| Jumlah meja diambil dari `COUNT(*) FROM billiard_tables` hari ini | Kalau owner menambah 2 meja bulan lalu (AD-07), utilisasi bulan-bulan sebelumnya jadi ikut turun secara retroaktif. Tren jadi bohong. |

**Yang BENAR:**

```sql
-- Jam-meja tersedia, dihitung per hari operasional per meja,
-- menghormati: jam buka aktual hari itu, status aktif meja PADA HARI ITU,
-- dan blok maintenance.
create or replace function public.available_table_hours(
  p_from date, p_to date
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select d::date as business_date
      from generate_series(p_from, p_to, interval '1 day') d
  ),
  hours_per_day as (
    select dy.business_date,
           -- jam operasional hari itu dari venue_settings (bisa beda weekday/weekend)
           extract(epoch from (vs.close_time - vs.open_time
                   + case when vs.close_time < vs.open_time
                          then interval '24 hours' else interval '0' end)) / 3600
             as open_hours
      from days dy
      join public.venue_settings vs
        on vs.day_type = public.day_type_of(dy.business_date)
       and dy.business_date between vs.effective_from
                                and coalesce(vs.effective_to, 'infinity'::date)
  ),
  table_days as (
    select hpd.business_date, t.id as table_id, hpd.open_hours,
           coalesce((
             select sum(extract(epoch from (m.ends_at - m.starts_at))/3600)
               from public.table_maintenance m
              where m.table_id = t.id
                and m.business_date = hpd.business_date
           ), 0) as maintenance_hours
      from hours_per_day hpd
      cross join public.billiard_tables t
     -- meja dihitung hanya jika SUDAH ada dan BELUM dinonaktifkan pada hari itu
     where t.commissioned_on <= hpd.business_date
       and (t.decommissioned_on is null or t.decommissioned_on > hpd.business_date)
  )
  select coalesce(sum(greatest(open_hours - maintenance_hours, 0)), 0)
    from table_days;
$$;
```

Ini menuntut dua kolom tambahan pada `billiard_tables` yang **wajib ada sejak MVP** (biaya nol sekarang, migrasi menyakitkan nanti):

```sql
alter table public.billiard_tables
  add column commissioned_on   date not null default current_date,
  add column decommissioned_on date;
```

| ID | Requirement | MoSCoW |
|---|---|---|
| FN-08 | Penyebut utilisasi = **jam-meja tersedia**, dihitung dari jam operasional aktual per hari dikurangi jam maintenance, memakai jumlah meja yang aktif **pada tanggal itu** (bukan hari ini) | **Must** |
| FN-09 | Kolom `commissioned_on` & `decommissioned_on` pada `billiard_tables`; meja tidak pernah di-`DELETE` | **Must** |
| FN-10 | Utilisasi ditampilkan dalam **dua angka**: utilisasi keseluruhan dan utilisasi jam prime (default 18:00–24:00, konfigurabel) | **Should** |
| FN-11 | Tooltip di setiap angka utilisasi menjelaskan penyebutnya secara literal: *"Dari 1.120 jam-meja tersedia bulan ini (10 meja × 16 jam × 7 hari, dikurangi 8 jam maintenance)"* | **Should** |
| FN-12 | Metrik **RevPATH** (M-16) ditampilkan sebagai KPI utama, bukan metrik sekunder | **Should** |

#### 5.2.4 Metrik Pelanggan & Konversi

| ID | Metrik | Rumus | Catatan |
|---|---|---|---|
| M-18 | **Average Order Value (AOV)** | `M-01 / COUNT(DISTINCT tab_id)` | Satuan hitung adalah **tab meja** (satu sesi bisa punya banyak payment), bukan per payment record. Kalau dihitung per payment, split cash+QRIS akan menggandakan denominator dan AOV terlihat separuh. |
| M-19 | **Attach Rate F&B** | `COUNT(DISTINCT tab_id WHERE ada sale_fnb) / COUNT(DISTINCT tab_id) × 100` | Mengukur efektivitas cross-sell UX-11. Target realistis venue biliar+resto: 55–75%. |
| M-20 | **AOV F&B saat attached** | `SUM(sale_fnb) / COUNT(DISTINCT tab_id WHERE ada sale_fnb)` | Dipisah dari M-19: attach rate tinggi tapi nilai kecil = pelanggan hanya beli air mineral. |
| M-21 | **Tingkat Pembatalan** | `COUNT(status='cancelled') / COUNT(status IN ('confirmed','seated','completed','no_show','cancelled')) × 100` | **Penyebut TIDAK memasukkan `hold` dan `expired`** — hold yang gagal bayar bukan pembatalan, itu abandonment checkout. Mencampurnya membuat angka pembatalan terlihat mengerikan. |
| M-22 | **Tingkat Abandonment Checkout** | `COUNT(status='expired') / COUNT(status IN ('hold','expired','confirmed',...)) × 100` | Metrik **terpisah** dari M-21. Ini metrik produk (UX pembayaran), bukan metrik bisnis. Naik tajam = ada masalah di halaman QR. |
| M-23 | **Tingkat No-Show** | `COUNT(status='no_show') / COUNT(status IN ('confirmed','seated','completed','no_show')) × 100` | Penyebut = booking yang **sudah dibayar**. Karena model prepaid, no-show tidak merugikan uang tapi merugikan kapasitas. |
| M-24 | **Pelanggan Baru** | `COUNT(DISTINCT user_id)` yang `first_paid_booking_at` jatuh dalam periode | Snapshot di kolom `profiles.first_paid_booking_at`, jangan dihitung ulang dengan subquery MIN() setiap render |
| M-25 | **Pelanggan Kembali** | `COUNT(DISTINCT user_id)` yang bertransaksi di periode **dan** `first_paid_booking_at < awal_periode` | |
| M-26 | **Rasio Retensi** | `M-25 / (M-24 + M-25) × 100` | Untuk venue biliar yang sangat sosial, target > 40% dalam 90 hari |
| M-27 | **Kontribusi Kanal** | `SUM(gross) GROUP BY channel / M-01 × 100` | Menjawab "apakah aplikasi ini benar-benar dipakai?" Kalau `qris_online` < 15% setelah 3 bulan, ada masalah adopsi. |

| ID | Requirement | MoSCoW |
|---|---|---|
| FN-13 | AOV dihitung per **tab meja** (`session_id`), bukan per payment record | **Must** |
| FN-14 | Tingkat Pembatalan (M-21) dan Tingkat Abandonment (M-22) adalah **dua metrik terpisah** dengan penyebut berbeda; tidak boleh digabung | **Must** |
| FN-15 | Kolom `profiles.first_paid_booking_at` di-set sekali saat pembayaran pertama settled, dipakai untuk M-24/M-25 | **Should** |
| FN-16 | Semua metrik persentase menampilkan **pembilang dan penyebut mentah** saat di-hover (mis. "42,3% — 187 dari 442") | **Should** |

---

### 5.3 Tampilan Dashboard

Prinsip desain: owner membuka dashboard di **HP** sambil berdiri di venue, bukan di laptop. Semua yang penting harus terbaca dalam **30 detik pertama** tanpa scroll horizontal. Warna mengikuti identitas SPL — amber `#F0A202` untuk nilai positif/aksen, brick maroon `#992212` untuk beban/negatif, latar near-black, angka besar memakai Emoland (condensed, mudah dibaca pada digit besar), label memakai Lido STF.

#### 5.3.1 Baris KPI Card (paling atas, selalu terlihat)

Enam kartu, dua kolom di mobile, enam kolom di desktop. Setiap kartu memuat: **label**, **nilai besar**, **delta vs periode sebelumnya** (panah + persentase), dan **sparkline 14 titik**.

| Urutan | KPI | Sumber | Warna nilai | Kenapa di posisi ini |
|---|---|---|---|---|
| 1 | **Omzet Kotor** | M-01 | Netral (putih) | Angka yang paling dicari owner, tapi diberi warna netral supaya tidak dibaca sebagai laba |
| 2 | **Pendapatan Bersih Venue** | M-05 | **Amber** (nilai utama) | Inilah "untung kotor" yang sesungguhnya |
| 3 | **Titipan Pajak** | M-02 | Abu-abu + ikon gembok | Visual harus terasa "bukan milik Anda" |
| 4 | **Utilisasi Meja** | M-13 | Amber jika ≥ target, maroon jika < target | Angka operasional nomor satu |
| 5 | **RevPATH** | M-16 | Amber | Metrik gabungan harga × okupansi |
| 6 | **Attach Rate F&B** | M-19 | Amber | Satu-satunya KPI yang bisa diperbaiki hari itu juga lewat instruksi ke staf |

Di bawah baris KPI, satu **strip tipis** berisi tiga angka kecil beban: Beban Gateway (M-04), Refund, Diskon. Tidak diberi kartu penuh karena bukan angka yang perlu dipantau tiap hari, tapi harus selalu terlihat supaya tidak pernah "hilang".

| ID | Requirement | MoSCoW |
|---|---|---|
| FN-17 | Enam KPI card di atas dengan delta vs periode sebelumnya dan sparkline 14 titik | **Must** |
| FN-18 | KPI "Titipan Pajak" secara visual dibedakan (abu-abu + ikon) dari KPI pendapatan | **Must** |
| FN-19 | Strip beban (gateway/refund/diskon) selalu terlihat di bawah baris KPI | **Should** |
| FN-20 | Threshold target utilisasi & attach rate dapat diatur owner; KPI berubah warna berdasarkan threshold | **Could** |

#### 5.3.2 Grafik — Jenis yang Tepat dan Alasannya

| ID | Visual | Jenis grafik | **Kenapa jenis ini, bukan yang lain** |
|---|---|---|---|
| V-01 | **Tren omzet harian** | **Bar chart vertikal** (bukan line) | Data harian bersifat **diskrit dan dapat dijumlahkan**. Line chart mengimplikasikan interpolasi kontinu antar hari, yang tidak bermakna ("berapa omzet pada Selasa jam 14 menurut garis?"). Bar juga memudahkan mata membandingkan Sabtu vs Selasa. |
| V-02 | **Tren omzet mingguan/bulanan** | **Line chart** | Pada agregasi mingguan/bulanan yang perhatiannya adalah **arah tren**, line unggul: mata mengikuti kemiringan, bukan membandingkan tinggi individual. Ini kebalikan dari V-01 dan pembalikan ini disengaja. |
| V-03 | **Komposisi Meja vs F&B per hari** | **Stacked bar chart** | Menampilkan total dan komposisi sekaligus dalam satu bentuk. Jangan pakai dua line terpisah — mata tidak bisa menjumlahkan dua garis. Maksimal **2–3 segmen**; lebih dari itu stacked bar jadi tidak terbaca. |
| V-04 | **Heatmap jam × hari** | **Matrix heatmap**, sumbu-X = jam (10:00–02:00), sumbu-Y = hari (Sen–Min), warna = utilisasi % (M-14) | **Ini grafik terpenting di seluruh dashboard.** Pola dua dimensi (jam × hari) mustahil dibaca dari bar chart — butuh 7 × 16 = 112 bar. Heatmap menampilkan 112 nilai dalam satu tatapan dan **lubang sepi langsung terlihat sebagai area gelap**. Ini persis input untuk keputusan happy hour. |
| V-05 | **Ranking menu terlaris** | **Horizontal bar chart**, top 10, diurutkan menurun | Horizontal karena label menu panjang ("Smoked Beef Ribs Platter") — pada bar vertikal label harus dimiringkan dan jadi sulit dibaca. Top 10 saja: ranking 11+ tidak pernah dipakai untuk keputusan. |
| V-06 | **Ranking meja terlaris** | **Horizontal bar chart** dengan **dua metrik berdampingan**: omzet (bar) dan utilisasi % (titik/marker di bar yang sama) | Meja bisa beromzet tinggi karena tarif VIP walau utilisasinya rendah. Menampilkan hanya omzet menyesatkan. Kombinasi bar + marker (bullet chart) memberi kedua sisi tanpa dua grafik. |
| V-07 | **Kontribusi kanal pembayaran** | **Horizontal stacked bar tunggal** (100%), bukan pie chart | Pie chart buruk untuk membandingkan irisan yang mirip dan tidak bisa menampilkan perubahan antar periode. Stacked bar 100% bisa ditumpuk antar periode untuk perbandingan langsung. **Jangan pernah pakai donut/pie di dashboard ini.** |
| V-08 | **Distribusi durasi sesi** | **Histogram** dengan bin 30 menit | Rata-rata (M-15) menyembunyikan bimodalitas. Kalau ada dua puncak (1 jam untuk casual, 3 jam untuk grup), strategi paketnya berbeda total. Histogram menampilkan ini; angka rata-rata tidak. |
| V-09 | **Perbandingan periode** | **Bar chart berpasangan** (side-by-side, bukan overlay) + tabel delta | Overlay dua periode dengan transparansi sulit dibaca di layar HP. Side-by-side dengan warna amber (periode ini) vs abu-abu (periode lalu) jelas dan tetap on-brand. |
| V-10 | **Funnel booking** | **Funnel/bar bertingkat**: Lihat jadwal → Buat hold → Buka QR → Bayar → Check-in | Menunjukkan di titik mana pelanggan hilang. Kalau drop terbesar di "Buka QR → Bayar", masalahnya di UX QR mobile (PAY-09), bukan di harga. |

**Aksesibilitas heatmap (V-04):** jangan mengandalkan warna saja. Setiap sel menampilkan **angka persentase** di dalamnya pada tampilan desktop, dan warna memakai skala **sekuensial satu-hue** (near-black → amber pekat), bukan merah-hijau. Skala merah-hijau tidak terbaca oleh ±8% pria Indonesia dengan defisiensi penglihatan warna, dan juga bertabrakan dengan palet SPL.

| ID | Requirement | MoSCoW |
|---|---|---|
| FN-21 | Heatmap utilisasi jam × hari (V-04) dengan skala sekuensial amber dan angka di dalam sel | **Must** |
| FN-22 | Tren harian sebagai bar chart, tren mingguan/bulanan sebagai line chart | **Must** |
| FN-23 | Ranking menu & meja sebagai horizontal bar, top 10 | **Must** |
| FN-24 | Ranking meja menampilkan omzet **dan** utilisasi dalam satu visual (bullet chart) | **Should** |
| FN-25 | Kontribusi kanal sebagai stacked bar 100%; **dilarang** memakai pie/donut chart | **Should** |
| FN-26 | Histogram distribusi durasi sesi dengan bin 30 menit | **Could** |
| FN-27 | Funnel booking (V-10) | **Could** (Fase 2) |
| FN-28 | Setiap grafik punya tombol "Unduh data grafik ini (CSV)" | **Should** |
| FN-29 | Tidak ada grafik yang bergantung pada warna saja untuk menyampaikan informasi | **Must** |

#### 5.3.3 Perbandingan Periode

Setiap KPI dan grafik menampilkan pembanding. Mode pembanding yang disediakan:

| Mode | Definisi | Kapan dipakai |
|---|---|---|
| **Periode sebelumnya** | Rentang dengan panjang sama persis, tepat sebelum rentang terpilih | Default untuk rentang custom |
| **Periode sama bulan lalu** | Rentang tanggal yang sama di bulan sebelumnya | Untuk melihat tren bulanan |
| **Hari yang sama minggu lalu** | Sabtu ini vs Sabtu lalu | **Default untuk rentang harian** — membandingkan Sabtu dengan Jumat tidak bermakna di bisnis yang sangat bergantung hari |

**Ini keputusan penting:** default pembanding untuk rentang 1 hari **harus** "hari yang sama minggu lalu", bukan "kemarin". Membandingkan Senin dengan Minggu akan selalu menghasilkan delta −60% dan owner akan panik tanpa alasan.

| ID | Requirement | MoSCoW |
|---|---|---|
| FN-30 | Tiga mode pembanding tersedia; default untuk rentang 1 hari = **hari yang sama minggu lalu** | **Must** |
| FN-31 | Delta ditampilkan dalam **persentase dan nilai absolut** (mis. "+12,4% · +Rp 1.240.000") | **Should** |

---

### 5.4 Filter

| ID | Filter | Opsi | Perilaku |
|---|---|---|---|
| FL-01 | **Rentang tanggal** | Preset: Hari Ini, Kemarin, 7 Hari Terakhir, Bulan Ini, Bulan Lalu, Custom | Semua preset memakai `business_date` (batas 02:00 WIB), **bukan** tanggal kalender |
| FL-02 | **Basis waktu** | Tanggal Transaksi / Tanggal Settlement | Toggle eksplisit di atas. Lihat §5.6 — ini bukan detail kecil |
| FL-03 | **Tipe meja** | Semua / Standard / VIP / per-meja individual | Multi-select |
| FL-04 | **Kanal pembayaran** | Semua / QRIS Online / Cash / EDC Debit / EDC Kredit / QRIS Statis Kasir / Transfer / Store Credit | Multi-select. Memisahkan online vs offline adalah use case utama. |
| FL-05 | **Kanal booking** | Semua / Online / Walk-in / Telepon | Berbeda dari FL-04. Booking online bisa dibayar cash di kasir. |
| FL-06 | **Kategori produk** | Semua / Sewa Meja / Makanan / Minuman / Minuman Beralkohol / Rokok / Merchandise | Kategori alkohol dipisah karena implikasi pajaknya berpotensi berbeda (risiko klasifikasi "bar" 40%) |
| FL-07 | **Kasir / staf** | Semua / per akun staf | Untuk laporan kontrol internal (§5.8) |
| FL-08 | **Status transaksi** | Paid / Refunded / Partial Refunded / Void | Default: Paid + Partial Refunded |

**Aturan interaksi filter:** semua filter **bersifat AND** dan **persist di URL query string** supaya owner bisa bookmark atau kirim link ke akuntan. Kombinasi filter yang menghasilkan nol baris harus menampilkan pesan spesifik ("Tidak ada transaksi VIP dengan kanal Cash pada 1–7 Agustus"), bukan grafik kosong tanpa penjelasan.

| ID | Requirement | MoSCoW |
|---|---|---|
| FN-32 | Delapan filter di atas, semua bersifat AND, state tersimpan di URL query string | **Must** |
| FN-33 | Toggle basis waktu (Transaksi / Settlement) tampil menonjol, bukan tersembunyi di menu | **Must** |
| FN-34 | Empty state filter menjelaskan kombinasi filter yang menghasilkan nol baris | **Should** |
| FN-35 | Filter tersimpan sebagai "Tampilan Favorit" bernama | **Could** (Fase 2) |

---

### 5.5 Laporan yang Bisa Diekspor

Format: **CSV (UTF-8 dengan BOM)** dan **XLSX**. BOM wajib karena Excel versi Indonesia membuka CSV tanpa BOM dengan encoding ANSI dan semua karakter non-ASCII rusak — dan lebih penting, **separator desimal**. Untuk XLSX, nilai uang ditulis sebagai **number murni** (bukan string) dengan format sel `#,##0` agar bisa langsung di-`SUM` oleh akuntan.

**[PERLU KONFIRMASI]** Apakah akuntan/kantor pajak menghendaki format angka Indonesia (titik ribuan, koma desimal) atau format internasional? Untuk CSV, rekomendasi: tulis angka mentah tanpa pemisah ribuan (`181818`) dan gunakan delimiter **titik koma (`;`)** — ini kombinasi yang paling aman untuk Excel dengan locale Indonesia.

#### 5.5.1 LAP-01 — Rekap Harian (Closing Kasir)

Dihasilkan otomatis pada penutupan hari operasional (setelah 02:00 WIB) dan bisa diunduh kapan saja. **Ini laporan yang dicetak dan ditandatangani.**

**Bagian A — Header**

| Kolom | Contoh | Keterangan |
|---|---|---|
| `business_date` | 2026-08-23 | Hari operasional, batas 02:00 |
| `venue_name` | SPL Sports Pool Lounge | |
| `npwpd` | 12.345.678.9-012.000 | Wajib untuk validitas laporan pajak |
| `jam_operasional` | 10:00 – 02:00 | |
| `dibuka_oleh` / `ditutup_oleh` | Rian / Dewi | Nama akun individual, bukan "kasir" |
| `dicetak_pada` | 2026-08-24 02:14 WIB | |

**Bagian B — Ringkasan Uang**

| Kolom | Tipe | Keterangan |
|---|---|---|
| `omzet_kotor` | integer | M-01 |
| `dpp_sewa_meja` | integer | M-07 |
| `dpp_fnb` | integer | M-08 |
| `service_charge` | integer | |
| `diskon_total` | integer | Negatif |
| `pajak_pbjt_fnb` | integer | Titipan |
| `pajak_pbjt_hiburan` | integer | Titipan |
| `pajak_total` | integer | M-02 |
| `mdr_gateway` | integer | Negatif |
| `refund_total` | integer | Negatif |
| `pendapatan_bersih_venue` | integer | M-05 |

**Bagian C — Rekap per Kanal (satu baris per kanal)**

| Kolom | Keterangan |
|---|---|
| `channel` | qris_online / cash / edc_debit / … |
| `jumlah_transaksi` | |
| `gross_amount` | |
| `mdr_fee` | Rp 0 untuk cash |
| `net_amount` | |
| `expected_in_drawer` | **Hanya diisi untuk `cash`** — inilah yang harus ada fisik di laci |

**Bagian D — Rekonsiliasi Kas Fisik** (diisi manual oleh kasir sebelum tutup)

| Kolom | Keterangan |
|---|---|
| `kas_awal` | Modal awal laci |
| `kas_seharusnya` | `kas_awal + expected_in_drawer(cash) − pengeluaran_kas` |
| `kas_fisik_dihitung` | Diisi kasir |
| `selisih` | `kas_fisik − kas_seharusnya`. **Wajib diberi penjelasan tertulis jika ≠ 0** |
| `penjelasan_selisih` | Free text, wajib jika selisih ≠ 0 |

**Bagian E — Operasional**

| Kolom | Keterangan |
|---|---|
| `jumlah_booking_online` / `walk_in` | |
| `jam_meja_terjual` / `jam_meja_tersedia` / `utilisasi_persen` | M-12 / M-11 / M-13 |
| `no_show_count` | |
| `void_count` / `void_total_rupiah` | |
| `diskon_manual_count` / `diskon_manual_total` | |
| `nomor_struk_awal` / `nomor_struk_akhir` | **Wajib berurutan tanpa gap** (TAX-08) |

#### 5.5.2 LAP-02 — Rekap Bulanan

Satu baris per `business_date` dengan kolom yang sama seperti Bagian B LAP-01, ditambah baris **TOTAL** di akhir dan sheet kedua berisi rekap per kanal dan per kategori produk.

Kolom tambahan yang hanya ada di rekap bulanan:

| Kolom | Keterangan |
|---|---|
| `hari` | Sen/Sel/… — memudahkan pola mingguan terbaca di Excel |
| `is_libur_nasional` | Boolean, untuk memisahkan anomali |
| `rata_rata_durasi_sesi_jam` | M-15 |
| `aov` | M-18 |
| `attach_rate_fnb_persen` | M-19 |
| `pelanggan_baru` / `pelanggan_kembali` | M-24 / M-25 |

#### 5.5.3 LAP-03 — Detail Transaksi (grain: satu baris per item)

Laporan paling granular, dipakai untuk audit dan investigasi sengketa.

| Kolom | Contoh | Keterangan |
|---|---|---|
| `struk_no` | SPL-260823-0042 | Berurutan, tanpa gap |
| `business_date` | 2026-08-23 | |
| `waktu_transaksi` | 2026-08-24 00:35:12+07 | `timestamptz`, ISO 8601 dengan offset |
| `session_id` / `booking_code` | | Untuk menggabungkan item ke satu tab |
| `channel_booking` | online / walk_in / phone | |
| `channel_payment` | qris_online / cash / … | |
| `table_code` | M-03 | Kosong untuk order F&B murni |
| `item_type` | table_session / fnb | |
| `item_name` | Sesi Biliar 2 Jam / Smoked Beef Ribs | |
| `item_category` | sewa_meja / makanan / minuman / alkohol | |
| `qty` | 1 | |
| `unit_price_locked` | 70000 | **Harga snapshot saat transaksi**, bukan harga master hari ini |
| `line_gross` | 140000 | |
| `line_discount` | 0 | |
| `tax_category` | entertainment / fnb | |
| `tax_rate_applied` | 0.10 | Tarif yang berlaku **pada tanggal itu** |
| `line_tax` | 12727 | |
| `line_dpp` | 127273 | |
| `mdr_allocated` | 980 | MDR dialokasikan proporsional ke item |
| `payment_status` | paid / refunded / partial_refunded | |
| `midtrans_order_id` | SPL-260823-0042-1 | Kosong untuk cash |
| `midtrans_transaction_id` | 0d8178e1-… | Untuk pencarian silang di dashboard MAP |
| `settlement_date` | 2026-08-26 | Kosong jika belum settle |
| `settlement_batch_id` | | |
| `recon_status` | matched / unmatched / disputed | |
| `kasir_id` / `kasir_nama` | | Akun individual |
| `void_flag` / `void_reason` / `void_approved_by` | | |
| `discount_reason` / `discount_approved_by` | | |

**Alokasi MDR ke item (`mdr_allocated`):** MDR dikenakan di level transaksi, bukan item. Alokasi ke item dilakukan **proporsional terhadap `line_gross`**, dengan sisa pembulatan dilempar ke item terbesar agar `SUM(mdr_allocated) = mdr_fee` transaksi persis. Tanpa aturan pembulatan ini, total kolom di Excel tidak akan cocok dengan ringkasan dan akuntan akan menganggap laporan rusak.

#### 5.5.4 LAP-04 — Rekap Pajak (untuk pengisian SPTPD)

Satu file per bulan, format paling sederhana karena akan disalin manual ke formulir SPTPD.

| Kolom | Keterangan |
|---|---|
| `masa_pajak` | 2026-08 |
| `npwpd` | |
| `tax_category` | fnb / entertainment |
| `tarif_persen` | 10 |
| `dpp` | Dasar Pengenaan Pajak |
| `pbjt_terutang` | `dpp × tarif` |
| `jumlah_transaksi` | |
| `omzet_bruto` | `dpp + pbjt` |

Ditambah **Bagian Rincian Harian** (satu baris per `business_date` per `tax_category`) supaya kalau Bapenda meminta rincian, datanya sudah siap tanpa query ulang.

**[PERLU KONFIRMASI]** Apakah Bapenda kota SPL mewajibkan format tertentu atau upload ke sistem e-SPTPD? Jika ya, format ekspor harus disesuaikan dan ini bisa mengubah struktur laporan.

| ID | Requirement | MoSCoW |
|---|---|---|
| FN-36 | LAP-01 Rekap Harian dengan lima bagian (Header, Ringkasan Uang, per Kanal, Rekonsiliasi Kas Fisik, Operasional) | **Must** |
| FN-37 | LAP-02 Rekap Bulanan, satu baris per hari + baris TOTAL + sheet rekap kanal/kategori | **Must** |
| FN-38 | LAP-03 Detail Transaksi grain per item dengan seluruh kolom di §5.5.3 | **Must** |
| FN-39 | LAP-04 Rekap Pajak per masa pajak, dipisah per `tax_category` | **Must** |
| FN-40 | Ekspor CSV (UTF-8 BOM, delimiter `;`) dan XLSX (uang sebagai number, format `#,##0`) | **Must** |
| FN-41 | `SUM(mdr_allocated)` per transaksi **wajib** sama persis dengan `mdr_fee` transaksi; sisa pembulatan ke item terbesar | **Must** |
| FN-42 | Nomor struk berurutan tanpa gap; void menghasilkan record void, bukan penghapusan nomor | **Must** |
| FN-43 | Semua laporan menampilkan `dicetak_pada` dan `dicetak_oleh` untuk jejak audit | **Should** |
| FN-44 | Ekspor terjadwal otomatis (rekap bulanan dikirim ke email akuntan tiap tanggal 1) | **Could** (Fase 2) |
| FN-45 | Laporan besar (> 10.000 baris) di-generate asynchronous dengan notifikasi saat siap, bukan blocking request | **Should** |

---

### 5.6 Rekonsiliasi Settlement

Ini bagian yang membedakan dashboard yang dipakai dari dashboard yang diabaikan. Tanpa rekonsiliasi, owner tidak pernah tahu apakah uang yang seharusnya masuk benar-benar masuk.

#### 5.6.1 Tiga Sumber Kebenaran yang Harus Dicocokkan

| Sumber | Isi | Kapan tersedia | Kelemahan |
|---|---|---|---|
| **A. Sistem SPL** | Transaksi berstatus `paid` di `payments` + `revenue_ledger` | Real-time | Bisa punya transaksi yang webhook-nya hilang (walau ada cron rekonsiliasi PAY-08) |
| **B. Laporan settlement gateway** | CSV settlement dari Dashboard MAP Midtrans: daftar transaksi yang sudah dicairkan, per batch | T+2/T+3 | Tidak mencakup cash & EDC. Nominal sudah dipotong MDR. |
| **C. Mutasi rekening bank** | Kredit masuk dari Midtrans, per batch, sudah dipotong biaya payout Rp 5.000 | T+2/T+3 | Hanya nilai agregat per batch, tidak per transaksi |

**Rantai yang harus konsisten:**

```
Σ gross(A, channel=qris_online, tanggal T)
  − Σ mdr(A)
  = Σ net(B, batch untuk tanggal T)
  − payout_fee
  = nilai kredit di mutasi rekening (C)
```

Kalau ketiganya cocok, bulan itu bersih. Kalau tidak, sistem harus menunjukkan **transaksi mana** yang bermasalah, bukan sekadar menampilkan angka selisih.

#### 5.6.2 Model Data Rekonsiliasi

```sql
create table public.settlement_batches (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null default 'midtrans',
  external_batch_id  text not null,               -- dari laporan gateway
  settlement_date    date not null,               -- tanggal dana masuk rekening
  gross_total        integer not null,            -- sebelum MDR, dari laporan gateway
  fee_total          integer not null,            -- MDR total batch
  payout_fee         integer not null default 0,  -- Rp 5.000/transfer
  net_total          integer not null,            -- yang seharusnya masuk rekening
  bank_credit_amount integer,                     -- diisi saat cocokkan mutasi
  bank_credit_date   date,
  status             text not null default 'imported'
                     check (status in ('imported','matched','variance','resolved')),
  variance_amount    integer generated always as
                     (coalesce(bank_credit_amount, 0) - net_total) stored,
  imported_by        uuid references auth.users(id),
  imported_at        timestamptz not null default now(),
  resolved_note      text,
  constraint settlement_batch_unique unique (provider, external_batch_id)
);

create table public.settlement_lines (
  id             bigserial primary key,
  batch_id       uuid not null references public.settlement_batches(id) on delete cascade,
  order_id       text not null,                   -- midtrans order_id dari laporan
  transaction_id text,
  gross_amount   integer not null,
  fee_amount     integer not null,
  net_amount     integer not null,
  payment_id     uuid references public.payments(id),  -- hasil matching
  match_status   text not null default 'unmatched'
                 check (match_status in ('unmatched','matched',
                                         'amount_mismatch','orphan_gateway',
                                         'orphan_system')),
  match_note     text,
  constraint settlement_line_unique unique (batch_id, order_id)
);

create index settlement_lines_open_idx
  on public.settlement_lines (match_status) where match_status <> 'matched';
```

#### 5.6.3 Algoritma Pencocokan

Dijalankan saat owner mengunggah CSV settlement gateway.

```
Langkah 1 — IMPOR
  Parse CSV settlement → insert ke settlement_batches + settlement_lines.
  ON CONFLICT (provider, external_batch_id) DO NOTHING  → impor ulang aman (idempoten).

Langkah 2 — MATCH EKSAK by order_id
  UPDATE settlement_lines sl
     SET payment_id = p.id, match_status = 'matched'
    FROM payments p
   WHERE p.order_id = sl.order_id
     AND p.gross_amount = sl.gross_amount
     AND p.status = 'paid';

Langkah 3 — DETEKSI SELISIH NOMINAL
  order_id cocok TAPI gross berbeda → match_status = 'amount_mismatch'.
  Ini serius: kemungkinan bug pembulatan atau manipulasi. Alert critical.

Langkah 4 — ORPHAN GATEWAY
  Baris di laporan gateway yang tidak punya padanan order_id di sistem
  → match_status = 'orphan_gateway'.
  Penyebab umum: transaksi dari QR statis di kasir yang tidak lewat aplikasi,
  atau webhook yang hilang total dan tidak tertangkap cron rekonsiliasi.
  Aksi: buat entri ledger 'adjustment' setelah investigasi manual.

Langkah 5 — ORPHAN SISTEM
  payments berstatus 'paid' pada rentang tanggal batch yang TIDAK muncul
  di laporan gateway mana pun setelah T+5 hari kerja
  → tandai sebagai 'orphan_system'.
  INI YANG PALING BERBAHAYA: sistem mengira sudah dibayar, uangnya tidak pernah masuk.
  Penyebab: webhook palsu yang lolos verifikasi (seharusnya mustahil), atau
  transaksi di-refund/chargeback tanpa notifikasi. Alert critical + investigasi wajib.

Langkah 6 — ROLL-UP KE BATCH
  Jika semua lines 'matched' DAN bank_credit_amount = net_total + payout_fee
    → batch.status = 'matched'
  Jika bank_credit_amount terisi tapi variance_amount ≠ 0
    → batch.status = 'variance'

Langkah 7 — TULIS KEMBALI KE LEDGER
  UPDATE revenue_ledger SET settlement_date = batch.settlement_date,
                            settlement_batch_id = batch.external_batch_id,
                            recon_status = 'matched'
   WHERE payment_id IN (payment yang matched);
```

#### 5.6.4 Alur Kerja Bulanan Owner

Ini SOP konkret, ditulis untuk dijalankan orang non-teknis. **Waktu total: ± 20 menit per bulan** kalau tidak ada selisih.

| Langkah | Aksi | Di mana | Estimasi |
|---|---|---|---|
| 1 | Unduh laporan settlement bulan lalu dari Dashboard MAP Midtrans (menu Settlement Report, format CSV) | Midtrans MAP | 2 menit |
| 2 | Buka **Dashboard SPL → Keuangan → Rekonsiliasi**, klik **Unggah Laporan Settlement**, pilih file CSV | Dashboard SPL | 1 menit |
| 3 | Sistem menampilkan ringkasan impor: *"Terimpor 6 batch, 412 transaksi. 408 cocok otomatis. 4 butuh perhatian."* | Dashboard SPL | otomatis |
| 4 | Buka **rekening bank**, catat semua kredit masuk dari Midtrans bulan itu beserta tanggal dan nominal | m-banking | 5 menit |
| 5 | Di tabel batch, isi kolom **Nominal Diterima di Bank** dan **Tanggal Terima** untuk setiap batch. Sistem otomatis menghitung `variance_amount` | Dashboard SPL | 5 menit |
| 6 | Selesaikan **daftar pengecualian** (4 item di atas): setiap baris punya tombol aksi dengan penjelasan yang bisa dibaca orang awam | Dashboard SPL | 5–15 menit |
| 7 | Klik **Tutup Periode**. Sistem mengunci bulan itu: tidak ada entri ledger baru boleh ditulis dengan `business_date` di dalamnya kecuali sebagai `adjustment` bertanggal saat ini | Dashboard SPL | 1 menit |
| 8 | Unduh **LAP-04 Rekap Pajak**, salin ke SPTPD, setor pajak | Dashboard SPL + Bapenda | 15 menit |

**Halaman "Daftar Pengecualian" harus berbicara bahasa manusia, bukan bahasa database:**

| `match_status` | Yang ditampilkan ke owner | Aksi yang ditawarkan |
|---|---|---|
| `amount_mismatch` | "Transaksi SPL-260823-0042: sistem mencatat Rp 200.000, gateway mencatat Rp 180.000. Selisih Rp 20.000." | [Lihat Detail] [Tandai Sengketa] [Buat Koreksi] |
| `orphan_gateway` | "Ada Rp 150.000 masuk dari gateway yang tidak ada di sistem SPL. Kemungkinan pembayaran lewat QR statis di kasir." | [Catat sebagai Pendapatan Lain] [Investigasi] |
| `orphan_system` | **"⚠ Transaksi SPL-260819-0011 tercatat LUNAS di sistem tapi dananya tidak pernah masuk. Sudah 6 hari kerja."** | [Cek Status di Midtrans] [Tandai Sengketa] [Batalkan Pendapatan] |
| `variance` batch | "Batch 26082601: seharusnya Rp 12.450.000 masuk, di rekening tercatat Rp 12.445.000. Selisih Rp 5.000." | [Kemungkinan biaya payout — Catat sebagai `payout_fee`] [Investigasi] |

Perhatikan kasus terakhir: selisih Rp 5.000 hampir pasti adalah biaya payout Midtrans. Sistem harus **menawarkan penjelasan yang paling mungkin** terlebih dahulu, bukan hanya melaporkan selisih. Ini perbedaan antara alat yang membantu dan alat yang membebani.

#### 5.6.5 Kanal Non-Gateway

Cash dan EDC tidak punya laporan settlement gateway. Rekonsiliasinya berbeda:

| Kanal | Dicocokkan dengan | Frekuensi |
|---|---|---|
| `cash` | Rekonsiliasi kas fisik harian (LAP-01 Bagian D) | Harian, oleh kasir |
| `edc_debit` / `edc_credit` | Laporan settlement mesin EDC bank (biasanya T+1) | Bulanan, manual oleh owner |
| `qris_static_kasir` | Mutasi rekening penerima QRIS statis | Bulanan. **Ini kanal paling rawan bocor** karena tidak lewat sistem sama sekali. |
| `transfer` | Mutasi rekening | Bulanan |

**[PERLU KONFIRMASI]** Apakah SPL memakai QRIS statis (QR tercetak di kasir) selain QRIS dinamis lewat aplikasi? Kalau ya, itu jalur uang yang tidak terlihat sistem dan wajib punya prosedur input manual, kalau tidak omzet akan bocor tanpa jejak.

| ID | Requirement | MoSCoW |
|---|---|---|
| FN-46 | Impor CSV laporan settlement gateway, idempoten pada `(provider, external_batch_id)` | **Must** |
| FN-47 | Pencocokan otomatis by `order_id` + validasi `gross_amount` | **Must** |
| FN-48 | Lima status pencocokan: matched / amount_mismatch / orphan_gateway / orphan_system / unmatched | **Must** |
| FN-49 | **Alert critical** untuk `orphan_system` (sistem bilang lunas, dana tidak pernah masuk) setelah T+5 hari kerja | **Must** |
| FN-50 | Input manual nominal & tanggal kredit bank per batch; `variance_amount` dihitung otomatis | **Must** |
| FN-51 | Halaman Daftar Pengecualian dengan bahasa manusia + aksi yang ditawarkan, bukan dump teknis | **Must** |
| FN-52 | Sistem menyarankan penjelasan paling mungkin untuk selisih umum (mis. selisih Rp 5.000 = payout fee) | **Should** |
| FN-53 | **Tutup Periode**: mengunci `business_date` dalam periode; perubahan setelahnya hanya lewat `adjustment` bertanggal saat ini | **Must** |
| FN-54 | Rekonsiliasi kas fisik harian wajib diisi sebelum shift bisa ditutup | **Must** |
| FN-55 | Tarik laporan settlement otomatis via Iris/Payout API (menggantikan langkah 1–2 manual) | **Won't** (Fase 3, sejalan FIN-11) |
| FN-56 | Rekonsiliasi EDC via upload CSV bank | **Could** (Fase 2) |

---

### 5.7 Batas Hari Operasional — Implikasi ke Query

Sudah ditetapkan di Seksi 4 (D-07): `business_date = ((starts_at at time zone 'Asia/Jakarta') − interval '2 hours')::date`. Seksi ini menjabarkan konsekuensinya untuk pelaporan, karena di sinilah kesalahan paling sering muncul.

#### 5.7.1 Kenapa 02:00, bukan 00:00

Venue tutup pukul 02:00 WIB. Pelanggan yang mulai main pukul 00:30 tanggal 24 adalah bagian dari **malam Sabtu tanggal 23**, bukan pagi Minggu tanggal 24. Kalau laporan memakai tengah malam:

| Konsekuensi | Dampak nyata |
|---|---|
| Satu shift kasir terpecah jadi dua tanggal laporan | Rekonsiliasi kas fisik mustahil — kasir menghitung laci sekali, sistem melaporkan dua hari |
| Omzet Sabtu terlihat lebih kecil dari sebenarnya | Owner salah menilai performa akhir pekan dan bisa salah mengambil keputusan jam operasional |
| Omzet Minggu pagi terlihat ada padahal venue belum buka | Anomali yang tidak bisa dijelaskan merusak kepercayaan pada laporan |
| Heatmap jam × hari menempatkan jam 00:30 Sabtu di baris Minggu | **Heatmap jadi salah total** dan keputusan happy hour diambil dari data yang keliru |

#### 5.7.2 Konsekuensi Konkret ke Query

| Aturan | Yang SALAH | Yang BENAR |
|---|---|---|
| Agregasi harian | `GROUP BY created_at::date` | `GROUP BY business_date` |
| Filter "hari ini" | `WHERE created_at::date = CURRENT_DATE` | `WHERE business_date = ((now() at time zone 'Asia/Jakarta') - interval '2 hours')::date` |
| Rentang tanggal | `WHERE created_at BETWEEN '2026-08-01' AND '2026-08-31'` | `WHERE business_date BETWEEN '2026-08-01' AND '2026-08-31'` |
| Sumbu jam heatmap | `EXTRACT(hour FROM starts_at)` | `EXTRACT(hour FROM (starts_at at time zone 'Asia/Jakarta'))` |
| Sumbu hari heatmap | `EXTRACT(dow FROM starts_at)` | `EXTRACT(dow FROM business_date)` — **memakai `business_date`, bukan `starts_at`**, supaya sesi 00:30 masuk baris Sabtu |
| Label "Bulan Ini" di frontend | `new Date().toISOString().slice(0,7)` | `Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta'})` lalu kurangi 2 jam sebelum ambil bulan |
| Tanggal settlement | Jangan pernah pakai `business_date` | Settlement memakai **tanggal kalender bank** (`settlement_date date`), bukan hari operasional. Dua konsep berbeda yang wajib dibedakan. |

#### 5.7.3 Dua Basis Waktu, Dua Angka Berbeda — dan Itu Benar

Ini yang paling membingungkan owner kalau tidak dijelaskan di UI.

| Pertanyaan owner | Basis yang dipakai | Contoh |
|---|---|---|
| "Berapa penjualan saya bulan Agustus?" | **Tanggal transaksi** (`business_date`) | Rp 157.750.000 |
| "Berapa uang yang masuk rekening bulan Agustus?" | **Tanggal settlement** (`settlement_date`) | Rp 152.310.000 |

Kedua angka **berbeda dan keduanya benar**. Selisihnya adalah transaksi akhir Juli yang settle di awal Agustus, dikurangi transaksi akhir Agustus yang settle di awal September, plus MDR.

UI harus menjelaskan ini secara eksplisit ketika toggle FL-02 diubah, dengan kalimat satu baris di bawah judul: *"Menampilkan berdasarkan tanggal dana masuk rekening. Angka ini akan berbeda dari laporan penjualan — itu normal."*

#### 5.7.4 Materialized View untuk Performa

Laporan bulanan yang menghitung ulang agregasi dari `revenue_ledger` setiap kali dibuka akan lambat setelah setahun data. Dan pada Supabase Free, query berat memakan egress.

```sql
create materialized view public.mv_daily_summary as
select
  business_date,
  sum(case when entry_type in ('sale_table')      then amount else 0 end) as dpp_table,
  sum(case when entry_type in ('sale_fnb')        then amount else 0 end) as dpp_fnb,
  sum(case when entry_type = 'service_fee'        then amount else 0 end) as service_charge,
  sum(case when entry_type = 'discount'           then amount else 0 end) as discount,
  sum(case when entry_type = 'tax_collected'      then amount else 0 end) as tax_collected,
  sum(case when entry_type in ('gateway_fee','payout_fee') then amount else 0 end) as gateway_cost,
  sum(case when entry_type = 'refund'             then amount else 0 end) as refund,
  sum(case when entry_type = 'adjustment'         then amount else 0 end) as adjustment,
  count(distinct booking_id)                                              as booking_count
from public.revenue_ledger
group by business_date;

create unique index mv_daily_summary_pk on public.mv_daily_summary (business_date);

-- Refresh tiap hari pukul 02:30 WIB (setelah hari operasional tutup).
-- CONCURRENTLY membutuhkan unique index di atas.
select cron.schedule(
  'refresh-daily-summary',
  '30 19 * * *',          -- 19:30 UTC = 02:30 WIB
  $$ refresh materialized view concurrently public.mv_daily_summary $$
);
```

Dashboard membaca `mv_daily_summary` untuk rentang **hari-hari yang sudah tutup**, dan menghitung langsung dari `revenue_ledger` **hanya untuk hari operasional yang sedang berjalan**. Pola ini membuat laporan setahun tetap cepat sementara angka hari ini tetap real-time.

| ID | Requirement | MoSCoW |
|---|---|---|
| FN-57 | Semua agregasi laporan memakai kolom `business_date`, tidak pernah `created_at::date` | **Must** |
| FN-58 | Sumbu hari pada heatmap memakai `EXTRACT(dow FROM business_date)`, bukan dari `starts_at` | **Must** |
| FN-59 | Basis tanggal settlement memakai `settlement_date` (tanggal kalender bank), terpisah dari `business_date` | **Must** |
| FN-60 | UI menjelaskan perbedaan dua basis waktu saat toggle diubah | **Should** |
| FN-61 | `mv_daily_summary` di-refresh `CONCURRENTLY` tiap 02:30 WIB; hari berjalan dihitung live | **Should** |
| FN-62 | Frontend tidak pernah memakai `toISOString().slice(0,10)` untuk menentukan tanggal; wajib `Intl.DateTimeFormat` dengan `timeZone: 'Asia/Jakarta'` | **Must** |

---

### 5.8 Anti-Fraud & Kontrol Internal

Kebocoran uang di venue F&B + biliar hampir tidak pernah berupa pencurian kas terang-terangan. Bentuknya adalah **void setelah pembayaran diterima**, **diskon fiktif**, dan **sesi walk-in yang tidak diinput**. Ketiganya terlihat normal di laporan agregat dan hanya muncul kalau dicari secara spesifik.

#### 5.8.1 Prinsip

| Prinsip | Implementasi |
|---|---|
| **Akun per orang** | Tidak ada login "kasir" bersama. Audit log tanpa identitas individu tidak berguna (AD-08 dari riset operasional). |
| **Aksi sensitif butuh alasan** | Alasan wajib diisi, minimal 10 karakter, tidak boleh diisi dengan pilihan default satu klik saja |
| **Aksi berisiko tinggi butuh approval** | Approval dari role lebih tinggi, dengan PIN atau re-autentikasi |
| **Semua tercatat immutable** | Audit log append-only, tidak bisa di-`UPDATE`/`DELETE` oleh siapa pun termasuk owner |
| **Anomali dilaporkan proaktif** | Sistem tidak menunggu owner mencari; sistem yang memberi tahu |

#### 5.8.2 Matriks Aksi Sensitif

| Aksi | Butuh alasan | Butuh approval | Role minimum | Batas |
|---|---|---|---|---|
| Diskon manual ≤ 10% | Ya | Tidak | `cashier` | Maks 3× per shift per kasir |
| Diskon manual 11–25% | Ya | Ya (`admin`) | `cashier` | — |
| Diskon manual > 25% | Ya | Ya (`owner`) | `admin` | — |
| Void item **sebelum** bayar | Ya | Tidak | `cashier` | — |
| Void item **sesudah** bayar | Ya | **Ya (`admin`)** | `cashier` | Ini titik kebocoran utama |
| Void seluruh struk sesudah bayar | Ya | **Ya (`owner`)** | `admin` | — |
| Refund uang | Ya | **Ya (`owner`)** | `admin` | Dijalankan manual di Dashboard MAP (PAY-14) |
| Terbitkan store credit | Ya | Ya (`admin`) | `cashier` | — |
| Override konflik walk-in vs booking | Ya | Tidak | `cashier` | Tercatat & muncul di laporan harian |
| Ubah harga master / rate card | Ya | Ya (`owner`) | `admin` | Perubahan tidak retroaktif |
| Ubah tarif pajak | Ya | Ya (`owner`) | `owner` | Wajib `effective_from` di masa depan |
| Hapus/nonaktifkan meja | Ya | Ya (`admin`) | `admin` | `DELETE` dilarang; hanya `decommissioned_on` |
| Tutup Periode / buka kembali | Ya | Ya (`owner`) | `owner` | Membuka kembali periode tertutup = alert critical |

#### 5.8.3 Skema Audit Log

```sql
create table public.audit_log (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  business_date date not null
                generated always as
                (((occurred_at at time zone 'Asia/Jakarta') - interval '2 hours')::date) stored,
  actor_id      uuid not null references auth.users(id),
  actor_name    text not null,            -- snapshot nama saat kejadian
  actor_role    text not null,            -- snapshot role saat kejadian
  action        text not null,            -- 'discount_applied','item_voided','refund_issued',…
  entity_type   text not null,            -- 'booking','order_item','rate_card','payment'
  entity_id     text not null,
  amount_impact integer,                  -- dampak rupiah, negatif jika mengurangi pendapatan
  old_value     jsonb,
  new_value     jsonb,
  reason        text,
  approved_by   uuid references auth.users(id),
  approved_at   timestamptz,
  ip_address    inet,
  device_label  text
);

-- Append-only ditegakkan di level database, bukan hanya di aplikasi.
create rule audit_log_no_update as on update to public.audit_log do instead nothing;
create rule audit_log_no_delete as on delete to public.audit_log do instead nothing;

create index audit_log_sensitive_idx
  on public.audit_log (business_date, action, actor_id);

alter table public.audit_log enable row level security;
create policy audit_read_admin on public.audit_log for select to authenticated
using (
  exists (select 1 from public.profiles p
           where p.id = (select auth.uid()) and p.role in ('admin','owner'))
);
-- Tidak ada policy INSERT untuk authenticated: penulisan hanya lewat
-- trigger / RPC SECURITY DEFINER, sehingga tidak bisa dipalsukan dari client.
```

`actor_name` dan `actor_role` disimpan sebagai **snapshot**, bukan join ke `profiles`. Kalau staf resign dan akunnya dihapus atau rolenya diubah, jejak audit tetap menunjukkan siapa dan dengan wewenang apa aksi itu dilakukan pada saat kejadian.

#### 5.8.4 Laporan Kontrol Internal

**LAP-05 — Aktivitas Sensitif Harian.** Muncul otomatis di dashboard owner setiap pagi. Target: **dapat dibaca dalam 30 detik**.

| Kolom | Keterangan |
|---|---|
| `waktu` | |
| `kasir` | Nama individual |
| `aksi` | Diskon / Void / Refund / Override |
| `struk_no` | |
| `nilai_dampak` | Rupiah, negatif |
| `alasan` | Teks yang diisi kasir |
| `disetujui_oleh` | Kosong = tidak butuh approval |

**LAP-06 — Rekap Diskon & Void per Kasir.** Bulanan, satu baris per kasir.

| Kolom | Kenapa penting |
|---|---|
| `kasir_nama` | |
| `total_transaksi_ditangani` | Penyebut — tanpa ini, kasir yang bekerja paling banyak akan selalu terlihat paling mencurigakan |
| `jumlah_diskon` / `nilai_diskon` | |
| `persen_transaksi_berdiskon` | `jumlah_diskon / total_transaksi × 100` — **inilah angka yang dibandingkan antar kasir** |
| `jumlah_void_prabayar` / `nilai` | Relatif normal |
| `jumlah_void_pascabayar` / `nilai` | **Kolom paling penting di seluruh laporan ini** |
| `persen_void_pascabayar` | |
| `jumlah_override_walkin` | |
| `selisih_kas_kumulatif` | Total selisih kas fisik dari shift-shift yang ditangani |
| `rata_rata_nilai_transaksi` | Nilai yang jauh di bawah rata-rata venue bisa mengindikasikan transaksi tidak diinput penuh |

**Cara membaca yang harus dijelaskan di UI:** yang dicari bukan nilai absolut, tapi **outlier relatif**. Kasir yang mem-void 8% transaksinya sementara rata-rata venue 1,5% adalah sinyal — walaupun nilai rupiahnya kecil. Sistem harus menyorot baris yang menyimpang lebih dari **2× median venue** dengan warna maroon, dan menuliskan kalimat penjelas: *"Rian: 8,2% transaksi di-void setelah bayar. Median venue 1,4%. Perlu ditanyakan."*

**LAP-07 — Anomali Terdeteksi.** Aturan deteksi yang berjalan otomatis:

| ID Aturan | Aturan | Severity |
|---|---|---|
| ANO-01 | Void pascabayar > 3× dalam satu shift oleh satu kasir | Tinggi |
| ANO-02 | Diskon > 25% diberikan tanpa record approval | **Critical** |
| ANO-03 | Selisih kas fisik > Rp 50.000 (konfigurabel) | Tinggi |
| ANO-04 | Selisih kas selalu negatif ≥ 5 shift berturut-turut oleh kasir yang sama | **Critical** |
| ANO-05 | Gap pada nomor struk | **Critical** |
| ANO-06 | Sesi meja berjalan > 30 menit tanpa ada tab/order terkait | Sedang (indikasi meja dipakai tanpa dicatat) |
| ANO-07 | Utilisasi meja fisik (dari log lampu/sensor, Fase 3) ≠ utilisasi tercatat | Tinggi |
| ANO-08 | Transaksi cash pada jam di luar jam operasional | Tinggi |
| ANO-09 | Pembukaan kembali periode yang sudah ditutup | **Critical** |
| ANO-10 | `orphan_system` di rekonsiliasi (§5.6.3 Langkah 5) | **Critical** |

| ID | Requirement | MoSCoW |
|---|---|---|
| FN-63 | Akun individual per staf; login bersama dilarang secara teknis (satu sesi aktif per akun, konfigurabel) | **Must** |
| FN-64 | Matriks aksi sensitif §5.8.2 ditegakkan di level RPC `SECURITY DEFINER`, bukan hanya disembunyikan di UI | **Must** |
| FN-65 | Alasan wajib minimal 10 karakter untuk semua aksi sensitif; dropdown alasan preset **harus** disertai field teks bebas | **Must** |
| FN-66 | Void pascabayar & refund wajib approval role lebih tinggi dengan re-autentikasi (PIN) | **Must** |
| FN-67 | `audit_log` append-only ditegakkan lewat RULE di database; tidak ada policy INSERT untuk `authenticated` | **Must** |
| FN-68 | `actor_name` & `actor_role` disimpan sebagai snapshot, bukan join | **Must** |
| FN-69 | LAP-05 Aktivitas Sensitif Harian muncul otomatis di dashboard owner | **Must** |
| FN-70 | LAP-06 Rekap Diskon & Void per Kasir dengan **penyebut** jumlah transaksi ditangani | **Must** |
| FN-71 | Outlier > 2× median venue disorot otomatis dengan kalimat penjelas berbahasa manusia | **Should** |
| FN-72 | LAP-07 Anomali otomatis dengan 10 aturan §5.8.4 | **Should** (ANO-02, ANO-05, ANO-09, ANO-10 = **Must**) |
| FN-73 | Notifikasi push/email ke owner untuk anomali severity **Critical**, real-time bukan batch harian | **Should** |
| FN-74 | Batas diskon per role (kasir 10%, admin 25%, owner tanpa batas) dikonfigurasi, bukan hardcode | **Should** |
| FN-75 | Deteksi anomali berbasis pola statistik (mis. z-score selisih kas per kasir) | **Won't** (Fase 3) |

---

### 5.9 Ringkasan Prioritas MoSCoW Seksi 5

| Prioritas | Jumlah | ID |
|---|---|---|
| **Must** | 40 | FN-01, 02, 03, 04, 07, 08, 09, 13, 14, 17, 18, 21, 22, 23, 29, 30, 32, 33, 36, 37, 38, 39, 40, 41, 42, 46, 47, 48, 49, 50, 51, 53, 54, 57, 58, 59, 62, 63, 64, 65, 66, 67, 68, 69, 70 |
| **Should** | 22 | FN-05, 10, 11, 12, 15, 16, 19, 24, 25, 28, 31, 34, 43, 45, 52, 60, 61, 71, 72, 73, 74 |
| **Could** | 8 | FN-06, 20, 26, 27, 35, 44, 56 |
| **Won't (Fase 3)** | 2 | FN-55, 75 |

**Yang wajib ada sejak hari pertama, tidak bisa ditunda ke Fase 2:** pemisahan lima lapis uang (FN-01), kolom `commissioned_on`/`decommissioned_on` (FN-09), `business_date` di semua agregasi (FN-57), audit log append-only dengan akun individual (FN-63, FN-67), dan nomor struk tanpa gap (FN-42). Semuanya berbiaya mendekati nol kalau dipasang sekarang, dan semuanya memerlukan migrasi data yang menyakitkan atau mustahil kalau ditambahkan setelah venue berjalan enam bulan.

---

### 5.10 Asumsi yang Perlu Dikonfirmasi Pemilik

| ID | Asumsi | Dampak jika salah |
|---|---|---|
| Q-F01 | **[PERLU KONFIRMASI]** Harga tayang tax-inclusive (pelanggan melihat harga final termasuk PBJT) | Kalau exclusive, seluruh rumus §5.1.2 berubah dan halaman checkout harus menampilkan pajak sebagai tambahan |
| Q-F02 | **[PERLU KONFIRMASI]** Tarif PBJT yang berlaku: berapa persen untuk F&B dan berapa untuk hiburan/biliar di Perda kota SPL | Risiko klasifikasi "bar" 40% mengubah seluruh model margin |
| Q-F03 | **[PERLU KONFIRMASI]** Apakah SPL menerapkan service charge? Kalau ya, berapa persen dan apakah masuk pendapatan venue atau dana tip staf | Menentukan FN-06 dan perhitungan DPP (service charge masuk dasar pengenaan PBJT) |
| Q-F04 | **[PERLU KONFIRMASI]** Jam operasional pasti dan apakah berbeda weekday/weekend | Penyebut utilisasi (M-11) dan batas hari operasional |
| Q-F05 | **[PERLU KONFIRMASI]** Apakah venue memakai QRIS statis di kasir selain aplikasi | Jalur uang tak terlihat sistem; wajib prosedur input manual |
| Q-F06 | **[PERLU KONFIRMASI]** Apakah ada mesin EDC, dari bank mana, dan siklus settlement-nya | Rekonsiliasi kanal EDC (FN-56) |
| Q-F07 | **[PERLU KONFIRMASI]** Target utilisasi yang dianggap sehat oleh pemilik | Threshold warna KPI (FN-20) |
| Q-F08 | **[PERLU KONFIRMASI]** Jumlah akun staf yang butuh akses dashboard, dan siapa yang berperan `owner` vs `admin` | Matriks approval §5.8.2 |
| Q-F09 | **[PERLU KONFIRMASI]** Apakah Bapenda setempat mewajibkan format SPTPD tertentu atau e-SPTPD | Struktur LAP-04 |
| Q-F10 | **[PERLU KONFIRMASI]** Ambang selisih kas yang dianggap wajar (ASUMSI Rp 50.000) | ANO-03 |
| Q-F11 | **ASUMSI:** biaya payout Midtrans Rp 5.000/transfer dan settlement T+2/T+3 — masih menunggu konfirmasi tertulis dari gateway | Perhitungan `variance_amount` batch dan ekspektasi tanggal di alur rekonsiliasi |