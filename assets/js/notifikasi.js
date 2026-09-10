/* =========================================================
   FIRESENTRY KARHUTLA - Notifikasi Aktif (Telegram)
   ---------------------------------------------------------
   Mengirim pesan Telegram otomatis saat status risiko sebuah
   KECAMATAN NAIK ke Sedang atau Tinggi — bukan setiap kali
   sinkron, supaya petugas tidak dibanjiri pesan berulang untuk
   status yang sama. Notifikasi dikirim lagi hanya jika levelnya
   naik lebih tinggi dari terakhir kali dinotifikasi, atau turun
   dulu ke Rendah lalu naik lagi.

   CARA MENGAKTIFKAN (5 menit, gratis, tanpa approval):
   1. Di Telegram, chat ke @BotFather -> ketik /newbot -> ikuti
      instruksi -> BotFather akan kasih TOKEN (contoh:
      123456789:ABCdefGhIJKlmnoPQRstuVWXyz).
   2. Buat grup Telegram isi petugas BPBD yang perlu menerima
      peringatan, lalu tambahkan bot kamu ke grup itu.
   3. Kirim 1 pesan apa saja ke grup itu, lalu buka di browser:
      https://api.telegram.org/bot<TOKEN>/getUpdates
      Cari angka "id" di dalam objek "chat" -> itu CHAT_ID kamu
      (untuk grup biasanya diawali tanda minus, contoh -1001234567890).
   4. Isi TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID di bawah ini.

   CATATAN KEAMANAN (penting untuk laporan/sidang):
   Karena ini situs statis tanpa server, TOKEN akan terlihat oleh
   siapa pun yang membuka "View Page Source" di browser — sama
   seperti FIRMS_MAP_KEY di api.js. Ini cukup aman untuk demo/skripsi
   selama bot HANYA dipakai kirim pesan ke 1 grup internal (bukan
   bot publik yang menyimpan data sensitif). Kalau merasa disalah-
   gunakan, token bisa langsung dicabut & diganti lewat /revoke di
   BotFather. Untuk versi produksi nyata (setelah tersambung ke
   server BPBD asli), sebaiknya pengiriman dipindah ke backend agar
   token tidak pernah sampai ke browser pengguna.
   ========================================================= */

const TELEGRAM_BOT_TOKEN = "8948149820:AAGCZtJuLxLvfe3pxAqieQIakAgkeRR_qyU";
const TELEGRAM_CHAT_ID   = "-4999388569";

const EWS_STORAGE_STATUS_NOTIFIKASI = "ews_karhutla_status_notifikasi_terakhir";
const EWS_URUTAN_RISIKO = { "Rendah": 0, "Sedang": 1, "Tinggi": 2 };

function ewsGetStatusTerakhirNotifikasi(){
  try{ return JSON.parse(localStorage.getItem(EWS_STORAGE_STATUS_NOTIFIKASI)) || {}; }
  catch(e){ return {}; }
}

function ewsSimpanStatusTerakhirNotifikasi(map){
  localStorage.setItem(EWS_STORAGE_STATUS_NOTIFIKASI, JSON.stringify(map));
}

/**
 * Kirim satu pesan teks ke Telegram lewat Bot API.
 * @returns {Promise<boolean>} true kalau berhasil terkirim
 */
async function ewsKirimTelegram(pesan){
  if(!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.startsWith("ISI_")){
    console.warn("[Notifikasi] TELEGRAM_BOT_TOKEN belum diisi di assets/js/notifikasi.js, notifikasi dilewati.");
    return false;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try{
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: pesan, parse_mode: "HTML" })
    });
    if(!res.ok){
      console.warn("[Notifikasi] Telegram merespons error:", res.status, await res.text());
      return false;
    }
    return true;
  }catch(err){
    console.warn("[Notifikasi] Gagal mengirim ke Telegram (cek koneksi internet).", err);
    return false;
  }
}

function ewsSusunPesanEskalasi(kecamatan, risikoBaru){
  const emoji = risikoBaru === "Tinggi" ? "🔴" : "🟠";
  return (
    `${emoji} <b>PERINGATAN DINI KARHUTLA</b>\n` +
    `Kecamatan: <b>${kecamatan}</b>\n` +
    `Status naik ke: <b>${risikoBaru}</b>\n` +
    `Waktu: ${new Date().toLocaleString("id-ID")} WIB\n` +
    `Silakan cek dashboard Monitoring untuk detail suhu, kelembapan, dan titik panas.`
  );
}

/**
 * Dipanggil setelah ewsSinkronMonitoringRealtime() selesai (lihat
 * monitoring.html). Membandingkan status risiko TERBARU tiap
 * kecamatan terhadap status terakhir yang pernah dinotifikasi, lalu
 * kirim pesan HANYA untuk kecamatan yang levelnya NAIK ke Sedang
 * atau Tinggi (bukan yang turun, dan bukan yang levelnya tetap sama
 * seperti notifikasi sebelumnya).
 * @returns {Promise<string[]>} daftar nama kecamatan yang baru saja dinotifikasi
 */
async function ewsCekDanKirimNotifikasiEskalasi(){
  const semuaWilayah = ewsGetWilayahRisikoGabungan(); // sudah ada di data.js
  const statusLama = ewsGetStatusTerakhirNotifikasi();
  const statusBaru = {};
  const kecamatanDinotifikasi = [];

  // Satu kecamatan bisa punya beberapa kelurahan/wilayah — ambil risiko
  // TERTINGGI di antara wilayah-wilayah dalam kecamatan yang sama.
  const risikoPerKecamatan = {};
  semuaWilayah.forEach(w => {
    const urutanSaatIni = EWS_URUTAN_RISIKO[w.risiko] ?? 0;
    const risikoSebelumnya = risikoPerKecamatan[w.kecamatan];
    if(risikoSebelumnya === undefined || urutanSaatIni > EWS_URUTAN_RISIKO[risikoSebelumnya]){
      risikoPerKecamatan[w.kecamatan] = w.risiko;
    }
  });

  for(const [kecamatan, risikoBaru] of Object.entries(risikoPerKecamatan)){
    statusBaru[kecamatan] = risikoBaru;
    const risikoLama = statusLama[kecamatan] || "Rendah";
    const naik = EWS_URUTAN_RISIKO[risikoBaru] > EWS_URUTAN_RISIKO[risikoLama];
    const perluNotifikasi = naik && (risikoBaru === "Sedang" || risikoBaru === "Tinggi");

    if(perluNotifikasi){
      const berhasil = await ewsKirimTelegram(ewsSusunPesanEskalasi(kecamatan, risikoBaru));
      if(berhasil) kecamatanDinotifikasi.push(kecamatan);
    }
  }

  ewsSimpanStatusTerakhirNotifikasi(statusBaru);
  return kecamatanDinotifikasi;
}
