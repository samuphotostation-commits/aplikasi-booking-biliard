/*
 * ═══════════════════════════════════════════════════════════════════
 * SPL — FIRMWARE LAMPU MEJA BILIAR untuk ESP32-S3   (versi 2, server-pull)
 *
 * Menggantikan firmware lama "firmware-app-billiard.ino".
 * Pemetaan pin, susunan dua board, dan relay active-LOW SAMA PERSIS —
 * kabel di panel TIDAK perlu diubah. Yang berubah ARAH komunikasinya.
 *
 * ── Kenapa diubah ─────────────────────────────────────────────────
 * Firmware lama menunggu perintah: panel kasir harus menembak
 * http://10.151.57.203/lampu/T01. Tiga hal membuatnya tidak bisa dipakai:
 *
 *   1. Aplikasi kasir dibuka lewat HTTPS. Browser MEMBLOKIR permintaan
 *      http:// polos dari halaman https:// ("mixed content"), diam-diam,
 *      tanpa pesan apa pun ke kasir. Lampu tidak menyala dan tidak ada
 *      yang tahu kenapa.
 *   2. Hanya perangkat di Wi-Fi yang sama yang bisa. HP manajer di
 *      jaringan seluler tidak akan pernah bisa menyalakan lampu.
 *   3. Kalau ESP32 sempat mati lampu, ia menyala kembali dengan SEMUA
 *      RELAY OFF — padahal meja sedang dipakai tamu. Perintahnya sudah
 *      lewat dan tidak pernah diulang.
 *
 * Versi ini MENARIK, bukan ditembak:
 *
 *   kasir / HP / tablet  →  Supabase  →  ESP32 menarik tiap 1 detik  →  SSR
 *
 *   • Dari perangkat mana pun, jaringan mana pun. Tidak perlu satu Wi-Fi.
 *   • Tidak ada mixed content: ESP32 yang menelepon keluar lewat HTTPS.
 *   • Tidak perlu IP statis, port forwarding, atau izin firewall masuk.
 *   • Internet putus → lampu TETAP pada keadaan terakhir. Tidak ada
 *     perintah "matikan semua" yang bisa lahir dari kegagalan jaringan.
 *   • Listrik ESP32 mati → saat menyala lagi, relay dipulihkan dari
 *     ingatan dalam (NVS) SEBELUM Wi-Fi tersambung, lalu dikoreksi
 *     server. Meja yang sedang dipakai tidak pernah gelap lebih dari
 *     sedetik.
 *   • Password Wi-Fi TIDAK ditanam di kode. Diisi lewat halaman
 *     pengaturan alat, tersimpan di alatnya sendiri.
 *
 * ── Persiapan Arduino IDE ─────────────────────────────────────────
 *   1. File → Preferences → Additional boards manager URLs:
 *      https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
 *   2. Boards Manager → pasang "esp32 by Espressif Systems" (3.x)
 *   3. Board: "ESP32S3 Dev Module"
 *   4. TIDAK ADA library tambahan yang perlu dipasang.
 *      (ArduinoJson tidak dipakai lagi — jawaban server berupa teks biasa.)
 *   5. Upload Speed 921600, Flash Mode QIO 80MHz, USB CDC On Boot: Enabled
 *
 * ── Satu berkas untuk KEDUA board ─────────────────────────────────
 * Nomor board TIDAK lagi di-#define. Dipilih di halaman pengaturan dan
 * disimpan di alatnya. Jadi tidak mungkin lagi salah upload "firmware
 * board 2" ke board 1.
 *
 * ── Cara pasang pertama kali ──────────────────────────────────────
 *   1. Upload. Alat belum tahu Wi-Fi, jadi ia membuka hotspot sendiri:
 *        nama : SPL-Lampu-XXXX      sandi : pasanglampu
 *   2. Sambungkan HP/laptop ke hotspot itu, buka http://192.168.4.1
 *   3. Isi Wi-Fi venue, kunci alat, nomor board. (Alamat server dan anon
 *      key SPL sudah tertanam di firmware — kolomnya dibiarkan kosong.)
 *   4. Simpan. Alat restart dan langsung bekerja.
 *   5. Sesudahnya halaman yang sama bisa dibuka di jaringan venue lewat
 *      http://lampu-spl1.local  (atau IP yang tertulis di Serial Monitor).
 *
 * Tahan tombol BOOT 3 detik (kapan saja, TANPA menekan RESET) untuk
 * membuka hotspot pengaturan lagi. JANGAN tahan BOOT sambil menekan RESET:
 * itu membuat chip masuk mode upload dan firmware tidak berjalan.
 * ═══════════════════════════════════════════════════════════════════
 */

#include <WiFi.h>
#include <WebServer.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <ESPmDNS.h>

static const char* FW_VERSI = "spl-lampu-2.3";

/* Alamat server dan kunci publik SPL sudah terisi dari pabrik, supaya di
   lokasi cukup mengisi Wi-Fi, kunci alat, dan nomor board. Kunci publik ini
   memang terbuka (sama dengan yang ada di situs kasir); yang rahasia hanya
   kunci alat. Bisa diganti dari halaman pengaturan kalau server pindah. */
static const char* URL_BAWAAN  = "https://fhoxdsxabpohafilqxoz.supabase.co";
static const char* ANON_BAWAAN = "sb_publishable_i74ClKA8pIju7KWWRGyGmA_4oVxRNco";

