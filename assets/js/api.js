/* =========================================================
   FIRESENTRY KARHUTLA - Integrasi API resmi
   Sumber: BMKG - Data Prakiraan Cuaca Terbuka
   https://data.bmkg.go.id/prakiraan-cuaca
   Dokumentasi endpoint:
   GET https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4={kode_wilayah}

   CATATAN:
   - Wajib mencantumkan BMKG sebagai sumber data (sudah ditampilkan
     pada elemen .source-note di setiap halaman yang memakai data ini).
   - Kode wilayah (adm4) pada EWS_CONFIG.bmkgAdm4 (assets/js/data.js)
     harus disesuaikan dengan kelurahan yang ingin dipantau. Daftar
     kode wilayah dapat dicari melalui portal wilayah.bmkg.go.id.
   - Jika permintaan gagal (offline, CORS pada environment tertentu,
     atau kode wilayah belum diisi), sistem otomatis memakai data
     contoh (CUACA_3HARI_FALLBACK) agar tampilan tetap dapat berjalan.
   ========================================================= */

async function fetchBmkgCuaca(adm4Code){
  const kode = adm4Code || EWS_CONFIG.bmkgAdm4;
  const url = `${EWS_CONFIG.bmkgEndpoint}?adm4=${encodeURIComponent(kode)}`;
  try{
    const res = await fetch(url, { method: "GET" });
    if(!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    return normalizeBmkgResponse(json);
  }catch(err){
    console.warn("[BMKG API] Tidak dapat mengambil data langsung, memakai data contoh.", err);
    return null; // pemanggil akan fallback ke CUACA_3HARI_FALLBACK
  }
}

/* Mengubah struktur respons BMKG (per-3-jam, 3 hari) menjadi
   ringkasan harian pagi/siang/malam yang dipakai tampilan. */
function normalizeBmkgResponse(json){
  try{
    const cuaca = json?.data?.[0]?.cuaca; // array of array (per hari)
    if(!cuaca) return null;
    const lokasi = json?.lokasi || json?.data?.[0]?.lokasi || {};
    const hasil = cuaca.slice(0,3).map((hariArr) => {
      const suhuArr = hariArr.map(j => j.t);
      const humArr = hariArr.map(j => j.hu);
      const tengahHari = hariArr.find(j => (j.local_datetime||"").includes(" 12:")) || hariArr[Math.floor(hariArr.length/2)];
      return {
        tanggal: hariArr[0]?.local_datetime?.slice(0,10) || "-",
        suhuMin: Math.min(...suhuArr),
        suhuMax: Math.max(...suhuArr),
        kelembapanMin: Math.min(...humArr),
        kelembapanMax: Math.max(...humArr),
        cuacaSiang: tengahHari?.weather_desc || "-",
        angin: tengahHari ? `${tengahHari.ws} km/j - ${tengahHari.wd}` : "-"
      };
    });
    return { lokasi, harian: hasil };
  }catch(e){
    console.warn("[BMKG API] Format respons tidak sesuai dugaan.", e);
    return null;
  }
}

/* =========================================================
   Tren cuaca untuk grafik Dashboard ("Tren Kondisi Cuaca")
   ---------------------------------------------------------
   Berbeda dari fetchBmkgCuaca() di atas (yang meringkas jadi
   min/max per HARI untuk kartu prakiraan 3 hari), fungsi ini
   mengambil titik-titik data MENTAH per-3-jam dari respons BMKG
   yang sama, lalu memotongnya mulai dari titik paling dekat
   dengan waktu sekarang — supaya grafik tren selalu relevan
   dengan "sekarang", bukan berhenti di jam yang di-hardcode.
   ========================================================= */
const EWS_TREN_JUMLAH_TITIK_24JAM = 8; // 8 titik x 3 jam = 24 jam ke depan

async function ewsAmbilTrenCuacaBmkg(adm4Code, jumlahTitik){
  const kode = adm4Code || EWS_CONFIG.bmkgAdm4;
  const n = jumlahTitik || EWS_TREN_JUMLAH_TITIK_24JAM;
  try{
    const res = await fetch(`${EWS_CONFIG.bmkgEndpoint}?adm4=${encodeURIComponent(kode)}`);
    if(!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    const cuaca = json?.data?.[0]?.cuaca; // array per hari, tiap hari array titik per-3-jam
    if(!cuaca) throw new Error("Format respons BMKG tidak sesuai dugaan");

    const flat = cuaca.flat().filter(j => j.local_datetime && typeof j.t === "number" && typeof j.hu === "number");
    flat.sort((a,b) => new Date(a.local_datetime.replace(" ","T")) - new Date(b.local_datetime.replace(" ","T")));

    const sekarang = Date.now();
    let idxMulai = flat.findIndex(j => new Date(j.local_datetime.replace(" ","T")).getTime() >= sekarang);
    if(idxMulai === -1) idxMulai = 0; // semua titik sudah lewat (jarang terjadi) → mulai dari awal yang tersedia

    const dipilih = flat.slice(idxMulai, idxMulai + n);
    if(dipilih.length === 0) throw new Error("Tidak ada titik prakiraan BMKG yang tersedia");

    return {
      sumber: "bmkg",
      label: dipilih.map(j => new Date(j.local_datetime.replace(" ","T")).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})),
      labelTanggal: dipilih.map(j => new Date(j.local_datetime.replace(" ","T")).toLocaleDateString("id-ID",{day:"2-digit",month:"short"})),
      suhu: dipilih.map(j => j.t),
      kelembapan: dipilih.map(j => j.hu),
      indeksPotensi: dipilih.map(j => ewsIndeksPotensiDariCuaca(j.t, j.hu)),
      waktuAmbil: new Date().toISOString()
    };
  }catch(err){
    console.warn("[BMKG API] Gagal mengambil tren cuaca, memakai data contoh.", err);
    return null; // pemanggil (dashboard.html) akan fallback ke ewsBuatTrenContohFallback()
  }
}

