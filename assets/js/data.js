/* =========================================================
   FIRESENTRY KARHUTLA - Data layer
   Berisi data contoh (fallback) yang disusun mengikuti struktur
   data resmi:
   - Cuaca   : BMKG "Data Prakiraan Cuaca Terbuka" (api.bmkg.go.id/publik/prakiraan-cuaca)
   - Hotspot : Pantau Titik Panas (Hotspot) Mandiri — BMKG Stasiun Meteorologi
               SSK II Pekanbaru (stamet-riau.bmkg.go.id) — sumber resmi & real-time
   - ISPU/PM2.5 : ISPU KLHK (Indeks Standar Pencemar Udara)

   Saat sumber resmi tidak dapat diakses langsung dari browser
   (CORS / tanpa API terbuka), sistem otomatis memakai data contoh
   di bawah ini agar tampilan tetap berjalan.
   ========================================================= */

const EWS_CONFIG = {
  wilayah: "Kota Pekanbaru, Provinsi Riau",
  // Kode wilayah tingkat kelurahan (adm4) sesuai Permendagri No. 58 Tahun 2021.
  // Cari kode kelurahan yang ingin dipantau (mis. Tenayan Raya/Rumbai) di:
  // https://kodewilayah.id  atau  https://disdukcapil.pekanbaru.go.id
  // Contoh kode valid Kec. Pekanbaru Kota: 14.71.02.1004 (ganti sesuai kebutuhan)
  bmkgAdm4: "14.71.02.1004", // TODO: ganti dengan kode adm4 kelurahan yang dipantau
  // Dokumentasi resmi: https://data.bmkg.go.id/prakiraan-cuaca/
  // Contoh panggilan API resmi: https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=31.71.03.1001
  bmkgEndpoint: "https://api.bmkg.go.id/publik/prakiraan-cuaca",
  // Pantau Titik Panas (Hotspot) Mandiri — BMKG Stamet SSK II Pekanbaru (real-time, resmi).
  // Situs ini berbasis PHP/JS dinamis tanpa endpoint JSON terbuka, sehingga tidak bisa
  // ditarik otomatis (fetch) dari browser. FireSentry Karhutla menampilkannya sebagai sumber
  // rujukan resmi (tautan langsung + info panduan) pada halaman Data Hotspot.
  bmkgHotspotUrl: "https://stamet-riau.bmkg.go.id/index.php?menu=cuaca&submenu=hotspot",
  firmsInfoUrl: "https://firms.modaps.eosdis.nasa.gov/api/",
  sipongiUrl: "https://sipongi.gakkum.kehutanan.go.id/sebaran-titik-panas",
  koordinatPekanbaru: { lat: 0.5071, lng: 101.4478 }
};

/* =========================================================
   Kode wilayah kelurahan (adm4) REPRESENTATIF per kecamatan,
   dipakai untuk menarik data cuaca BMKG per kecamatan secara
   real-time (lihat ewsSinkronMonitoringRealtime() di api.js).

   BMKG hanya menyediakan data sampai level KELURAHAN (adm4) —
   tidak ada endpoint "per kecamatan". Jadi tiap kecamatan diwakili
   oleh satu kelurahan di dalamnya sebagai titik pantau.

   STATUS SAAT INI: baru 1 kode yang terverifikasi manual (Pekanbaru
   Kota). Kecamatan lain masih memakai kode kota (EWS_CONFIG.bmkgAdm4)
   sebagai representasi sementara — supaya sistem tetap menampilkan
   data BMKG yang ASLI (bukan data contoh), hanya belum presisi per
   kecamatan. Lengkapi baris di bawah dengan kode kelurahan dari
   kecamatan terkait untuk akurasi penuh. Cara mencari kodenya:
   1. Buka https://kodewilayah.id lalu cari nama kelurahan yang ada
      di kecamatan tersebut (lihat daftar kelurahan per kecamatan di
      https://id.wikipedia.org/wiki/Daftar_kecamatan_dan_kelurahan_di_Kota_Pekanbaru)
   2. Salin kode berformat "14.71.xx.xxxx" ke bawah ini.
   ========================================================= */
// Kode adm4 (kelurahan representatif) untuk SELURUH 15 kecamatan resmi
// Kota Pekanbaru per Perda Kota Pekanbaru No. 2 Tahun 2020 & Kepmendagri
// 050-145 Tahun 2022. Nama kecamatan di bawah sudah disamakan dengan nama
// resmi TERKINI (bukan lagi nama pra-pemekaran seperti "Rumbai Pesisir",
// "Tampan", atau "Marpoyan") dan dicocokkan dengan field `kecamatan` yang
// dipakai di WILAYAH_RISIKO, batas-kecamatan.js, dan TABEL_RISIKO_KECAMATAN
// supaya semua modul merujuk ke wilayah yang sama. Kode divalidasi silang
// pada 2 sumber independen: (1) kodewilayah.id — basis data resmi Kemendagri
// tingkat kelurahan, (2) daftar kelurahan per-kecamatan hasil Perda (portal
// berita resmi Pemko Pekanbaru).
const KECAMATAN_ADM4 = {
  "Pekanbaru Kota": "14.71.02.1004",   // Kel. Kota Baru
  "Tenayan Raya": "14.71.10.1004",     // Kel. Rejosari
  "Rumbai": "14.71.12.1009",           // Kel. Sri Meranti (dahulu bernama kec. "Rumbai Pesisir")
  "Rumbai Barat": "14.71.06.1003",     // Kel. Rumbai Bukit (dahulu bernama kec. "Rumbai")
  "Rumbai Timur": "14.71.15.1005",     // Kel. Limbungan (kecamatan baru hasil pemekaran)
  "Kulim": "14.71.14.1001",            // Kel. Kulim (kecamatan baru, dimekarkan dari Tenayan Raya)
  "Bukit Raya": "14.71.07.1005",       // Kel. Simpang Tiga
  "Marpoyan Damai": "14.71.09.1003",   // Kel. Sidomulyo Timur
  "Payung Sekaki": "14.71.11.1002",    // Kel. Labuh Baru Timur
  "Tuah Madani": "14.71.13.1004",      // Kel. Tuah Madani
  "Binawidya": "14.71.08.1010",        // Kel. Binawidya
  "Sukajadi": "14.71.01.1007",         // Kel. Sukajadi
  "Sail": "14.71.03.1001",             // Kel. Cinta Raja
  "Lima Puluh": "14.71.04.1001",       // Kel. Rintis
  "Senapelan": "14.71.05.1005",        // Kel. Kampung Bandar
};

function ewsAdm4UntukKecamatan(kecamatan){
  return KECAMATAN_ADM4[kecamatan] || EWS_CONFIG.bmkgAdm4;
}

/* --- Ringkasan kondisi terkini (dipakai di Dashboard) ---
   Catatan: statusRisiko & jam update TIDAK lagi disimpan di sini sebagai
   nilai tetap — keduanya sekarang dihitung otomatis saat Dashboard dibuka
   (lihat ewsHitungStatusMayoritas() di bawah, dan ewsWaktuSyncTerakhir() di
   api.js) supaya selalu sesuai kondisi wilayah & waktu yang sebenarnya. */
const DASHBOARD_SUMMARY = {
  suhu: 35.2, suhuDelta: 2.1, suhuTren: "up",
  kelembapan: 47, kelembapanDelta: -5.4, kelembapanTren: "down",
  hotspot: 18, hotspotDeltaHariIni: 6,
  pm25: 86, pm25Status: "Tidak Sehat"
};

/* =========================================================
   Tren cuaca & indeks potensi karhutla (grafik Dashboard)
   ---------------------------------------------------------
   Sumber data ASLI: prakiraan BMKG per-3-jam (lihat
   ewsAmbilTrenCuacaBmkg() di api.js), ditarik saat halaman
   Dashboard dibuka. Karena BMKG hanya menyediakan PRAKIRAAN ke
   depan (bukan histori observasi jam-jaman), grafik ini bersifat
   "prakiraan beberapa jam/hari ke depan" — bukan "24 jam yang
   sudah lewat" seperti versi contoh sebelumnya.

   NASA FIRMS (titik panas) adalah data SATELIT untuk kejadian yang
   SUDAH terjadi, sehingga tidak bisa diprakirakan ke depan seperti
   cuaca. Karena itu garis ketiga BUKAN "jumlah titik panas hasil
   ramalan" (itu akan jadi angka fiktif), melainkan INDEKS POTENSI
   KARHUTLA (0-100) yang dihitung dari kombinasi suhu & kelembapan
   tiap titik prakiraan, memakai komponen yang sama dengan
   ewsHitungRisiko() di atas supaya konsisten dengan logika risiko
   yang sudah dipakai di Monitoring/Peringatan.

   Fungsi di bawah HANYA dipakai sebagai DATA CONTOH/FALLBACK —
   dipakai dashboard.html hanya jika ewsAmbilTrenCuacaBmkg() gagal
   (BMKG tidak dapat dihubungi / adm4 belum valid). Labelnya sengaja
   dibuat relatif terhadap jam sekarang (bukan hardcode) supaya
   tampilan contoh pun tidak terlihat "macet" di satu jam tertentu.
   ========================================================= */