/* ══ PEMETAAN MEJA KE PIN ═══════════════════════════════════════════
   Diambil apa adanya dari firmware lama — kabel tidak berubah.
   Board 1 = T01–T16 (16 kanal). Board 2 = T17–T30, V01–V04, T35 (19 kanal).

   ESP32-S3: GPIO yang aman dipakai output = 1–18, 21, 35–45.
   JANGAN pakai 0 (tombol BOOT), 19/20 (USB), 26–32 (flash/PSRAM),
   43/44 (UART0 — dipakai Serial Monitor).

   Meja yang belum terpasang (T31–T34, T36–T40) bisa ditambahkan nanti
   TANPA upload ulang, lewat kolom "Peta tambahan" di halaman pengaturan.
   ═════════════════════════════════════════════════════════════════ */

struct PetaRelay {
  const char* meja;   // id meja persis seperti di aplikasi (T01, V03, …)
  uint8_t     pin;    // GPIO ESP32-S3
};

static const PetaRelay PETA_BOARD1[] = {
  // Deret kiri breakout board (SSR 1)
  { "T01",  4 }, { "T02",  5 }, { "T03",  6 }, { "T04",  7 },
  { "T05", 15 }, { "T06", 16 }, { "T07", 17 }, { "T08", 18 },
  // Deret kanan breakout board (SSR 2)
  { "T09", 42 }, { "T10", 41 }, { "T11", 40 }, { "T12", 39 },
  { "T13", 38 }, { "T14", 37 }, { "T15", 36 }, { "T16", 35 },
};

static const PetaRelay PETA_BOARD2[] = {
  // Deret kiri breakout board (SSR 3)
  { "T17",  4 }, { "T18",  5 }, { "T19",  6 }, { "T20",  7 },
  { "T21", 15 }, { "T22", 16 }, { "T23", 17 }, { "T24", 18 },
  // Deret kanan breakout board (SSR 4)
  { "T25", 42 }, { "T26", 41 }, { "T27", 40 }, { "T28", 39 },
  { "T29", 38 }, { "T30", 37 }, { "V01", 36 }, { "V02", 35 },
  // Tambahan bawah kiri (SSR 5)
  { "V03",  9 }, { "V04", 10 }, { "T35", 11 },
};

/* Relay/SSR modul biru yang terpasang aktif saat diberi LOW. Kalau suatu
   saat modulnya diganti yang active-HIGH, tukar dua baris ini — atau
   centang "Relay aktif HIGH" di halaman pengaturan (tersimpan di alat). */
static const int LEVEL_ON_DEFAULT  = LOW;

#define MAKS_RELAY   48

/* ══ Keadaan alat ══════════════════════════════════════════════════ */

struct Kanal {
  char    meja[8];
  uint8_t pin;
  bool    on;
};

static Kanal  kanal[MAKS_RELAY];
static int    jumlahKanal = 0;
static int    levelOn     = LEVEL_ON_DEFAULT;

static Preferences nvs;
static WebServer   web(80);

/* Pengaturan yang tersimpan di alat */
static String cfgSsid, cfgPass, cfgUrl, cfgAnon, cfgKunci, cfgPetaExtra, cfgNama;
static int    cfgBoard = 1;
static bool   cfgAktifHigh = false;

/* Jalannya sinkronisasi */
static long          versiServer   = -1;    // versi status yang sedang dipegang
static unsigned long tarikTerakhir = 0;     // millis() saat berhasil terakhir
static unsigned long jedaTarik     = 1000;  // naik sendiri kalau server bermasalah
static unsigned long cobaBerikut   = 0;
static String        pesanTerakhir = "belum pernah menarik";
static uint32_t      hitungOk = 0, hitungGagal = 0;
static bool          modePengaturan = false;
static bool          cobaWifiLatar  = false;   // hotspot terbuka karena Wi-Fi gagal: terus coba
static unsigned long tamuApTerakhir = 0;       // millis() saat terakhir ada HP di hotspot

static WiFiClientSecure tls;
static HTTPClient       http;
static bool             httpSiap = false;

/* ══ Relay ═════════════════════════════════════════════════════════ */

static inline int levelOff() { return levelOn == LOW ? HIGH : LOW; }

static int cariKanal(const String& meja) {
  for (int i = 0; i < jumlahKanal; i++) {
    if (meja.equalsIgnoreCase(kanal[i].meja)) return i;
  }
  return -1;
}

/* Keadaan relay disimpan sebagai satu bilangan bit, bukan 44 kunci NVS:
   satu tulisan per perubahan, bukan 44. Flash NVS punya batas jumlah tulis. */
static uint64_t bitKeadaan() {
  uint64_t b = 0;
  for (int i = 0; i < jumlahKanal; i++) if (kanal[i].on) b |= (1ULL << i);
  return b;
}

static unsigned long simpanTertunda = 0;

static void jadwalkanSimpan() { simpanTertunda = millis() + 2000; }

static void simpanKeadaanKalauPerlu() {
  if (!simpanTertunda || (long)(millis() - simpanTertunda) < 0) return;
  simpanTertunda = 0;
  nvs.begin("lampu", false);
  nvs.putULong64("state", bitKeadaan());
  nvs.putInt("nkanal", jumlahKanal);
  nvs.end();
}

/* Memasang satu relay. `catat` false saat memulihkan dari ingatan supaya
   tidak langsung menulis balik ke NVS. */
static void pasangRelay(int i, bool on, bool catat = true) {
  if (i < 0 || i >= jumlahKanal) return;
  if (kanal[i].on == on && catat) return;
  kanal[i].on = on;
  digitalWrite(kanal[i].pin, on ? levelOn : levelOff());
  if (catat) {
    Serial.printf("[%s] %s (GPIO %d)\n", kanal[i].meja, on ? "NYALA" : "MATI", kanal[i].pin);
    jadwalkanSimpan();
  }
}

