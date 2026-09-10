/*
 * Firebase Realtime Database + yerel önbellek veri katmanı.
 * Çocuklara ait kişi veya kimlik bilgisi bu uygulamada tutulmaz.
 */

const RECORDS_STORAGE_KEY = "etkinlik-takip-records-v3";
const HOMES_STORAGE_KEY = "etkinlik-takip-homes-v2";
// Ev sorumlusu fotoğrafı homeProfiles/{homeId} içindeki photoDataUrl
// alanında base64 veri URL'si olarak saklanır; localStorage çevrimdışı önbellektir.
const HOME_PROFILES_STORAGE_KEY = "etkinlik-takip-home-profiles-v1";
const HOME_RESPONSIBLES_STORAGE_KEY = "etkinlik-takip-home-responsibles-v1";
const HOME_IDS_STORAGE_KEY = "etkinlik-takip-home-ids-v1";
const DEFAULT_HOMES = [];
const LEGACY_DEMO_RECORD_IDS = new Set(["demo-1", "demo-2", "demo-3", "demo-4", "demo-5"]);
const LEGACY_DEMO_HOMES = new Set(["Güneş Çocuk Evi", "Umut Çocuk Evi", "Papatya Çocuk Evi", "Yıldız Çocuk Evi"]);
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

function normalizeRecords(list) {
  return list.filter((record) => record && typeof record === "object" && !LEGACY_DEMO_RECORD_IDS.has(String(record.id || ""))).map((record, index) => ({
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

function normalizeHomeName(value) {
  const cleanName = String(value || "").trim().replace(/\s+/g, " ");
  if (!cleanName) return "";
  return /\s+çocuk\s+evi$/i.test(cleanName) ? cleanName : `${cleanName} Çocuk Evi`;
}

function getRecords() {
  try {
    const stored = JSON.parse(localStorage.getItem(RECORDS_STORAGE_KEY));
    return Array.isArray(stored) ? normalizeRecords(stored) : [];
  } catch {
    return [];
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

function normalizeHomeIds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce((ids, [home, id]) => {
    const cleanHome = String(home || "").trim();
    const cleanId = String(id || "").trim();
    if (cleanHome && cleanId) ids[cleanHome] = cleanId;
    return ids;
  }, {});
}

function getHomeIds() {
  try {
    return normalizeHomeIds(JSON.parse(localStorage.getItem(HOME_IDS_STORAGE_KEY)));
  } catch {
    return {};
  }
}

function saveHomeIds(ids) {
  try {
    localStorage.setItem(HOME_IDS_STORAGE_KEY, JSON.stringify(ids));
    queueFirebaseSync();
    return true;
  } catch {
    showToast("Çocuk evi kimlikleri cihazda saklanamadı.");
    return false;
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

function normalizeHomeResponsibles(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce((responsibles, [home, name]) => {
    const cleanHome = String(home || "").trim();
    const cleanName = String(name || "").trim().replace(/\s+/g, " ");
    if (cleanHome && cleanName) responsibles[cleanHome] = cleanName;
    return responsibles;
  }, {});
}

function getHomeResponsibles() {
  try {
    return normalizeHomeResponsibles(JSON.parse(localStorage.getItem(HOME_RESPONSIBLES_STORAGE_KEY)));
  } catch {
    return {};
  }
}

function saveHomeResponsibles(responsibles) {
  try {
    localStorage.setItem(HOME_RESPONSIBLES_STORAGE_KEY, JSON.stringify(responsibles));
    queueFirebaseSync();
    return true;
  } catch {
    showToast("Ev sorumlusu bilgisi cihazda saklanamadı. Tarayıcı depolamasını kontrol edin.");
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
let homeIds = getHomeIds();
let homeProfiles = getHomeProfiles();
let homeResponsibles = getHomeResponsibles();
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
  profile: null,
  role: "responsible",
  userDirectory: [],
  auditLogs: [],
  hydrating: false,
  syncTimer: null,
  refreshTimer: null,
  realtimeBound: false,
  pendingAudit: [],
  lastCloudPayload: { homes: {}, eventRecords: {}, homeProfiles: {} }
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
    if (!homeIds[home]) homeIds[home] = `home-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    cloudHomes[homeIds[home]] = { name: home, responsibleName: homeResponsibles[home] || "" };
  });
  const cloudRecords = {};
  records.forEach((record) => {
    cloudRecords[firebaseSafeKey(record.id)] = { ...record };
  });
  const cloudProfiles = {};
  Object.entries(homeProfiles).forEach(([home, profile]) => {
    if (!homeIds[home]) homeIds[home] = `home-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    cloudProfiles[homeIds[home]] = { homeName: home, photoDataUrl: profile.photoDataUrl };
  });
  return { homes: cloudHomes, eventRecords: cloudRecords, homeProfiles: cloudProfiles };
}

function createAuditEntry(action, target, details = {}) {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    target: String(target || ""),
    details,
    email: String(firebaseState.user?.email || ""),
    actorUid: String(firebaseState.user?.uid || ""),
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
}

function queueAudit(action, target, details = {}) {
  if (!firebaseState.enabled || !firebaseState.user) return;
  queueFirebaseSync(createAuditEntry(action, target, details));
}

async function syncFirebaseState() {
  if (!firebaseState.enabled || !firebaseState.user || firebaseState.hydrating) return;
  const pendingAudit = firebaseState.pendingAudit.splice(0);
  try {
    const payload = firebaseStatePayload();
    const updates = {};
    const addCollectionUpdates = (path, current, previous) => {
      Object.keys(previous || {}).filter((key) => !(key in current)).forEach((key) => { updates[`${path}/${key}`] = null; });
      Object.entries(current).forEach(([key, value]) => { updates[`${path}/${key}`] = value; });
    };
    addCollectionUpdates("eventRecords", payload.eventRecords, firebaseState.lastCloudPayload.eventRecords);
    if (firebaseState.role === "admin") {
      addCollectionUpdates("homes", payload.homes, firebaseState.lastCloudPayload.homes);
      addCollectionUpdates("homeProfiles", payload.homeProfiles, firebaseState.lastCloudPayload.homeProfiles);
    }
    pendingAudit.forEach((entry) => { updates[`auditLogs/${firebaseSafeKey(entry.id)}`] = entry; });
    if (Object.keys(updates).length) await firebaseState.database.ref().update(updates);
    firebaseState.lastCloudPayload = payload;
  } catch (error) {
    firebaseState.pendingAudit.unshift(...pendingAudit);
    console.warn("Firebase verisi senkronize edilemedi:", error);
    showToast("Firebase senkronizasyonu başarısız oldu. Yerel kayıt korunuyor.");
  }
}

function queueFirebaseSync(auditEntry = null) {
  if (auditEntry) firebaseState.pendingAudit.push(auditEntry);
  if (!firebaseState.enabled || !firebaseState.user || firebaseState.hydrating) return;
  clearTimeout(firebaseState.syncTimer);
  firebaseState.syncTimer = setTimeout(() => syncFirebaseState(), 120);
}

function cloudHomesToData(value) {
  const ids = {};
  const names = Object.entries(value || {}).map(([id, item]) => {
    const name = typeof item === "string" ? item : item?.name;
    if (name) ids[String(name).trim()] = id;
    return name;
  });
  return { homes: normalizeHomes(names), ids };
}

function cloudHomesToList(value) {
  return cloudHomesToData(value).homes;
}

function cloudResponsiblesToMap(value) {
  return Object.values(value || {}).reduce((responsibles, item) => {
    const home = String(item?.name || "").trim();
    const responsibleName = String(item?.responsibleName || "").trim();
    if (home && responsibleName) responsibles[home] = responsibleName;
    return responsibles;
  }, {});
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
  clearTimeout(firebaseState.syncTimer);
  clearTimeout(firebaseState.refreshTimer);
  firebaseState.pendingAudit = [];
  firebaseState.hydrating = true;
  try {
    const [homesSnapshot, recordsSnapshot, profilesSnapshot] = await Promise.all([
      firebaseState.database.ref("homes").once("value"),
      firebaseState.database.ref("eventRecords").once("value"),
      firebaseState.database.ref("homeProfiles").once("value")
    ]);
    const cloudHomeData = homesSnapshot.exists() ? cloudHomesToData(homesSnapshot.val()) : { homes: [], ids: {} };
    const cloudHomes = cloudHomeData.homes;
    const cloudResponsibles = homesSnapshot.exists() ? cloudResponsiblesToMap(homesSnapshot.val()) : {};
    const cloudRecords = recordsSnapshot.exists() ? normalizeRecords(Object.values(recordsSnapshot.val() || {})) : [];
    const cloudProfiles = profilesSnapshot.exists() ? cloudProfilesToMap(profilesSnapshot.val()) : {};
    firebaseState.lastCloudPayload = {
      homes: homesSnapshot.exists() ? homesSnapshot.val() || {} : {},
      eventRecords: recordsSnapshot.exists() ? recordsSnapshot.val() || {} : {},
      homeProfiles: profilesSnapshot.exists() ? profilesSnapshot.val() || {} : {}
    };
    const hasLegacyDemoHomes = cloudHomes.length > 0 && cloudHomes.every((home) => LEGACY_DEMO_HOMES.has(home));
    const shouldClearLegacyDemo = hasLegacyDemoHomes && cloudRecords.length === 0;
    // Once Firebase auth is active, the cloud is the source of truth. In particular,
    // a missing node means the data was intentionally deleted and must not be
    // repopulated from an older localStorage snapshot on the next refresh.
    homes = shouldClearLegacyDemo ? [] : cloudHomes;
    homeIds = shouldClearLegacyDemo ? {} : cloudHomeData.ids;
    homeResponsibles = shouldClearLegacyDemo ? {} : cloudResponsibles;
    records = shouldClearLegacyDemo ? [] : cloudRecords;
    homeProfiles = shouldClearLegacyDemo ? {} : cloudProfiles;
    saveHomes(homes);
    saveHomeIds(homeIds);
    saveHomeResponsibles(homeResponsibles);
    saveRecords(records);
    saveHomeProfiles(homeProfiles);
    updateEverything();
  } catch (error) {
    console.warn("Firebase verisi okunamadı:", error);
    showToast("Firebase verisi okunamadı. Yerel önbellek gösteriliyor.");
  } finally {
    firebaseState.hydrating = false;
  }
}

function bindFirebaseRealtime() {
  if (firebaseState.realtimeBound || !firebaseState.enabled || !firebaseState.database) return;
  firebaseState.realtimeBound = true;
  const scheduleRefresh = () => {
    if (!firebaseState.user || firebaseState.hydrating) return;
    clearTimeout(firebaseState.refreshTimer);
    firebaseState.refreshTimer = setTimeout(() => hydrateFromFirebase(), 120);
  };
  ["eventRecords", "homes", "homeProfiles"].forEach((path) => {
    firebaseState.database.ref(path).on("value", scheduleRefresh, (error) => console.warn(`${path} canlı dinleyicisi başarısız:`, error));
  });
  if (isAdminUser()) {
    firebaseState.database.ref("users").on("value", () => hydrateAdminUsers(), (error) => console.warn("Kullanıcı izinleri canlı dinleyicisi başarısız:", error));
    firebaseState.database.ref("auditLogs").on("value", () => hydrateAdminAuditLogs(), (error) => console.warn("Değişiklik günlüğü canlı dinleyicisi başarısız:", error));
  } else if (firebaseState.user) {
    firebaseState.database.ref(`users/${firebaseSafeKey(firebaseState.user.uid)}`).on("value", async (snapshot) => {
      const profile = snapshot.val() || {};
      if (!firebaseState.user || (profile.approved === true && profile.blocked !== true)) return;
      await firebaseState.auth.signOut();
      redirectToLogin(profile.blocked === true ? "blocked" : "pending");
    }, (error) => console.warn("Kullanıcı izin durumu dinlenemedi:", error));
  }
}

async function hydrateAdminUsers() {
  const usersList = $("#users-list");
  if (!usersList || !firebaseState.enabled || !firebaseState.user || !isAdminUser()) {
    firebaseState.userDirectory = [];
    renderAdminUsers();
    return;
  }
  try {
    const snapshot = await firebaseState.database.ref("users").once("value");
    const directory = [];
    snapshot.forEach((child) => {
      const profile = child.val() || {};
      if (!profile.email || profile.role === "admin") return;
      directory.push({
        key: child.key,
        email: String(profile.email),
        role: String(profile.role || "responsible"),
        approved: profile.approved === true,
        blocked: profile.blocked === true,
        createdAt: Number(profile.createdAt || 0)
      });
    });
    firebaseState.userDirectory = directory.sort((first, second) => Number(first.approved) - Number(second.approved) || first.email.localeCompare(second.email, "tr"));
  } catch (error) {
    console.warn("Kullanıcı izinleri okunamadı:", error);
    firebaseState.userDirectory = [];
    showToast("Kullanıcı izinleri okunamadı.");
  }
  renderAdminUsers();
}

async function hydrateAdminAuditLogs() {
  if (!firebaseState.enabled || !firebaseState.database || !firebaseState.user || !isAdminUser()) {
    firebaseState.auditLogs = [];
    renderAuditLogs();
    return;
  }
  try {
    const snapshot = await firebaseState.database.ref("auditLogs").limitToLast(40).once("value");
    const logs = [];
    snapshot.forEach((child) => {
      const log = child.val();
      if (log && typeof log === "object") logs.push({ ...log, key: child.key });
    });
    firebaseState.auditLogs = logs.sort((first, second) => Number(second.timestamp || 0) - Number(first.timestamp || 0));
  } catch (error) {
    console.warn("Değişiklik günlüğü okunamadı:", error);
    firebaseState.auditLogs = [];
  }
  renderAuditLogs();
}

function configuredAdminEmail() {
  return String(window.ETKINLIK_FIREBASE_CONFIG?.adminEmail || "").trim().toLocaleLowerCase("tr-TR");
}

function isAdminUser(user = firebaseState.user) {
  const email = String(user?.email || "").trim().toLocaleLowerCase("tr-TR");
  return firebaseState.role === "admin" || (email && configuredAdminEmail() && email === configuredAdminEmail());
}

function applyRoleUI() {
  const admin = isAdminUser();
  $$('[data-admin-only]').forEach((element) => { element.hidden = !admin; });
  $("#data-mode").textContent = firebaseState.enabled && firebaseState.user
    ? `Firebase bağlı · ${admin ? "Yönetici" : "Ev sorumlusu"}`
    : "Giriş bekleniyor";
  renderHomes();
  renderHomeDetail();
  renderAdminUsers();
  renderAuditLogs();
}

async function loadFirebaseUserProfile(user) {
  firebaseState.profile = null;
  const configuredAdmin = String(user?.email || "").trim().toLocaleLowerCase("tr-TR") === configuredAdminEmail();
  firebaseState.role = configuredAdmin ? "admin" : "responsible";
  try {
    const snapshot = await firebaseState.database.ref(`users/${firebaseSafeKey(user.uid)}`).once("value");
    if (snapshot.exists()) {
      firebaseState.profile = snapshot.val();
      if (!configuredAdmin && (snapshot.val()?.role === "admin" || snapshot.val()?.role === "responsible")) firebaseState.role = snapshot.val().role;
    } else if (!configuredAdmin) {
      // Repair an Auth account created before its profile write completed.
      // The self-create rule only permits this safe, unapproved profile.
      firebaseState.profile = { email: user.email || "", role: "responsible", approved: false };
      await firebaseState.database.ref(`users/${firebaseSafeKey(user.uid)}`).set({
        email: user.email || "",
        role: "responsible",
        approved: false,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
    }
  } catch (error) {
    console.warn("Kullanıcı rolü okunamadı:", error);
  }
  applyRoleUI();
}

function redirectToLogin(reason = "") {
  if (location.pathname.endsWith("/login.html")) return;
  const query = reason ? `?reason=${encodeURIComponent(reason)}` : "";
  location.replace(`./login.html${query}`);
}

function initFirebase() {
  const config = window.ETKINLIK_FIREBASE_CONFIG;
  if (!config || typeof firebase === "undefined") {
    if (!config) {
      $("#data-mode").textContent = "Yerel taslak";
      document.body.classList.remove("app-pending");
    } else {
      redirectToLogin("firebase");
    }
    return;
  }
  try {
    const firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
    firebaseState.auth = firebase.auth(firebaseApp);
    firebaseState.database = firebase.database(firebaseApp);
    firebaseState.enabled = true;
    $("#auth-logout").addEventListener("click", () => firebaseState.auth.signOut());
    firebaseState.auth.onAuthStateChanged(async (user) => {
      firebaseState.user = user;
      if (!user) {
        redirectToLogin();
        return;
      }
      await loadFirebaseUserProfile(user);
      if (!isAdminUser(user) && (firebaseState.profile?.approved !== true || firebaseState.profile?.blocked === true)) {
        await firebaseState.auth.signOut();
        redirectToLogin(firebaseState.profile?.blocked === true ? "blocked" : "pending");
        return;
      }
      document.body.classList.remove("app-pending");
      await hydrateAdminUsers();
      await hydrateAdminAuditLogs();
      await hydrateFromFirebase();
      bindFirebaseRealtime();
    });
  } catch (error) {
    console.warn("Firebase başlatılamadı:", error);
    redirectToLogin("firebase");
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
  const canManageHomes = !firebaseState.enabled || isAdminUser();
  list.innerHTML = homes.map((home) => {
    const eventCount = records.filter((record) => record.home === home).length;
    const isSelected = selectedHomeDetail === home;
    const responsibleLabel = homeResponsibles[home] ? `<span class="home-responsible">Sorumlu: ${escapeHTML(homeResponsibles[home])}</span>` : "";
    const adminActions = canManageHomes
      ? `<button class="row-action row-edit" type="button" data-rename-home="${escapeHTML(home)}">Adını değiştir</button><button class="row-action row-delete" type="button" data-delete-home="${escapeHTML(home)}">Sil</button>`
      : `<span class="home-role-note">Yönetici yönetir</span>`;
    return `<div class="home-row${isSelected ? " selected" : ""}"><button class="home-name-button" type="button" data-open-home="${escapeHTML(home)}" aria-label="${escapeHTML(home)} detayını aç"><strong>${escapeHTML(home)}</strong><span>${eventCount} etkinlik kaydı</span>${responsibleLabel}</button><div class="row-actions"><button class="row-action row-open" type="button" data-open-home="${escapeHTML(home)}">Aç</button>${adminActions}</div></div>`;
  }).join("");
}

function renderAdminUsers() {
  const section = $("#user-access");
  const list = $("#users-list");
  if (!section || !list) return;
  const admin = isAdminUser();
  section.hidden = !admin;
  const pendingBadge = $("#pending-user-count");
  if (!admin) {
    list.innerHTML = "";
    if (pendingBadge) pendingBadge.hidden = true;
    return;
  }
  const pendingCount = firebaseState.userDirectory.filter((profile) => !profile.approved && !profile.blocked).length;
  if (pendingBadge) {
    pendingBadge.textContent = String(pendingCount);
    pendingBadge.hidden = pendingCount === 0;
  }
  if (!firebaseState.userDirectory.length) {
    list.innerHTML = `<div class="empty-state"><strong>Henüz kayıt olan ev sorumlusu yok.</strong><p>Yeni kullanıcı kayıt olduğunda burada izin verebilirsiniz.</p></div>`;
    return;
  }
  list.innerHTML = firebaseState.userDirectory.map((profile) => {
    const created = profile.createdAt ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(profile.createdAt)) : "Tarih belirtilmedi";
    const status = profile.blocked ? "Engellendi" : profile.approved ? "İzin verildi" : "Onay bekliyor";
    const actionLabel = profile.approved ? "İzni geri al" : "Görüntüleme izni ver";
    const actionClass = profile.approved ? "button-ghost" : "button-primary";
    const statusClass = profile.blocked ? "blocked" : profile.approved ? "approved" : "pending";
    const blockLabel = profile.blocked ? "Engeli kaldır" : "Hesabı engelle";
    return `<article class="user-access-row"><div class="user-access-copy"><strong>${escapeHTML(profile.email)}</strong><span>Kayıt tarihi: ${escapeHTML(created)}</span></div><div class="user-access-actions"><span class="user-access-status ${statusClass}">${status}</span><button class="button button-small ${actionClass}" type="button" data-user-key="${escapeHTML(profile.key)}" data-user-approved="${String(profile.approved)}">${actionLabel}</button><button class="button button-small button-ghost" type="button" data-user-key="${escapeHTML(profile.key)}" data-user-blocked="${String(profile.blocked)}">${blockLabel}</button></div></article>`;
  }).join("");
}

function renderAuditLogs() {
  const list = $("#audit-log-list");
  if (!list) return;
  if (!isAdminUser()) {
    list.innerHTML = "";
    return;
  }
  if (!firebaseState.auditLogs.length) {
    list.innerHTML = `<div class="empty-state"><strong>Henüz değişiklik günlüğü yok.</strong><p>Yeni işlemler burada görünür.</p></div>`;
    return;
  }
  const labels = {
    "event.create": "Etkinlik eklendi",
    "event.update": "Etkinlik güncellendi",
    "event.delete": "Etkinlik silindi",
    "home.create": "Çocuk evi eklendi",
    "home.rename": "Çocuk evi adı değiştirildi",
    "home.delete": "Çocuk evi silindi",
    "home.photo.update": "Sorumlu fotoğrafı güncellendi",
    "user.approve": "Kullanıcıya izin verildi",
    "user.revoke": "Kullanıcı izni geri alındı",
    "user.block": "Kullanıcı engellendi",
    "user.unblock": "Kullanıcı engeli kaldırıldı"
  };
  list.innerHTML = firebaseState.auditLogs.map((log) => {
    const detail = log.details?.from && log.details?.to
      ? `${log.details.from} → ${log.details.to}`
      : log.details?.home || log.details?.email || log.target || "—";
    const date = log.timestamp ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.timestamp)) : "Tarih belirtilmedi";
    return `<div class="audit-log-row"><div><strong>${escapeHTML(labels[log.action] || log.action || "İşlem")}</strong><span>${escapeHTML(String(detail))}</span></div><time datetime="${log.timestamp ? new Date(log.timestamp).toISOString() : ""}">${escapeHTML(date)}</time></div>`;
  }).join("");
}

async function setUserApproval(userKey, approved) {
  if (!firebaseState.enabled || !firebaseState.database || !isAdminUser() || !userKey) return;
  const profile = firebaseState.userDirectory.find((item) => item.key === userKey);
  if (!profile) return;
  try {
    const audit = createAuditEntry(approved ? "user.approve" : "user.revoke", userKey, { email: profile.email });
    await firebaseState.database.ref().update({
      [`users/${userKey}/approved`]: approved,
      [`auditLogs/${firebaseSafeKey(audit.id)}`]: audit
    });
    profile.approved = approved;
    firebaseState.userDirectory.sort((first, second) => Number(first.approved) - Number(second.approved) || first.email.localeCompare(second.email, "tr"));
    renderAdminUsers();
    showToast(approved ? "Kullanıcıya görüntüleme izni verildi." : "Kullanıcının görüntüleme izni geri alındı.");
  } catch (error) {
    console.warn("Kullanıcı izni güncellenemedi:", error);
    showToast("Kullanıcı izni güncellenemedi.");
  }
}

async function setUserBlocked(userKey, blocked) {
  if (!firebaseState.enabled || !firebaseState.database || !isAdminUser() || !userKey) return;
  const profile = firebaseState.userDirectory.find((item) => item.key === userKey);
  if (!profile) return;
  try {
    const audit = createAuditEntry(blocked ? "user.block" : "user.unblock", userKey, { email: profile.email });
    await firebaseState.database.ref().update({
      [`users/${userKey}/blocked`]: blocked,
      [`auditLogs/${firebaseSafeKey(audit.id)}`]: audit
    });
    profile.blocked = blocked;
    renderAdminUsers();
    showToast(blocked ? "Kullanıcı hesabı engellendi." : "Kullanıcı hesabının engeli kaldırıldı.");
  } catch (error) {
    console.warn("Kullanıcı engel durumu güncellenemedi:", error);
    showToast("Kullanıcı engel durumu güncellenemedi.");
  }
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
  $("#home-profile-title").textContent = homeResponsibles[selectedHomeDetail] || "Sorumlu adı belirtilmedi";
  photoButton.hidden = !(!firebaseState.enabled || isAdminUser());
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
    queueAudit("home.photo.update", homeIds[targetHome], { home: targetHome });
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
  const savedRecordId = editingRecordId || records[0]?.id;
  if (!saveRecords(records)) {
    records = previousRecords;
    return;
  }
  queueAudit(wasEditing ? "event.update" : "event.create", savedRecordId, { home: recordData.home, type: recordData.type });
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
  queueAudit("event.delete", id, { home: record.home, type: record.type });
  updateEverything();
  showToast("Kayıt silindi.");
}

function addHome(name, responsibleName) {
  const cleanName = normalizeHomeName(name);
  const cleanResponsibleName = String(responsibleName || "").trim().replace(/\s+/g, " ");
  if (!cleanName) return false;
  if (!cleanResponsibleName) {
    showToast("Ev sorumlusunun adını yazın.");
    return false;
  }
  if (homes.some((home) => home.toLocaleLowerCase("tr-TR") === cleanName.toLocaleLowerCase("tr-TR"))) {
    showToast("Bu çocuk evi zaten kayıtlı.");
    return false;
  }
  const previousHomes = [...homes];
  const previousHomeIds = { ...homeIds };
  const previousResponsibles = { ...homeResponsibles };
  homes.push(cleanName);
  homeIds = { ...homeIds, [cleanName]: `home-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}` };
  homeResponsibles = { ...homeResponsibles, [cleanName]: cleanResponsibleName };
  homes.sort((a, b) => a.localeCompare(b, "tr"));
  if (!saveHomes(homes) || !saveHomeIds(homeIds) || !saveHomeResponsibles(homeResponsibles)) {
    homes = previousHomes;
    homeIds = previousHomeIds;
    homeResponsibles = previousResponsibles;
    saveHomes(previousHomes);
    saveHomeIds(previousHomeIds);
    saveHomeResponsibles(previousResponsibles);
    return false;
  }
  queueAudit("home.create", homeIds[cleanName], { home: cleanName });
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
  $("#home-modal-responsible").value = isRename ? (homeResponsibles[name] || "") : "";
  $("#home-modal-responsible").closest("label").hidden = !isRename;
  $("#home-modal-responsible").required = isRename;
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
    const previousHomeIds = homeIds;
    const previousProfiles = homeProfiles;
    const previousResponsibles = homeResponsibles;
    homes = homes.filter((home) => home !== oldName);
    homeIds = { ...homeIds };
    homeProfiles = { ...homeProfiles };
    homeResponsibles = { ...homeResponsibles };
    delete homeIds[oldName];
    delete homeProfiles[oldName];
    delete homeResponsibles[oldName];
    if (!saveHomes(homes) || !saveHomeIds(homeIds) || !saveHomeProfiles(homeProfiles) || !saveHomeResponsibles(homeResponsibles)) {
      homes = previousHomes;
      homeIds = previousHomeIds;
      homeProfiles = previousProfiles;
      homeResponsibles = previousResponsibles;
      saveHomes(previousHomes);
      saveHomeIds(previousHomeIds);
      saveHomeProfiles(previousProfiles);
      saveHomeResponsibles(previousResponsibles);
      return;
    }
    if (selectedHomeDetail === oldName) selectedHomeDetail = null;
    queueAudit("home.delete", previousHomeIds[oldName] || oldName, { home: oldName });
    closeModal();
    updateEverything();
    showToast(eventCount ? "Çocuk evi silindi; geçmiş kayıtlar korundu." : "Çocuk evi silindi.");
    return;
  }

  const newName = normalizeHomeName($("#home-modal-name").value);
  const newResponsibleName = $("#home-modal-responsible").value.trim().replace(/\s+/g, " ");
  const error = $("#home-modal-error");
  if (!newName) {
    error.textContent = "Lütfen çocuk evinin adını yazın.";
    return;
  }
  if (!newResponsibleName) {
    error.textContent = "Lütfen ev sorumlusunun adını yazın.";
    return;
  }
  if (homes.some((home) => home !== oldName && home.toLocaleLowerCase("tr-TR") === newName.toLocaleLowerCase("tr-TR"))) {
    error.textContent = "Bu isimde başka bir çocuk evi bulunuyor.";
    return;
  }
  const previousHomes = homes;
  const previousHomeIds = homeIds;
  const previousRecords = records;
  const previousProfiles = homeProfiles;
  const previousResponsibles = homeResponsibles;
  homes = homes.map((home) => home === oldName ? newName : home).sort((a, b) => a.localeCompare(b, "tr"));
  homeIds = { ...homeIds, [newName]: homeIds[oldName] || `home-${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}` };
  delete homeIds[oldName];
  records = records.map((record) => record.home === oldName ? { ...record, home: newName } : record);
  homeProfiles = { ...homeProfiles };
  homeResponsibles = { ...homeResponsibles };
  if (homeProfiles[oldName]) {
    homeProfiles[newName] = homeProfiles[oldName];
    delete homeProfiles[oldName];
  }
  if (homeResponsibles[oldName]) delete homeResponsibles[oldName];
  homeResponsibles[newName] = newResponsibleName;
  if (!saveHomes(homes) || !saveHomeIds(homeIds) || !saveRecords(records) || !saveHomeProfiles(homeProfiles) || !saveHomeResponsibles(homeResponsibles)) {
    homes = previousHomes;
    homeIds = previousHomeIds;
    records = previousRecords;
    homeProfiles = previousProfiles;
    homeResponsibles = previousResponsibles;
    saveHomes(previousHomes);
    saveHomeIds(previousHomeIds);
    saveRecords(previousRecords);
    saveHomeProfiles(previousProfiles);
    saveHomeResponsibles(previousResponsibles);
    return;
  }
  if (selectedHomeDetail === oldName) selectedHomeDetail = newName;
  queueAudit("home.rename", homeIds[newName] || newName, { from: oldName, to: newName });
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
    const nameInput = $("#new-home-name");
    const responsibleInput = $("#new-home-responsible");
    if (addHome(nameInput.value, responsibleInput.value)) {
      nameInput.value = "";
      responsibleInput.value = "";
    }
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
  $("#users-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-user-key]");
    if (!button) return;
    if (button.dataset.userBlocked !== undefined) {
      setUserBlocked(button.dataset.userKey, button.dataset.userBlocked !== "true");
      return;
    }
    setUserApproval(button.dataset.userKey, button.dataset.userApproved !== "true");
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