/* =========================================================
   Hotspot / titik panas
   Sumber resmi: SIPONGI+ (Kementerian Kehutanan) - tidak
   menyediakan API publik terbuka tanpa autentikasi, sehingga
   untuk integrasi real-time disarankan memakai:
   NASA FIRMS Area API (butuh MAP_KEY gratis dari firms.modaps.eosdis.nasa.gov)
   Contoh endpoint:
   https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/{west},{south},{east},{north}/1

   Fungsi di bawah ini disiapkan sebagai titik integrasi; jika
   MAP_KEY belum diisi, sistem memakai DATA_HOTSPOT (contoh).
   ========================================================= */
/* CATATAN: key ini SENGAJA masih ditulis langsung di sini (beda dengan
   TELEGRAM_BOT_TOKEN yang sudah dipindah ke GitHub Secrets — lihat
   assets/js/notifikasi.js). Situs ini statis tanpa backend, sedangkan
   fitur peta/tabel hotspot di dashboard butuh data live saat halaman
   dibuka di browser siapa pun — bukan cuma saat GitHub Actions jalan.
   Risikonya jauh lebih rendah dari token bot Telegram: MAP_KEY NASA
   FIRMS cuma bisa dipakai untuk QUERY DATA HOTSPOT (baca data publik),
   TIDAK bisa dipakai kirim pesan/aksi apa pun atas nama kamu. Kalau
   suatu saat mau ditutup total, key ini perlu di-generate ulang lewat
   firms.modaps.eosdis.nasa.gov/api/area/ dan pengambilan datanya
   dipindah ke backend/proxy (di luar cakupan situs statis ini). */
const FIRMS_MAP_KEY = "3486f6f3e9c24833f254f4a7f2bf2976"; // API key NASA FIRMS (magang BPBD Pekanbaru)

/* Rentang hari pencarian hotspot FIRMS (day_range pada endpoint area/csv).
   Bisa dipilih pengguna di halaman Data Hotspot / Monitoring (1 / 3 / 7 hari
   terakhir) supaya tabel tidak kosong hanya karena kebetulan tidak ada
   hotspot baru dalam 24 jam terakhir. Disimpan di localStorage supaya
   pilihan yang sama dipakai konsisten oleh kedua halaman & auto-sync. */