static int jumlahNyala() {
  int n = 0;
  for (int i = 0; i < jumlahKanal; i++) if (kanal[i].on) n++;
  return n;
}

/* ══ Menyusun daftar kanal ═════════════════════════════════════════ */

static void tambahKanal(const char* meja, uint8_t pin) {
  if (jumlahKanal >= MAKS_RELAY) return;
  if (cariKanal(String(meja)) >= 0) return;           // jangan dobel
  strncpy(kanal[jumlahKanal].meja, meja, sizeof(kanal[0].meja) - 1);
  kanal[jumlahKanal].meja[sizeof(kanal[0].meja) - 1] = 0;
  kanal[jumlahKanal].pin = pin;
  kanal[jumlahKanal].on  = false;
  jumlahKanal++;
}

/* "T31=12,T32=13" → kanal tambahan tanpa upload ulang. */
static void bacaPetaTambahan(const String& s) {
  int i = 0;
  while (i < (int)s.length()) {
    int koma = s.indexOf(',', i);
    if (koma < 0) koma = s.length();
    String bagian = s.substring(i, koma);
    bagian.trim();
    int eq = bagian.indexOf('=');
    if (eq > 0) {
      String meja = bagian.substring(0, eq);
      int pin = bagian.substring(eq + 1).toInt();
      meja.trim();
      if (meja.length() > 0 && meja.length() < 8 && pin > 0 && pin < 49) {
        tambahKanal(meja.c_str(), (uint8_t)pin);
      }
    }
    i = koma + 1;
  }
}

static void siapkanKanal() {
  jumlahKanal = 0;
  const PetaRelay* peta = (cfgBoard == 2) ? PETA_BOARD2 : PETA_BOARD1;
  int n = (cfgBoard == 2) ? (int)(sizeof(PETA_BOARD2) / sizeof(PETA_BOARD2[0]))
                          : (int)(sizeof(PETA_BOARD1) / sizeof(PETA_BOARD1[0]));
  for (int i = 0; i < n; i++) tambahKanal(peta[i].meja, peta[i].pin);
  if (cfgPetaExtra.length()) bacaPetaTambahan(cfgPetaExtra);
}

/* Memulihkan keadaan SEBELUM pin jadi output.
   Urutannya penting: kalau pinMode() dipanggil duluan, pin ikut nilai
   bawaan (LOW) sesaat — dan pada SSR active-LOW itu berarti SELURUH
   LAMPU BERKEDIP setiap alat restart. */
static void pulihkanKeadaan() {
  nvs.begin("lampu", true);
  uint64_t b = nvs.getULong64("state", 0);
  int      n = nvs.getInt("nkanal", 0);
  nvs.end();

  // Jumlah kanal berubah (board atau peta tambahan diubah) = peta lama
  // tidak lagi berarti. Lebih jujur mulai dari mati dan biarkan server
  // mengoreksi dalam sedetik daripada menyalakan meja yang salah.
  if (n != jumlahKanal) b = 0;

  for (int i = 0; i < jumlahKanal; i++) {
    bool on = (b >> i) & 1ULL;
    digitalWrite(kanal[i].pin, on ? levelOn : levelOff());   // kunci dulu…
    pinMode(kanal[i].pin, OUTPUT);                           // …baru digerakkan
    digitalWrite(kanal[i].pin, on ? levelOn : levelOff());
    kanal[i].on = on;
  }
  Serial.printf("Relay dipulihkan: %d kanal, %d menyala\n", jumlahKanal, jumlahNyala());
}

/* ══ Pengaturan tersimpan ══════════════════════════════════════════ */

static void muatPengaturan() {
  nvs.begin("lampu", true);
  cfgSsid      = nvs.getString("ssid", "");
  cfgPass      = nvs.getString("pass", "");
  cfgUrl       = nvs.getString("url", "");
  cfgAnon      = nvs.getString("anon", "");
  cfgKunci     = nvs.getString("kunci", "");
  cfgPetaExtra = nvs.getString("extra", "");
  cfgNama      = nvs.getString("nama", "");
  cfgBoard     = nvs.getInt("board", 1);
  cfgAktifHigh = nvs.getBool("ahigh", false);
  nvs.end();

  if (cfgBoard != 1 && cfgBoard != 2) cfgBoard = 1;
  levelOn = cfgAktifHigh ? HIGH : LOW;
  if (cfgNama.length() == 0) cfgNama = String("board") + cfgBoard;

  // Alamat Supabase boleh ditulis dengan atau tanpa garis miring penutup.
  cfgUrl.trim();
  while (cfgUrl.endsWith("/")) cfgUrl.remove(cfgUrl.length() - 1);

  /* Server SPL tidak pindah-pindah. Selama alamatnya alamat bawaan (atau
     kosong / bukan https), alamat DAN anon key selalu diambil dari firmware,
     apa pun yang pernah tersimpan. Firmware 2.1 menanam anon key yang
     terpotong dan halaman pengaturan ikut menyimpannya, sehingga server
     menjawab 401 "Invalid API key". Dengan aturan ini kekeliruan semacam
     itu — terpotong, salah ketik, terisi spasi — tidak bisa terjadi lagi.
     Isian manual hanya dipakai kalau teknisi sengaja memindah ke server lain. */
  if (!cfgUrl.startsWith("https://") || cfgUrl.equalsIgnoreCase(URL_BAWAAN)) {
    cfgUrl  = URL_BAWAAN;
    cfgAnon = ANON_BAWAAN;
  }
  cfgAnon.trim();
  if (!cfgAnon.length()) cfgAnon = ANON_BAWAAN;
}

