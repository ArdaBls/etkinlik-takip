/*
 * Firebase Realtime Database + yerel önbellek veri katmanı.
 * Çocuklara ait kişi veya kimlik bilgisi bu uygulamada tutulmaz.
 */

const RECORDS_STORAGE_KEY = "etkinlik-takip-records-v2";
const HOMES_STORAGE_KEY = "etkinlik-takip-homes-v1";
// Ev sorumlusu fotoğrafı homeProfiles/{homeId} içindeki photoDataUrl
// alanında base64 veri URL'si olarak saklanır; localStorage çevrimdışı önbellektir.
const HOME_PROFILES_STORAGE_KEY = "etkinlik-takip-home-profiles-v1";
const DEFAULT_HOMES = ["Güneş Çocuk Evi", "Umut Çocuk Evi", "Papatya Çocuk Evi", "Yıldız Çocuk Evi"];
const PHOTO_DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/;
const MAX_PHOTO_DATA_URL_LENGTH = 700_000;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const localISO = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const todayISO = () => localISO();
const parseDate = (value) => new Date(`${value}T12:00:00`);
const formatDate = (value) => {
  const date = parseDate(value);
  return Number.isNaN(date.getTime()) ? "Geçersiz tarih" : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric" }).format(date);
};

function getSampleRecords() {
  const now = new Date();
  const dateAt = (offset) => {
    const copy = new Date(now);
    copy.setDate(copy.getDate() + offset);
    return localISO(copy);
  };

  return [
    { id: "demo-1", date: dateAt(0), home: "Güneş Çocuk Evi", type: "Spor", eventName: "Basketbol antrenmanı", location: "İl Spor Salonu", startTime: "14:00", endTime: "15:30", notes: "" },
    { id: "demo-2", date: dateAt(-1), home: "Umut Çocuk Evi", type: "Kültür & Sanat", eventName: "Seramik atölyesi", location: "Gençlik Merkezi", startTime: "13:30", endTime: "15:00", notes: "" },
    { id: "demo-3", date: dateAt(-3), home: "Papatya Çocuk Evi", type: "Gezi", eventName: "Doğa yürüyüşü", location: "Kent Ormanı", startTime: "10:00", endTime: "12:00", notes: "Hava koşulları uygun." },
    { id: "demo-4", date: dateAt(-6), home: "Yıldız Çocuk Evi", type: "Eğitim", eventName: "Bilim atölyesi", location: "Bilim Merkezi", startTime: "11:00", endTime: "12:30", notes: "" },
    { id: "demo-5", date: dateAt(-10), home: "Güneş Çocuk Evi", type: "Spor", eventName: "Yüzme etkinliği", location: "Olimpik Havuz", startTime: "14:00", endTime: "15:00", notes: "" }
  ];
}

function normalizeRecords(list) {
  return list.filter((record) => record && typeof record === "object").map((record, index) => ({
    id: String(record.id || `record-${index + 1}`),
    date: typeof record.date === "string" && !Number.isNaN(parseDate(record.date).getTime()) ? record.date : todayISO(),
    home: String(record.home || "").trim() || "İsimsiz çocuk evi",
    type: String(record.type || "Diğer").trim() || "Diğer",
    eventName: String(record.eventName || "İsimsiz etkinlik").trim() || "İsimsiz etkinlik",
    location: String(record.location || "").trim(),
    startTime: String(record.startTime || "").trim(),
    endTime: String(record.endTime || "").trim(),
    notes: String(record.notes || "").trim()
  }));
}

function normalizeHomes(list) {
  return [...new Set(list.filter((home) => typeof home === "string").map((home) => home.trim().replace(/\s+/g, " ")).filter(Boolean))];
}

function getRecords() {
  try {
    const stored = JSON.parse(localStorage.getItem(RECORDS_STORAGE_KEY));
    return Array.isArray(stored) ? normalizeRecords(stored) : getSampleRecords();
  } catch {
    return getSampleRecords();
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));
    queueFirebaseSync();
    return true;
  } catch {
    showToast("Kayıt cihazda saklanamadı. Tarayıcı depolamasını kontrol edin.");
    return false;
  }
}

function getHomes() {
  try {
    const stored = JSON.parse(localStorage.getItem(HOMES_STORAGE_KEY));
    return Array.isArray(stored) ? normalizeHomes(stored) : [...DEFAULT_HOMES];
  } catch {
    return [...DEFAULT_HOMES];
  }
}

function saveHomes(homeList) {
  try {
    localStorage.setItem(HOMES_STORAGE_KEY, JSON.stringify(homeList));
    queueFirebaseSync();
    return true;
  } catch {
    showToast("Çocuk evi cihazda saklanamadı. Tarayıcı depolamasını kontrol edin.");
    return false;
  }
}

function normalizeHomeProfiles(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce((profiles, [home, profile]) => {
    const photoDataUrl = profile && typeof profile === "object" ? String(profile.photoDataUrl || "") : "";
    if (home.trim() && PHOTO_DATA_URL_PATTERN.test(photoDataUrl)) profiles[home] = { photoDataUrl };
    return profiles;
  }, {});
}

function getHomeProfiles() {
  try {
    return normalizeHomeProfiles(JSON.parse(localStorage.getItem(HOME_PROFILES_STORAGE_KEY)));
  } catch {
    return {};
  }
}

