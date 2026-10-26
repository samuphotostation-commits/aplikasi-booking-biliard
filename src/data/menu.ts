// Data menu asli pemilik. Harga dalam RUPIAH PENUH sebagai integer — rupiah
// tidak punya sen (PRD KK-24 / §8.3). "26K" di buku menu = 26000.
//
// PATOKAN HARGA: **UPDATE-BUKU-MENU (4).pdf, 7 April 2026** (Drive pemilik,
// folder `SPL / menu`) — keputusan pemilik 19 Okt 2026: *"gunakan yg ada di
// gdrive saat ini sebagai patokan."* Sebelumnya berkas ini disusun dari
// `BUKU MENU SPL (6).pdf` (Juni 2025), dan belasan harganya sudah tidak
// berlaku: bebek 60.000 → 44.000, daging 55.000 → 40.000, ayam asap
// 36–37.000 → 28.000.
//
// YANG SENGAJA BELUM DIPASANG. Buku itu dicetak dua kolom, dan di beberapa
// halaman nama dan harganya saling tindih saat dibaca mesin. Hidangan yang
// pasangan harganya tidak bisa dipastikan TIDAK dimasukkan ke sini — lebih
// baik hidangannya belum ada di layar daripada ada dengan harga yang salah:
//
//   Mie Goreng Ayam · Mienas          26.000 atau 29.000
//   Ayam Penyet · Ayam Cabe Ijo
//     · Ayam Bakar Smoke House         25.000 atau 28.000
//   Ayam (Sauce) Lada Hitam           tertulis dua kali: 28.000 dan 30.000
//   Smoked Sirloin · Tanderloin
//     · Salmon Steak                   199.000 / 145.000 / 231.000, urutan tak jelas
//   Es Jeruk                          28.000 atau 23.000
//   Orange Juice                      tertulis dua kali: 25.000 dan 30.000
//   Iga Bakar Jumbo (1,2 kg) 330.000  sama hidangannya dengan `fp-01`/`fp-02`?
//
// YANG TETAP WALAU TIDAK ADA DI BUKU APRIL 2026. Tujuh mocktail di bawah tidak
// ikut terbaca karena halaman Mocktail-nya terbaca sebagai salinan halaman
// Milk Based — itu cacat bacaan, bukan tanda hidangannya dihapus, dan
// Strawbery Mojito terjual hari ini juga. Begitu pula sembilan hidangan lain
// yang ada di sini tapi tidak di buku (Nasi Goreng Lada Hitam, Iga Slice
// Asap, dll.): dibiarkan sampai pemilik bilang dihapus. Membuang hidangan
// yang ternyata masih dijual membuat kasir tidak bisa menagihnya malam itu
// juga; membiarkan hidangan yang sudah tidak dijual paling-paling ditandai
// habis.

export type Variant = { label: string; options: string[] };

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  note?: string;
  variant?: Variant;
  /** Siapa yang menyiapkan. `billiard` = barang jadi di counter biliar
   *  (rokok, botolan, cemilan) — tidak membuat tiket dapur/bar. */
  station: "kitchen" | "bar" | "billiard";
  /**
   * Hanya untuk barang tambahan pemilik. `false` = tidak muncul lagi di daftar
   * pesanan, TAPI namanya tetap terbaca di pesanan & laporan lama. Barang yang
   * pernah terjual tidak pernah benar-benar dihapus — kalau dihapus, riwayat
   * penjualannya berubah jadi deretan kode tak bernama.
   */
  aktif?: boolean;
};

export type MenuCategory = {
  id: string;
  name: string;
  kicker?: string;
  /** Hanya untuk kasir — tidak ditampilkan di menu HP pelanggan. Dipakai barang
   *  counter biliar: rokok tidak boleh dipesan lewat HP tanpa ada yang
   *  memeriksa umur pembelinya. Kasir menyerahkannya langsung. */
  staffOnly?: boolean;
  items: MenuItem[];
};

const K = (n: number) => n * 1000;