static bool siapKerja() {
  return cfgSsid.length() && cfgUrl.length() && cfgAnon.length() && cfgKunci.length();
}

/* ══ Menarik status dari server ════════════════════════════════════ */

/* BENTUK JAWABAN SERVER — diperiksa langsung ke Supabase venue, 13 Nov 2026.

   Fungsi `lampu_sinkron` mengembalikan `text`. Dulu firmware ini meminta
   `Accept: text/plain` supaya dapat teks mentah; PostgREST di Supabase
   MENOLAKNYA dengan 406 "None of these media types are available:
   text/plain". Kalau dibiarkan, tiap tarikan gagal dan lampu tidak akan
   pernah menyala sama sekali.

   Yang dipakai sekarang `Accept: application/json`, dan jawabannya berupa
   STRING JSON — satu baris dengan tanda kutip di ujung dan baris baru
   ditulis sebagai \n:

     "v=17\nT01=1\nT02=0"

   Fungsi di bawah mengupas bungkus itu. Bentuk teks mentah tetap diterima
   kalau suatu saat PostgREST berubah; yang mana pun yang datang, hasilnya
   sama. */
static void normalkanBadan(String& b) {
  b.trim();
  if (!b.startsWith("\"")) return;
  String out;
  out.reserve(b.length());
  for (int i = 1; i < (int)b.length() - 1; i++) {
    char c = b[i];
    if (c == '\\' && i + 1 < (int)b.length() - 1) {
      char n = b[++i];
      if      (n == 'n') out += '\n';
      else if (n == 't') out += '\t';
      else if (n == 'r') { /* abaikan */ }
      else               out += n;
    } else out += c;
  }
  b = out;
}

/* Kunci alat disalin manusia dari layar kasir ke HP. Spasi, tanda pisah,
   dan baris baru yang ikut tersalin bukan bagian dari kunci — kalau tidak
   dibuang, server menjawab "kunci alat salah" padahal hurufnya benar. */
static String rapikanKunci(String k) {
  String o;
  o.reserve(k.length());
  for (size_t i = 0; i < k.length(); i++) {
    char c = k[i];
    if (c == ' ' || c == '-' || c == 9 || c == 13 || c == 10) continue;
    o += c;
  }
  return o;
}

static String escJson(const String& s) {
  String o;
  o.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '"' || c == '\\') { o += '\\'; o += c; }
    else if (c == '\n') o += "\\n";
    else if ((uint8_t)c < 0x20) { /* buang */ }
    else o += c;
  }
  return o;
}

static void terapkanJawaban(const String& badan) {
  long     versiBaru = versiServer;
  bool     penuh = false;        // jawaban memuat daftar meja
  bool     adaSama = false;      // jawaban memuat penanda "tidak berubah"
  int      diubah = 0;
  uint64_t disebut = 0;          // kanal mana yang muncul di jawaban ini

  int i = 0;
  while (i < (int)badan.length()) {
    int akhir = badan.indexOf('\n', i);
    if (akhir < 0) akhir = badan.length();
    String baris = badan.substring(i, akhir);
    baris.trim();
    i = akhir + 1;
    if (!baris.length()) continue;

    int eq = baris.indexOf('=');
    if (eq <= 0) continue;
    String k = baris.substring(0, eq);
    String v = baris.substring(eq + 1);
    k.trim(); v.trim();

    if (k == "v")    { versiBaru = v.toInt(); continue; }
    if (k == "sama") { adaSama = true; continue; }

    penuh = true;
    int idx = cariKanal(k);
    if (idx < 0) continue;                     // meja milik board sebelah
    disebut |= (1ULL << idx);
    bool on = (v == "1" || v == "true");
    if (kanal[idx].on != on) { pasangRelay(idx, on); diubah++; }
  }

  /* Meja yang DITARIK dari denah (Atur → Meja) hilang dari daftar server.
     Tanpa baris di bawah, lampunya akan menyala selamanya — tidak ada lagi
     yang pernah menyebutnya untuk mematikannya.

     Dimatikan HANYA kalau jawabannya memang daftar penuh (`penuh`). Jawaban
     kosong atau rusak tidak boleh pernah berarti "matikan semua": itu persis
     kegagalan yang dihindari seluruh rancangan ini. */
  if (penuh) {
    for (int j = 0; j < jumlahKanal; j++) {
      if (!((disebut >> j) & 1ULL) && kanal[j].on) {
        Serial.printf("[%s] tidak ada lagi di denah venue\n", kanal[j].meja);
        pasangRelay(j, false);
        diubah++;
      }
    }
  }

  /* Nomor versi hanya dipercaya kalau jawabannya UTUH — entah daftar meja,
     entah penanda "sama". Jawaban yang cuma berisi "v=12" (badan terpotong
     di tengah jalan) dulu akan menaikkan versi alat tanpa satu relay pun
     ikut berubah; sesudah itu server selamanya menjawab "sama=1" dan alat
     terkunci pada keadaan basi. Dengan penjaga ini, tarikan berikutnya
     meminta daftar penuh lagi dan keadaannya pulih sendiri. */
  if (penuh || adaSama) versiServer = versiBaru;
  if (diubah) Serial.printf("Status v%ld diterapkan, %d relay berubah\n", versiServer, diubah);
}