function saveHomeProfiles(profiles) {
  try {
    localStorage.setItem(HOME_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    queueFirebaseSync();
    return true;
  } catch {
    showToast("Ev sorumlusunun fotoğrafı cihazda saklanamadı. Tarayıcı depolamasını kontrol edin.");
    return false;
  }
}

let records = getRecords();
let homes = getHomes();
let homeProfiles = getHomeProfiles();
let editingRecordId = null;
let homeModalMode = null;
let selectedHomeName = null;
let selectedHomeDetail = null;
let monthlyRingSegments = [];
let monthlyRingTotal = 0;
let ringFocusIndex = 0;
let modalTrigger = null;
let deferredInstallPrompt = null;
let toastTimer;
const firebaseState = {
  enabled: false,
  auth: null,
  database: null,
  user: null,
  hydrating: false,
  syncTimer: null
};

const TYPE_COLORS = {
  "Spor": "#126b63",
  "Kültür & Sanat": "#d77263",
  "Gezi": "#5d82ae",
  "Eğitim": "#d69b4d",
  "Diğer": "#6fae93"
};

function firebaseSafeKey(value) {
  return encodeURIComponent(String(value))
    .replace(/\./g, "%2E")
    .replace(/\$/g, "%24")
    .replace(/#/g, "%23")
    .replace(/\[/g, "%5B")
    .replace(/\]/g, "%5D");
}

function firebaseStatePayload() {
  const cloudHomes = {};
  homes.forEach((home) => {
    cloudHomes[firebaseSafeKey(home)] = { name: home };
  });
  const cloudRecords = {};
  records.forEach((record) => {
    cloudRecords[firebaseSafeKey(record.id)] = { ...record };
  });
  const cloudProfiles = {};
  Object.entries(homeProfiles).forEach(([home, profile]) => {
    cloudProfiles[firebaseSafeKey(home)] = { homeName: home, photoDataUrl: profile.photoDataUrl };
  });
  return { homes: cloudHomes, eventRecords: cloudRecords, homeProfiles: cloudProfiles };
}

async function syncFirebaseState() {
  if (!firebaseState.enabled || !firebaseState.user || firebaseState.hydrating) return;
  try {
    const payload = firebaseStatePayload();
    await Promise.all([
      firebaseState.database.ref("homes").set(payload.homes),
      firebaseState.database.ref("eventRecords").set(payload.eventRecords),
      firebaseState.database.ref("homeProfiles").set(payload.homeProfiles)
    ]);
  } catch (error) {
    console.warn("Firebase verisi senkronize edilemedi:", error);
    showToast("Firebase senkronizasyonu başarısız oldu. Yerel kayıt korunuyor.");
  }
}

function queueFirebaseSync() {
  if (!firebaseState.enabled || !firebaseState.user || firebaseState.hydrating) return;
  clearTimeout(firebaseState.syncTimer);
  firebaseState.syncTimer = setTimeout(() => syncFirebaseState(), 350);
}

function cloudHomesToList(value) {
  return normalizeHomes(Object.values(value || {}).map((item) => typeof item === "string" ? item : item?.name));
}

function cloudProfilesToMap(value) {
  return Object.values(value || {}).reduce((profiles, profile) => {
    const home = String(profile?.homeName || "").trim();
    const photoDataUrl = String(profile?.photoDataUrl || "");
    if (home && PHOTO_DATA_URL_PATTERN.test(photoDataUrl)) profiles[home] = { photoDataUrl };
    return profiles;
  }, {});
}

async function hydrateFromFirebase() {
  if (!firebaseState.enabled || !firebaseState.user) return;
  firebaseState.hydrating = true;
  try {
    const [homesSnapshot, recordsSnapshot, profilesSnapshot] = await Promise.all([
      firebaseState.database.ref("homes").once("value"),
      firebaseState.database.ref("eventRecords").once("value"),
      firebaseState.database.ref("homeProfiles").once("value")
    ]);
    const hasCloudData = homesSnapshot.exists() || recordsSnapshot.exists() || profilesSnapshot.exists();
    if (homesSnapshot.exists()) homes = cloudHomesToList(homesSnapshot.val());
    if (recordsSnapshot.exists()) records = normalizeRecords(Object.values(recordsSnapshot.val() || {}));
    if (profilesSnapshot.exists()) homeProfiles = cloudProfilesToMap(profilesSnapshot.val());
    saveHomes(homes);
    saveRecords(records);
    saveHomeProfiles(homeProfiles);
    updateEverything();
    if (!hasCloudData) {
      firebaseState.hydrating = false;
      await syncFirebaseState();
    }
  } catch (error) {
    console.warn("Firebase verisi okunamadı:", error);
    showToast("Firebase verisi okunamadı. Yerel önbellek gösteriliyor.");
  } finally {
    firebaseState.hydrating = false;
  }
}

function authErrorText(error) {
  const messages = {
    "auth/invalid-credential": "E-posta veya parola hatalı.",
    "auth/invalid-email": "Geçerli bir e-posta adresi yazın.",
    "auth/user-disabled": "Bu yönetici hesabı devre dışı bırakılmış.",
    "auth/too-many-requests": "Çok fazla başarısız deneme yapıldı. Bir süre sonra tekrar deneyin."
  };
  return messages[error?.code] || "Giriş yapılamadı. Firebase Authentication ayarlarını kontrol edin.";
}

function showAuthGate(message = "Yalnızca yetkili ev sorumlusu giriş yapabilir.") {
  $("#auth-gate").hidden = false;
  $("#auth-error").textContent = message;
  $("#auth-logout").hidden = true;
  $("#data-mode").textContent = "Giriş bekleniyor";
  document.body.style.overflow = "hidden";
}

function hideAuthGate() {
  $("#auth-gate").hidden = true;
  $("#auth-error").textContent = "";
  $("#auth-logout").hidden = false;
  $("#data-mode").textContent = "Firebase bağlı";
  document.body.style.overflow = "";
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  $("#auth-error").textContent = "";
  if (!email || !password) {
    $("#auth-error").textContent = "E-posta ve parola zorunludur.";
    return;
  }
  button.disabled = true;
  button.textContent = "Giriş yapılıyor…";
  try {
    await firebaseState.auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    $("#auth-error").textContent = authErrorText(error);
  } finally {
    button.disabled = false;
    button.textContent = "Giriş yap";
  }
}

function initFirebase() {
  const config = window.ETKINLIK_FIREBASE_CONFIG;
  if (!config || typeof firebase === "undefined") {
    $("#data-mode").textContent = "Yerel taslak";
    return;
  }
  try {
    const firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
    firebaseState.auth = firebase.auth(firebaseApp);
    firebaseState.database = firebase.database(firebaseApp);
    firebaseState.enabled = true;
    $("#auth-form").addEventListener("submit", handleAuthSubmit);
    $("#auth-logout").addEventListener("click", () => firebaseState.auth.signOut());
    firebaseState.auth.onAuthStateChanged(async (user) => {
      firebaseState.user = user;
      if (!user) {
        showAuthGate();
        return;
      }
      hideAuthGate();
      await hydrateFromFirebase();
    });
  } catch (error) {
    console.warn("Firebase başlatılamadı:", error);
    $("#data-mode").textContent = "Yerel taslak";
  }
}

function getReportHomes() {
  return [...new Set([...homes, ...records.map((record) => record.home)])].sort((a, b) => a.localeCompare(b, "tr"));
}

function populateHomeSelects() {
  const selectedReportHome = $("#report-home-filter").value || "all";
  $("#form-home-select").innerHTML = `<option value="" selected disabled>Seçiniz</option>${homes.map((home) => `<option value="${escapeHTML(home)}">${escapeHTML(home)}</option>`).join("")}`;
  $("#report-home-filter").innerHTML = `<option value="all">Tüm çocuk evleri</option>${getReportHomes().map((home) => `<option value="${escapeHTML(home)}">${escapeHTML(home)}</option>`).join("")}`;
  if ([...$("#report-home-filter").options].some((option) => option.value === selectedReportHome)) $("#report-home-filter").value = selectedReportHome;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function getMonthRecords() {
  const current = new Date();
  return records.filter((record) => {
    const recordDate = parseDate(record.date);
    return recordDate.getMonth() === current.getMonth() && recordDate.getFullYear() === current.getFullYear();
  });
}

function renderStats() {
  const monthly = getMonthRecords();
  const typeCounts = monthly.reduce((counts, record) => {
    counts[record.type] = (counts[record.type] || 0) + 1;
    return counts;
  }, {});
  const typeEntries = Object.entries(typeCounts).sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0], "tr"));
  const breakdown = typeEntries.map(([type, count]) => `${type}: ${count}`).join(" · ") || "Henüz kayıt yok";
  monthlyRingTotal = monthly.length;
  ringFocusIndex = 0;
  let segmentStart = 0;
  monthlyRingSegments = typeEntries.map(([type, count]) => {
    const segmentEnd = segmentStart + (count / monthly.length) * 360;
    const segment = { type, count, percent: Math.round((count / monthly.length) * 100), start: segmentStart, end: segmentEnd, color: TYPE_COLORS[type] || "#6fae93" };
    segmentStart = segmentEnd;
    return segment;
  });
  $("#stat-events").textContent = monthly.length;
  $("#stat-homes").textContent = homes.length;
  showRingCategory(monthlyRingSegments[0] || null);
  $("#top-type-ring").style.background = monthly.length ? `conic-gradient(${monthlyRingSegments.map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`).join(",")})` : "var(--mint-pale)";
  $("#top-type-ring").setAttribute("aria-label", `Bu ay etkinlik türü dağılımı: ${breakdown}`);
}

function showRingCategory(segment) {
  if (!segment) {
    $("#stat-top-type").textContent = "—";
    $("#stat-top-percent").textContent = "0%";
    $("#stat-top-detail").textContent = "Henüz kayıt yok";
    $("#top-type-ring").setAttribute("aria-label", "Bu ay henüz etkinlik kaydı yok");
    return;
  }
  const segmentIndex = monthlyRingSegments.indexOf(segment);
  if (segmentIndex >= 0) ringFocusIndex = segmentIndex;
  $("#stat-top-type").textContent = segment.type;
  $("#stat-top-percent").textContent = `${segment.percent}%`;
  $("#stat-top-detail").textContent = `${segment.count} / ${monthlyRingTotal} etkinlik`;
  $("#top-type-ring").setAttribute("aria-label", `${segment.type}: ay içindeki etkinliklerin yüzde ${segment.percent}'i, ${segment.count} etkinlik`);
}