// Skor 0-4 dari komponen suhu+kelembapan pada ewsHitungRisiko(), diskalakan
// ke 0-100 supaya sebanding secara visual dengan sumbu grafik.
function ewsIndeksPotensiDariCuaca(suhu, kelembapan){
  let skor = 0;
  if (suhu >= 35) skor += 2; else if (suhu >= 33) skor += 1;
  if (kelembapan <= 45) skor += 2; else if (kelembapan <= 55) skor += 1;
  return Math.round((skor / 4) * 100);
}

// Menghasilkan dataset CONTOH dengan label jam relatif terhadap waktu saat
// ini (kelipatan 3 jam ke depan), dipakai HANYA saat BMKG gagal dihubungi.
function ewsBuatTrenContohFallback(jumlahTitik){
  const n = jumlahTitik || 8;
  const suhuContoh = [26,25,27,30,33,35,34,31,28,26,25,24,25,27,30,33,35,34,31,28,26,25,24,25];
  const kelembapanContoh = [78,80,74,62,50,44,47,58,70,76,80,82,80,74,62,50,44,47,58,70,76,80,82,80];
  const label = [], suhu = [], kelembapan = [], indeksPotensi = [];
  const sekarang = new Date();
  for(let i=0;i<n;i++){
    const t = new Date(sekarang.getTime() + i*3*60*60*1000);
    label.push(t.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}));
    const s = suhuContoh[i % suhuContoh.length];
    const k = kelembapanContoh[i % kelembapanContoh.length];
    suhu.push(s); kelembapan.push(k);
    indeksPotensi.push(ewsIndeksPotensiDariCuaca(s,k));
  }
  return { sumber:"contoh", label, suhu, kelembapan, indeksPotensi, waktuAmbil: sekarang.toISOString() };
}