const EWS_STORAGE_HOTSPOT_RENTANG = "ews_karhutla_hotspot_rentang_hari";
const EWS_RENTANG_HOTSPOT_PILIHAN = [1, 3, 7, 30]; // nilai yang valid dipilih dari UI
const EWS_RENTANG_HOTSPOT_DEFAULT = 1;

function ewsGetRentangHariHotspot(){
  const v = parseInt(localStorage.getItem(EWS_STORAGE_HOTSPOT_RENTANG), 10);
  return EWS_RENTANG_HOTSPOT_PILIHAN.includes(v) ? v : EWS_RENTANG_HOTSPOT_DEFAULT;
}

function ewsSetRentangHariHotspot(n){
  const v = EWS_RENTANG_HOTSPOT_PILIHAN.includes(n) ? n : EWS_RENTANG_HOTSPOT_DEFAULT;
  localStorage.setItem(EWS_STORAGE_HOTSPOT_RENTANG, String(v));
}

// FIRMS Area API membatasi DAY_RANGE maksimal 5 hari per sekali panggilan
// (dikonfirmasi dari dokumentasi resmi firms.modaps.eosdis.nasa.gov/api/area/).
// Supaya pilihan "7 hari" dan "sebulan (30 hari)" di UI tetap bisa jalan, kita
// pecah jadi beberapa panggilan (maks 5 hari tiap panggilan) pakai parameter
// [DATE] eksplisit, lalu hasilnya digabung. Tanggal dihitung dalam GMT karena
// FIRMS mendasarkan tanggalnya pada GMT (bukan WIB).
const EWS_FIRMS_MAKS_DAY_RANGE = 5;

function ewsTanggalGmtMundur(hariMundur){
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - hariMundur);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (GMT)
}