function handleRingPointer(event) {
  if (!monthlyRingSegments.length) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const angle = (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI + 90 + 360) % 360;
  const segmentIndex = monthlyRingSegments.findIndex((item) => angle >= item.start && angle < item.end);
  const segment = monthlyRingSegments[segmentIndex >= 0 ? segmentIndex : monthlyRingSegments.length - 1];
  ringFocusIndex = segmentIndex >= 0 ? segmentIndex : monthlyRingSegments.length - 1;
  showRingCategory(segment);
}

function handleRingKey(event) {
  if (!monthlyRingSegments.length || !["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  if (event.key === "Home") ringFocusIndex = 0;
  else if (event.key === "End") ringFocusIndex = monthlyRingSegments.length - 1;
  else if (event.key === "ArrowRight" || event.key === "ArrowDown") ringFocusIndex = (ringFocusIndex + 1) % monthlyRingSegments.length;
  else ringFocusIndex = (ringFocusIndex - 1 + monthlyRingSegments.length) % monthlyRingSegments.length;
  showRingCategory(monthlyRingSegments[ringFocusIndex]);
}

function renderMonthlyDistribution() {
  const monthly = getMonthRecords();
  const counts = monthly.reduce((result, record) => {
    result[record.type] = (result[record.type] || 0) + 1;
    return result;
  }, {});
  const entries = Object.entries(counts).sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0], "tr"));
  $("#monthly-distribution-total").textContent = `${monthly.length} etkinlik`;
  if (!entries.length) {
    $("#monthly-type-bars").innerHTML = `<div class="distribution-empty">Bu ay henüz etkinlik kaydı yok.</div>`;
    return;
  }
  $("#monthly-type-bars").innerHTML = entries.map(([type, count]) => {
    const percent = Math.round((count / monthly.length) * 100);
    const color = TYPE_COLORS[type] || TYPE_COLORS.Diğer;
    return `<div class="type-bar-row"><div class="type-bar-label"><span><i style="background:${color}"></i>${escapeHTML(type)}</span><strong>${count} kez · %${percent}</strong></div><div class="type-bar-track"><i style="width:${percent}%;background:${color}"></i></div></div>`;
  }).join("");
}