/* --- Daftar wilayah kecamatan & status risiko (untuk Monitoring & Peta) --- */
const WILAYAH_RISIKO = [
  { nama: "Rejosari", kecamatan: "Tenayan Raya", risiko: "Tinggi", hotspot: 6, suhu: 36.1, kelembapan: 40, lat: 0.5486, lng: 101.5192,
    // "Rejosari" adalah kelurahan resmi di Kecamatan Tenayan Raya (bukan nama kecamatan itu sendiri).
    jenisLahan: "Lahan Gambut", tujuanMonitoring: "Memantau perkembangan titik panas di area gambut yang berdekatan dengan kebun warga.",
    catatanLokal: "Kondisi tanah gambut kering akibat kemarau panjang; akses menuju sebagian titik cukup sulit dilalui kendaraan roda empat.",
    ancamanDampak: "Api berpotensi menjalar cepat di lahan gambut kering dan menimbulkan kabut asap ke permukiman terdekat.",
    jumlahTerdampakKK: 12, tindakanPencegahan: "Patroli udara & darat rutin, pembasahan lahan gambut, dan sosialisasi larangan membakar kepada warga.",
    tindakanPenanganan: "Kesiagaan regu pemadam Sektor 3 dengan pompa portable dan mobil tangki air siaga di lokasi.",
    hasilPeninjauan: "Titik panas masih aktif, tim tetap berjaga dan memantau perkembangan setiap 3 jam." },
  { nama: "Sri Meranti", kecamatan: "Rumbai", risiko: "Tinggi", hotspot: 5, suhu: 35.8, kelembapan: 42, lat: 0.5637, lng: 101.4111,
    // Kecamatan "Rumbai Pesisir" sudah tidak ada sejak Perda Kota Pekanbaru No. 2 Th. 2020 — nama
    // resminya sekarang "Rumbai", dan "Sri Meranti" adalah salah satu kelurahan resminya.
    jenisLahan: "Lahan Gambut", tujuanMonitoring: "Verifikasi lapangan atas titik panas hasil deteksi satelit di area gambut pesisir.",
    catatanLokal: "Lokasi berdekatan dengan permukiman nelayan; sumber air terbatas sehingga suplai dibantu dari sungai terdekat.",
    ancamanDampak: "Risiko penjalaran api ke arah permukiman nelayan serta gangguan aktivitas warga akibat kabut asap.",
    jumlahTerdampakKK: 9, tindakanPencegahan: "Pemasangan papan larangan membakar lahan dan patroli gabungan bersama warga setempat.",
    tindakanPenanganan: "Pemadaman manual dibantu suplai air dari sungai terdekat, disiagakan regu Sektor 1.",
    hasilPeninjauan: "Sebagian titik berhasil dilokalisasi, pemantauan lanjutan masih diperlukan pada sore hari." },
  { nama: "Rumbai Bukit", kecamatan: "Rumbai Barat", risiko: "Tinggi", hotspot: 4, suhu: 35.4, kelembapan: 43, lat: 0.5350, lng: 101.4390,
    // Kecamatan "Rumbai" (versi lama) resmi berganti nama menjadi "Rumbai Barat" sejak Perda No. 2
    // Th. 2020; "Rumbai Bukit" adalah salah satu kelurahan resminya.
    jenisLahan: "Perkebunan Sawit", tujuanMonitoring: "Memantau titik panas di area perkebunan sawit warga akibat cuaca kering dan angin kencang.",
    catatanLokal: "Angin kencang di siang hari menyulitkan pemadaman karena bara api mudah terbawa ke kebun sebelah.",
    ancamanDampak: "Berpotensi merusak tanaman sawit produktif milik warga di sekitar titik panas.",
    jumlahTerdampakKK: 6, tindakanPencegahan: "Pemantauan cuaca berkala dan kesiapsiagaan regu saat kondisi angin kencang.",
    tindakanPenanganan: "Pemadaman manual dengan dukungan mobil tangki air BPBD.",
    hasilPeninjauan: "Perkembangan api masih dipantau, belum ada perluasan area terdampak." },
  { nama: "Simpang Baru", kecamatan: "Binawidya", risiko: "Tinggi", hotspot: 3, suhu: 34.9, kelembapan: 45, lat: 0.4802, lng: 101.3986,
    // "Simpang Baru" adalah kelurahan resmi Kecamatan Binawidya (dahulu titik ini memakai nama
    // pra-pemekaran "Tampan", yang sekarang hanya nama kelurahan di Kecamatan Payung Sekaki).
    jenisLahan: "Semak Belukar", tujuanMonitoring: "Menindaklanjuti laporan warga terkait titik panas di lahan semak belukar kosong.",
    catatanLokal: "Lahan merupakan tanah kosong tak bertuan yang sering ditumbuhi semak kering saat kemarau.",
    ancamanDampak: "Kabut asap tipis mulai tercium di beberapa RW terdekat, berpotensi meluas bila tidak segera ditangani.",
    jumlahTerdampakKK: 4, tindakanPencegahan: "Pembersihan semak kering secara berkala dan patroli rutin Sektor 2.",
    tindakanPenanganan: "Pemadaman manual oleh regu setempat menggunakan peralatan ringan.",
    hasilPeninjauan: "Api berhasil dipadamkan sebagian, tim masih memantau kemungkinan titik bara baru." },
  { nama: "Tangkerang Selatan", kecamatan: "Bukit Raya", risiko: "Sedang", hotspot: 2, suhu: 34.2, kelembapan: 49, lat: 0.5083, lng: 101.4767,
    jenisLahan: "Lahan Kosong & Semak", tujuanMonitoring: "Memantau perkembangan cuaca dan potensi titik panas baru di lahan kosong pinggir jalan.",
    catatanLokal: "Beberapa warga masih terpantau membakar sampah di lahan kosong, berisiko memicu titik panas baru.",
    ancamanDampak: "Risiko masih tergolong sedang, namun berpotensi meningkat bila cuaca kering berlanjut.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Sosialisasi larangan membakar sampah/lahan dan pemantauan berkala petugas.",
    tindakanPenanganan: "Belum ada tindakan pemadaman aktif, status masih pemantauan.",
    hasilPeninjauan: "Kondisi terkendali, tidak ditemukan titik api aktif saat peninjauan terakhir." },
  { nama: "Wonorejo", kecamatan: "Marpoyan Damai", risiko: "Sedang", hotspot: 2, suhu: 33.8, kelembapan: 50, lat: 0.5069, lng: 101.4364,
    jenisLahan: "Lahan Kosong & Permukiman", tujuanMonitoring: "Memantau kondisi kelembapan udara dan potensi titik panas di sela permukiman padat.",
    catatanLokal: "Kepadatan permukiman cukup tinggi sehingga potensi dampak asap lebih terasa meski luas area kecil.",
    ancamanDampak: "Gangguan kualitas udara ringan pada permukiman padat penduduk di sekitar lahan kosong.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Edukasi warga RT/RW dan pemasangan imbauan larangan membakar sampah.",
    tindakanPenanganan: "Belum diperlukan tindakan pemadaman, status pemantauan rutin.",
    hasilPeninjauan: "Tidak ditemukan indikasi titik panas baru pada peninjauan terakhir." },
  { nama: "Tampan", kecamatan: "Payung Sekaki", risiko: "Sedang", hotspot: 1, suhu: 33.5, kelembapan: 51, lat: 0.5147, lng: 101.4058,
    // "Tampan" saat ini adalah nama kelurahan resmi di Kecamatan Payung Sekaki, bukan nama kecamatan.
    jenisLahan: "Perkebunan Campuran", tujuanMonitoring: "Verifikasi satu titik panas hasil deteksi satelit di area kebun campuran warga.",
    catatanLokal: "Titik panas berada di area kebun campuran yang jarang dikunjungi, sehingga verifikasi memakan waktu lebih lama.",
    ancamanDampak: "Dampak masih terbatas pada tanaman kebun milik warga di sekitar titik panas.",
    jumlahTerdampakKK: 2, tindakanPencegahan: "Koordinasi dengan pemilik kebun untuk pembersihan gulma kering.",
    tindakanPenanganan: "Pemantauan lanjutan, pemadaman belum diperlukan.",
    hasilPeninjauan: "Titik panas terverifikasi kecil dan tidak berkembang." },
  { nama: "Airputih", kecamatan: "Tuah Madani", risiko: "Sedang", hotspot: 1, suhu: 33.3, kelembapan: 52, lat: 0.5215, lng: 101.3980,
    jenisLahan: "Lahan Kosong Kampus & Permukiman", tujuanMonitoring: "Memantau lahan kosong di sekitar kawasan kampus dan permukiman baru.",
    catatanLokal: "Kawasan pemekaran baru dengan banyak lahan kosong yang belum termanfaatkan, rawan dibakar untuk pembersihan.",
    ancamanDampak: "Potensi gangguan aktivitas kampus dan permukiman bila asap meluas.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Koordinasi dengan pengelola kawasan untuk pengawasan lahan kosong.",
    tindakanPenanganan: "Belum ada tindakan aktif, status pemantauan.",
    hasilPeninjauan: "Kondisi aman, tidak ada titik api aktif saat peninjauan." },
  { nama: "Delima", kecamatan: "Binawidya", risiko: "Sedang", hotspot: 1, suhu: 33.0, kelembapan: 53, lat: 0.4890, lng: 101.3700,
    jenisLahan: "Lahan Kosong & Hutan Kota", tujuanMonitoring: "Memantau kondisi vegetasi hutan kota dan lahan kosong di pinggiran kawasan.",
    catatanLokal: "Sebagian area berbatasan dengan hutan kota yang menjadi ruang terbuka hijau kelurahan.",
    ancamanDampak: "Risiko rendah-sedang terhadap ruang terbuka hijau bila titik panas tidak segera diverifikasi.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Patroli rutin petugas kelurahan dan pemantauan citra satelit harian.",
    tindakanPenanganan: "Belum diperlukan tindakan pemadaman.",
    hasilPeninjauan: "Kondisi vegetasi masih terjaga, tidak ada titik api aktif." },
  { nama: "Perhentian Marpoyan", kecamatan: "Marpoyan Damai", risiko: "Sedang", hotspot: 0, suhu: 32.6, kelembapan: 55, lat: 0.5000, lng: 101.4500,
    // "Perhentian Marpoyan" adalah kelurahan resmi Kecamatan Marpoyan Damai — "Marpoyan" saja
    // tidak pernah menjadi nama kecamatan maupun kelurahan tersendiri.
    jenisLahan: "Permukiman & Lahan Kosong", tujuanMonitoring: "Pemantauan rutin kondisi cuaca dan potensi titik panas di kelurahan padat penduduk.",
    catatanLokal: "Tidak ada laporan titik panas terbaru dari warga maupun satelit dalam sepekan terakhir.",
    ancamanDampak: "Tidak ada ancaman aktif saat ini, risiko bersifat antisipatif mengikuti tren cuaca kering.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Sosialisasi kesiapsiagaan karhutla kepada RT/RW setempat.",
    tindakanPenanganan: "Tidak diperlukan, tidak ada kejadian aktif.",
    hasilPeninjauan: "Wilayah terpantau aman pada peninjauan terakhir." },
  { nama: "Sukajadi", kecamatan: "Sukajadi", risiko: "Rendah", hotspot: 0, suhu: 32.1, kelembapan: 58, lat: 0.5261, lng: 101.4342,
    jenisLahan: "Permukiman & Perkotaan", tujuanMonitoring: "Pemantauan rutin sebagai kawasan perkotaan padat, minim lahan vegetasi rawan terbakar.",
    catatanLokal: "Wilayah didominasi bangunan dan jalan beraspal, minim lahan terbuka bervegetasi.",
    ancamanDampak: "Ancaman karhutla sangat rendah karena minimnya tutupan lahan rawan terbakar.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Pemantauan berkala tanpa tindakan khusus.",
    tindakanPenanganan: "Tidak diperlukan.",
    hasilPeninjauan: "Tidak ada indikasi risiko karhutla pada peninjauan terakhir." },
  { nama: "Kota Tinggi", kecamatan: "Pekanbaru Kota", risiko: "Rendah", hotspot: 0, suhu: 31.8, kelembapan: 60, lat: 0.5333, lng: 101.4500,
    jenisLahan: "Permukiman & Perkantoran", tujuanMonitoring: "Pemantauan rutin kawasan pusat kota yang minim lahan vegetasi.",
    catatanLokal: "Kawasan pusat pemerintahan dan perkantoran, hampir tidak memiliki lahan terbuka bervegetasi.",
    ancamanDampak: "Ancaman karhutla praktis tidak ada di wilayah ini.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Tidak ada tindakan khusus, cukup pemantauan rutin.",
    tindakanPenanganan: "Tidak diperlukan.",
    hasilPeninjauan: "Kondisi selalu aman pada setiap peninjauan." },
  { nama: "Cinta Raja", kecamatan: "Sail", risiko: "Rendah", hotspot: 0, suhu: 31.9, kelembapan: 59, lat: 0.5280, lng: 101.4600,
    jenisLahan: "Permukiman & Perkotaan", tujuanMonitoring: "Pemantauan rutin sebagai bagian dari kawasan inti kota.",
    catatanLokal: "Tidak ditemukan lahan gambut maupun vegetasi rawan terbakar di wilayah ini.",
    ancamanDampak: "Ancaman karhutla sangat rendah.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Pemantauan berkala tanpa tindakan khusus.",
    tindakanPenanganan: "Tidak diperlukan.",
    hasilPeninjauan: "Wilayah terpantau aman." },
  { nama: "Rintis", kecamatan: "Lima Puluh", risiko: "Rendah", hotspot: 0, suhu: 32.0, kelembapan: 58, lat: 0.5410, lng: 101.4530,
    jenisLahan: "Permukiman & Tepi Sungai", tujuanMonitoring: "Pemantauan rutin kawasan tepi sungai yang padat permukiman.",
    catatanLokal: "Wilayah tepi sungai dengan kepadatan bangunan tinggi, minim lahan kosong bervegetasi.",
    ancamanDampak: "Ancaman karhutla rendah, namun tetap perlu diwaspadai pembakaran sampah rumah tangga.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Imbauan larangan membakar sampah di bantaran sungai.",
    tindakanPenanganan: "Tidak diperlukan.",
    hasilPeninjauan: "Tidak ada indikasi risiko pada peninjauan terakhir." },
  { nama: "Kampung Bandar", kecamatan: "Senapelan", risiko: "Rendah", hotspot: 0, suhu: 31.7, kelembapan: 60, lat: 0.5305, lng: 101.4380,
    jenisLahan: "Permukiman & Kawasan Bersejarah", tujuanMonitoring: "Pemantauan rutin kawasan permukiman padat dan cagar budaya kota lama.",
    catatanLokal: "Kawasan padat penduduk dengan bangunan bersejarah, tidak memiliki lahan vegetasi luas.",
    ancamanDampak: "Ancaman karhutla praktis tidak ada di wilayah ini.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Tidak ada tindakan khusus, cukup pemantauan rutin.",
    tindakanPenanganan: "Tidak diperlukan.",
    hasilPeninjauan: "Kondisi selalu aman pada setiap peninjauan." },
  { nama: "Sukamaju", kecamatan: "Sail", risiko: "Rendah", hotspot: 0, suhu: 31.6, kelembapan: 61, lat: 0.5250, lng: 101.4470,
    // "Sail Kecil" bukan nama kelurahan resmi; kelurahan resmi di Kecamatan Sail adalah
    // Cinta Raja, Sukamaju, dan Sukamulya.
    jenisLahan: "Permukiman & Perkotaan", tujuanMonitoring: "Pemantauan rutin sebagai kelurahan padat di kawasan inti kota.",
    catatanLokal: "Tidak ditemukan lahan terbuka signifikan yang berpotensi menjadi sumber karhutla.",
    ancamanDampak: "Ancaman karhutla sangat rendah.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Pemantauan berkala tanpa tindakan khusus.",
    tindakanPenanganan: "Tidak diperlukan.",
    hasilPeninjauan: "Wilayah terpantau aman." },
  { nama: "Rejosari", kecamatan: "Tenayan Raya", risiko: "Rendah", hotspot: 0, suhu: 31.9, kelembapan: 59, lat: 0.5460, lng: 101.4890,
    jenisLahan: "Perkebunan & Lahan Kosong", tujuanMonitoring: "Pemantauan pencegahan dini di area perkebunan yang berdekatan dengan zona rawan Tenayan Raya.",
    catatanLokal: "Wilayah berbatasan langsung dengan zona berisiko tinggi Tenayan Raya, perlu kewaspadaan penjalaran api.",
    ancamanDampak: "Berpotensi terdampak bila titik panas di Tenayan Raya meluas ke arah kelurahan ini.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Koordinasi lintas kelurahan dengan tim Sektor 3 dan pemantauan batas wilayah.",
    tindakanPenanganan: "Belum diperlukan, status siaga pemantauan.",
    hasilPeninjauan: "Belum ada titik api yang menjalar ke wilayah ini." },
  { nama: "Simpang Tiga", kecamatan: "Bukit Raya", risiko: "Rendah", hotspot: 0, suhu: 32.2, kelembapan: 57, lat: 0.4950, lng: 101.4650,
    jenisLahan: "Permukiman & Lahan Kosong", tujuanMonitoring: "Pemantauan rutin lahan kosong di kawasan permukiman berkembang.",
    catatanLokal: "Beberapa lahan kosong mulai dibangun perumahan baru, mengurangi luas area rawan terbakar.",
    ancamanDampak: "Ancaman karhutla rendah dan cenderung menurun seiring pembangunan permukiman.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Pemantauan berkala tanpa tindakan khusus.",
    tindakanPenanganan: "Tidak diperlukan.",
    hasilPeninjauan: "Tidak ada indikasi risiko pada peninjauan terakhir." },
  { nama: "Kulim", kecamatan: "Kulim", risiko: "Sedang", hotspot: 1, suhu: 34.0, kelembapan: 47, lat: 0.4890, lng: 101.5330,
    // Kecamatan Kulim (dimekarkan dari Tenayan Raya sejak Perda No. 2 Th. 2020) sebelumnya tidak
    // ada dalam data Monitoring sama sekali. Koordinat titik masih perkiraan karena GeoJSON batas
    // resmi kecamatan ini belum tersedia bebas (lihat catatan pada batas-kecamatan.js).
    jenisLahan: "Kawasan Industri & Lahan Gambut", tujuanMonitoring: "Memantau titik panas di sekitar kawasan industri yang berbatasan dengan lahan gambut.",
    catatanLokal: "Wilayah pemekaran baru dari Tenayan Raya dengan campuran kawasan industri dan lahan gambut di pinggirannya.",
    ancamanDampak: "Berpotensi mengganggu aktivitas industri dan menimbulkan kabut asap ke permukiman pekerja terdekat.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Koordinasi dengan pengelola kawasan industri dan patroli rutin lahan gambut sekitar.",
    tindakanPenanganan: "Belum diperlukan tindakan pemadaman, status pemantauan rutin.",
    hasilPeninjauan: "Tidak ditemukan titik api aktif pada peninjauan terakhir." },
  { nama: "Limbungan", kecamatan: "Rumbai Timur", risiko: "Sedang", hotspot: 1, suhu: 34.3, kelembapan: 46, lat: 0.5750, lng: 101.4650,
    // Kecamatan Rumbai Timur (hasil pemekaran sebagian wilayah Rumbai Pesisir/Rumbai, sejak Perda
    // No. 2 Th. 2020) sebelumnya tidak ada dalam data Monitoring sama sekali. Koordinat titik masih
    // perkiraan karena GeoJSON batas resmi kecamatan ini belum tersedia bebas.
    jenisLahan: "Lahan Gambut & Perkebunan", tujuanMonitoring: "Memantau titik panas di area gambut dan kebun warga di wilayah pemekaran baru.",
    catatanLokal: "Wilayah pemekaran baru dengan akses jalan yang masih terbatas di beberapa titik.",
    ancamanDampak: "Berpotensi menimbulkan kabut asap ke permukiman terdekat bila titik panas tidak segera ditangani.",
    jumlahTerdampakKK: 0, tindakanPencegahan: "Sosialisasi larangan membakar lahan dan pemantauan citra satelit berkala.",
    tindakanPenanganan: "Belum diperlukan tindakan pemadaman, status pemantauan rutin.",
    hasilPeninjauan: "Tidak ditemukan titik api aktif pada peninjauan terakhir." }
];

