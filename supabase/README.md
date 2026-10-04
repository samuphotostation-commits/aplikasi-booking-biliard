# Supabase — tahap S2 (menunggu akun baru milik venue)

Berkas di folder ini **belum pernah dijalankan** di project Supabase mana pun. Isinya
rancangan yang sudah siap ditempel begitu akun baru dibuat, supaya pemasangan tinggal
beberapa menit — bukan merancang dari nol.

**Jangan** memakai akun `samuphotostation`: akun itu menjalankan photobooth yang LIVE
dengan paket berbayar. Buat akun baru dengan email khusus venue.

## Urutan pemasangan (±15 menit)

1. Pemilik membuat akun + project `spl-venue`, region **Southeast Asia (Singapore)**.
2. Pemilik mengirim **Project URL** dan **anon / publishable key** saja.
   Jangan pernah mengirim `service_role` key, password database, atau access token lewat chat.
3. Tempel `schema.sql` ke **SQL Editor** dashboard, jalankan.
4. Pasang Edge Function (`functions/`) lewat dashboard atau CLI dengan Personal Access
   Token akun baru — login CLI photobooth di komputer ini tidak disentuh.
5. Isi PIN staf lewat `seed-pin.sql` (hash, bukan PIN polos).
6. Aplikasi dinyalakan ke mode server lewat variabel lingkungan `VITE_SUPABASE_URL`
   dan `VITE_SUPABASE_ANON_KEY`; tanpa keduanya aplikasi tetap berjalan mode lokal.

## Yang dijaga rancangan ini

| Aturan | Cara |
|---|---|
| Urutan & jam ditentukan server | `append_event()` memberi `seq` dan `at_ms` yang tidak pernah mundur |
| Kirim ulang tidak dobel | `venue_events.id` (id klien) unik; pengiriman ulang mengembalikan baris yang sama |
| Pelaku tidak bisa dipalsukan | `by_staff` diisi dari token PIN di Edge Function, bukan dari isian perangkat |
| Perangkat hilang bisa dicabut | Tabel `devices`; token ditolak kalau perangkatnya dinonaktifkan |
| HP pelanggan tidak melihat data pribadi | Tabel jejak tertutup RLS; HP hanya membaca `public_slots` + fungsi pelanggan |
| Uang hanya dari webhook | `confirmOnline` hanya boleh masuk dari fungsi webhook Midtrans (service role) |
