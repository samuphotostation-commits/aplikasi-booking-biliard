// Data menu asli, disalin dari BUKU MENU SPL (6).pdf (15 halaman).
// Harga dalam RUPIAH PENUH sebagai integer — rupiah tidak punya sen (PRD KK-24 / §8.3).
// "26K" di buku menu = 26000.

export type Variant = { label: string; options: string[] };

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  note?: string;
  variant?: Variant;
  station: "kitchen" | "bar";
};

export type MenuCategory = {
  id: string;
  name: string;
  kicker?: string;
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
      { id: "lb-03", name: "Pisang Goreng", price: K(22), station: "kitchen" },
      { id: "lb-04", name: "Kentang Goreng", price: K(23), station: "kitchen" },
      { id: "lb-05", name: "Tahu Walik", price: K(26), station: "kitchen" },
      { id: "lb-06", name: "Chicken Nugget", price: K(28), station: "kitchen" },
      { id: "lb-07", name: "Sosis Goreng", price: K(28), station: "kitchen" },
      { id: "lb-08", name: "Chicken Pop Corn", price: K(28), station: "kitchen" },
      { id: "lb-09", name: "Nachoz Libre", price: K(35), station: "kitchen" },
    ],
  },
  {
    id: "vegetables",
    name: "Vegetables",
    kicker: "Sayuran",
    items: [
      { id: "vg-01", name: "Cah Kangkung", price: K(18), station: "kitchen" },
      {
        id: "vg-02", name: "Capcay", price: K(26), station: "kitchen",
        variant: { label: "Pilihan isi", options: ["Ayam", "Seafood"] },
      },
      {
        id: "vg-03", name: "Sapo Tofu", price: K(30), station: "kitchen",
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
      { id: "fr-02", name: "Nasi Goreng Kampung", price: K(33), station: "kitchen" },
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
      { id: "fn-03", name: "Bihun Goreng Smoked House", price: K(45), station: "kitchen" },
      { id: "fn-04", name: "Mie Goreng Smoked House", price: K(45), station: "kitchen" },
    ],
  },
  {
    id: "smokehouse-ayam",
    name: "Smokehouse Ayam",
    kicker: "Pilihan Olahan Ayam",
    items: [
      { id: "sa-01", name: "Ayam Asap Sambal Pecel", price: K(37), station: "kitchen" },
      { id: "sa-02", name: "Ayam Asap Cabe Ijo", price: K(36), station: "kitchen" },
      { id: "sa-03", name: "Ayam Asap Sambal Dadak", price: K(36), station: "kitchen" },
      { id: "sa-04", name: "Ayam Asap Sambal Kemangi", price: K(36), station: "kitchen" },
      { id: "sa-05", name: "Ayam Sauce Rica-Rica Kuah", price: K(36), station: "kitchen" },
      { id: "sa-06", name: "Ayam Sauce Rawit", price: K(36), station: "kitchen" },
      { id: "sa-07", name: "Ayam Sauce Rica Manado", price: K(36), station: "kitchen" },
      { id: "sa-08", name: "Ayam Sauce Lada Hitam", price: K(40), station: "kitchen" },
    ],
  },
  {
    id: "smokehouse-bebek",
    name: "Smokehouse Bebek",
    kicker: "Pilihan Olahan Bebek",
    items: [
      { id: "sb-01", name: "Bebek Asap Sambal Pecel", price: K(60), station: "kitchen" },
      { id: "sb-02", name: "Bebek Asap Cabe Ijo", price: K(60), station: "kitchen" },
      { id: "sb-03", name: "Bebek Asap Sambal Dadak", price: K(60), station: "kitchen" },
      { id: "sb-04", name: "Bebek Asap Sambal Bawang", price: K(60), station: "kitchen" },
    ],
  },
  {
    id: "smokehouse-daging",
    name: "Smokehouse Daging",
    kicker: "Pilihan Olahan Daging",
    items: [
      { id: "sd-01", name: "Daging Asap Sambal Pecel", price: K(55), station: "kitchen" },
      { id: "sd-02", name: "Daging Asap Cabe Ijo", price: K(55), station: "kitchen" },
      { id: "sd-03", name: "Daging Asap Sambal Dadak", price: K(55), station: "kitchen" },
      { id: "sd-04", name: "Daging Asap Sambal Bawang", price: K(55), station: "kitchen" },
    ],
  },
  {
    id: "smokehouse-buntut",
    name: "Smokehouse Buntut Sapi",
    kicker: "Pilihan Olahan Buntut",
    items: [
      { id: "sk-01", name: "Buntut Asap Sambal Pecel", price: K(95), station: "kitchen" },
      { id: "sk-02", name: "Buntut Asap Cabe Ijo", price: K(95), station: "kitchen" },
      { id: "sk-03", name: "Buntut Asap Sambal Dadak", price: K(95), station: "kitchen" },
      { id: "sk-04", name: "Buntut Asap Sambal Bawang", price: K(95), station: "kitchen" },
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
      { id: "cf-06", name: "Kopi Susu Creamy", price: K(40), station: "bar" },
      { id: "cf-07", name: "Cappucino", price: K(41), station: "bar" },
      { id: "cf-08", name: "Moccacino", price: K(47), station: "bar" },
      { id: "cf-09", name: "Kopi Susu Double Shoot", price: K(47), station: "bar" },
      { id: "cf-10", name: "Caramel Macchiato", price: K(47), station: "bar" },
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
      { id: "jc-06", name: "Mix Juice", price: K(33), station: "bar", note: "Create your own juice" },
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
];

export const ALL_ITEMS: MenuItem[] = MENU.flatMap((c) => c.items);
export const findItem = (id: string) => ALL_ITEMS.find((i) => i.id === id);