/* ---------------------------------------------------------------
   Titik fasilitas pendidikan (TK/SD/SMP Negeri) & kesehatan
   (Puskesmas/Klinik) untuk lapisan tambahan di Peta Wilayah.
   Nama & koordinat diambil dari data lokasi publik (Google Maps)
   per kecamatan Kota Pekanbaru — representatif, BUKAN basis data
   lengkap seluruh sekolah/faskes yang ada (jumlahnya ratusan).
   --------------------------------------------------------------- */
const TITIK_PENDIDIKAN = [
  { nama:"TK Negeri Pembina I", jenjang:"TK Negeri", kecamatan:"Sail", lat:0.5230788, lng:101.4553619 },
  { nama:"TK Negeri Pembina 2 Pekanbaru", jenjang:"TK Negeri", kecamatan:"Tuah Madani", lat:0.4511302, lng:101.4147463 },
  { nama:"SD Negeri 178 Pekanbaru", jenjang:"SD Negeri", kecamatan:"Tenayan Raya", lat:0.5398389, lng:101.4947841 },
  { nama:"SD Negeri 46 Pekanbaru", jenjang:"SD Negeri", kecamatan:"Tenayan Raya", lat:0.4742577, lng:101.5157568 },
  { nama:"SD Negeri 106 Pekanbaru", jenjang:"SD Negeri", kecamatan:"Rumbai Barat", lat:0.5632686, lng:101.4416656 },
  { nama:"SD Negeri 102 Pekanbaru", jenjang:"SD Negeri", kecamatan:"Rumbai", lat:0.5738081, lng:101.4490095 },
  // PERLU DICEK: koordinat titik ini (lat 0.5413798) jatuh di wilayah Payung Sekaki menurut uji
  // poligon, cukup jauh dari lokasi SD Negeri Tampan 011 yang sebenarnya (area Binawidya/Tuah
  // Madani). Kemungkinan koordinat sumber sebelumnya salah input — mohon diverifikasi ulang.
  { nama:"SD Negeri Tampan 011", jenjang:"SD Negeri", kecamatan:"Payung Sekaki", lat:0.5413798, lng:101.4147132 },
  { nama:"SMP Negeri 45 Pekanbaru", jenjang:"SMP Negeri", kecamatan:"Binawidya", lat:0.4979651, lng:101.3587389 },
  { nama:"SMP Bukit Raya", jenjang:"SMP Negeri", kecamatan:"Bukit Raya", lat:0.5063856, lng:101.4957224 },
  { nama:"SD Negeri 141 Pekanbaru", jenjang:"SD Negeri", kecamatan:"Bukit Raya", lat:0.4616179, lng:101.4584019 },
  { nama:"SD Negeri 169 Pekanbaru", jenjang:"SD Negeri", kecamatan:"Marpoyan Damai", lat:0.4350131, lng:101.4323606 },
  { nama:"SMP Negeri 25 Pekanbaru", jenjang:"SMP Negeri", kecamatan:"Marpoyan Damai", lat:0.4426996, lng:101.4376152 },
  { nama:"SD Negeri 160 Pekanbaru", jenjang:"SD Negeri", kecamatan:"Marpoyan Damai", lat:0.4593336, lng:101.4506573 },
  { nama:"SD Negeri 124 Pekanbaru", jenjang:"SD Negeri", kecamatan:"Payung Sekaki", lat:0.5154020, lng:101.4164355 },
  { nama:"SMP Negeri 36 Pekanbaru", jenjang:"SMP Negeri", kecamatan:"Payung Sekaki", lat:0.5453995, lng:101.4184330 },
  { nama:"SD Negeri 68 Pekanbaru", jenjang:"SD Negeri", kecamatan:"Sukajadi", lat:0.5087804, lng:101.4354226 },
  { nama:"SMP Negeri 32 Pekanbaru", jenjang:"SMP Negeri", kecamatan:"Sukajadi", lat:0.5089428, lng:101.4358281 },
  { nama:"SD Negeri 88 Pekanbaru", jenjang:"SD Negeri", kecamatan:"Sail", lat:0.5205511, lng:101.4561482 },
  { nama:"SD Negeri 125 Pekanbaru", jenjang:"SD Negeri", kecamatan:"Pekanbaru Kota", lat:0.5224261, lng:101.4453943 },
  { nama:"SMP Negeri 1 Pekanbaru", jenjang:"SMP Negeri", kecamatan:"Lima Puluh", lat:0.5263500, lng:101.4537630 },
  { nama:"SD Negeri 7 Senapelan", jenjang:"SD Negeri", kecamatan:"Senapelan", lat:0.5382286, lng:101.4282471 },
  { nama:"SMP Negeri 2 Pekanbaru", jenjang:"SMP Negeri", kecamatan:"Senapelan", lat:0.5321723, lng:101.4419946 },
  { nama:"SD Negeri 183 Pekanbaru", jenjang:"SD Negeri", kecamatan:"Binawidya", lat:0.4524734, lng:101.3760409 }
];