static void tarikStatus() {
  if (WiFi.status() != WL_CONNECTED) {
    pesanTerakhir = "Wi-Fi putus — lampu dipertahankan";
    return;
  }

  if (!httpSiap) {
    // Sertifikat server tidak diperiksa: ESP32 tidak punya jam yang benar
    // sebelum tersambung dan daftar CA-nya tidak pernah diperbarui. Yang
    // lewat jalur ini hanya "meja mana yang lampunya menyala" — tidak ada
    // data tamu, dan tidak ada jalan menulis apa pun ke venue.
    tls.setInsecure();
    tls.setTimeout(6);
    httpSiap = true;
  }

  String alamat = cfgUrl + "/rest/v1/rpc/lampu_sinkron";
  if (!http.begin(tls, alamat)) {
    pesanTerakhir = "alamat Supabase tidak terbaca";
    hitungGagal++;
    http.end();
    return;
  }
  http.setReuse(true);                 // satu jabat tangan TLS dipakai berulang
  http.setTimeout(6000);
  http.addHeader("Content-Type", "application/json");
  // JANGAN diganti ke text/plain: PostgREST menjawab 406. Lihat catatan
  // di atas normalkanBadan().
  http.addHeader("Accept", "application/json");
  http.addHeader("apikey", cfgAnon);
  http.addHeader("Authorization", String("Bearer ") + cfgAnon);

  String body = String("{\"p_token\":\"") + escJson(cfgKunci) +
                "\",\"p_alat\":\"" + escJson(cfgNama) +
                "\",\"p_versi\":" + String(versiServer) +
                ",\"p_ip\":\"" + WiFi.localIP().toString() +
                "\",\"p_rssi\":" + String(WiFi.RSSI()) +
                ",\"p_fw\":\"" + FW_VERSI +
                "\",\"p_nyala\":" + String(jumlahNyala()) +
                ",\"p_relay\":" + String(jumlahKanal) + "}";

  int kode = http.POST(body);
  if (kode == 200) {
    String badan = http.getString();
    normalkanBadan(badan);
    terapkanJawaban(badan);
    tarikTerakhir = millis();
    pesanTerakhir = "ok";
    jedaTarik = 1000;
    hitungOk++;
  } else {
    hitungGagal++;
    String isi = kode > 0 ? http.getString() : String();
    pesanTerakhir = String("server menjawab ") + kode + (isi.length() ? (" — " + isi.substring(0, 120)) : "");
    if (isi.indexOf("Invalid API key") >= 0)
      pesanTerakhir = String("ANON KEY SALAH (") + kode + ") — kosongkan kolom Alamat & Anon key di Pengaturan";
    else if (isi.indexOf("kunci alat salah") >= 0)
      pesanTerakhir = String("KUNCI ALAT SALAH (") + kode + ") — ketik ulang kunci dari layar kasir, Atur > Lampu meja";
    else if (isi.indexOf("kunci alat belum dipasang") >= 0)
      pesanTerakhir = String("KUNCI ALAT BELUM DIPASANG DI SERVER (") + kode + ") — Atur > Lampu meja > Pasang kunci";
    else if (kode < 0)
      pesanTerakhir = String("tidak bisa menghubungi server (") + kode + ") — cek internet Wi-Fi venue";
    Serial.printf("Gagal menarik: %s\n", pesanTerakhir.c_str());
    // Mundur pelan-pelan supaya server tidak dihujani saat ada masalah,
    // tapi tidak pernah lebih lambat dari 15 detik — kasir menunggu.
    jedaTarik = jedaTarik * 2 > 15000 ? 15000 : jedaTarik * 2;
  }
  http.end();
}

/* ══ Halaman web di alat ═══════════════════════════════════════════ */

/* Nama Wi-Fi boleh berisi tanda kutip atau & — tanpa ini, satu SSID
   seperti O'Brien's membuat halaman pengaturannya rusak dan teknisi
   tidak bisa lagi mengubah apa pun dari sana. */
static String esc(const String& s) {
  String o;
  o.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if      (c == '&')  o += "&amp;";
    else if (c == '<')  o += "&lt;";
    else if (c == '>')  o += "&gt;";
    else if (c == '"')  o += "&quot;";
    else if (c == '\'') o += "&#39;";
    else                o += c;
  }
  return o;
}

static String halamanAwal() {
  String h = F("<!doctype html><meta charset=utf-8>"
               "<meta name=viewport content='width=device-width,initial-scale=1'>"
               "<title>SPL Lampu</title><style>"
               "body{font-family:system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:16px}"
               "h1{font-size:18px;margin:0 0 4px}.d{color:#999;font-size:13px}"
               "table{border-collapse:collapse;margin-top:14px;width:100%;max-width:520px}"
               "td{padding:6px 8px;border-bottom:1px solid #333;font-size:14px}"
               "td:last-child{text-align:right}.on{color:#ffd34d;font-weight:600}.off{color:#666}"
               "a.b{display:inline-block;margin-top:16px;padding:9px 14px;background:#222;"
               "border:1px solid #444;border-radius:8px;color:#ddd;text-decoration:none}"
               "</style>");
  h += "<h1>SPL — lampu meja biliar</h1>";
  h += "<div class=d>Alat <b>" + esc(cfgNama) + "</b> · board " + String(cfgBoard) +
       " · " + String(jumlahKanal) + " kanal · " + String(jumlahNyala()) + " menyala</div>";
  h += "<div class=d>" + String(FW_VERSI) + " · IP " + WiFi.localIP().toString() +
       " · sinyal " + String(WiFi.RSSI()) + " dBm</div>";

  unsigned long lalu = tarikTerakhir ? (millis() - tarikTerakhir) / 1000 : 0;
  h += "<div class=d>Status v" + String(versiServer) + " · terakhir tersambung " +
       (tarikTerakhir ? (String(lalu) + " detik lalu") : String("belum pernah")) +
       " · " + esc(pesanTerakhir) + "</div>";
  h += "<div class=d>Berhasil " + String(hitungOk) + " · gagal " + String(hitungGagal) + "</div>";

  h += "<table>";
  for (int i = 0; i < jumlahKanal; i++) {
    h += "<tr><td>" + String(kanal[i].meja) + "</td><td class=d>GPIO " + String(kanal[i].pin) +
         "</td><td class='" + (kanal[i].on ? "on'>NYALA" : "off'>mati") + "</td></tr>";
  }
  h += "</table><a class=b href='/atur'>Pengaturan</a>";
  return h;
}