export const MENU: MenuCategory[] = [
  {
    id: "light-bites",
    name: "Light Bites",
    kicker: "Cemilan",
    items: [
      { id: "lb-01", name: "Tempe Mendoan", price: K(18), station: "kitchen" },
      { id: "lb-02", name: "Singkong Goreng Tongkang", price: K(18), station: "kitchen" },
      { id: "lb-10", name: "Lumpia", price: K(20), station: "kitchen" },
      { id: "lb-03", name: "Pisang Goreng", price: K(22), station: "kitchen" },
      { id: "lb-04", name: "Kentang Goreng", price: K(22), station: "kitchen" },
      { id: "lb-11", name: "Chicken Finger", price: K(22), station: "kitchen" },
      { id: "lb-12", name: "Roti Bakar Srikaya", price: K(22), station: "kitchen" },
      { id: "lb-13", name: "Roti Bakar Nuttela", price: K(22), station: "kitchen" },
      { id: "lb-05", name: "Tahu Walik", price: K(25), station: "kitchen" },
      { id: "lb-06", name: "Chicken Nugget", price: K(25), station: "kitchen" },
      { id: "lb-07", name: "Sosis Goreng", price: K(25), station: "kitchen" },
      { id: "lb-08", name: "Chicken Pop Corn", price: K(25), station: "kitchen" },
      { id: "lb-14", name: "Roti Bakar Milo Coklat", price: K(25), station: "kitchen" },
      { id: "lb-15", name: "Roti Bakar Nuttela & Cheese", price: K(25), station: "kitchen" },
      { id: "lb-09", name: "Nachoz Libre", price: K(35), station: "kitchen" },
      { id: "lb-16", name: "Mix Platter Snack", price: K(35), station: "kitchen" },
    ],
  },
  {
    // PENDAMPING NASI — kategori baru dari buku April 2026. Porsi kecil
    // yang dipesan menyertai hidangan utama, jadi urutannya tepat di sini:
    // kasir membukanya sesudah cemilan, sebelum menu besar.
    id: "pendamping",
    name: "Pendamping Nasi",
    kicker: "Porsi kecil",
    items: [
      { id: "pn-01", name: "Kol Goreng Crispy", price: K(6), station: "kitchen" },
      { id: "pn-02", name: "Tahu Kalasan", price: K(6), station: "kitchen" },
      { id: "pn-03", name: "Tahu Bacem", price: K(6), station: "kitchen" },
      { id: "pn-04", name: "Tempe Bacem", price: K(6), station: "kitchen" },
      { id: "pn-05", name: "Terong Crispy", price: K(6), station: "kitchen" },
      { id: "pn-06", name: "Tahu Crispy", price: K(6), station: "kitchen" },
      { id: "pn-07", name: "Tempe Mendoan (pendamping)", price: K(8), station: "kitchen" },
      { id: "pn-08", name: "Mata Sapi (2 pcs)", price: K(10), station: "kitchen" },
      { id: "pn-09", name: "Dadar Biasa (ayam)", price: K(10), station: "kitchen" },
      { id: "pn-10", name: "Bakwan Jagung", price: K(10), station: "kitchen" },
      { id: "pn-11", name: "Telur Rebus (2 pcs)", price: K(10), station: "kitchen" },
      { id: "pn-12", name: "Dadar Barendo (bebek)", price: K(15), station: "kitchen" },
      { id: "pn-13", name: "Omelete", price: K(15), station: "kitchen" },
    ],
  },
  {
    id: "vegetables",
    name: "Vegetables",
    kicker: "Sayuran",
    items: [
      { id: "vg-04", name: "Lalapan Sayur", price: K(6), station: "kitchen" },
      { id: "vg-01", name: "Cah Kangkung", price: K(10), station: "kitchen" },
      { id: "vg-05", name: "Cah Kangkung Special", price: K(15), station: "kitchen" },
      { id: "vg-06", name: "Cah Tauge Special", price: K(15), station: "kitchen" },
      {
        id: "vg-02", name: "Capcay", price: K(25), station: "kitchen",
        variant: { label: "Pilihan isi", options: ["Ayam", "Seafood"] },
      },
      {
        id: "vg-03", name: "Sapo Tofu", price: K(29), station: "kitchen",
        variant: { label: "Pilihan isi", options: ["Ayam", "Seafood"] },
      },
    ],
  },
  {
    id: "fried-rice",
    name: "Fried Rice",
    kicker: "Nasi Goreng",
    items: [
      { id: "fr-01", name: "Nasi Goreng Telur", price: K(25), station: "kitchen" },
      { id: "fr-05", name: "Nasi Goreng Tek Tek", price: K(25), station: "kitchen" },
      { id: "fr-06", name: "Nasi Goreng Ayam", price: K(29), station: "kitchen" },
      { id: "fr-02", name: "Nasi Goreng Kampung", price: K(29), station: "kitchen" },
      { id: "fr-07", name: "Nasi Goreng Seafood", price: K(35), station: "kitchen" },
      { id: "fr-03", name: "Nasi Goreng Lada Hitam", price: K(44), station: "kitchen" },
      { id: "fr-04", name: "Nasi Goreng Special Smoked House", price: K(45), station: "kitchen" },
    ],
  },
  {
    id: "fried-noodles",
    name: "Fried Noodles",
    kicker: "Mie & Bihun",
    items: [
      { id: "fn-01", name: "Bihun Goreng", price: K(25), station: "kitchen" },
      { id: "fn-02", name: "Mie Goreng", price: K(25), station: "kitchen" },
      { id: "fn-05", name: "Kwetiaw Goreng Seafood", price: K(35), station: "kitchen" },
      { id: "fn-03", name: "Bihun Goreng Smoked House", price: K(45), station: "kitchen" },
      { id: "fn-04", name: "Mie Goreng Smoked House", price: K(45), station: "kitchen" },
    ],
  },
  {
    // RICE BOWL — kategori baru dari buku April 2026.
    id: "rice-bowl",
    name: "Rice Bowl",
    kicker: "Nasi mangkuk",
    items: [
      { id: "rb-01", name: "Rice Bowl Rica Rica Kuah", price: K(25), station: "kitchen" },
      { id: "rb-02", name: "Rice Bowl Rica Rica Manado", price: K(25), station: "kitchen" },
      { id: "rb-03", name: "Rice Bowl Ayam Lada Hitam", price: K(26), station: "kitchen" },
      { id: "rb-04", name: "Rice Bowl Katsu Teriyaki", price: K(32), station: "kitchen" },
      { id: "rb-05", name: "Rice Bowl Sapi Lada Hitam", price: K(32), station: "kitchen" },
      { id: "rb-06", name: "Rice Bowl Gyudon Beef", price: K(32), station: "kitchen" },
    ],
  },
  {
    // MAKANAN BERKUAH — kategori baru dari buku April 2026. Inilah rumah
    // folder foto "MENU BERKUAH" yang dulu tidak punya tempat.
    id: "berkuah",
    name: "Makanan Berkuah",
    kicker: "Soto & soup",
    items: [
      { id: "bk-01", name: "Soto Ayam", price: K(18), station: "kitchen" },
      { id: "bk-02", name: "Soto Kudus", price: K(18), station: "kitchen" },
      { id: "bk-03", name: "Soup Ayam", price: K(20), station: "kitchen" },
      { id: "bk-04", name: "Soup Daging", price: K(44), station: "kitchen" },
      { id: "bk-05", name: "Soup Iga", price: K(95), station: "kitchen" },
      { id: "bk-06", name: "Soup Buntut", price: K(95), station: "kitchen" },
    ],
  },
  {
    id: "smokehouse-ayam",
    name: "Smokehouse Ayam",
    kicker: "Pilihan Olahan Ayam",
    items: [
      { id: "sa-09", name: "Ayam Geprek", price: K(24), station: "kitchen" },
      { id: "sa-10", name: "Ayam Cianjur", price: K(25), station: "kitchen" },
      { id: "sa-01", name: "Ayam Asap Sambal Pecel", price: K(28), station: "kitchen" },
      { id: "sa-02", name: "Ayam Asap Cabe Ijo", price: K(28), station: "kitchen" },
      { id: "sa-04", name: "Ayam Asap Sambal Kemangi", price: K(28), station: "kitchen" },
      { id: "sa-11", name: "Ayam Asap Sambal Bawang", price: K(28), station: "kitchen" },
      { id: "sa-05", name: "Ayam Sauce Rica-Rica Kuah", price: K(28), station: "kitchen" },
      { id: "sa-06", name: "Ayam Sauce Rawit", price: K(28), station: "kitchen" },
      // TIGA DI BAWAH TIDAK ADA DI BUKU APRIL 2026, jadi harganya TIDAK
      // diubah — bukan karena masih berlaku, tapi karena tidak ada angka
      // baru yang bisa dipercaya. Kelihatan ganjil di layar (36–40 ribu
      // berdampingan dengan 28 ribu), dan memang begitu maksudnya: itu
      // pertanyaan yang belum dijawab, bukan harga yang sudah diputuskan.
      { id: "sa-03", name: "Ayam Asap Sambal Dadak", price: K(36), station: "kitchen" },
      { id: "sa-07", name: "Ayam Sauce Rica Manado", price: K(36), station: "kitchen" },
      { id: "sa-08", name: "Ayam Sauce Lada Hitam", price: K(40), station: "kitchen" },
    ],
  },
  {
    id: "smokehouse-bebek",
    name: "Smokehouse Bebek",
    kicker: "Pilihan Olahan Bebek",
    items: [
      { id: "sb-05", name: "Bebek Goreng Cianjur", price: K(44), station: "kitchen" },
      { id: "sb-01", name: "Bebek Asap Sambal Pecel", price: K(44), station: "kitchen" },
      { id: "sb-02", name: "Bebek Asap Cabe Ijo", price: K(44), station: "kitchen" },
      { id: "sb-03", name: "Bebek Asap Sambal Dadak", price: K(44), station: "kitchen" },
      { id: "sb-04", name: "Bebek Asap Sambal Bawang", price: K(44), station: "kitchen" },
      { id: "sb-06", name: "Bebek Asap Sambal Kemangi", price: K(44), station: "kitchen" },
      { id: "sb-07", name: "Bebek Bakar Smoke House", price: K(45), station: "kitchen" },
    ],
  },
  {
    id: "smokehouse-daging",
    name: "Smokehouse Daging",
    kicker: "Pilihan Olahan Daging",
    items: [
      { id: "sd-01", name: "Daging Asap Sambal Pecel", price: K(40), station: "kitchen" },
      { id: "sd-02", name: "Daging Asap Cabe Ijo", price: K(40), station: "kitchen" },
      { id: "sd-03", name: "Daging Asap Sambal Dadak", price: K(40), station: "kitchen" },
      { id: "sd-04", name: "Daging Asap Sambal Bawang", price: K(40), station: "kitchen" },
      { id: "sd-05", name: "Daging Asap Sambal Kemangi", price: K(40), station: "kitchen" },
    ],
  },
  {
    id: "smokehouse-buntut",
    name: "Smokehouse Buntut Sapi",
    kicker: "Pilihan Olahan Buntut",
    items: [
      { id: "sk-05", name: "Buntut Goreng Cianjur", price: K(95), station: "kitchen" },
      { id: "sk-01", name: "Buntut Asap Sambal Pecel", price: K(95), station: "kitchen" },
      { id: "sk-02", name: "Buntut Asap Cabe Ijo", price: K(95), station: "kitchen" },
      { id: "sk-03", name: "Buntut Asap Sambal Dadak", price: K(95), station: "kitchen" },
      { id: "sk-04", name: "Buntut Asap Sambal Bawang", price: K(95), station: "kitchen" },
      { id: "sk-06", name: "Buntut Asap Sambal Kemangi", price: K(95), station: "kitchen" },
    ],
  },
  {
    // IGA TRADITIONAL — kategori baru dari buku April 2026. Dipisah dari
    // "Beef Ribs" karena bukunya sendiri memisahkannya: yang ini iga bakar
    // bersambal, yang satu lagi iga panggang bersaus western.
    id: "iga-traditional",
    name: "Iga Traditional",
    kicker: "Iga bakar bersambal",
    items: [
      { id: "it-01", name: "Iga Bakar Asap Sambal Dadak", price: K(85), station: "kitchen" },
      { id: "it-02", name: "Iga Bakar Sambal Ijo", price: K(85), station: "kitchen" },
      { id: "it-03", name: "Iga Bakar Sambal Pecel", price: K(85), station: "kitchen" },
      { id: "it-04", name: "Iga Bakar Sambal Kemangi", price: K(85), station: "kitchen" },
      { id: "it-05", name: "Iga Bakar Sambal Bawang", price: K(85), station: "kitchen" },
    ],
  },
  {
    id: "beef-ribs",
    name: "Beef Ribs",
    kicker: "Western & Nusantara",
    items: [
      {
        id: "br-01", name: "Iga Slice Asap — Western", price: K(92), station: "kitchen",
        note: "Iga dibakar & diasap dengan rempah, disajikan dengan kentang goreng dan kacang.",
        variant: { label: "Pilihan saus", options: ["Black Peppers", "Spicy BBQ Sauce", "Double Cheese"] },
      },
      {
        id: "br-02", name: "Iga Cocktail Asap — Nusantara", price: K(75), station: "kitchen",
        variant: { label: "Pilihan sambal", options: ["Sambal Pecel", "Sambal Ijo", "Sambal Bawang", "Sambal Dadak"] },
      },
      {
        id: "br-03", name: "Iga Slice Asap — Nusantara", price: K(86), station: "kitchen",
        variant: { label: "Pilihan sambal", options: ["Sambal Pecel", "Sambal Ijo", "Sambal Bawang", "Sambal Dadak"] },
      },
      // INILAH "PAKET 115 / 125" yang ditanyakan pemilik: bukan paket, tapi
      // dua baris Smoke Grilled Beef Ribs di buku April 2026.
      { id: "br-04", name: "Smoke Grilled Beef Ribs", price: K(115), station: "kitchen" },
      { id: "br-05", name: "Smoke Grilled Beef Ribs Double Cheese", price: K(125), station: "kitchen" },
    ],
  },
  {
    // HOT PLATE — kategori baru dari buku April 2026. Tiga saus steak-nya
    // dipasang sebagai varian, persis seperti tertulis di bukunya.
    //
    // Halaman STEAK (Sirloin / Tanderloin / Salmon) BELUM dipasang: ketiga
    // harganya tercetak bertumpuk (199.000 / 145.000 / 231.000) dan urutannya
    // tidak terbaca. Itu hidangan termahal di buku — salah satu arah pun
    // mahal — jadi ditunggu kepastiannya.
    id: "hot-plate",
    name: "Hot Plate",
    kicker: "Disajikan panas di atas plat",
    items: [
      { id: "hp-01", name: "Katsu Chicken Teriyaki", price: K(55), station: "kitchen" },
      { id: "hp-02", name: "Gyudon Beef Sukiyaki Style", price: K(65), station: "kitchen" },
      {
        id: "hp-03", name: "Smoked Beef & Dice Cut Steak", price: K(135), station: "kitchen",
        variant: { label: "Pilihan saus", options: ["Mushroom Sauce", "Black Pepper Sauce", "BBQ Sauce"] },
      },
      {
        id: "hp-04", name: "Smoked Dice Cut Loin Steak", price: K(135), station: "kitchen",
        variant: { label: "Pilihan saus", options: ["Mushroom Sauce", "Black Pepper Sauce", "BBQ Sauce"] },
      },
    ],
  },
  {
    id: "family",
    name: "Family Package",
    kicker: "Porsi 3–4 orang",
    items: [
      {
        id: "fp-01", name: "Iga Bakar Asap Jumbo — Nusantara", price: K(350), station: "kitchen",
        note: "Porsi untuk 3–4 orang.",
        variant: { label: "Pilihan sambal", options: ["Sambal Pecel", "Sambal Ijo", "Sambal Bawang", "Sambal Dadak"] },
      },
      {
        id: "fp-02", name: "Iga Bakar Asap Jumbo — Western", price: K(335), station: "kitchen",
        note: "Porsi untuk 3–4 orang.",
        variant: { label: "Pilihan saus", options: ["Black Peppers", "Spicy BBQ Sauce", "Double Cheese"] },
      },
      // Buku April 2026 memuat satu "Iga Bakar Jumbo (1,2 kg) 330.000".
      // TIDAK ditambahkan sebagai baris ketiga: kemungkinan besar itu
      // hidangan yang sama dengan dua di atas, dan tiga piring iga jumbo
      // yang nyaris sama di satu layar membuat kasir memilih yang salah.
    ],
  },
  {
    // OTHERS — kategori baru dari buku April 2026. Tambahan kecil yang
    // selama ini tidak bisa ditagih sama sekali: nasi putih, saus, emping.
    id: "others",
    name: "Others",
    kicker: "Tambahan",
    items: [
      { id: "ot-01", name: "Extra Chili Sauce", price: K(3), station: "kitchen" },
      { id: "ot-02", name: "Extra Tomato Sauce", price: K(3), station: "kitchen" },
      { id: "ot-03", name: "Extra Sambal", price: K(3), station: "kitchen" },
      { id: "ot-04", name: "Nasi Putih", price: K(5), station: "kitchen" },
      { id: "ot-05", name: "Cheese Sauce", price: K(5), station: "kitchen" },
      { id: "ot-06", name: "BBQ Sauce", price: K(5), station: "kitchen" },
      { id: "ot-07", name: "Mushroom Sauce", price: K(5), station: "kitchen" },
      { id: "ot-08", name: "Blackpepper Sauce", price: K(5), station: "kitchen" },
      { id: "ot-09", name: "Emping", price: K(6), station: "kitchen" },
    ],
  },
  {
    id: "coffee",
    name: "Coffee Based",
    kicker: "Kopi",
    items: [
      { id: "cf-01", name: "Espresso", price: K(26), station: "bar" },
      { id: "cf-02", name: "Americano", price: K(29), station: "bar" },
      { id: "cf-03", name: "Coffee Latte", price: K(30), station: "bar" },
      { id: "cf-04", name: "Kopi Susu Gula Aren", price: K(33), station: "bar" },
      { id: "cf-05", name: "Kopi Susu Biscotti", price: K(39), station: "bar" },
      { id: "cf-06", name: "Kopi Susu Creamy", price: K(35), station: "bar" },
      { id: "cf-07", name: "Cappucino", price: K(41), station: "bar" },
      { id: "cf-08", name: "Moccacino", price: K(47), station: "bar" },
      { id: "cf-09", name: "Kopi Susu Double Shoot", price: K(47), station: "bar" },
      { id: "cf-10", name: "Caramel Macchiato", price: K(47), station: "bar" },
    ],
  },
  {
    // KOPI & SUSU SACHET — kategori baru dari buku April 2026 (halaman
    // "Drink served with soul"). Inilah minuman yang paling sering dipesan
    // tamu biliar dan selama ini sama sekali tidak bisa ditagih.
    //
    // Harga yang dipasang adalah harga DINGIN. Buku mencantumkan dua harga
    // untuk sebagian minuman (Kopi Tubruk 14.000 es / 12.000 panas), tapi
    // berkas ini cuma punya satu harga per barang. Yang panas karena itu
    // ditagih harga es sampai pemilik memutuskan dipisah atau tidak.
    id: "kopi-sachet",
    name: "Kopi & Susu Sachet",
    kicker: "Es / panas",
    items: [
      { id: "ks-01", name: "Kopi Tubruk", price: K(14), station: "bar" },
      { id: "ks-02", name: "Extra Joss Susu", price: K(15), station: "bar" },
      { id: "ks-03", name: "Kopi Susu", price: K(16), station: "bar" },
      { id: "ks-04", name: "Kuku Bima Susu", price: K(16), station: "bar" },
      { id: "ks-05", name: "Nutrisari Jamsu", price: K(18), station: "bar" },
      { id: "ks-06", name: "Nutrisari Angsu", price: K(18), station: "bar" },
      { id: "ks-07", name: "Nutrisari Mangsu", price: K(18), station: "bar" },
      { id: "ks-08", name: "Nutrisari Jesu", price: K(18), station: "bar" },
      { id: "ks-09", name: "Fanta Susu", price: K(22), station: "bar" },
    ],
  },
  {
    id: "ice-blend",
    name: "Ice Blend",
    kicker: "Milk Based",
    items: [
      { id: "ib-01", name: "Milo Smoke", price: K(35), station: "bar" },
      { id: "ib-02", name: "Chocolate Crunchy", price: K(35), station: "bar" },
      { id: "ib-03", name: "Cookies Cream", price: K(35), station: "bar" },
      { id: "ib-04", name: "Matcha & Cream", price: K(35), station: "bar" },
      { id: "ib-05", name: "Milky Taro", price: K(35), station: "bar" },
      { id: "ib-06", name: "Hershey Cream", price: K(47), station: "bar" },
      { id: "ib-07", name: "Caramel Biscoff Lotus", price: K(48), station: "bar" },
    ],
  },
  {
    id: "mocktail",
    name: "Mocktail",
    kicker: "White Flavour",
    items: [
      { id: "mk-01", name: "Lemon Grass Cooler", price: K(30), station: "bar" },
      { id: "mk-02", name: "Orange Mojito", price: K(41), station: "bar" },
      { id: "mk-03", name: "Mango Mojito", price: K(41), station: "bar" },
      { id: "mk-04", name: "Virgin Mojito", price: K(41), station: "bar" },
      { id: "mk-05", name: "Strawbery Mojito", price: K(47), station: "bar" },
      { id: "mk-06", name: "Lychee Splash Mojito", price: K(47), station: "bar" },
      { id: "mk-07", name: "Blue Lemon Mojito", price: K(47), station: "bar" },
    ],
  },
  {
    id: "juice",
    name: "Fresh Juice",
    kicker: "Jus Segar",
    items: [
      { id: "jc-01", name: "Avocado Juice", price: K(30), station: "bar" },
      { id: "jc-02", name: "Dragon Fruit Juice", price: K(30), station: "bar" },
      { id: "jc-03", name: "Mango Juice", price: K(30), station: "bar" },
      { id: "jc-04", name: "Watermelon Juice", price: K(30), station: "bar" },
      { id: "jc-05", name: "Pineapple Juice", price: K(30), station: "bar" },
      { id: "jc-07", name: "Melon Juice", price: K(30), station: "bar" },
      { id: "jc-06", name: "Mix Juice", price: K(33), station: "bar", note: "Create your own juice" },
      // Orange Juice BELUM dipasang: di buku tertulis dua kali, 25.000 dan
      // 30.000, dan tidak ada cara memastikan mana yang berlaku.
    ],
  },
  {
    // ES SEGAR — kategori baru dari buku April 2026 (halaman "Fresh &
    // Creamy" dan "Refresh Drinks").
    id: "es-segar",
    name: "Es Segar",
    kicker: "Es buah & kelapa",
    items: [
      { id: "es-01", name: "Es Semangka", price: K(23), station: "bar" },
      { id: "es-02", name: "Es Buah", price: K(25), station: "bar" },
      { id: "es-03", name: "Es Jagung Kelapa", price: K(28), station: "bar" },
      { id: "es-04", name: "Es Kelapa", price: K(28), station: "bar" },
      { id: "es-05", name: "Es Teller", price: K(30), station: "bar" },
      // Es Jeruk BELUM dipasang: harganya tercetak bertumpuk dengan Es
      // Kelapa di sebelahnya — 28.000 atau 23.000, tidak bisa dipastikan.
    ],
  },
  {
    id: "cold-drink",
    name: "Cold Drink",
    kicker: "Ice / Hot",
    items: [
      { id: "cd-01", name: "Ice Tea", price: K(10), station: "bar" },
      { id: "cd-02", name: "Ice Blackcurrant", price: K(22), station: "bar" },
      { id: "cd-03", name: "Ice Lemonade", price: K(22), station: "bar" },
      { id: "cd-04", name: "Ice Tea Tarik", price: K(22), station: "bar" },
      { id: "cd-05", name: "Ice Lemon Tea", price: K(22), station: "bar" },
      { id: "cd-06", name: "Ice Green Tea", price: K(22), station: "bar" },
      { id: "cd-07", name: "Ice Lychee Tea", price: K(28), station: "bar" },
      { id: "cd-08", name: "Honey Lemon Tea", price: K(29), station: "bar" },
      { id: "cd-09", name: "Ice Strawberry Lemon Tea", price: K(29), station: "bar" },
      { id: "cd-10", name: "Ice Honey Milk Tea", price: K(40), station: "bar" },
    ],
  },
  {
    id: "tradisional",
    name: "Tradisional Drink",
    kicker: "Ice / Hot",
    items: [
      { id: "td-01", name: "Wedang Jahe", price: K(19), station: "bar" },
      { id: "td-02", name: "Jahe Madu", price: K(27), station: "bar" },
      { id: "td-03", name: "Jahe Susu", price: K(28), station: "bar" },
    ],
  },
  {
    // Barang jadi yang dijual di counter biliar. Harganya diambil dari struk
    // KAS KASIR SPL 3 Okt 2026 (total ÷ qty) — ketiga subtotal struk cocok persis
    // saat diperiksa ulang, jadi angkanya berasal dari penjualan nyata.
    // Inilah isi rekap "BILLIARD"; tanpa ini rekap itu kosong.
    id: "counter-biliar",
    name: "Counter Biliar",
    kicker: "Rokok & botolan · kasir saja",
    staffOnly: true,
    items: [
      { id: "bl-01", name: "A Mild 12", price: K(30), station: "billiard" },
      { id: "bl-02", name: "A Mild 16", price: K(40), station: "billiard" },
      { id: "bl-03", name: "Aqua", price: K(6), station: "billiard" },
      { id: "bl-04", name: "Coca Cola Botol", price: K(10), station: "billiard" },
      { id: "bl-05", name: "Dji Sam Soe", price: K(25), station: "billiard" },
      { id: "bl-06", name: "Dji Sam Soe Kretek", price: K(23), station: "billiard" },
      { id: "bl-07", name: "Fanta Botol", price: K(10), station: "billiard" },
      { id: "bl-08", name: "Ion Water", price: K(10), station: "billiard" },
      { id: "bl-09", name: "LA Ice", price: K(39), station: "billiard" },
      { id: "bl-10", name: "Lucky Strike", price: K(37), station: "billiard" },
      { id: "bl-11", name: "Marlboro FB 12", price: K(30), station: "billiard" },
      { id: "bl-12", name: "Marlboro Ice Burst", price: K(55), station: "billiard" },
      { id: "bl-13", name: "Marlboro Light", price: K(55), station: "billiard" },
      { id: "bl-14", name: "Marlboro Red", price: K(55), station: "billiard" },
      { id: "bl-15", name: "Nutriboost", price: K(10), station: "billiard" },
      { id: "bl-16", name: "Peyek", price: K(10), station: "billiard" },
      { id: "bl-17", name: "Pulpy Orange", price: K(10), station: "billiard" },
      { id: "bl-18", name: "Surya 12", price: K(30), station: "billiard" },
      { id: "bl-19", name: "Surya 16", price: K(40), station: "billiard" },
    ],
  },
];

export const ALL_ITEMS: MenuItem[] = MENU.flatMap((c) => c.items);
export const findItem = (id: string) => ALL_ITEMS.find((i) => i.id === id);