const TITIK_KESEHATAN = [
  { nama:"Puskesmas Tenayan Raya", jenis:"Puskesmas", kecamatan:"Tenayan Raya", lat:0.4837822, lng:101.5271909 },
  { nama:"Puskesmas Rumbai", jenis:"Puskesmas", kecamatan:"Rumbai Barat", lat:0.5601634, lng:101.4410839 },
  { nama:"Puskesmas Rumbai Bukit", jenis:"Puskesmas", kecamatan:"Rumbai Barat", lat:0.6090589, lng:101.4007013 },
  { nama:"Klinik Utama Mutiara Hati", jenis:"Klinik", kecamatan:"Rumbai", lat:0.5610263, lng:101.4498900 },
  { nama:"Puskesmas Tampan", jenis:"Puskesmas", kecamatan:"Binawidya", lat:0.4694665, lng:101.4058524 },
  { nama:"Klinik Utama GASA", jenis:"Klinik", kecamatan:"Binawidya", lat:0.4859591, lng:101.3592893 },
  { nama:"Klinik Uwa Medica", jenis:"Klinik", kecamatan:"Binawidya", lat:0.4645425, lng:101.3951919 },
  { nama:"Puskesmas Harapan Raya", jenis:"Puskesmas", kecamatan:"Bukit Raya", lat:0.4993201, lng:101.4561237 },
  { nama:"Puskesmas Sapta Taruna", jenis:"Puskesmas", kecamatan:"Bukit Raya", lat:0.5042022, lng:101.4744647 },
  { nama:"Puskesmas Simpang Tiga", jenis:"Puskesmas", kecamatan:"Marpoyan Damai", lat:0.4635637, lng:101.4529472 },
  { nama:"Puskesmas Garuda", jenis:"Puskesmas", kecamatan:"Marpoyan Damai", lat:0.4917505, lng:101.4447731 },
  { nama:"Puskesmas Payung Sekaki", jenis:"Puskesmas", kecamatan:"Payung Sekaki", lat:0.5123958, lng:101.4157594 },
  { nama:"Puskesmas Sukajadi", jenis:"Puskesmas", kecamatan:"Sukajadi", lat:0.5132928, lng:101.4450998 },
  { nama:"Puskesmas Pekanbaru Kota", jenis:"Puskesmas", kecamatan:"Pekanbaru Kota", lat:0.5319698, lng:101.4530048 },
  { nama:"Puskesmas Lima Puluh", jenis:"Puskesmas", kecamatan:"Lima Puluh", lat:0.5403719, lng:101.4644081 },
  { nama:"Puskesmas Senapelan", jenis:"Puskesmas", kecamatan:"Senapelan", lat:0.5375380, lng:101.4357920 },
  { nama:"Puskesmas Sail", jenis:"Puskesmas", kecamatan:"Sail", lat:0.5226683, lng:101.4602698 },
  { nama:"Klinik Dr. Idha", jenis:"Klinik", kecamatan:"Tuah Madani", lat:0.4344397, lng:101.3997366 }
];

/* --- Data hotspot (titik panas) mengikuti struktur SIPONGI/FIRMS --- */
const DATA_HOTSPOT = [
  { id:"HS-2609-01", tanggal:"2026-09-02", jam:"14:12 WIB", lat:0.5486, lng:101.5192, kecamatan:"Tenayan Raya", satelit:"NOAA-20", confidence:"Tinggi", persen:92 },
  { id:"HS-2609-02", tanggal:"2026-09-02", jam:"13:47 WIB", lat:0.5637, lng:101.4111, kecamatan:"Rumbai", satelit:"TERRA/AQUA", confidence:"Tinggi", persen:87 },
  { id:"HS-2609-03", tanggal:"2026-09-02", jam:"13:20 WIB", lat:0.5350, lng:101.4390, kecamatan:"Rumbai Barat", satelit:"SNPP", confidence:"Sedang", persen:64 },
  { id:"HS-2609-04", tanggal:"2026-09-02", jam:"12:55 WIB", lat:0.4802, lng:101.3986, kecamatan:"Binawidya", satelit:"NOAA-20", confidence:"Sedang", persen:58 },
  { id:"HS-2609-05", tanggal:"2026-09-02", jam:"11:38 WIB", lat:0.5083, lng:101.4767, kecamatan:"Bukit Raya", satelit:"TERRA/AQUA", confidence:"Sedang", persen:47 },
  { id:"HS-2609-06", tanggal:"2026-09-02", jam:"10:05 WIB", lat:0.5069, lng:101.4364, kecamatan:"Marpoyan Damai", satelit:"SNPP", confidence:"Rendah", persen:28 },
  { id:"HS-2609-07", tanggal:"2026-09-02", jam:"09:41 WIB", lat:0.5147, lng:101.4058, kecamatan:"Payung Sekaki", satelit:"NOAA-20", confidence:"Rendah", persen:22 },
  { id:"HS-2609-08", tanggal:"2026-09-02", jam:"08:30 WIB", lat:0.5486, lng:101.5192, kecamatan:"Tenayan Raya", satelit:"TERRA/AQUA", confidence:"Tinggi", persen:81 }
];

