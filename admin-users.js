(() => {
  const $ = (selector) => document.querySelector(selector);
  let auth = null;
  let database = null;
  let currentUser = null;
  let isAdmin = false;
  const userDirectory = new Map();
  const homeDirectory = new Map();

  const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const photoPattern = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/;
  const initials = (value = "") => {
    const parts = String(value).trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) || "EV").toLocaleUpperCase("tr-TR");
  };
  const firebaseSafeKey = (value) => encodeURIComponent(String(value)).replace(/\./g, "%2E").replace(/\$/g, "%24").replace(/#/g, "%23").replace(/\[/g, "%5B").replace(/\]/g, "%5D");
  const configuredAdminEmail = () => String(window.ETKINLIK_FIREBASE_CONFIG?.adminEmail || "").trim().toLocaleLowerCase("tr-TR");
  const isConfiguredAdmin = (user) => String(user?.email || "").trim().toLocaleLowerCase("tr-TR") === configuredAdminEmail();
  const createAuditEntry = (action, target, details = {}) => ({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    target: String(target || ""),
    details,
    email: String(currentUser?.email || ""),
    actorUid: String(currentUser?.uid || ""),
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });

  const renderUsers = () => {
    const list = $("#users-list");
    const profiles = [...userDirectory.values()].sort((first, second) => Number(first.approved) - Number(second.approved) || (first.displayName || first.email).localeCompare(second.displayName || second.email, "tr"));
    const pendingCount = profiles.filter((profile) => !profile.approved && !profile.blocked).length;
    const badge = $("#pending-user-count");
    badge.textContent = `${pendingCount} bekleyen`;
    badge.hidden = pendingCount === 0;
    if (!profiles.length) {
      list.innerHTML = `<div class="empty-state"><strong>Henüz kayıt olan ev sorumlusu yok.</strong><p>Yeni kullanıcı kayıt olduğunda burada izin verebilirsiniz.</p></div>`;
      return;
    }
    list.innerHTML = profiles.map((profile) => {
      const created = profile.createdAt ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(profile.createdAt)) : "Tarih belirtilmedi";
      const status = profile.blocked ? "Engellendi" : profile.approved ? "İzin verildi" : "Onay bekliyor";
      const statusClass = profile.blocked ? "blocked" : profile.approved ? "approved" : "pending";
      const assignedHomeIds = profile.assignedHomeIds && typeof profile.assignedHomeIds === "object" ? profile.assignedHomeIds : {};
      const selectedCount = [...homeDirectory.keys()].filter((homeId) => assignedHomeIds[homeId] === true).length;
      const displayName = profile.displayName || `${profile.firstName || ""} ${profile.lastName || ""}`.trim() || "Ad soyad belirtilmedi";
      const avatar = photoPattern.test(String(profile.photoDataUrl || ""))
        ? `<img src="${profile.photoDataUrl}" alt="${escapeHTML(displayName)}" />`
        : `<span>${escapeHTML(initials(displayName))}</span>`;
      const assignmentMarkup = homeDirectory.size
        ? `<div class="user-home-assignment" data-assignment-container="${escapeHTML(profile.key)}"><span class="user-home-assignment-title">Sorumlu olduğu çocuk evleri</span><div class="assignment-combobox"><button class="assignment-combobox-trigger" type="button" data-combobox-toggle="${escapeHTML(profile.key)}" aria-expanded="false" aria-controls="assignment-menu-${escapeHTML(profile.key)}" role="combobox"><span data-assignment-summary="${escapeHTML(profile.key)}">${selectedCount ? `${selectedCount} çocuk evi seçildi` : "Çocuk evlerini seçin"}</span><span class="assignment-combobox-chevron" aria-hidden="true">⌄</span></button><div class="assignment-combobox-menu" id="assignment-menu-${escapeHTML(profile.key)}" data-assignment-menu="${escapeHTML(profile.key)}" role="listbox" hidden><label class="assignment-search"><span class="sr-only">Çocuk evi ara</span><input type="search" data-assignment-search="${escapeHTML(profile.key)}" placeholder="Çocuk evi ara…" autocomplete="off" /></label><div class="assignment-options" data-assignment-options="${escapeHTML(profile.key)}">${[...homeDirectory.values()].sort((first, second) => first.name.localeCompare(second.name, "tr")).map((home) => `<label class="assignment-option" data-assignment-option-label="${escapeHTML(home.id)}"><input type="checkbox" data-assignment-home="${escapeHTML(home.id)}" data-assignment-user="${escapeHTML(profile.key)}"${assignedHomeIds[home.id] === true ? " checked" : ""}><span>${escapeHTML(home.name)}</span></label>`).join("")}</div><div class="assignment-combobox-footer"><span data-assignment-empty="${escapeHTML(profile.key)}" hidden>Sonuç bulunamadı.</span><button class="assignment-clear" type="button" data-assignment-clear="${escapeHTML(profile.key)}">Seçimi temizle</button></div></div></div></div>`
        : `<div class="user-home-assignment user-home-assignment-empty">Önce çocuk evi ekleyin; ardından bu kullanıcıya ev yetkisi verebilirsiniz.</div>`;
      return `<article class="user-access-row"><div class="user-access-copy-with-avatar"><span class="user-access-avatar">${avatar}</span><div class="user-access-copy"><strong>${escapeHTML(displayName)}</strong><span>${escapeHTML(profile.email)}</span><span>Kayıt tarihi: ${escapeHTML(created)}</span></div></div><div class="user-access-actions"><span class="user-access-status ${statusClass}">${status}</span><button class="button button-small ${profile.approved ? "button-ghost" : "button-primary"}" type="button" data-user-key="${escapeHTML(profile.key)}" data-action="approval">${profile.approved ? "İzni geri al" : "Görüntüleme izni ver"}</button><button class="button button-small button-ghost" type="button" data-user-key="${escapeHTML(profile.key)}" data-action="blocked">${profile.blocked ? "Engeli kaldır" : "Hesabı engelle"}</button></div>${assignmentMarkup}</article>`;
    }).join("");
  };

  const renderAuditLogs = (snapshot) => {
    const list = $("#audit-log-list");
    const logs = [];
    snapshot.forEach((child) => { if (child.val() && typeof child.val() === "object") logs.push(child.val()); });
    logs.sort((first, second) => Number(second.timestamp || 0) - Number(first.timestamp || 0));
    if (!logs.length) {
      list.innerHTML = `<div class="empty-state"><strong>Henüz değişiklik günlüğü yok.</strong><p>Yeni işlemler burada görünür.</p></div>`;
      return;
    }
    const labels = { "event.create": "Etkinlik eklendi", "event.update": "Etkinlik güncellendi", "event.delete": "Etkinlik silindi", "home.create": "Çocuk evi eklendi", "home.rename": "Çocuk evi adı değiştirildi", "home.delete": "Çocuk evi silindi", "home.photo.update": "Sorumlu fotoğrafı güncellendi", "user.approve": "Kullanıcıya izin verildi", "user.revoke": "Kullanıcı izni geri alındı", "user.block": "Kullanıcı engellendi", "user.unblock": "Kullanıcı engeli kaldırıldı", "user.homes.update": "Çocuk evi yetkileri güncellendi" };
    list.innerHTML = logs.map((log) => {
      const detail = log.details?.from && log.details?.to ? `${log.details.from} → ${log.details.to}` : log.details?.home || log.details?.email || log.target || "—";
      const date = log.timestamp ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.timestamp)) : "Tarih belirtilmedi";
      return `<div class="audit-log-row"><div><strong>${escapeHTML(labels[log.action] || log.action || "İşlem")}</strong><span>${escapeHTML(String(detail))}</span></div><time>${escapeHTML(date)}</time></div>`;
    }).join("");
  };

  const setUserField = async (userKey, field, value) => {
    if (!isAdmin || !userDirectory.has(userKey)) return;
    const profile = userDirectory.get(userKey);
    const action = field === "approved" ? (value ? "user.approve" : "user.revoke") : (value ? "user.block" : "user.unblock");
    const audit = createAuditEntry(action, userKey, { email: profile.email });
    try {
      await database.ref().update({ [`users/${userKey}/${field}`]: value, [`auditLogs/${firebaseSafeKey(audit.id)}`]: audit });
    } catch (error) {
      console.warn("Kullanıcı durumu güncellenemedi:", error);
      window.alert("Kullanıcı durumu güncellenemedi. Firebase Rules ayarlarını kontrol edin.");
    }
  };

  const setAssignedHomes = async (userKey, selectedHomeIds) => {
    if (!isAdmin || !userDirectory.has(userKey)) return;
    const profile = userDirectory.get(userKey);
    const assignedHomeIds = selectedHomeIds.reduce((result, homeId) => { result[homeId] = true; return result; }, {});
    const audit = createAuditEntry("user.homes.update", userKey, { email: profile.email, homes: selectedHomeIds });
    try {
      await database.ref().update({ [`users/${userKey}/assignedHomeIds`]: assignedHomeIds, [`auditLogs/${firebaseSafeKey(audit.id)}`]: audit });
    } catch (error) {
      console.warn("Çocuk evi yetkileri güncellenemedi:", error);
      window.alert("Çocuk evi yetkileri güncellenemedi. Firebase Rules ayarlarını kontrol edin.");
      renderUsers();
    }
  };

  const closeAssignmentMenus = (exceptKey = "") => {
    document.querySelectorAll("[data-assignment-menu]").forEach((menu) => {
      if (menu.dataset.assignmentMenu !== exceptKey) {
        menu.hidden = true;
        const trigger = document.querySelector(`[data-combobox-toggle="${menu.dataset.assignmentMenu}"]`);
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      }
    });
  };

  const updateAssignmentSummary = (userKey) => {
    const container = document.querySelector(`[data-assignment-container="${userKey}"]`);
    if (!container) return;
    const selected = [...container.querySelectorAll("[data-assignment-home]")].filter((input) => input.checked).length;
    const summary = container.querySelector("[data-assignment-summary]");
    if (summary) summary.textContent = selected ? `${selected} çocuk evi seçildi` : "Çocuk evlerini seçin";
  };

  const initTheme = () => {
    document.body.classList.add("dark-theme");
    try { localStorage.setItem("etkinlik-takip-theme", "dark"); } catch {}
    const meta = $("#theme-color-meta");
    if (meta) meta.content = "#12211f";
    const toggle = $("#theme-toggle");
    if (toggle) toggle.hidden = true;
  };

  const init = () => {
    initTheme();
    const config = window.ETKINLIK_FIREBASE_CONFIG;
    if (!config || typeof firebase === "undefined") { location.replace("./login.html?reason=firebase"); return; }
    try {
      const firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
      auth = firebase.auth(firebaseApp);
      database = firebase.database(firebaseApp);
    } catch (error) { console.warn("Firebase başlatılamadı:", error); location.replace("./login.html?reason=firebase"); return; }

    $("#auth-logout").addEventListener("click", () => auth.signOut());
    $("#users-list").addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-combobox-toggle]");
      if (toggle) {
        const key = toggle.dataset.comboboxToggle;
        const menu = document.querySelector(`[data-assignment-menu="${key}"]`);
        if (!menu) return;
        const willOpen = menu.hidden;
        closeAssignmentMenus(willOpen ? key : "");
        menu.hidden = !willOpen;
        toggle.setAttribute("aria-expanded", String(willOpen));
        if (willOpen) menu.querySelector("[data-assignment-search]")?.focus();
        return;
      }
      const clear = event.target.closest("[data-assignment-clear]");
      if (clear) {
        const key = clear.dataset.assignmentClear;
        const container = document.querySelector(`[data-assignment-container="${key}"]`);
        const inputs = container ? [...container.querySelectorAll("[data-assignment-home]")] : [];
        inputs.forEach((input) => { input.checked = false; });
        updateAssignmentSummary(key);
        setAssignedHomes(key, []);
        return;
      }
      const button = event.target.closest("[data-user-key]");
      if (!button) return;
      const field = button.dataset.action === "blocked" ? "blocked" : "approved";
      const profile = userDirectory.get(button.dataset.userKey);
      if (profile) setUserField(button.dataset.userKey, field, field === "blocked" ? !profile.blocked : !profile.approved);
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".assignment-combobox")) closeAssignmentMenus();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAssignmentMenus();
    });
    $("#users-list").addEventListener("change", (event) => {
      const input = event.target.closest("[data-assignment-home]");
      if (!input) return;
      const userKey = input.dataset.assignmentUser;
      const selected = [...document.querySelectorAll("[data-assignment-user]")]
        .filter((element) => element.dataset.assignmentUser === userKey && element.checked)
        .map((element) => element.dataset.assignmentHome);
      updateAssignmentSummary(userKey);
      setAssignedHomes(userKey, selected);
    });
    $("#users-list").addEventListener("input", (event) => {
      const search = event.target.closest("[data-assignment-search]");
      if (!search) return;
      const key = search.dataset.assignmentSearch;
      const query = search.value.trim().toLocaleLowerCase("tr-TR");
      const container = document.querySelector(`[data-assignment-container="${key}"]`);
      const options = container ? [...container.querySelectorAll("[data-assignment-option-label]")] : [];
      let visible = 0;
      options.forEach((option) => {
        const matches = !query || option.textContent.toLocaleLowerCase("tr-TR").includes(query);
        option.hidden = !matches;
        if (matches) visible += 1;
      });
      const empty = container?.querySelector("[data-assignment-empty]");
      if (empty) empty.hidden = visible > 0;
    });
    auth.onAuthStateChanged(async (user) => {
      currentUser = user;
      if (!user) { location.replace("./login.html"); return; }
      let profile = null;
      try { const snapshot = await database.ref(`users/${firebaseSafeKey(user.uid)}`).once("value"); profile = snapshot.val(); } catch (error) { console.warn("Admin profili okunamadı:", error); }
      isAdmin = isConfiguredAdmin(user) || profile?.role === "admin";
      if (!isAdmin) { location.replace("./"); return; }
      document.body.classList.remove("app-pending");
      $("#auth-logout").hidden = false;
      database.ref("users").on("value", (snapshot) => {
        userDirectory.clear();
        snapshot.forEach((child) => { const value = child.val() || {}; if (value.email && value.role !== "admin") userDirectory.set(child.key, { key: child.key, email: String(value.email), displayName: String(value.displayName || ""), firstName: String(value.firstName || ""), lastName: String(value.lastName || ""), photoDataUrl: String(value.photoDataUrl || ""), assignedHomeIds: value.assignedHomeIds && typeof value.assignedHomeIds === "object" ? value.assignedHomeIds : {}, approved: value.approved === true, blocked: value.blocked === true, createdAt: Number(value.createdAt || 0) }); });
        renderUsers();
      }, (error) => console.warn("Kullanıcı listesi okunamadı:", error));
      database.ref("homes").on("value", (snapshot) => {
        homeDirectory.clear();
        snapshot.forEach((child) => {
          const value = child.val() || {};
          if (value.name) homeDirectory.set(child.key, { id: child.key, name: String(value.name), responsibleName: String(value.responsibleName || "") });
        });
        renderUsers();
      }, (error) => console.warn("Çocuk evi listesi okunamadı:", error));
      database.ref("auditLogs").limitToLast(40).on("value", renderAuditLogs, (error) => console.warn("Değişiklik günlüğü okunamadı:", error));
    });
  };

  init();
})();