static String halamanAtur(const String& pesan) {
  String h = F("<!doctype html><meta charset=utf-8>"
               "<meta name=viewport content='width=device-width,initial-scale=1'>"
               "<title>Pengaturan lampu SPL</title><style>"
               "body{font-family:system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:16px;"
               "max-width:520px}h1{font-size:18px}label{display:block;margin:12px 0 4px;font-size:13px;color:#bbb}"
               "input,select{width:100%;box-sizing:border-box;padding:10px;background:#1b1b1b;color:#eee;"
               "border:1px solid #444;border-radius:8px;font-size:15px}"
               "button{margin-top:18px;width:100%;padding:12px;background:#c8a24a;color:#111;border:0;"
               "border-radius:8px;font-size:16px;font-weight:600}"
               ".d{color:#888;font-size:12px;margin-top:4px}.p{background:#243;padding:10px;border-radius:8px}"
               "</style>");
  h += "<h1>Pengaturan alat lampu</h1>";
  if (pesan.length()) h += "<div class=p>" + esc(pesan) + "</div>";
  h += "<form method=POST action='/simpan'>";

  /* Di jaringan venue, halaman ini terbuka untuk siapa pun yang tahu IP-nya —
     termasuk tamu yang memakai Wi-Fi yang sama. Tanpa penjaga di bawah,
     siapa saja bisa mengarahkan alat ke server lain atau mengganti nomor
     board, dan lampu seluruh ruangan ikut salah. Di mode hotspot penjaganya
     tidak dipasang: justru di situlah kunci pertama kali diisi. */
  if (!modePengaturan) {
    h += "<label>Kunci alat sekarang (wajib untuk menyimpan)</label>"
         "<input name=sandi type=text autocomplete=off autocapitalize=off autocorrect=off spellcheck=false>";
    h += "<div class=d>Lupa kuncinya? Tahan tombol BOOT 3 detik (tanpa menekan RESET) — "
         "hotspot pengaturan terbuka tanpa kunci.</div>";
  }
  h += "<label>Nama Wi-Fi venue</label><input name=ssid autocomplete=off autocapitalize=off "
       "autocorrect=off spellcheck=false value='" + esc(cfgSsid) + "'>";
  h += "<label>Password Wi-Fi</label><input name=pass type=password placeholder='"
       + String(cfgPass.length() ? "(tersimpan — kosongkan kalau tidak diubah)" : "") + "'>";
  h += "<label>Kunci alat</label><input name=kunci type=text autocomplete=off autocapitalize=off "
       "autocorrect=off spellcheck=false placeholder='"
       + String(cfgKunci.length() ? "(tersimpan — kosongkan kalau tidak diubah)" : "") + "'>";
  h += "<div class=d>Dibuat pemilik di panel kasir: Atur → Lampu meja. Spasi dan tanda - boleh ikut diketik.</div>";
  // Hanya di hotspot pengaturan: cukup untuk mencocokkan dengan layar kasir,
  // tidak cukup untuk menebak kuncinya.
  if (modePengaturan && cfgKunci.length() >= 8) {
    h += "<div class=d>Tersimpan sekarang: " + String(cfgKunci.length()) + " huruf, berakhiran <b>"
         + esc(cfgKunci.substring(cfgKunci.length() - 4)) + "</b></div>";
  }
  h += "<label>Nomor board</label><select name=board>";
  h += String("<option value=1") + (cfgBoard == 1 ? " selected" : "") + ">1 — T01 sampai T16</option>";
  h += String("<option value=2") + (cfgBoard == 2 ? " selected" : "") + ">2 — T17–T30, V01–V04, T35</option>";
  h += "</select>";
  h += "<label>Nama alat (muncul di panel kasir)</label><input name=nama value='" + esc(cfgNama) + "'>";
  h += "<label>Peta tambahan (opsional)</label><input name=extra value='" + esc(cfgPetaExtra) +
       "' placeholder='T31=12,T32=13'>";
  h += "<div class=d>Untuk meja yang dipasang belakangan, tanpa upload ulang.</div>";
  {
    bool bawaan = cfgUrl.equalsIgnoreCase(URL_BAWAAN);
    h += String("<details") + (bawaan ? "" : " open") + "><summary class=d style='margin-top:14px'>"
         "Lanjutan — server (biarkan kosong)</summary>";
    h += "<div class=d>Server SPL sudah terisi di firmware. Kosongkan dua kolom ini.</div>";
    h += "<label>Alamat Supabase</label><input name=url autocapitalize=off autocorrect=off spellcheck=false value='"
         + (bawaan ? String() : esc(cfgUrl)) + "' placeholder='(bawaan SPL)'>";
    h += "<label>Anon key Supabase</label><input name=anon autocapitalize=off autocorrect=off spellcheck=false value='"
         + (bawaan ? String() : esc(cfgAnon)) + "' placeholder='(bawaan SPL)'>";
    h += "</details>";
  }
  h += "<label>Jenis relay</label><select name=ahigh>";
  h += String("<option value=0") + (!cfgAktifHigh ? " selected" : "") + ">Aktif LOW (modul biru biasa)</option>";
  h += String("<option value=1") + (cfgAktifHigh ? " selected" : "") + ">Aktif HIGH</option>";
  h += "</select>";
  h += "<button type=submit>Simpan &amp; nyalakan ulang</button></form>";
  h += "<div class=d style='margin-top:18px'>Lampu yang sedang menyala TIDAK ikut padam saat disimpan — "
       "keadaannya diingat alat dan dipulihkan setelah restart.</div>";
  return h;
}