/* --- Riwayat kejadian karhutla --- */
const RIWAYAT_KEJADIAN = [
  { id:"KRH-2026-041", tanggal:"01 Sep 2026", tanggalISO:"2026-09-01", lokasi:"Kel. Rejosari, Tenayan Raya", luas:"2.4 Ha", status:"Ditangani", penyebab:"Pembukaan lahan", petugas:"Tim Damkarhutla Sektor 3",
    namaPetugas:"Andi Saputra", jenisLahan:"Lahan Gambut", tujuanMonitoring:"Memastikan sekat kanal menahan penjalaran api ke area gambut sekitar",
    catatanLokal:"Warga setempat melaporkan asap tebal sejak pagi hari; akses jalan menuju lokasi cukup sulit karena tanah gambut basah.",
    ancamanDampak:"Api berpotensi menjalar ke kebun warga dan menimbulkan kabut asap yang mengganggu aktivitas pemukiman terdekat.",
    jumlahTerdampak:"8 KK, 2.4 Ha lahan", tindakanPencegahan:"Pembuatan sekat bakar dan pembasahan lahan gambut di sekitar titik api.",
    tindakanPenanganan:"Pemadaman manual menggunakan pompa portable dan dibantu water bombing ringan.",
    hasilPeninjauan:"Api berhasil dilokalisasi, namun tim masih berjaga untuk memantau titik bara sisa." },
  { id:"KRH-2026-040", tanggal:"29 Agu 2026", tanggalISO:"2026-08-29", lokasi:"Kel. Limbungan, Rumbai Timur", luas:"1.1 Ha", status:"Selesai", penyebab:"Diduga faktor manusia", petugas:"Tim Damkarhutla Sektor 1",
    namaPetugas:"Budi Hartono", jenisLahan:"Lahan Gambut", tujuanMonitoring:"Verifikasi titik panas hasil deteksi satelit dan memastikan tidak ada perluasan area terbakar",
    catatanLokal:"Lokasi berdekatan dengan permukiman nelayan; sumber air terbatas sehingga suplai air dibantu dari sungai terdekat.",
    ancamanDampak:"Risiko penjalaran api ke arah permukiman nelayan cukup rendah karena vegetasi sekitar tidak terlalu rapat.",
    jumlahTerdampak:"1.1 Ha lahan kosong", tindakanPencegahan:"Patroli rutin dan sosialisasi larangan membakar lahan kepada warga sekitar.",
    tindakanPenanganan:"Pemadaman langsung oleh tim dalam waktu kurang dari 3 jam.",
    hasilPeninjauan:"Kejadian selesai ditangani tanpa korban jiwa maupun kerugian material yang signifikan." },
  { id:"KRH-2026-039", tanggal:"27 Agu 2026", tanggalISO:"2026-08-27", lokasi:"Kel. Sri Meranti, Rumbai", luas:"0.8 Ha", status:"Selesai", penyebab:"Cuaca kering & angin kencang", petugas:"Tim Damkarhutla Sektor 1",
    namaPetugas:"Candra Wijaya", jenisLahan:"Perkebunan Sawit", tujuanMonitoring:"Memantau perkembangan titik panas akibat cuaca ekstrem di area perkebunan sawit warga",
    catatanLokal:"Angin kencang menyulitkan proses pemadaman karena bara api mudah terbawa ke arah kebun sebelah.",
    ancamanDampak:"Berpotensi merusak tanaman sawit produktif milik warga di sekitar lokasi kejadian.",
    jumlahTerdampak:"0.8 Ha kebun sawit", tindakanPencegahan:"Pemantauan cuaca berkala dan kesiapsiagaan regu pemadam saat kondisi angin kencang.",
    tindakanPenanganan:"Pemadaman manual dengan dukungan mobil tangki air dari BPBD.",
    hasilPeninjauan:"Api padam total, kerugian terbatas pada tanaman sawit muda di sekitar titik kejadian." },
  { id:"KRH-2026-038", tanggal:"22 Agu 2026", tanggalISO:"2026-08-22", lokasi:"Kel. Simpang Baru, Tampan", luas:"3.6 Ha", status:"Selesai", penyebab:"Pembakaran lahan gambut", petugas:"Tim Damkarhutla Sektor 2",
    namaPetugas:"Dedi Kurniawan", jenisLahan:"Lahan Gambut", tujuanMonitoring:"Menindaklanjuti laporan warga terkait pembakaran lahan gambut secara sengaja",
    catatanLokal:"Ditemukan indikasi pembakaran yang disengaja untuk pembukaan lahan; kasus sudah dikoordinasikan dengan pihak kepolisian setempat.",
    ancamanDampak:"Menimbulkan kabut asap tebal yang menurunkan kualitas udara di beberapa kelurahan sekitar.",
    jumlahTerdampak:"3.6 Ha lahan gambut, sekitar 20 KK terdampak asap", tindakanPencegahan:"Pemasangan papan larangan membakar lahan dan patroli gabungan bersama Polsek setempat.",
    tindakanPenanganan:"Pemadaman selama dua hari menggunakan kombinasi manual dan water bombing.",
    hasilPeninjauan:"Api berhasil dipadamkan tuntas; kasus pembakaran diteruskan ke proses hukum lebih lanjut." },
  { id:"KRH-2026-037", tanggal:"18 Agu 2026", tanggalISO:"2026-08-18", lokasi:"Kel. Airputih, Tuah Madani", luas:"1.7 Ha", status:"Selesai", penyebab:"Puntung rokok", petugas:"Tim Damkarhutla Sektor 3",
    namaPetugas:"Eko Prasetyo", jenisLahan:"Semak Belukar", tujuanMonitoring:"Memastikan api yang berawal dari lahan semak tidak menjalar ke area hutan sekunder terdekat",
    catatanLokal:"Sumber api diduga berasal dari puntung rokok yang dibuang sembarangan di pinggir jalan.",
    ancamanDampak:"Potensi menjalar ke area hutan sekunder di belakang permukiman jika tidak segera ditangani.",
    jumlahTerdampak:"1.7 Ha semak belukar", tindakanPencegahan:"Pemasangan rambu peringatan bahaya kebakaran di area rawan dan edukasi warga sekitar.",
    tindakanPenanganan:"Pemadaman cepat oleh tim dalam waktu kurang dari 2 jam menggunakan alat pemadam ringan.",
    hasilPeninjauan:"Api padam sepenuhnya, tidak ada perluasan area maupun korban jiwa." }
];

/* --- Laporan tersimpan --- */
const DAFTAR_LAPORAN = [
  { id:"LAP-0091", judul:"Laporan Mingguan Monitoring Karhutla", periode:"25-31 Agu 2026", jenis:"Mingguan", dibuat:"01 Sep 2026", petugas:"Petugas BPBD" },
  { id:"LAP-0090", judul:"Laporan Kejadian Karhutla Tenayan Raya", periode:"01 Sep 2026", jenis:"Kejadian", dibuat:"01 Sep 2026", petugas:"Petugas BPBD" },
  { id:"LAP-0089", judul:"Laporan Bulanan Kualitas Udara & Hotspot", periode:"Agustus 2026", jenis:"Bulanan", dibuat:"31 Agu 2026", petugas:"Petugas BPBD" },
  { id:"LAP-0088", judul:"Laporan Mingguan Monitoring Karhutla", periode:"18-24 Agu 2026", jenis:"Mingguan", dibuat:"25 Agu 2026", petugas:"Petugas BPBD" }
];

/* --- Daftar peringatan aktif --- */
const DAFTAR_PERINGATAN = [
  { id:"PRG-014", tingkat:"Tinggi", wilayah:"Tenayan Raya, Rumbai, Rumbai Barat, Payung Sekaki", pesan:"Suhu tinggi, kelembapan rendah, dan peningkatan titik panas menunjukkan potensi risiko karhutla meningkat.", waktu:"02 Sep 2026, 15:00 WIB", status:"Aktif" },
  { id:"PRG-013", tingkat:"Sedang", wilayah:"Bukit Raya, Marpoyan Damai, Payung Sekaki", pesan:"Kelembapan udara menurun signifikan dalam 6 jam terakhir.", waktu:"02 Sep 2026, 10:00 WIB", status:"Aktif" },
  { id:"PRG-012", tingkat:"Tinggi", wilayah:"Rumbai Barat, Rumbai", pesan:"Terdeteksi klaster titik panas dengan confidence level tinggi.", waktu:"01 Sep 2026, 18:20 WIB", status:"Ditutup" },
  { id:"PRG-011", tingkat:"Rendah", wilayah:"Kota Pekanbaru (seluruh wilayah)", pesan:"Kondisi cuaca dan kualitas udara masih dalam batas normal.", waktu:"30 Agu 2026, 07:00 WIB", status:"Ditutup" }
];

/* --- Prakiraan cuaca 3 hari (fallback jika BMKG API tidak terjangkau dari browser) --- */
const CUACA_3HARI_FALLBACK = [
  { hari:"Hari ini", tanggal:"02 Sep", pagi:"Berawan", siang:"Cerah Berasap", malam:"Berawan", suhuMin:24, suhuMax:35, kelembapanMin:40, kelembapanMax:78, angin:"6 km/j - Timur" },
  { hari:"Besok", tanggal:"03 Sep", pagi:"Cerah", siang:"Cerah Berasap", malam:"Cerah", suhuMin:23, suhuMax:36, kelembapanMin:38, kelembapanMax:75, angin:"8 km/j - Timur Laut" },
  { hari:"Lusa", tanggal:"04 Sep", pagi:"Berawan", siang:"Berawan", malam:"Hujan Ringan", suhuMin:24, suhuMax:33, kelembapanMin:45, kelembapanMax:82, angin:"7 km/j - Utara" }
];

