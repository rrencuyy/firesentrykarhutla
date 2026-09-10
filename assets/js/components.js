/* =========================================================
   FIRESENTRY KARHUTLA - Komponen bersama (sidebar, auth guard, util)
   ========================================================= */

// Catatan: "Data Cuaca" dan "Data Hotspot" sengaja TIDAK lagi punya menu
// sendiri — keduanya sudah digabungkan sebagai tab di dalam halaman
// "Monitoring Karhutla" (lihat monitoring.html: tab 🌦️ Data Cuaca & 📈 Data
// Hotspot). data-cuaca.html dan data-hotspot.html tetap ada sebagai alih
// arah (redirect) otomatis ke tab terkait, untuk menjaga tautan/bookmark
// lama tetap berfungsi. Halaman "Riwayat Kejadian" (riwayat.html) sudah
// dihapus sepenuhnya sesuai permintaan — tidak ada lagi menunya di sini.
const MENU_UTAMA = [
  { key:"dashboard", label:"Dashboard", icon:"📊", href:"dashboard.html" },
  { key:"monitoring", label:"Monitoring Karhutla", icon:"🔥", href:"monitoring.html" },
  { key:"peta", label:"Peta Wilayah", icon:"📍", href:"peta.html" },
  { key:"risiko", label:"Analisis Risiko", icon:"🧭", href:"analisis-risiko.html" },
  { key:"peringatan", label:"Peringatan", icon:"⚠️", href:"peringatan.html" },
];
const MENU_DATA = [
  { key:"laporan", label:"Laporan", icon:"📄", href:"laporan.html" },
];

/* ---------- Auth guard sederhana (client-side, untuk keperluan demo/skripsi) ---------- */
const AUTH_KEY = "ews_karhutla_auth";

function ewsIsLoggedIn(){
  try{
    const raw = localStorage.getItem(AUTH_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    return !!(data && data.loggedIn);
  }catch(e){ return false; }
}

function ewsCurrentUser(){
  try{
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

function ewsRequireAuth(){
  if(!ewsIsLoggedIn()){
    window.location.href = "index.html";
  }
}

function ewsLogout(){
  localStorage.removeItem(AUTH_KEY);
  window.location.href = "index.html";
}

/* ---------- Render sidebar ---------- */
function renderSidebar(activeKey){
  const mount = document.getElementById("sidebar-mount");
  if(!mount) return;
  const user = ewsCurrentUser() || { nama:"Petugas BPBD", role:"Monitoring & Operasional" };
  const initials = (user.nama || "P B").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();

  const renderItems = (items) => items.map(it => `
    <li>
      <a class="nav-item ${it.key===activeKey ? "active" : ""}" href="${it.href}">
        <span class="nav-icon">${it.icon}</span>
        <span>${it.label}</span>
      </a>
    </li>`).join("");

  mount.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <div class="brand-mark"><img src="assets/img/logo-bpbd.png" alt="Logo BPBD Kota Pekanbaru" class="brand-logo-img"></div>
        <div class="brand-text">
          <div class="brand-title">FIRESENTRY KARHUTLA</div>
          <div class="brand-sub">BPBD KOTA PEKANBARU</div>
        </div>
      </div>

      <div class="nav-group">
        <div class="nav-label">MENU UTAMA</div>
        <ul class="nav-list">${renderItems(MENU_UTAMA)}</ul>
      </div>

      <div class="nav-group">
        <div class="nav-label">DATA &amp; LAPORAN</div>
        <ul class="nav-list">${renderItems(MENU_DATA)}</ul>
      </div>

      <div class="sidebar-footer">
        <div class="nav-label" style="padding-left:2px;">SISTEM</div>
        <div class="user-chip">
          <div class="user-avatar">${initials}</div>
          <div class="user-meta">
            <div class="user-name">${user.nama || "Petugas BPBD"}</div>
            <div class="user-role">${user.role || "Monitoring & Operasional"}</div>
          </div>
        </div>
        <button class="logout-btn" onclick="ewsLogout()">⏻ Keluar</button>
      </div>
    </aside>`;
}

/* ---------- Topbar (judul halaman + status + notifikasi) ---------- */
function renderTopbar({title, subtitle}){
  const mount = document.getElementById("topbar-mount");
  if(!mount) return;
  mount.innerHTML = `
    <div class="mobile-topbar">
      <button onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
      <strong>FIRESENTRY KARHUTLA</strong>
      <span></span>
    </div>
    <div class="topbar">
      <div>
        <h1 class="page-title">${title}</h1>
        <p class="page-sub">${subtitle || ""}</p>
      </div>
      <div class="topbar-actions">
        <span class="status-live"><span class="status-dot"></span>Sistem aktif</span>
        <button class="bell-btn" id="notif-btn" title="Notifikasi"><span class="dot"></span>🔔</button>
      </div>
    </div>`;

  const btn = document.getElementById("notif-btn");
  if(btn){
    btn.addEventListener("click", () => {
      const lines = (typeof NOTIF_LIST !== "undefined" ? NOTIF_LIST : [])
        .map(n => `• [${n.time}] ${n.text}`).join("\n");
      alert("Notifikasi Terbaru\n\n" + (lines || "Tidak ada notifikasi baru."));
    });
  }
}

/* ---------- Util umum ---------- */
function ewsBadgeClass(level){
  const l = (level || "").toLowerCase();
  if(l === "tinggi" || l === "high") return "badge-high";
  if(l === "sedang" || l === "medium") return "badge-medium";
  if(l === "rendah" || l === "low") return "badge-low";
  return "badge-neutral";
}

function ewsInitPage(activeKey, topbarConfig){
  ewsRequireAuth();
  renderSidebar(activeKey);
  renderTopbar(topbarConfig);
}