function filteredRecordsForTable() {
  const query = $("#record-search").value.trim().toLocaleLowerCase("tr-TR");
  const type = $("#record-type-filter").value;
  return [...records]
    .filter((record) => type === "all" || record.type === type)
    .filter((record) => !query || [record.home, record.eventName, record.location, record.type].some((value) => String(value || "").toLocaleLowerCase("tr-TR").includes(query)))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function renderRecordsTable() {
  const tableBody = $("#records-table-body");
  const empty = $("#records-empty");
  const visibleRecords = filteredRecordsForTable();
  empty.hidden = visibleRecords.length > 0;
  tableBody.innerHTML = visibleRecords.map((record) => {
    const time = record.startTime ? `${escapeHTML(record.startTime)}${record.endTime ? `–${escapeHTML(record.endTime)}` : ""}` : "Saat belirtilmedi";
    const safeId = escapeHTML(record.id);
    return `<tr><td>${formatDate(record.date)}</td><td>${escapeHTML(record.home)}</td><td class="event-cell"><strong>${escapeHTML(record.eventName)}</strong><span>${escapeHTML(record.type)}</span></td><td>${escapeHTML(record.location || "—")}</td><td>${time}</td><td><div class="row-actions"><button class="row-action row-edit" type="button" data-edit-id="${safeId}" aria-label="Kaydı düzenle">Düzenle</button><button class="row-action row-delete" type="button" data-delete-id="${safeId}" aria-label="Kaydı sil">Sil</button></div></td></tr>`;
  }).join("");
}

function renderHomes() {
  const list = $("#homes-list");
  if (!homes.length) {
    list.innerHTML = `<div class="empty-state"><strong>Henüz çocuk evi eklenmedi.</strong><p>Etkinlik kaydı oluşturmak için önce bir çocuk evi ekleyin.</p></div>`;
    return;
  }
  list.innerHTML = homes.map((home) => {
    const eventCount = records.filter((record) => record.home === home).length;
    const isSelected = selectedHomeDetail === home;
    return `<div class="home-row${isSelected ? " selected" : ""}"><button class="home-name-button" type="button" data-open-home="${escapeHTML(home)}" aria-label="${escapeHTML(home)} detayını aç"><strong>${escapeHTML(home)}</strong><span>${eventCount} etkinlik kaydı</span></button><div class="row-actions"><button class="row-action row-open" type="button" data-open-home="${escapeHTML(home)}">Aç</button><button class="row-action row-edit" type="button" data-rename-home="${escapeHTML(home)}">Adını değiştir</button><button class="row-action row-delete" type="button" data-delete-home="${escapeHTML(home)}">Sil</button></div></div>`;
  }).join("");
}

function filterRecordsByPeriod(sourceRecords, period, start = "", end = "") {
  const today = parseDate(todayISO());
  const startOfToday = new Date(today);
  if (period === "custom" && start && end && start > end) return [];

  return [...sourceRecords].filter((record) => {
    const date = parseDate(record.date);
    let isInPeriod = true;
    if (period === "today") isInPeriod = record.date === todayISO();
    if (period === "week") {
      const sevenDaysAgo = new Date(startOfToday);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      isInPeriod = date >= sevenDaysAgo && date <= startOfToday;
    }
    if (period === "month") isInPeriod = date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
    if (period === "year") isInPeriod = date.getFullYear() === today.getFullYear();
    if (period === "custom") isInPeriod = (!start || record.date >= start) && (!end || record.date <= end);
    return isInPeriod;
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function getReportRecords() {
  const period = $("#report-period").value;
  const home = $("#report-home-filter").value;
  const type = $("#report-type-filter").value;
  const start = $("#report-start-date").value;
  const end = $("#report-end-date").value;
  return filterRecordsByPeriod(records, period, start, end)
    .filter((record) => (home === "all" || record.home === home) && (type === "all" || record.type === type));
}

function getHomeDetailRecords() {
  if (!selectedHomeDetail) return [];
  const period = $("#home-detail-period").value;
  const type = $("#home-detail-type").value;
  const start = $("#home-detail-start-date").value;
  const end = $("#home-detail-end-date").value;
  return filterRecordsByPeriod(records.filter((record) => record.home === selectedHomeDetail), period, start, end)
    .filter((record) => type === "all" || record.type === type);
}

function updateHomeDetailDateInputs() {
  const enabled = $("#home-detail-period").value === "custom";
  $("#home-detail-start-date").disabled = !enabled;
  $("#home-detail-end-date").disabled = !enabled;
  if (!enabled) {
    $("#home-detail-start-date").value = "";
    $("#home-detail-end-date").value = "";
  }
}

function openHomeDetail(home) {
  if (!homes.includes(home)) return;
  selectedHomeDetail = home;
  $("#home-detail-period").value = "all";
  $("#home-detail-type").value = "all";
  $("#home-detail-start-date").value = "";
  $("#home-detail-end-date").value = "";
  updateHomeDetailDateInputs();
  renderHomes();
  renderHomeDetail();
  requestAnimationFrame(() => $("#home-detail").scrollIntoView({ behavior: "smooth", block: "start" }));
}

function closeHomeDetail() {
  selectedHomeDetail = null;
  $("#home-detail").hidden = true;
  renderHomes();
}

function renderHomeDetail() {
  const section = $("#home-detail");
  if (!selectedHomeDetail || !homes.includes(selectedHomeDetail)) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  $("#home-detail-name").textContent = selectedHomeDetail;
  $("#home-detail-home-count").textContent = `${records.filter((record) => record.home === selectedHomeDetail).length} toplam etkinlik kaydı`;
  const profile = homeProfiles[selectedHomeDetail];
  const photo = $("#home-detail-photo");
  const placeholder = $("#home-detail-photo-placeholder");
  const photoButton = $("#home-photo-button");
  if (profile?.photoDataUrl) {
    photo.src = profile.photoDataUrl;
    photo.alt = `${selectedHomeDetail} ev sorumlusunun fotoğrafı`;
    photo.hidden = false;
    placeholder.hidden = true;
    photoButton.textContent = "Fotoğrafı değiştir";
  } else {
    photo.removeAttribute("src");
    photo.alt = "";
    photo.hidden = true;
    placeholder.hidden = false;
    photoButton.textContent = "Fotoğraf ekle";
  }

  updateHomeDetailDateInputs();
  const detailRecords = getHomeDetailRecords();
  const start = $("#home-detail-start-date").value;
  const end = $("#home-detail-end-date").value;
  const invalidRange = $("#home-detail-period").value === "custom" && start && end && start > end;
  $("#home-detail-summary").textContent = invalidRange
    ? "Başlangıç tarihi, bitiş tarihinden sonra olamaz."
    : `${detailRecords.length} kayıt gösteriliyor`;
  $("#home-detail-summary").dataset.error = invalidRange ? "true" : "false";
  $("#home-detail-empty").hidden = detailRecords.length > 0;
  $("#home-detail-table-body").innerHTML = detailRecords.map((record) => {
    const time = record.startTime ? `${escapeHTML(record.startTime)}${record.endTime ? `–${escapeHTML(record.endTime)}` : ""}` : "Saat belirtilmedi";
    const safeId = escapeHTML(record.id);
    return `<tr><td>${formatDate(record.date)}</td><td class="event-cell"><strong>${escapeHTML(record.eventName)}</strong><span>${escapeHTML(record.type)}</span></td><td>${escapeHTML(record.location || "—")}</td><td>${time}</td><td><div class="row-actions"><button class="row-action row-edit" type="button" data-edit-id="${safeId}" aria-label="Kaydı düzenle">Düzenle</button></div></td></tr>`;
  }).join("");
}

function compressPhotoToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("photo-read"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("photo-decode"));
      image.onload = () => {
        const maxDimension = 640;
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("photo-canvas"));
          return;
        }
        context.fillStyle = "#f8f8f4";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        let quality = 0.82;
        let photoDataUrl = canvas.toDataURL("image/jpeg", quality);
        while (photoDataUrl.length > MAX_PHOTO_DATA_URL_LENGTH && quality > 0.42) {
          quality -= 0.08;
          photoDataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        if (photoDataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) {
          reject(new Error("photo-too-large"));
          return;
        }
        resolve(photoDataUrl);
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

function handleHomePhotoChange(event) {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = "";
  const targetHome = selectedHomeDetail;
  if (!file || !targetHome) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    showToast("Lütfen PNG, JPG veya WebP formatında bir fotoğraf seçin.");
    return;
  }
  if (file.size > 3 * 1024 * 1024) {
    showToast("Fotoğraf 3 MB'dan küçük olmalı.");
    return;
  }
  compressPhotoToDataUrl(file).then((photoDataUrl) => {
    if (!PHOTO_DATA_URL_PATTERN.test(photoDataUrl)) {
      showToast("Fotoğraf verisi okunamadı.");
      return;
    }
    const previousProfiles = homeProfiles;
    homeProfiles = { ...homeProfiles, [targetHome]: { photoDataUrl } };
    if (!saveHomeProfiles(homeProfiles)) {
      homeProfiles = previousProfiles;
      return;
    }
    renderHomeDetail();
    showToast("Ev sorumlusunun fotoğrafı güncellendi.");
  }).catch((error) => {
    showToast(error.message === "photo-too-large" ? "Fotoğraf sıkıştırılamadı. Daha küçük bir dosya deneyin." : "Fotoğraf okunamadı. Lütfen tekrar deneyin.");
  });
}

function describeCurrentReport() {
  const periodText = $("#report-period").selectedOptions[0].textContent;
  const home = $("#report-home-filter").selectedOptions[0].textContent;
  const type = $("#report-type-filter").selectedOptions[0].textContent;
  return `${periodText} · ${home} · ${type}`;
}

function renderReportSummary() {
  const invalidRange = $("#report-period").value === "custom" && $("#report-start-date").value && $("#report-end-date").value && $("#report-start-date").value > $("#report-end-date").value;
  const reportRecords = getReportRecords();
  const reportHomes = new Set(reportRecords.map((record) => record.home));
  const types = new Set(reportRecords.map((record) => record.type));
  const days = new Set(reportRecords.map((record) => record.date));
  $("#report-event-count").textContent = reportRecords.length;
  $("#report-home-count").textContent = reportHomes.size;
  $("#report-type-count").textContent = types.size;
  $("#report-day-count").textContent = days.size;
  $("#report-detail").dataset.error = invalidRange ? "true" : "false";
  $("#report-detail").textContent = invalidRange ? "Başlangıç tarihi, bitiş tarihinden sonra olamaz." : reportRecords.length ? `${reportRecords.length} kayıt · ${describeCurrentReport()}` : "Filtrelere uyan kayıt bulunmuyor.";
}

function updateEverything() {
  populateHomeSelects();
  renderStats();
  renderMonthlyDistribution();
  renderRecordsTable();
  renderHomes();
  renderHomeDetail();
  renderReportSummary();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function openModal(recordId = null, trigger = null) {
  const form = $("#event-form");
  form.reset();
  form.elements.date.value = todayISO();
  editingRecordId = recordId;
  modalTrigger = trigger;
  const record = records.find((item) => item.id === recordId);
  if (record) {
    form.elements.date.value = record.date;
    form.elements.home.value = record.home;
    form.elements.type.value = record.type;
    form.elements.eventName.value = record.eventName;
    form.elements.location.value = record.location || "";
    form.elements.startTime.value = record.startTime || "";
    form.elements.endTime.value = record.endTime || "";
    form.elements.notes.value = record.notes || "";
    $("#record-modal-title").textContent = "Etkinlik kaydını düzenle";
    $("#record-submit-button span").textContent = "Değişiklikleri kaydet";
  } else {
    $("#record-modal-title").textContent = "Etkinlik kaydı ekle";
    $("#record-submit-button span").textContent = "Kaydı kaydet";
  }
  $("#modal-backdrop").hidden = false;
  $("#record-modal").hidden = false;
  document.body.style.overflow = "hidden";
  $("#event-form [name=eventName]").focus();
}

function closeModal() {
  const trigger = modalTrigger;
  $("#modal-backdrop").hidden = true;
  $("#record-modal").hidden = true;
  $("#home-modal").hidden = true;
  document.body.style.overflow = "";
  $("#form-error").textContent = "";
  $("#home-modal-error").textContent = "";
  editingRecordId = null;
  homeModalMode = null;
  selectedHomeName = null;
  modalTrigger = null;
  if (trigger && document.contains(trigger)) trigger.focus();
}

function handleEventForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const error = $("#form-error");
  if (!data.date || !data.home || !data.type || !data.eventName.trim()) {
    error.textContent = "Lütfen zorunlu alanları tamamlayın.";
    return;
  }
  if (data.startTime && data.endTime && data.endTime < data.startTime) {
    error.textContent = "Bitiş saati başlangıç saatinden önce olamaz.";
    return;
  }
  const recordData = {
    date: data.date,
    home: data.home,
    type: data.type,
    eventName: data.eventName.trim(),
    location: data.location.trim(),
    startTime: data.startTime,
    endTime: data.endTime,
    notes: data.notes.trim()
  };
  const previousRecords = [...records];
  if (editingRecordId) {
    records = records.map((record) => record.id === editingRecordId ? { ...record, ...recordData } : record);
  } else {
    records.unshift({ id: `local-${Date.now()}`, ...recordData });
  }
  const wasEditing = Boolean(editingRecordId);
  if (!saveRecords(records)) {
    records = previousRecords;
    return;
  }
  form.reset();
  form.elements.date.value = todayISO();
  closeModal();
  updateEverything();
  showToast(wasEditing ? "Etkinlik kaydı güncellendi." : "Etkinlik kaydı eklendi.");
}

function editRecord(id, trigger = null) {
  const record = records.find((item) => item.id === id);
  if (!record) return;
  if (!homes.includes(record.home)) {
    $("#form-home-select").insertAdjacentHTML("beforeend", `<option value="${escapeHTML(record.home)}">${escapeHTML(record.home)} (silinmiş)</option>`);
  }
  openModal(id, trigger);
}

function deleteRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record || !window.confirm(`“${record.eventName}” kaydını silmek istiyor musunuz?`)) return;
  const previousRecords = records;
  records = records.filter((item) => item.id !== id);
  if (!saveRecords(records)) {
    records = previousRecords;
    return;
  }
  updateEverything();
  showToast("Kayıt silindi.");
}

function addHome(name) {
  const cleanName = name.trim().replace(/\s+/g, " ");
  if (!cleanName) return false;
  if (homes.some((home) => home.toLocaleLowerCase("tr-TR") === cleanName.toLocaleLowerCase("tr-TR"))) {
    showToast("Bu çocuk evi zaten kayıtlı.");
    return false;
  }
  const previousHomes = [...homes];
  homes.push(cleanName);
  homes.sort((a, b) => a.localeCompare(b, "tr"));
  if (!saveHomes(homes)) {
    homes = previousHomes;
    return false;
  }
  updateEverything();
  showToast("Çocuk evi eklendi.");
  return true;
}

function openHomeModal(mode, name, trigger = null) {
  homeModalMode = mode;
  selectedHomeName = name;
  modalTrigger = trigger;
  const isRename = mode === "rename";
  const eventCount = records.filter((record) => record.home === name).length;
  const nameField = $("#home-modal-name").closest("label");
  const submitButton = $("#home-modal-submit");
  $("#home-modal-error").textContent = "";
  nameField.hidden = !isRename;
  $("#home-delete-notice").hidden = isRename;
  $("#home-modal-title").textContent = isRename ? "Çocuk evinin adını değiştir" : "Çocuk evini sil";
  $("#home-modal-description").textContent = isRename ? "Yeni isim geçmiş etkinlik kayıtlarına da uygulanır." : `“${name}” çocuk evini listeden kaldırmak üzeresiniz.`;
  $("#home-modal-name").value = isRename ? name : "";
  $("#home-delete-message").textContent = eventCount
    ? `Bu eve ait ${eventCount} geçmiş etkinlik kaydı silinmeyecek. Ev yalnızca yeni kayıtlarda seçilebilecek listeden kaldırılacak.`
    : "Bu çocuk evi yeni kayıtlarda seçilebilecek listeden kaldırılacak.";
  submitButton.textContent = isRename ? "Değişiklikleri kaydet" : "Çocuk evini sil";
  submitButton.classList.toggle("button-primary", isRename);
  submitButton.classList.toggle("button-danger", !isRename);
  $("#modal-backdrop").hidden = false;
  $("#home-modal").hidden = false;
  document.body.style.overflow = "hidden";
  if (isRename) $("#home-modal-name").focus();
}

function handleHomeModal(event) {
  event.preventDefault();
  if (!homeModalMode || !selectedHomeName) return;
  const oldName = selectedHomeName;
  const eventCount = records.filter((record) => record.home === oldName).length;
  if (homeModalMode === "delete") {
    const previousHomes = homes;
    const previousProfiles = homeProfiles;
    homes = homes.filter((home) => home !== oldName);
    homeProfiles = { ...homeProfiles };
    delete homeProfiles[oldName];
    if (!saveHomes(homes) || !saveHomeProfiles(homeProfiles)) {
      homes = previousHomes;
      homeProfiles = previousProfiles;
      saveHomes(previousHomes);
      saveHomeProfiles(previousProfiles);
      return;
    }
    if (selectedHomeDetail === oldName) selectedHomeDetail = null;
    closeModal();
    updateEverything();
    showToast(eventCount ? "Çocuk evi silindi; geçmiş kayıtlar korundu." : "Çocuk evi silindi.");
    return;
  }

  const newName = $("#home-modal-name").value.trim().replace(/\s+/g, " ");
  const error = $("#home-modal-error");
  if (!newName) {
    error.textContent = "Lütfen çocuk evinin adını yazın.";
    return;
  }
  if (homes.some((home) => home !== oldName && home.toLocaleLowerCase("tr-TR") === newName.toLocaleLowerCase("tr-TR"))) {
    error.textContent = "Bu isimde başka bir çocuk evi bulunuyor.";
    return;
  }
  const previousHomes = homes;
  const previousRecords = records;
  const previousProfiles = homeProfiles;
  homes = homes.map((home) => home === oldName ? newName : home).sort((a, b) => a.localeCompare(b, "tr"));
  records = records.map((record) => record.home === oldName ? { ...record, home: newName } : record);
  homeProfiles = { ...homeProfiles };
  if (homeProfiles[oldName]) {
    homeProfiles[newName] = homeProfiles[oldName];
    delete homeProfiles[oldName];
  }
  if (!saveHomes(homes) || !saveRecords(records) || !saveHomeProfiles(homeProfiles)) {
    homes = previousHomes;
    records = previousRecords;
    homeProfiles = previousProfiles;
    saveHomes(previousHomes);
    saveRecords(previousRecords);
    saveHomeProfiles(previousProfiles);
    return;
  }
  if (selectedHomeDetail === oldName) selectedHomeDetail = newName;
  closeModal();
  updateEverything();
  showToast("Çocuk evinin adı ve bağlı kayıtları güncellendi.");
}

function updateCustomDateInputs() {
  const enabled = $("#report-period").value === "custom";
  $("#report-start-date").disabled = !enabled;
  $("#report-end-date").disabled = !enabled;
  if (!enabled) {
    $("#report-start-date").value = "";
    $("#report-end-date").value = "";
  }
}

function exportExcel() {
  const reportRecords = getReportRecords();
  if (!reportRecords.length) {
    showToast("Excel oluşturmak için önce en az bir kayıt seçin.");
    return;
  }
  if (!window.XLSX) {
    showToast("Excel bileşeni yüklenemedi. İnternet bağlantısını kontrol edin.");
    return;
  }

  const homeSummary = Object.values(reportRecords.reduce((summary, record) => {
    if (!summary[record.home]) summary[record.home] = { "Çocuk evi": record.home, "Etkinlik sayısı": 0, "İlk etkinlik tarihi": record.date, "Son etkinlik tarihi": record.date };
    summary[record.home]["Etkinlik sayısı"] += 1;
    if (record.date < summary[record.home]["İlk etkinlik tarihi"]) summary[record.home]["İlk etkinlik tarihi"] = record.date;
    if (record.date > summary[record.home]["Son etkinlik tarihi"]) summary[record.home]["Son etkinlik tarihi"] = record.date;
    return summary;
  }, {}));
  homeSummary.forEach((row) => {
    row["İlk etkinlik tarihi"] = formatDate(row["İlk etkinlik tarihi"]);
    row["Son etkinlik tarihi"] = formatDate(row["Son etkinlik tarihi"]);
  });

  const detailRows = reportRecords.map((record) => ({
    Tarih: formatDate(record.date),
    "Çocuk evi": record.home,
    "Etkinlik türü": record.type,
    "Etkinlik adı": record.eventName,
    Yer: record.location || "Belirtilmedi",
    "Başlangıç saati": record.startTime || "—",
    "Bitiş saati": record.endTime || "—",
    Açıklama: record.notes || "—"
  }));
  const overviewRows = [
    { Ölçüt: "Rapor kapsamı", Değer: describeCurrentReport() },
    { Ölçüt: "Oluşturulma tarihi", Değer: new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short" }).format(new Date()) },
    { Ölçüt: "Etkinlik sayısı", Değer: reportRecords.length },
    { Ölçüt: "Çocuk evi sayısı", Değer: homeSummary.length },
    { Ölçüt: "Etkinlik türü sayısı", Değer: new Set(reportRecords.map((record) => record.type)).size },
    { Ölçüt: "Etkinlik günü sayısı", Değer: new Set(reportRecords.map((record) => record.date)).size },
    {},
    { Ölçüt: "Not", Değer: "Bu raporda çocuk adı veya bireysel çocuk verisi bulunmaz." }
  ];
  const workbook = XLSX.utils.book_new();
  const overviewSheet = XLSX.utils.json_to_sheet(overviewRows);
  overviewSheet["!cols"] = [{ wch: 25 }, { wch: 75 }];
  const homeSheet = XLSX.utils.json_to_sheet(homeSummary);
  homeSheet["!cols"] = [{ wch: 28 }, { wch: 17 }, { wch: 22 }, { wch: 22 }];
  const detailsSheet = XLSX.utils.json_to_sheet(detailRows);
  detailsSheet["!cols"] = [
    { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 31 }, { wch: 25 }, { wch: 15 }, { wch: 14 }, { wch: 42 }
  ];
  detailsSheet["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(detailsSheet["!ref"])) };
  XLSX.utils.book_append_sheet(workbook, overviewSheet, "Rapor Özeti");
  XLSX.utils.book_append_sheet(workbook, homeSheet, "Çocuk Evi Özeti");
  XLSX.utils.book_append_sheet(workbook, detailsSheet, "Ayrıntılı Kayıtlar");
  XLSX.writeFile(workbook, `etkinlik-raporu-${todayISO()}.xlsx`, { compression: true });
  showToast("Excel raporu indirildi.");
}

function safeFilePart(value) {
  return String(value || "cocuk-evi").replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "cocuk-evi";
}

function exportHomeExcel() {
  if (!selectedHomeDetail) return;
  const detailRecords = getHomeDetailRecords();
  if (!window.XLSX) {
    showToast("Excel bileşeni yüklenemedi. İnternet bağlantısını kontrol edin.");
    return;
  }

  const periodText = $("#home-detail-period").selectedOptions[0].textContent;
  const typeText = $("#home-detail-type").selectedOptions[0].textContent;
  const start = $("#home-detail-start-date").value;
  const end = $("#home-detail-end-date").value;
  const rangeText = $("#home-detail-period").value === "custom" && (start || end) ? `${start || "başlangıç yok"} – ${end || "bitiş yok"}` : periodText;
  const summaryRows = [
    { Ölçüt: "Çocuk evi", Değer: selectedHomeDetail },
    { Ölçüt: "Rapor dönemi", Değer: rangeText },
    { Ölçüt: "Etkinlik türü", Değer: typeText },
    { Ölçüt: "Etkinlik sayısı", Değer: detailRecords.length },
    { Ölçüt: "Etkinlik günü sayısı", Değer: new Set(detailRecords.map((record) => record.date)).size },
    {},
    { Ölçüt: "Not", Değer: "Bu raporda çocuk adı veya bireysel çocuk verisi bulunmaz." }
  ];
  const detailRows = detailRecords.map((record) => ({
    Tarih: formatDate(record.date),
    "Çocuk evi": record.home,
    "Etkinlik türü": record.type,
    "Etkinlik adı": record.eventName,
    Yer: record.location || "Belirtilmedi",
    "Başlangıç saati": record.startTime || "—",
    "Bitiş saati": record.endTime || "—",
    Açıklama: record.notes || "—"
  }));
  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 24 }, { wch: 72 }];
  const detailSheet = detailRows.length
    ? XLSX.utils.json_to_sheet(detailRows)
    : XLSX.utils.aoa_to_sheet([["Tarih", "Çocuk evi", "Etkinlik türü", "Etkinlik adı", "Yer", "Başlangıç saati", "Bitiş saati", "Açıklama"]]);
  detailSheet["!cols"] = [{ wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 31 }, { wch: 25 }, { wch: 15 }, { wch: 14 }, { wch: 42 }];
  detailSheet["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(detailSheet["!ref"])) };
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Ev Özeti");
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Etkinlik Kayıtları");
  XLSX.writeFile(workbook, `etkinlik-${safeFilePart(selectedHomeDetail)}-${todayISO()}.xlsx`, { compression: true });
  showToast(detailRecords.length ? `${selectedHomeDetail} için Excel raporu indirildi.` : "Filtreye uyan kayıt yok; boş Excel raporu indirildi.");
}

function initTheme() {
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem("etkinlik-takip-theme");
  } catch {
    savedTheme = null;
  }
  const themeMeta = $("#theme-color-meta");
  if (savedTheme === "dark") document.body.classList.add("dark-theme");
  themeMeta.content = savedTheme === "dark" ? "#12211f" : "#f8f8f4";
  $("#theme-toggle").addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark-theme");
    try {
      localStorage.setItem("etkinlik-takip-theme", isDark ? "dark" : "light");
    } catch {
      showToast("Tema tercihi bu tarayıcıda saklanamadı.");
    }
    themeMeta.content = isDark ? "#12211f" : "#f8f8f4";
    $("#theme-toggle").setAttribute("aria-label", isDark ? "Açık temaya geç" : "Koyu temaya geç");
  });
  $("#theme-toggle").setAttribute("aria-label", savedTheme === "dark" ? "Açık temaya geç" : "Koyu temaya geç");
}