/* =========================================================
   Penyimpanan data yang diinput pengguna (persisten di browser)
   Dipakai supaya kejadian yang ditambahkan di halaman Riwayat
   Kejadian juga bisa ditarik saat menyusun Laporan.
   ========================================================= */
const EWS_STORAGE_RIWAYAT = "ews_karhutla_riwayat_tambahan";

function ewsGetRiwayatTambahan(){
  try{ return JSON.parse(localStorage.getItem(EWS_STORAGE_RIWAYAT)) || []; }
  catch(e){ return []; }
}

function ewsSimpanRiwayatTambahan(list){
  localStorage.setItem(EWS_STORAGE_RIWAYAT, JSON.stringify(list));
}

// Pastikan data contoh (RIWAYAT_KEJADIAN) sudah tersimpan di localStorage
// supaya baris tersebut juga bisa diedit/diubah, bukan hanya kejadian baru.
function ewsSeedRiwayatJikaKosong(){
  if(localStorage.getItem(EWS_STORAGE_RIWAYAT) === null){
    ewsSimpanRiwayatTambahan(RIWAYAT_KEJADIAN.slice());
  }
}

function ewsTambahRiwayat(item){
  ewsSeedRiwayatJikaKosong();
  const list = ewsGetRiwayatTambahan();
  list.unshift(item);
  ewsSimpanRiwayatTambahan(list);
}

// Perbarui satu kejadian (berdasarkan id) dengan field-field baru
function ewsUpdateRiwayat(id, perubahan){
  ewsSeedRiwayatJikaKosong();
  const list = ewsGetRiwayatTambahan();
  const idx = list.findIndex(r => r.id === id);
  if(idx > -1){
    list[idx] = { ...list[idx], ...perubahan };
    ewsSimpanRiwayatTambahan(list);
    return list[idx];
  }
  return null;
}

// Hapus satu kejadian berdasarkan id
function ewsHapusRiwayat(id){
  ewsSeedRiwayatJikaKosong();
  const list = ewsGetRiwayatTambahan().filter(r => r.id !== id);
  ewsSimpanRiwayatTambahan(list);
}

// Gabungan data riwayat (contoh + kejadian yang ditambahkan/diubah admin)
function ewsSemuaRiwayat(){
  ewsSeedRiwayatJikaKosong();
  return ewsGetRiwayatTambahan();
}

/* =========================================================
   Penyimpanan Laporan (persisten di browser)
   Sama seperti Riwayat Kejadian di atas: laporan yang dibuat lewat
   form "Buat Laporan Baru" disimpan ke localStorage supaya tetap
   ada saat pindah halaman/menu atau saat browser dimuat ulang.
   ========================================================= */
const EWS_STORAGE_LAPORAN = "ews_karhutla_laporan_tambahan";

function ewsGetLaporanTersimpan(){
  try{ return JSON.parse(localStorage.getItem(EWS_STORAGE_LAPORAN)) || []; }
  catch(e){ return []; }
}

function ewsSimpanLaporanTersimpan(list){
  localStorage.setItem(EWS_STORAGE_LAPORAN, JSON.stringify(list));
}

// Pastikan data contoh (DAFTAR_LAPORAN) sudah tersimpan di localStorage
// supaya baris tersebut juga ikut tampil bersama laporan baru.
function ewsSeedLaporanJikaKosong(){
  if(localStorage.getItem(EWS_STORAGE_LAPORAN) === null){
    const awal = JSON.parse(JSON.stringify(DAFTAR_LAPORAN)).map(l => ({
      ...l, dataDisertakan: ["Monitoring","Cuaca","Hotspot","Kejadian"], tglMulai:"", tglSelesai:""
    }));
    ewsSimpanLaporanTersimpan(awal);
  }
}

function ewsTambahLaporan(item){
  ewsSeedLaporanJikaKosong();
  const list = ewsGetLaporanTersimpan();
  list.unshift(item);
  ewsSimpanLaporanTersimpan(list);
  return item;
}

// Gabungan data laporan (contoh + laporan yang ditambahkan pengguna)
function ewsSemuaLaporan(){
  ewsSeedLaporanJikaKosong();
  return ewsGetLaporanTersimpan();
}

// Hapus satu laporan berdasarkan id
function ewsHapusLaporan(id){
  ewsSeedLaporanJikaKosong();
  const list = ewsGetLaporanTersimpan().filter(l => l.id !== id);
  ewsSimpanLaporanTersimpan(list);
}
const NOTIF_LIST = [
  { text: "Titik panas baru terdeteksi di Kec. Tenayan Raya", time: "15 menit lalu", level: "high" },
  { text: "Kelembapan udara turun di bawah 50%", time: "1 jam lalu", level: "medium" },
  { text: "Laporan mingguan berhasil dibuat", time: "3 jam lalu", level: "info" }
];

/* =========================================================
   SUMBER DATA TUNGGAL — Monitoring Karhutla
   Ini adalah inti dari keterhubungan otomatis antar halaman:
   Monitoring → Peringatan → Peta → Dashboard.

   1. WILAYAH_RISIKO (di atas) adalah data DASAR (contoh/awal).
   2. Saat petugas meng-klik "Update" pada satu kecamatan di
      halaman Monitoring, nilai suhu/kelembapan/titik panas baru
      disimpan sebagai "override" di localStorage, dan tingkat
      risikonya DIHITUNG ULANG otomatis (bukan dipilih manual)
      lewat ewsHitungRisiko().
   3. ewsGetWilayahRisikoGabungan() menggabungkan data dasar +
      override → inilah yang dipakai SEMUA halaman (Monitoring,
      Peringatan, Peta, Dashboard). Karena satu fungsi ini
      dipakai bersama, begitu Monitoring diperbarui, halaman
      lain otomatis ikut berubah saat dibuka/direfresh — tanpa
      perlu input ulang di masing-masing halaman.
   ========================================================= */
const EWS_STORAGE_MONITORING = "ews_karhutla_monitoring_override";

// Menghitung tingkat risiko otomatis dari 3 indikator (bukan dipilih manual)
function ewsHitungRisiko(suhu, kelembapan, hotspot){
  let skor = 0;
  if (suhu >= 35) skor += 2; else if (suhu >= 33) skor += 1;
  if (kelembapan <= 45) skor += 2; else if (kelembapan <= 55) skor += 1;
  if (hotspot >= 4) skor += 3; else if (hotspot >= 2) skor += 2; else if (hotspot >= 1) skor += 1;
  if (skor >= 5) return "Tinggi";
  if (skor >= 2) return "Sedang";
  return "Rendah";
}

function ewsGetMonitoringOverride(){
  try{ return JSON.parse(localStorage.getItem(EWS_STORAGE_MONITORING)) || {}; }
  catch(e){ return {}; }
}

// Field catatan & tindakan lapangan (selain suhu/kelembapan/hotspot) yang
// bisa diperbarui petugas lewat form Update Data di halaman Monitoring.
const EWS_FIELD_CATATAN_MONITORING = [
  "jenisLahan", "tujuanMonitoring", "catatanLokal", "ancamanDampak",
  "jumlahTerdampakKK", "tindakanPencegahan", "tindakanPenanganan", "hasilPeninjauan"
];

function ewsSimpanUpdateMonitoring(kecamatan, suhu, kelembapan, hotspot, catatan){
  const all = ewsGetMonitoringOverride();
  const sebelumnya = all[kecamatan] || {};
  all[kecamatan] = {
    ...sebelumnya,
    suhu, kelembapan, hotspot,
    risiko: ewsHitungRisiko(suhu, kelembapan, hotspot),
    ...(catatan || {}),
    diperbaruiOleh: (typeof ewsCurrentUser === "function" && ewsCurrentUser() && ewsCurrentUser().nama) || "Petugas BPBD",
    diperbaruiPada: new Date().toISOString()
  };
  localStorage.setItem(EWS_STORAGE_MONITORING, JSON.stringify(all));
}

// Data monitoring gabungan (dasar + hasil update petugas) — dipakai di SEMUA halaman
function ewsGetWilayahRisikoGabungan(){
  const override = ewsGetMonitoringOverride();
  return WILAYAH_RISIKO.map(w => {
    const o = override[w.kecamatan];
    if(!o) return w;
    const hasil = { ...w, suhu:o.suhu, kelembapan:o.kelembapan, hotspot:o.hotspot, risiko:o.risiko, diperbaruiOleh:o.diperbaruiOleh, diperbaruiPada:o.diperbaruiPada };
    EWS_FIELD_CATATAN_MONITORING.forEach(f => { if(o[f] !== undefined) hasil[f] = o[f]; });
    return hasil;
  });
}

