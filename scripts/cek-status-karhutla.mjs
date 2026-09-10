#!/usr/bin/env node
/* =========================================================
   FIRESENTRY KARHUTLA - Pengecekan Status Otomatis (server-side)
   ---------------------------------------------------------
   Dijalankan TERJADWAL lewat GitHub Actions (lihat
   .github/workflows/cek-status-karhutla.yml) — TANPA perlu ada
   yang membuka browser/dashboard. Inilah bagian yang membuat
   sistem ini benar-benar "Peringatan DINI", bukan cuma tampilan
   pasif yang harus dibuka manual.

   ALUR:
   1. Ambil cuaca terkini (BMKG) + titik panas (NASA FIRMS) untuk
      tiap kecamatan — logikanya sama persis dengan
      ewsSinkronMonitoringRealtime() di assets/js/api.js, hanya
      dijalankan di Node (server), bukan di browser.
   2. Hitung status risiko tiap kecamatan.
   3. Bandingkan dengan status hasil run SEBELUMNYA (disimpan di
      data/status-notifikasi-terakhir.json, di-commit balik ke
      repo tiap kali script ini jalan).
   4. Kirim pesan Telegram HANYA untuk kecamatan yang levelnya
      NAIK ke Sedang/Tinggi.

   ====== PENTING - DUPLIKASI YANG PERLU DIJAGA ======
   Ambang batas risiko (suhu 35, kelembapan 45, hotspot 1/2/4) di
   bawah ini SENGAJA disalin dari ewsHitungRisiko() di
   assets/js/data.js — karena file itu ditulis untuk browser
   (memakai localStorage) dan tidak bisa langsung dipakai di sini.
   KALAU ambang batas di data.js diubah nanti (poin revisi #3 -
   validasi bersama pembimbing/BPBD), UBAH JUGA angka yang sama
   persis di hitungRisiko() di bawah supaya dashboard & notifikasi
   tidak saling berbeda pendapat soal status suatu kecamatan.
   ========================================================= */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const FIRMS_MAP_KEY = process.env.FIRMS_MAP_KEY;
const BMKG_ENDPOINT = "https://api.bmkg.go.id/publik/prakiraan-cuaca";
const FIRMS_BOX = "101.30,0.40,101.60,0.60"; // area Kota Pekanbaru, sama seperti api.js
const FILE_STATUS = path.join(process.cwd(), "data", "status-notifikasi-terakhir.json");

// Kode wilayah (adm4) per kecamatan — disalin dari KECAMATAN_ADM4 di assets/js/data.js
const KECAMATAN_ADM4 = {
  "Pekanbaru Kota": "14.71.02.1004",
  "Tenayan Raya": "14.71.10.1004",
  "Rumbai": "14.71.12.1009",
  "Rumbai Barat": "14.71.06.1003",
  "Rumbai Timur": "14.71.15.1005",
  "Kulim": "14.71.14.1001",
  "Bukit Raya": "14.71.07.1005",
  "Marpoyan Damai": "14.71.09.1003",
  "Payung Sekaki": "14.71.11.1002",
  "Tuah Madani": "14.71.13.1004",
  "Binawidya": "14.71.08.1010",
  "Sukajadi": "14.71.01.1007",
  "Sail": "14.71.03.1001",
  "Lima Puluh": "14.71.04.1001",
  "Senapelan": "14.71.05.1005",
};

// Satu titik koordinat wakil per kecamatan (dipakai HANYA untuk
// mengelompokkan titik panas FIRMS ke kecamatan terdekat — cukup untuk
// keperluan notifikasi, tidak perlu presisi kelurahan seperti di dashboard).
const TITIK_ACUAN_KECAMATAN = {
  "Tenayan Raya": { lat: 0.5486, lng: 101.5192 },
  "Rumbai": { lat: 0.5637, lng: 101.4111 },
  "Rumbai Barat": { lat: 0.535, lng: 101.439 },
  "Binawidya": { lat: 0.4802, lng: 101.3986 },
  "Bukit Raya": { lat: 0.5083, lng: 101.4767 },
  "Marpoyan Damai": { lat: 0.5069, lng: 101.4364 },
  "Payung Sekaki": { lat: 0.5147, lng: 101.4058 },
  "Tuah Madani": { lat: 0.5215, lng: 101.398 },
  "Sukajadi": { lat: 0.5261, lng: 101.4342 },
  "Pekanbaru Kota": { lat: 0.5333, lng: 101.45 },
  "Sail": { lat: 0.528, lng: 101.46 },
  "Lima Puluh": { lat: 0.541, lng: 101.453 },
  "Senapelan": { lat: 0.5305, lng: 101.438 },
  "Kulim": { lat: 0.489, lng: 101.533 },
  "Rumbai Timur": { lat: 0.575, lng: 101.465 },
};