function initPWA() {
  const installButton = $("#install-app");
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => console.warn("Service worker kaydedilemedi:", error));
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    try {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
    } catch {
      showToast("Uygulama yükleme penceresi açılamadı.");
    } finally {
      deferredInstallPrompt = null;
      installButton.hidden = true;
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installButton.hidden = true;
    showToast("Etkinlik Takip ana ekrana eklendi.");
  });
}

function init() {
  initFirebase();
  initTheme();
  initPWA();
  $("#event-form [name=date]").value = todayISO();
  updateCustomDateInputs();
  updateEverything();
  $("#top-type-ring").addEventListener("pointermove", handleRingPointer);
  $("#top-type-ring").addEventListener("pointerleave", () => showRingCategory(monthlyRingSegments[0] || null));
  $("#top-type-ring").addEventListener("keydown", handleRingKey);
  $("#open-record-form-secondary").addEventListener("click", (event) => openModal(null, event.currentTarget));
  $$(".modal-close").forEach((button) => button.addEventListener("click", closeModal));
  $("#modal-backdrop").addEventListener("click", closeModal);
  $("#event-form").addEventListener("submit", handleEventForm);
  $("#record-search").addEventListener("input", renderRecordsTable);
  $("#record-type-filter").addEventListener("change", renderRecordsTable);
  $("#reset-record-filters").addEventListener("click", () => {
    $("#record-search").value = "";
    $("#record-type-filter").value = "all";
    renderRecordsTable();
  });
  $("#records-table-body").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-id]");
    const deleteButton = event.target.closest("[data-delete-id]");
    if (editButton) editRecord(editButton.dataset.editId, editButton);
    if (deleteButton) deleteRecord(deleteButton.dataset.deleteId);
  });
  $("#home-add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#new-home-name");
    if (addHome(input.value)) input.value = "";
  });
  $("#homes-list").addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-home]");
    const renameButton = event.target.closest("[data-rename-home]");
    const deleteButton = event.target.closest("[data-delete-home]");
    if (openButton) {
      openHomeDetail(openButton.dataset.openHome);
      return;
    }
    if (renameButton) openHomeModal("rename", renameButton.dataset.renameHome, renameButton);
    if (deleteButton) openHomeModal("delete", deleteButton.dataset.deleteHome, deleteButton);
  });
  $("#home-modal-form").addEventListener("submit", handleHomeModal);
  $("#close-home-detail").addEventListener("click", closeHomeDetail);
  $("#home-detail-period").addEventListener("change", () => {
    updateHomeDetailDateInputs();
    renderHomeDetail();
  });
  ["#home-detail-start-date", "#home-detail-end-date", "#home-detail-type"].forEach((selector) => {
    $(selector).addEventListener("change", renderHomeDetail);
  });
  $("#home-detail-table-body").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-id]");
    if (editButton) editRecord(editButton.dataset.editId, editButton);
  });
  $("#home-photo-button").addEventListener("click", () => $("#home-photo-input").click());
  $("#home-photo-input").addEventListener("change", handleHomePhotoChange);
  $("#export-home-excel").addEventListener("click", exportHomeExcel);
  const mobileNavToggle = $("#mobile-nav-toggle");
  const mainNav = $("#main-nav");
  mobileNavToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("mobile-open");
    mobileNavToggle.setAttribute("aria-expanded", String(isOpen));
    mobileNavToggle.setAttribute("aria-label", isOpen ? "Menüyü kapat" : "Menüyü aç");
  });
  mainNav.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;
    $$(".main-nav a").forEach((item) => item.classList.toggle("active", item === link));
    mainNav.classList.remove("mobile-open");
    mobileNavToggle.setAttribute("aria-expanded", "false");
    mobileNavToggle.setAttribute("aria-label", "Menüyü aç");
  });
  const navLinks = $$(".main-nav a");
  const observedSections = navLinks.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  if ("IntersectionObserver" in window && observedSections.length) {
    const navObserver = new IntersectionObserver((entries) => {
      const visibleSection = entries
        .filter((entry) => entry.isIntersecting)
        .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];
      if (!visibleSection) return;
      navLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${visibleSection.target.id}`));
    }, { rootMargin: "-18% 0px -62% 0px", threshold: [0.1, 0.25, 0.5] });
    observedSections.forEach((section) => navObserver.observe(section));
  }
  ["#report-period", "#report-start-date", "#report-end-date", "#report-home-filter", "#report-type-filter"].forEach((selector) => {
    $(selector).addEventListener("change", () => {
      if (selector === "#report-period") updateCustomDateInputs();
      renderReportSummary();
    });
  });
  $("#export-excel").addEventListener("click", exportExcel);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (!$("#record-modal").hidden || !$("#home-modal").hidden)) closeModal();
    if (event.key !== "Tab") return;
    const activeModal = !$("#record-modal").hidden ? $("#record-modal") : !$("#home-modal").hidden ? $("#home-modal") : null;
    if (!activeModal) return;
    const focusable = [...activeModal.querySelectorAll("button, input, select, textarea, [href]")].filter((element) => !element.disabled && !element.hidden);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

init();