// Menarik data FIRMS untuk N hari terakhir (sampai hari ini), otomatis dipecah
// jadi beberapa panggilan kalau N > 5. Mengembalikan { titik, berhasil } —
// "berhasil" true kalau MINIMAL satu potongan berhasil dihubungi (supaya
// gagalnya satu potongan di tengah tidak membuat seluruh sinkronisasi dianggap
// gagal total).
async function fetchFirmsRentang(box, totalHari){
  const semuaTitik = [];
  let berhasil = false;
  let sisa = totalHari;
  let mundurAkhir = 0; // jarak hari dari hari ini ke UJUNG (paling baru) potongan saat ini
  while(sisa > 0){
    const ukuran = Math.min(EWS_FIRMS_MAKS_DAY_RANGE, sisa);
    const mundurAwal = mundurAkhir + ukuran - 1; // jarak hari dari hari ini ke AWAL (paling lama) potongan ini
    const tanggalAwal = ewsTanggalGmtMundur(mundurAwal);
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_MAP_KEY}/VIIRS_SNPP_NRT/${box}/${ukuran}/${tanggalAwal}`;
    try{
      const res = await fetch(url);
      if(res.ok){
        const csv = await res.text();
        semuaTitik.push(...parseFirmsCsv(csv));
        berhasil = true;
      }
    }catch(e){
      console.warn("[FIRMS API] Gagal mengambil potongan rentang mulai", tanggalAwal, `(${ukuran} hari)`, e);
    }
    mundurAkhir += ukuran;
    sisa -= ukuran;
  }
  return { titik: semuaTitik, berhasil };
}

async function fetchFirmsHotspot(bbox, hariRentang){
  if(!FIRMS_MAP_KEY) return null;
  const box = bbox || "101.30,0.40,101.60,0.60"; // sekitar Kota Pekanbaru
  const rentang = EWS_RENTANG_HOTSPOT_PILIHAN.includes(hariRentang) ? hariRentang : EWS_RENTANG_HOTSPOT_DEFAULT;
  const { titik, berhasil } = await fetchFirmsRentang(box, rentang);
  return berhasil ? titik : null;
}

function parseFirmsCsv(csv){
  const rows = csv.trim().split("\n");
  const headers = rows[0].split(",");
  return rows.slice(1).map(r => {
    const cols = r.split(",");
    const obj = {};
    headers.forEach((h,i) => obj[h.trim()] = cols[i]);
    return obj;
  });
}

/* =========================================================
   SINKRONISASI REAL-TIME → Monitoring Karhutla
   Inilah fungsi utama yang menjawab: "datanya dari mana?"

   1. Suhu & kelembapan per kecamatan → ditarik LANGSUNG dari
      BMKG (api.bmkg.go.id) untuk kelurahan wakil tiap kecamatan
      (lihat KECAMATAN_ADM4 di data.js), diambil titik data
      terdekat dengan waktu sekarang (bukan rata-rata 3 hari).
   2. Titik panas per kecamatan → ditarik LANGSUNG dari NASA FIRMS
      (data satelit VIIRS/MODIS, sumber yang sama dipakai SIPONGI),
      lalu setiap titik dikelompokkan ke kecamatan terdekat
      berdasarkan koordinat.
   3. Hasilnya disimpan lewat ewsSimpanUpdateMonitoring() — fungsi
      yang SAMA dipakai saat petugas update manual — sehingga
      otomatis mengalir ke Peringatan, Peta, dan Dashboard tanpa
      kode tambahan di halaman lain.

   CATATAN PENTING soal "selalu update tiap hari":
   Karena ini website statis (tanpa server backend), sinkronisasi
   hanya berjalan ketika ada yang MEMBUKA halaman Monitoring (baik
   otomatis saat halaman dibuka, atau lewat tombol "Sinkronkan").
   Untuk auto-update di background 24/7 tanpa perlu ada yang buka
   browser, dibutuhkan server terjadwal (cron job) — di luar
   cakupan website statis ini. Lihat README bagian "Sinkronisasi
   Real-time" untuk opsi lanjutannya.
   ========================================================= */

// Mengambil titik data cuaca BMKG yang PALING DEKAT dengan waktu sekarang
// (bukan rata-rata harian) — dipakai untuk merepresentasikan "kondisi saat ini".
function ewsAmbilCuacaTerkini(bmkgJson){
  try{
    const cuaca = bmkgJson?.data?.[0]?.cuaca;
    if(!cuaca) return null;
    const flat = cuaca.flat();
    const now = Date.now();
    let terdekat = null, selisihMin = Infinity;
    flat.forEach(item => {
      const t = new Date((item.local_datetime||"").replace(" ","T")).getTime();
      if(isNaN(t)) return;
      const selisih = Math.abs(now - t);
      if(selisih < selisihMin){ selisihMin = selisih; terdekat = item; }
    });
    if(!terdekat) return null;
    return { suhu: terdekat.t, kelembapan: terdekat.hu, waktu: terdekat.local_datetime, cuaca: terdekat.weather_desc };
  }catch(e){
    console.warn("[BMKG API] Gagal membaca titik cuaca terkini.", e);
    return null;
  }
}

// Mengelompokkan titik panas FIRMS ke kecamatan terdekat (berdasarkan jarak koordinat)
function ewsKelompokkanHotspotKeKecamatan(points){
  const hasil = {};
  points.forEach(p => {
    const lat = parseFloat(p.latitude), lng = parseFloat(p.longitude);
    if(isNaN(lat) || isNaN(lng)) return;
    let terdekat = null, jarakMin = Infinity;
    WILAYAH_RISIKO.forEach(w => {
      const jarak = Math.hypot(lat - w.lat, lng - w.lng);
      if(jarak < jarakMin){ jarakMin = jarak; terdekat = w.kecamatan; }
    });
    if(terdekat) hasil[terdekat] = (hasil[terdekat] || 0) + 1;
  });
  return hasil;
}

/* =========================================================
   ARSIP DETAIL TITIK PANAS (dipakai halaman Data Hotspot)
   ---------------------------------------------------------
   ewsKelompokkanHotspotKeKecamatan() di atas cuma menghasilkan
   JUMLAH per kecamatan (dipakai Monitoring). Halaman Data Hotspot
   butuh detail PER TITIK (koordinat, jam deteksi, satelit,
   confidence) — makanya dipisah jadi fungsi sendiri di bawah,
   memakai data mentah FIRMS yang sama persis (tidak menambah
   panggilan API baru).
   ========================================================= */

// VIIRS NRT melaporkan confidence sebagai kategori huruf (l/n/h), MODIS
// sebagai angka 0-100. Fungsi ini menangani keduanya jadi label + persen
// yang konsisten dengan tampilan tabel (kolom Confidence & Tingkat Keyakinan).
function ewsNormalisasiConfidenceFirms(raw){
  const angka = parseFloat(raw);
  if(!isNaN(angka) && String(raw).trim() !== ""){
    // Produk berbasis MODIS: confidence sudah dalam bentuk persen asli
    const label = angka >= 80 ? "Tinggi" : angka >= 50 ? "Sedang" : "Rendah";
    return { label, persen: Math.round(angka) };
  }
  // Produk berbasis VIIRS: confidence kategorikal (h = high, n = nominal, l = low).
  // Belum ada angka persen resmi dari FIRMS untuk kategori ini — nilai di bawah
  // adalah representasi kasar per kategori supaya kolom "Tingkat Keyakinan"
  // tetap bisa ditampilkan secara konsisten dengan produk MODIS.
  const k = String(raw).trim().toLowerCase();
  if(k === "h") return { label: "Tinggi", persen: 85 };
  if(k === "n") return { label: "Sedang", persen: 55 };
  return { label: "Rendah", persen: 25 };
}

function ewsNamaSatelitFirms(p){
  // Endpoint yang dipakai saat ini (VIIRS_SNPP_NRT) selalu berasal dari
  // satelit Suomi NPP. Jika suatu saat endpoint ditambah (mis. gabung
  // VIIRS_NOAA20_NRT / MODIS_NRT), sesuaikan pemetaan di sini.
  const instrumen = (p.instrument || "VIIRS").toUpperCase();
  return `SNPP (${instrumen})`;
}

// Mengubah baris mentah FIRMS jadi record arsip siap-tampil (mengikuti bentuk
// yang sama dengan DATA_HOTSPOT contoh di data.js), sekaligus menandai
// kecamatan terdekat — supaya bisa langsung dipakai tabel Data Hotspot.
function ewsBuatDetailHotspotDariFirms(points){
  return points.map(p => {
    const lat = parseFloat(p.latitude), lng = parseFloat(p.longitude);
    if(isNaN(lat) || isNaN(lng)) return null;

    let terdekat = null, jarakMin = Infinity;
    WILAYAH_RISIKO.forEach(w => {
      const jarak = Math.hypot(lat - w.lat, lng - w.lng);
      if(jarak < jarakMin){ jarakMin = jarak; terdekat = w.kecamatan; }
    });

    const { label: confidence, persen } = ewsNormalisasiConfidenceFirms(p.confidence);
    const tanggal = p.acq_date || new Date().toISOString().slice(0,10);
    const jamMentah = (p.acq_time || "0000").padStart(4, "0");
    const jam = `${jamMentah.slice(0,2)}:${jamMentah.slice(2,4)} UTC`;

    return {
      id: `HS-${tanggal.replace(/-/g,"").slice(2)}-${lat.toFixed(3)}-${lng.toFixed(3)}`, // unik per titik+tanggal, dipakai untuk dedupe
      tanggal, jam,
      kecamatan: terdekat || "-",
      lat, lng,
      satelit: ewsNamaSatelitFirms(p),
      confidence, persen
    };
  }).filter(Boolean);
}

const EWS_STORAGE_HOTSPOT_ARSIP = "ews_karhutla_arsip_hotspot_firms";
const EWS_ARSIP_HOTSPOT_MAKS_HARI = 35; // buang otomatis data lebih tua dari ini; dinaikkan dari 14 supaya menampung pilihan "sebulan terakhir" (30 hari) + sedikit buffer

// Penanda terpisah: "FIRMS pernah berhasil dihubungi minimal sekali", TERLEPAS
// dari apakah hasilnya 0 titik atau lebih. Tanpa ini, hari dengan 0 titik panas
// (hal yang WAJAR dan justru kabar baik — bukan error) akan salah dibaca sebagai
// "belum pernah sync" dan tabel jatuh balik ke data contoh tanggal lama, padahal
// sinkronisasi sebenarnya sudah berhasil.
const EWS_STORAGE_HOTSPOT_PERNAH_REAL = "ews_karhutla_hotspot_pernah_real";

// Menyimpan hasil sinkron FIRMS terbaru ke arsip lokal, digabung dengan arsip
// lama (dedupe berdasarkan id), lalu dibuang yang lebih tua dari batas di atas.
// Dipanggil setiap kali FIRMS berhasil dihubungi, walau recordBaru kosong (0 titik),
// supaya penanda "pernah real" di atas selalu ikut ter-set.
function ewsSimpanArsipHotspot(recordBaru){
  let arsip = [];
  try{ arsip = JSON.parse(localStorage.getItem(EWS_STORAGE_HOTSPOT_ARSIP)) || []; }catch(e){ arsip = []; }

  const petaId = new Map(arsip.map(r => [r.id, r]));
  recordBaru.forEach(r => petaId.set(r.id, r));

  const batasWaktu = Date.now() - EWS_ARSIP_HOTSPOT_MAKS_HARI * 24 * 60 * 60 * 1000;
  const hasil = [...petaId.values()]
    .filter(r => new Date(r.tanggal).getTime() >= batasWaktu)
    .sort((a,b) => (b.tanggal + b.jam).localeCompare(a.tanggal + a.jam));

  localStorage.setItem(EWS_STORAGE_HOTSPOT_ARSIP, JSON.stringify(hasil));
  localStorage.setItem(EWS_STORAGE_HOTSPOT_PERNAH_REAL, "1");
  return hasil;
}

// Dipakai halaman Data Hotspot. Mengembalikan null HANYA kalau belum pernah ada
// sinkronisasi FIRMS yang berhasil sama sekali (supaya halaman tahu harus
// fallback ke DATA_HOTSPOT contoh di data.js). Kalau sudah pernah berhasil tapi
// arsip 14 hari terakhir kebetulan kosong (0 titik panas terdeteksi), fungsi ini
// tetap mengembalikan array kosong — BUKAN null — supaya tabel menampilkan
// "0 titik terdeteksi" yang jujur, bukan malah balik ke data contoh lama.
function ewsGetArsipHotspot(){
  const pernahReal = localStorage.getItem(EWS_STORAGE_HOTSPOT_PERNAH_REAL) === "1";
  if(!pernahReal) return null;
  try{
    const arsip = JSON.parse(localStorage.getItem(EWS_STORAGE_HOTSPOT_ARSIP));
    return Array.isArray(arsip) ? arsip : [];
  }catch(e){
    return [];
  }
}

const EWS_STORAGE_SYNC_TIME = "ews_karhutla_sync_terakhir";

function ewsWaktuSyncTerakhir(){
  return localStorage.getItem(EWS_STORAGE_SYNC_TIME);
}

/**
 * Menyinkronkan seluruh data Monitoring dari sumber resmi (BMKG + FIRMS).
 * @param {function} onProgress - dipanggil setiap 1 kecamatan selesai diproses (nama kecamatan)
 * @param {number} [hariRentang] - rentang hari pencarian hotspot FIRMS (1/3/7/30). Default: preferensi tersimpan (ewsGetRentangHariHotspot()).
 * @returns {Promise<{jumlahTersinkron:number, totalWilayah:number, firmsAktif:boolean, hariRentang:number}>}
 */
async function ewsSinkronMonitoringRealtime(onProgress, hariRentang){
  const rentang = EWS_RENTANG_HOTSPOT_PILIHAN.includes(hariRentang) ? hariRentang : ewsGetRentangHariHotspot();
  const daftarKecamatan = [...new Set(WILAYAH_RISIKO.map(w => w.kecamatan))];
  const cuacaPerKecamatan = {};

  for(const kec of daftarKecamatan){
    const adm4 = ewsAdm4UntukKecamatan(kec);
    try{
      const res = await fetch(`${EWS_CONFIG.bmkgEndpoint}?adm4=${encodeURIComponent(adm4)}`);
      if(res.ok){
        const json = await res.json();
        const terkini = ewsAmbilCuacaTerkini(json);
        if(terkini) cuacaPerKecamatan[kec] = terkini;
      }
    }catch(e){
      console.warn("[Sinkron] Gagal ambil cuaca BMKG untuk", kec, e);
    }
    if(onProgress) onProgress(kec);
  }

  // Titik panas real-time dari NASA FIRMS (aktif hanya jika FIRMS_MAP_KEY sudah diisi).
  // Dipecah otomatis kalau rentang > 5 hari (lihat fetchFirmsRentang) karena itu
  // batas maksimal day_range dari FIRMS Area API per sekali panggilan.
  let firmsPoints = [];
  let firmsAktif = false;
  if(FIRMS_MAP_KEY){
    const box = "101.30,0.40,101.60,0.60"; // area Kota Pekanbaru
    const hasilFirms = await fetchFirmsRentang(box, rentang);
    firmsPoints = hasilFirms.titik;
    firmsAktif = hasilFirms.berhasil;
  }
  const hotspotPerKecamatan = firmsAktif ? ewsKelompokkanHotspotKeKecamatan(firmsPoints) : {};

  // Simpan juga versi DETAIL per titik (dipakai halaman Data Hotspot) —
  // sumbernya persis sama dengan yang dipakai untuk hitung jumlah di atas,
  // jadi kedua halaman (Monitoring & Data Hotspot) selalu konsisten satu sama lain.
  // PENTING: tetap dipanggil walau firmsPoints kosong (array []), supaya penanda
  // "pernah real" ikut ter-set — 0 titik panas terdeteksi itu hasil FIRMS yang sah
  // (tidak ada hotspot aktif saat ini), bukan tanda sinkronisasi gagal.
  if(firmsAktif){
    ewsSimpanArsipHotspot(ewsBuatDetailHotspotDariFirms(firmsPoints));
  }

  let jumlahTersinkron = 0;
  daftarKecamatan.forEach(kec => {
    const cuaca = cuacaPerKecamatan[kec];
    if(!cuaca) return; // BMKG gagal untuk kecamatan ini → biarkan data sebelumnya, jangan ditimpa

    const dasar = WILAYAH_RISIKO.find(w => w.kecamatan === kec) || {};
    const overrideLama = ewsGetMonitoringOverride()[kec];

    // Jika kecamatan ini BELUM punya kode kelurahan sendiri (masih memakai kode
    // kota sebagai wakil sementara), suhu/kelembapan mentahnya akan sama persis
    // dengan kecamatan lain yang juga belum dipetakan. Supaya perbedaan relatif
    // antar kecamatan (yang sebelumnya masuk akal secara geografis) tidak hilang,
    // kita tambahkan selisih dari data dasar terhadap kecamatan acuan (Pekanbaru
    // Kota) — jadi angkanya tetap berbasis data BMKG asli, hanya disesuaikan
    // proporsinya. Begitu KECAMATAN_ADM4 diisi kode kelurahan sendiri, penyesuaian
    // ini otomatis tidak lagi dipakai (karena datanya sudah presisi per kecamatan).
    const sudahPunyaKodeSendiri = !!KECAMATAN_ADM4[kec];
    let suhuFinal = cuaca.suhu, kelembapanFinal = cuaca.kelembapan;
    if(!sudahPunyaKodeSendiri){
      const acuan = WILAYAH_RISIKO.find(w => w.kecamatan === "Pekanbaru Kota");
      if(acuan){
        suhuFinal = Math.round((cuaca.suhu + (dasar.suhu - acuan.suhu)) * 10) / 10;
        kelembapanFinal = Math.round(cuaca.kelembapan + (dasar.kelembapan - acuan.kelembapan));
      }
    }

    // Titik panas: pakai hasil FIRMS kalau aktif, kalau tidak pertahankan nilai yang sudah ada
    const hotspot = firmsAktif ? (hotspotPerKecamatan[kec] || 0) : (overrideLama?.hotspot ?? dasar.hotspot);

    ewsSimpanUpdateMonitoring(kec, suhuFinal, kelembapanFinal, hotspot);
    jumlahTersinkron++;
  });

  localStorage.setItem(EWS_STORAGE_SYNC_TIME, new Date().toISOString());
  ewsSetRentangHariHotspot(rentang); // simpan supaya auto-sync berikutnya & halaman lain memakai pilihan yang sama
  return { jumlahTersinkron, totalWilayah: daftarKecamatan.length, firmsAktif, hariRentang: rentang };
}