const URUTAN_RISIKO = { Rendah: 0, Sedang: 1, Tinggi: 2 };

// Sama persis dengan ewsHitungRisiko() di assets/js/data.js — lihat catatan
// "DUPLIKASI YANG PERLU DIJAGA" di atas file ini.
function hitungRisiko(suhu, kelembapan, hotspot) {
  let skor = 0;
  if (suhu >= 30) skor += 2;
  else if (suhu >= 38) skor += 1;
  if (kelembapan <= 45) skor += 2;
  else if (kelembapan <= 55) skor += 1;
  if (hotspot >= 4) skor += 3;
  else if (hotspot >= 2) skor += 2;
  else if (hotspot >= 1) skor += 1;
  if (skor >= 5) return "Tinggi";
  if (skor >= 2) return "Sedang";
  return "Rendah";
}

async function ambilCuacaTerkini(adm4) {
  const res = await fetch(`${BMKG_ENDPOINT}?adm4=${encodeURIComponent(adm4)}`);
  if (!res.ok) throw new Error("BMKG HTTP " + res.status);
  const json = await res.json();
  const cuaca = json?.data?.[0]?.cuaca;
  if (!cuaca) return null;
  const flat = cuaca.flat();
  const now = Date.now();
  let terdekat = null;
  let selisihMin = Infinity;
  for (const item of flat) {
    const t = new Date((item.local_datetime || "").replace(" ", "T")).getTime();
    if (Number.isNaN(t)) continue;
    const selisih = Math.abs(now - t);
    if (selisih < selisihMin) {
      selisihMin = selisih;
      terdekat = item;
    }
  }
  return terdekat ? { suhu: terdekat.t, kelembapan: terdekat.hu } : null;
}

async function ambilTitikFirms() {
  if (!FIRMS_MAP_KEY) {
    console.warn("[FIRMS] FIRMS_MAP_KEY tidak diset (secret kosong), lewati pengambilan hotspot.");
    return [];
  }
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_MAP_KEY}/VIIRS_SNPP_NRT/${FIRMS_BOX}/1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("FIRMS HTTP " + res.status);
  const csv = (await res.text()).trim();
  const baris = csv.split("\n");
  if (baris.length < 2) return [];
  const header = baris[0].split(",");
  return baris.slice(1).map((r) => {
    const kolom = r.split(",");
    const obj = {};
    header.forEach((h, i) => (obj[h.trim()] = kolom[i]));
    return obj;
  });
}

function kecamatanTerdekat(lat, lng) {
  let terdekat = null;
  let jarakMin = Infinity;
  for (const [kec, titik] of Object.entries(TITIK_ACUAN_KECAMATAN)) {
    const jarak = Math.hypot(lat - titik.lat, lng - titik.lng);
    if (jarak < jarakMin) {
      jarakMin = jarak;
      terdekat = kec;
    }
  }
  return terdekat;
}

function kelompokkanHotspot(titikFirms) {
  const jumlah = {};
  for (const p of titikFirms) {
    const lat = parseFloat(p.latitude);
    const lng = parseFloat(p.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const kec = kecamatanTerdekat(lat, lng);
    if (!kec) continue;
    jumlah[kec] = (jumlah[kec] || 0) + 1;
  }
  return jumlah;
}

async function kirimTelegram(pesan) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID belum diset di GitHub Secrets, notifikasi dilewati.");
    return false;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: pesan, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    console.warn("[Telegram] Gagal kirim:", res.status, await res.text());
    return false;
  }
  return true;
}

function susunPesan(kecamatan, risikoBaru) {
  const emoji = risikoBaru === "Tinggi" ? "🔴" : "🟠";
  return (
    `${emoji} <b>PERINGATAN DINI KARHUTLA</b>\n` +
    `Kecamatan: <b>${kecamatan}</b>\n` +
    `Status naik ke: <b>${risikoBaru}</b>\n` +
    `Waktu: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB\n` +
    `(Notifikasi otomatis dari pengecekan terjadwal — bukan dari dashboard.)`
  );
}

/**
 * Alert KHUSUS untuk masalah SISTEM (bukan eskalasi risiko karhutla biasa)
 * — dipakai saat BMKG gagal total atau script error, supaya petugas/dev
 * tahu sistemnya sedang "buta", bukan diam-diam berhenti kerja.
 */
async function kirimAlertSistem(pesan) {
  await kirimTelegram(`⚠️ <b>PERINGATAN SISTEM FIRESENTRY</b>\n${pesan}\n\nWaktu: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB`);
}