static void rutePengaturan() {
  web.on("/", HTTP_GET, []() {
    web.send(200, "text/html; charset=utf-8", modePengaturan ? halamanAtur("") : halamanAwal());
  });
  web.on("/atur", HTTP_GET, []() { web.send(200, "text/html; charset=utf-8", halamanAtur("")); });

  web.on("/simpan", HTTP_POST, []() {
    // Di jaringan venue: tanpa kunci alat yang benar, tidak ada yang berubah.
    if (!modePengaturan && (!cfgKunci.length() || rapikanKunci(web.arg("sandi")) != cfgKunci)) {
      web.send(403, "text/html; charset=utf-8", halamanAtur("Kunci alat salah — tidak ada yang disimpan."));
      return;
    }
    nvs.begin("lampu", false);
    // Keyboard HP sering menambah spasi di ujung nama Wi-Fi.
    { String n = web.arg("ssid"); n.trim(); if (web.hasArg("ssid")) nvs.putString("ssid", n); }
    if (web.arg("pass").length())  nvs.putString("pass",  web.arg("pass"));
    { String u = web.arg("url");  u.trim(); if (web.hasArg("url"))  nvs.putString("url",  u); }
    { String a = web.arg("anon"); a.trim(); if (web.hasArg("anon")) nvs.putString("anon", a); }
    { String k = rapikanKunci(web.arg("kunci")); if (k.length()) nvs.putString("kunci", k); }
    if (web.hasArg("nama"))  nvs.putString("nama",  web.arg("nama"));
    if (web.hasArg("extra")) nvs.putString("extra", web.arg("extra"));
    if (web.hasArg("board")) nvs.putInt("board", web.arg("board").toInt());
    if (web.hasArg("ahigh")) nvs.putBool("ahigh", web.arg("ahigh") == "1");
    nvs.end();
    web.send(200, "text/html; charset=utf-8",
             F("<!doctype html><meta charset=utf-8><body style='font-family:system-ui;background:#111;"
               "color:#eee;padding:24px'>Tersimpan. Alat menyala ulang…"));
    // Simpanan keadaan relay ditunda 2 detik supaya NVS tidak ditulis tiap
    // perubahan. Restart tanpa menuntaskannya membuat lampu yang baru saja
    // berganti lahir kembali dengan keadaan lama.
    simpanTertunda = 1;
    simpanKeadaanKalauPerlu();
    delay(400);
    ESP.restart();
  });

  // Uji satu relay dari jaringan venue — untuk teknisi saat memasang.
  // Dikunci kunci alat supaya tamu yang menebak IP tidak bisa main lampu.
  web.on("/uji", HTTP_GET, []() {
    if (!cfgKunci.length() || rapikanKunci(web.arg("kunci")) != cfgKunci) {
      web.send(403, "text/plain; charset=utf-8", "kunci alat salah");
      return;
    }
    int i = cariKanal(web.arg("meja"));
    if (i < 0) { web.send(404, "text/plain; charset=utf-8", "meja tidak ada di board ini"); return; }
    pasangRelay(i, web.arg("on") == "1");
    // Server akan mengoreksinya dalam sedetik — ini memang hanya untuk
    // memastikan kabelnya benar, bukan cara mengendalikan lampu.
    web.send(200, "text/plain; charset=utf-8", String(kanal[i].meja) + " = " + (kanal[i].on ? "1" : "0"));
  });

  web.on("/ping", HTTP_GET, []() { web.send(200, "text/plain", "pong"); });
  web.onNotFound([]() {
    // Captive portal: apa pun yang dibuka di hotspot mendarat di pengaturan.
    if (modePengaturan) {
      web.sendHeader("Location", String("http://") + WiFi.softAPIP().toString() + "/");
      web.send(302, "text/plain", "");
    } else web.send(404, "text/plain", "404");
  });
}

/* ══ Wi-Fi ═════════════════════════════════════════════════════════ */

static String idAlat() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[8];
  snprintf(buf, sizeof(buf), "%04X", (uint16_t)(mac >> 32));
  return String(buf);
}

static void mulaiModePengaturan(const char* alasan, bool tetapCobaWifi = false) {
  modePengaturan = true;
  httpSiap       = false;                 // sambungan TLS lama tidak berlaku lagi
  cobaWifiLatar  = tetapCobaWifi;
  tamuApTerakhir = millis();
  Serial.printf("Mode pengaturan: %s\n", alasan);
  WiFi.mode(tetapCobaWifi ? WIFI_AP_STA : WIFI_AP);
  String nama = String("SPL-Lampu-") + idAlat();
  WiFi.softAP(nama.c_str(), "pasanglampu");
  Serial.printf("Hotspot \"%s\" (sandi pasanglampu) → buka http://%s\n",
                nama.c_str(), WiFi.softAPIP().toString().c_str());
}