/* =========================================================
   Status risiko KESELURUHAN kota, dihitung dari jumlah wilayah
   per tingkat risiko (bukan nilai tetap/hardcode). Dua pendekatan
   tersedia — Dashboard memakai ewsHitungStatusMayoritas() di bawah
   sebagai status UTAMA, dan versi "worst-case" berikut ini disimpan
   sebagai alternatif/referensi bila suatu saat ingin diaktifkan
   kembali (mis. kebijakan BPBD berubah jadi lebih ketat):
   - worst-case wins: ADA 1 wilayah Tinggi -> status Tinggi;
     tidak ada Tinggi tapi ada Sedang -> Sedang; semua Rendah -> Rendah.
   ========================================================= */
function ewsHitungStatusKota(jumlahRisiko){
  if(jumlahRisiko.tinggi > 0) return "Tinggi";
  if(jumlahRisiko.sedang > 0) return "Sedang";
  return "Rendah";
}

// Status berdasarkan warna yang PALING BANYAK jumlah wilayahnya (mayoritas).
// INI YANG DIPAKAI Dashboard saat ini — label utama donut & banner mengikuti
// warna paling dominan secara visual (supaya tidak kontradiktif, mis. donut
// dominan hijau tapi label "Tinggi"). Wilayah Sedang/Tinggi yang bukan
// mayoritas tetap ditampilkan sebagai catatan tambahan di dashboard.html,
// jadi tidak hilang/tersembunyi begitu saja. Jika jumlahnya seri,
// diprioritaskan tingkat yang lebih parah (Tinggi > Sedang > Rendah)
// supaya tetap condong ke sisi aman/waspada.
function ewsHitungStatusMayoritas(jumlahRisiko){
  const entri = [
    ["Tinggi", jumlahRisiko.tinggi],
    ["Sedang", jumlahRisiko.sedang],
    ["Rendah", jumlahRisiko.rendah]
  ];
  entri.sort((a, b) => b[1] - a[1]); // urut jumlah terbanyak dulu; seri -> urutan asli (Tinggi>Sedang>Rendah) menang
  return entri[0][0];
}

/* =========================================================
   Peringatan otomatis dari data Monitoring
   Data peringatan TIDAK diinput manual — melainkan dihasilkan
   langsung dari ewsGetWilayahRisikoGabungan() (data terkini
   halaman Monitoring Karhutla, termasuk update petugas).
   Setiap kecamatan berisiko Tinggi/Sedang otomatis menjadi
   satu entri peringatan aktif.
   ========================================================= */
function generatePeringatanDariMonitoring(){
  const now = new Date();
  const waktu = now.toLocaleString("id-ID", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) + " WIB";

  const dataTerkini = ewsGetWilayahRisikoGabungan();
  const kelompok = { Tinggi: [], Sedang: [], Rendah: [] };
  dataTerkini.forEach(w => kelompok[w.risiko]?.push(w));

  const pesanTemplate = {
    Tinggi: "Suhu tinggi, kelembapan rendah, dan titik panas terdeteksi menunjukkan potensi risiko karhutla TINGGI. Perlu kesiagaan dan patroli lapangan segera.",
    Sedang: "Beberapa indikator (suhu/kelembapan/titik panas) menunjukkan peningkatan risiko karhutla pada tingkat SEDANG. Perlu pemantauan lebih ketat.",
    Rendah: "Kondisi cuaca dan jumlah titik panas masih dalam batas normal. Risiko karhutla saat ini tergolong RENDAH."
  };

  const hasil = [];
  ["Tinggi","Sedang"].forEach(level => {
    const list = kelompok[level];
    if(list.length === 0) return;
    hasil.push({
      id: "PRG-AUTO-" + level.toUpperCase(),
      tingkat: level,
      wilayah: list.map(w => w.kecamatan).join(", "),
      pesan: pesanTemplate[level],
      waktu: "Update " + waktu,
      status: "Aktif",
      totalHotspot: list.reduce((s,w)=>s+w.hotspot,0),
      jumlahWilayah: list.length,
      // Rincian per kecamatan — dasar perhitungan totalHotspot di atas, dipakai
      // untuk menampilkan detail "titik panas ini datang dari kecamatan mana saja"
      rincian: list.map(w => ({ nama: w.nama, kecamatan: w.kecamatan, suhu: w.suhu, kelembapan: w.kelembapan, hotspot: w.hotspot }))
                   .sort((a,b) => b.hotspot - a.hotspot),
      signature: level + "|" + list.map(w=>w.kecamatan).sort().join(",") + "|" + list.reduce((s,w)=>s+w.hotspot,0)
    });
  });
  if(kelompok.Rendah.length){
    hasil.push({
      id: "PRG-AUTO-RENDAH",
      tingkat: "Rendah",
      wilayah: kelompok.Rendah.map(w => w.kecamatan).join(", "),
      pesan: pesanTemplate.Rendah,
      waktu: "Update " + waktu,
      status: "Aktif",
      totalHotspot: kelompok.Rendah.reduce((s,w)=>s+w.hotspot,0),
      jumlahWilayah: kelompok.Rendah.length,
      rincian: kelompok.Rendah.map(w => ({ nama: w.nama, kecamatan: w.kecamatan, suhu: w.suhu, kelembapan: w.kelembapan, hotspot: w.hotspot }))
                              .sort((a,b) => b.hotspot - a.hotspot),
      signature: "Rendah|" + kelompok.Rendah.map(w=>w.kecamatan).sort().join(",") + "|" + kelompok.Rendah.reduce((s,w)=>s+w.hotspot,0)
    });
  }

  // Sembunyikan peringatan yang sudah ditutup petugas, SELAMA kondisi datanya
  // belum berubah. Begitu data monitoring berubah (signature beda), peringatan
  // baru otomatis muncul lagi sebagai aktif.
  const ditutup = ewsGetPeringatanDitutup();
  return hasil.filter(h => ditutup[h.tingkat] !== h.signature);
}

/* =========================================================
   Menutup peringatan aktif
   Dipanggil dari halaman Peringatan saat petugas klik "Tutup".
   1. Menyimpan salinan peringatan ke arsip (localStorage) dengan
      status "Ditutup" agar tampil di tabel Riwayat Peringatan.
   2. Menyimpan "signature" kondisi saat ditutup, supaya peringatan
      dengan kondisi PERSIS SAMA tidak muncul lagi sebagai aktif —
      tapi begitu data Monitoring berubah, peringatan baru otomatis
      muncul kembali (karena signature-nya beda).
   ========================================================= */
const EWS_STORAGE_PERINGATAN_ARSIP = "ews_karhutla_peringatan_arsip";
const EWS_STORAGE_PERINGATAN_DITUTUP = "ews_karhutla_peringatan_ditutup";

function ewsGetPeringatanArsip(){
  try{ return JSON.parse(localStorage.getItem(EWS_STORAGE_PERINGATAN_ARSIP)) || []; }
  catch(e){ return []; }
}

function ewsGetPeringatanDitutup(){
  try{ return JSON.parse(localStorage.getItem(EWS_STORAGE_PERINGATAN_DITUTUP)) || {}; }
  catch(e){ return {}; }
}

function ewsTutupPeringatan(entry){
  // 1) catat ke arsip/riwayat
  const arsip = ewsGetPeringatanArsip();
  arsip.unshift({
    id: "PRG-" + Date.now(),
    tingkat: entry.tingkat,
    wilayah: entry.wilayah,
    pesan: entry.pesan,
    waktu: entry.waktu,
    status: "Ditutup",
    ditutupOleh: (typeof ewsCurrentUser === "function" && ewsCurrentUser() && ewsCurrentUser().nama) || "Petugas BPBD",
    ditutupPada: new Date().toISOString()
  });
  localStorage.setItem(EWS_STORAGE_PERINGATAN_ARSIP, JSON.stringify(arsip));

  // 2) tandai signature kondisi ini sebagai "ditutup" untuk tingkat risiko tsb.
  const ditutup = ewsGetPeringatanDitutup();
  ditutup[entry.tingkat] = entry.signature;
  localStorage.setItem(EWS_STORAGE_PERINGATAN_DITUTUP, JSON.stringify(ditutup));
}

// Gabungan arsip contoh (DAFTAR_PERINGATAN yang berstatus Ditutup) + arsip hasil klik "Tutup"
function ewsSemuaArsipPeringatan(){
  const contoh = DAFTAR_PERINGATAN.filter(p => p.status === "Ditutup");
  return [...ewsGetPeringatanArsip(), ...contoh];
}