async function bacaStatusLama() {
  try {
    return JSON.parse(await readFile(FILE_STATUS, "utf8"));
  } catch (e) {
    return {}; // pertama kali dijalankan, file belum ada
  }
}

async function simpanStatusBaru(status) {
  await mkdir(path.dirname(FILE_STATUS), { recursive: true });
  await writeFile(FILE_STATUS, JSON.stringify(status, null, 2) + "\n", "utf8");
}

async function main() {
  const statusLama = await bacaStatusLama();
  const statusBaru = {};
  const dinotifikasi = [];

  const titikFirms = await ambilTitikFirms().catch((e) => {
    console.warn("[FIRMS] Gagal ambil hotspot:", e.message);
    return [];
  });
  const hotspotPerKecamatan = kelompokkanHotspot(titikFirms);

  const kecamatanGagal = []; // nama kecamatan yang BMKG-nya gagal diambil kali ini

  for (const [kecamatan, adm4] of Object.entries(KECAMATAN_ADM4)) {
    let cuaca = null;
    try {
      cuaca = await ambilCuacaTerkini(adm4);
    } catch (e) {
      console.warn(`[BMKG] Gagal ambil cuaca untuk ${kecamatan}:`, e.message);
    }
    if (!cuaca) {
      kecamatanGagal.push(kecamatan);
      continue; // BMKG gagal untuk kecamatan ini, lewati (jangan tebak status)
    }

    const hotspot = hotspotPerKecamatan[kecamatan] || 0;
    const risikoBaru = hitungRisiko(cuaca.suhu, cuaca.kelembapan, hotspot);
    statusBaru[kecamatan] = risikoBaru;

    const risikoLama = statusLama[kecamatan] || "Rendah";
    const naik = URUTAN_RISIKO[risikoBaru] > URUTAN_RISIKO[risikoLama];
    const perluNotifikasi = naik && (risikoBaru === "Sedang" || risikoBaru === "Tinggi");

    console.log(`${kecamatan}: suhu=${cuaca.suhu} kelembapan=${cuaca.kelembapan} hotspot=${hotspot} -> ${risikoBaru}`);

    if (perluNotifikasi) {
      const terkirim = await kirimTelegram(susunPesan(kecamatan, risikoBaru));
      if (terkirim) dinotifikasi.push(kecamatan);
    }
  }

  await simpanStatusBaru(statusBaru);

  const totalKecamatan = Object.keys(KECAMATAN_ADM4).length;
  if (kecamatanGagal.length === totalKecamatan) {
    // SEMUA kecamatan gagal — kemungkinan besar BMKG down atau endpoint berubah.
    // Ini paling kritis: sistem jadi "buta" total tanpa ada yang tahu.
    console.error("[ALERT] BMKG gagal untuk SEMUA kecamatan — sistem tidak bisa menilai risiko saat ini.");
    await kirimAlertSistem(
      `Gagal mengambil data cuaca BMKG untuk <b>SEMUA ${totalKecamatan} kecamatan</b>.\n` +
      `Sistem TIDAK BISA menilai status risiko saat ini — kemungkinan BMKG API sedang down atau berubah.\n` +
      `Cek log GitHub Actions untuk detail error.`
    );
  } else if (kecamatanGagal.length > 0) {
    // Sebagian gagal — beri tahu supaya tidak dikira "aman", padahal cuma tidak ter-cek.
    console.warn(`[ALERT] BMKG gagal untuk ${kecamatanGagal.length} dari ${totalKecamatan} kecamatan:`, kecamatanGagal.join(", "));
    await kirimAlertSistem(
      `Gagal ambil data cuaca untuk ${kecamatanGagal.length} dari ${totalKecamatan} kecamatan:\n` +
      `<b>${kecamatanGagal.join(", ")}</b>\n` +
      `Kecamatan ini TIDAK ter-update statusnya kali ini (bukan berarti aman, datanya cuma tidak masuk).`
    );
  }

  if (dinotifikasi.length) {
    console.log("Notifikasi terkirim untuk:", dinotifikasi.join(", "));
  } else {
    console.log("Tidak ada eskalasi status — tidak ada notifikasi yang dikirim kali ini.");
  }
}

main().catch(async (e) => {
  console.error("Pengecekan gagal total:", e);
  // Kirim juga ke Telegram, jangan cuma diam di log GitHub Actions yang jarang dicek.
  await kirimAlertSistem(
    `Script pengecekan status karhutla GAGAL TOTAL dengan error:\n<code>${String(e.message || e).slice(0, 300)}</code>\n` +
    `Cek log GitHub Actions untuk detail lengkap.`
  ).catch(() => {}); // kalau kirim alert-nya sendiri juga gagal, jangan sampai bikin proses macet
  process.exit(1);
});