static bool sambungWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);               // jeda 1 detik tidak boleh ikut tidur
  WiFi.setAutoReconnect(true);
  WiFi.begin(cfgSsid.c_str(), cfgPass.c_str());
  Serial.printf("Menyambung ke \"%s\"", cfgSsid.c_str());
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print("."); }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED) return false;
  Serial.printf("Tersambung. IP %s, sinyal %d dBm\n",
                WiFi.localIP().toString().c_str(), WiFi.RSSI());
  String host = String("lampu-spl") + cfgBoard;
  if (MDNS.begin(host.c_str())) Serial.printf("Bisa dibuka di http://%s.local\n", host.c_str());
  return true;
}

/* ══ setup & loop ══════════════════════════════════════════════════ */

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("\n\n═══ SPL lampu meja — %s ═══\n", FW_VERSI);

  muatPengaturan();
  siapkanKanal();
  pulihkanKeadaan();            // relay benar SEBELUM Wi-Fi — ini yang penting

  // Tombol BOOT ditahan saat menyala = buka pengaturan, walau Wi-Fi beres.
  pinMode(0, INPUT_PULLUP);
  bool tahanBoot = false;
  if (digitalRead(0) == LOW) {
    unsigned long t = millis();
    while (digitalRead(0) == LOW && millis() - t < 3000) delay(50);
    tahanBoot = (millis() - t >= 3000);
  }

  rutePengaturan();

  if (tahanBoot)            mulaiModePengaturan("tombol BOOT ditahan");
  else if (!siapKerja())    mulaiModePengaturan("pengaturan belum lengkap");
  else if (!sambungWifi())  mulaiModePengaturan("Wi-Fi tidak tersambung (tetap dicoba tiap 15 detik)", true);

  web.begin();
  Serial.printf("Halaman alat aktif di port 80 — %d kanal dilayani\n", jumlahKanal);
}

void loop() {
  web.handleClient();
  simpanKeadaanKalauPerlu();

  /* Tombol BOOT ditahan 3 detik KAPAN SAJA = buka hotspot pengaturan.
     Dulu hanya dibaca sesaat setelah menyala, sehingga orang menahan BOOT
     sambil menekan RESET — dan itu justru membuat chip ESP32 masuk mode
     upload (firmware tidak jalan sama sekali). Sekarang cukup ditahan. */
  static unsigned long bootDitekan = 0;
  if (!modePengaturan) {
    if (digitalRead(0) == LOW) {
      if (!bootDitekan) bootDitekan = millis() | 1;
      else if (millis() - bootDitekan >= 3000) {
        bootDitekan = 0;
        mulaiModePengaturan("tombol BOOT ditahan 3 detik");
        return;
      }
    } else bootDitekan = 0;
  }

  if (modePengaturan) {
    if (WiFi.softAPgetStationNum() > 0) tamuApTerakhir = millis();
    bool adaTamu = (millis() - tamuApTerakhir) < 20000;

    if (cobaWifiLatar && !adaTamu) {
      if (WiFi.status() == WL_CONNECTED) {
        // Router sudah hidup lagi dan tidak ada yang sedang mengatur: kerja.
        Serial.printf("Wi-Fi venue tersambung lagi. IP %s — keluar dari mode pengaturan\n",
                      WiFi.localIP().toString().c_str());
        WiFi.softAPdisconnect(true);
        WiFi.mode(WIFI_STA);
        modePengaturan = false;
        cobaWifiLatar  = false;
        String host = String("lampu-spl") + cfgBoard;
        MDNS.begin(host.c_str());
        return;
      }
      // Dicoba ulang hanya saat tidak ada HP di hotspot: memindai saluran
      // membuat hotspot tersendat bagi orang yang sedang mengisi pengaturan.
      static unsigned long cobaLagi = 0;
      if (millis() - cobaLagi > 15000) {
        cobaLagi = millis();
        Serial.println("Mencoba Wi-Fi venue lagi…");
        WiFi.begin(cfgSsid.c_str(), cfgPass.c_str());
      }
    }

    // Hotspot dibuka dengan tombol BOOT lalu ditinggal: sesudah 10 menit
    // tanpa HP tersambung, kembali bekerja seperti biasa.
    if (!cobaWifiLatar && siapKerja() && millis() - tamuApTerakhir > 600000UL) {
      Serial.println("Hotspot pengaturan ditinggal 10 menit — menyala ulang");
      simpanTertunda = 1;
      simpanKeadaanKalauPerlu();
      delay(200);
      ESP.restart();
    }
    delay(5);
    return;
  }

  // Wi-Fi putus: dicoba terus, relay DIBIARKAN apa adanya.
  static unsigned long cekWifi = 0;
  if (WiFi.status() != WL_CONNECTED && millis() - cekWifi > 5000) {
    cekWifi = millis();
    Serial.println("Wi-Fi putus — menyambung lagi (lampu dipertahankan)");
    WiFi.reconnect();
    httpSiap = false;                 // sambungan TLS lama sudah tidak berlaku
  }

  if ((long)(millis() - cobaBerikut) >= 0) {
    tarikStatus();
    cobaBerikut = millis() + jedaTarik;
  }

  delay(5);
}
