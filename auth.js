(() => {
  const $ = (selector) => document.querySelector(selector);
  let authMode = "login";
  let pendingRegistration = false;
  let auth = null;
  let database = null;
  let approvalListenerRef = null;
  let approvalListener = null;
  const PENDING_REGISTRATION_STORAGE_KEY = "etkinlik-takip-pending-registration-v1";

  const readPendingRegistration = () => {
    try {
      const value = JSON.parse(localStorage.getItem(PENDING_REGISTRATION_STORAGE_KEY));
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  };

  const savePendingRegistration = (value) => {
    try { localStorage.setItem(PENDING_REGISTRATION_STORAGE_KEY, JSON.stringify(value)); } catch {}
  };

  const clearPendingRegistration = () => {
    try { localStorage.removeItem(PENDING_REGISTRATION_STORAGE_KEY); } catch {}
  };

  const stopApprovalWatch = () => {
    if (approvalListenerRef && approvalListener) approvalListenerRef.off("value", approvalListener);
    approvalListenerRef = null;
    approvalListener = null;
  };

  const configuredAdminEmail = () => String(window.ETKINLIK_FIREBASE_CONFIG?.adminEmail || "").trim().toLocaleLowerCase("tr-TR");

  const watchApproval = (user) => {
    stopApprovalWatch();
    if (!user || !database) return;
    approvalListenerRef = database.ref(`users/${encodeURIComponent(user.uid)}`);
    approvalListener = (snapshot) => {
      if (!auth.currentUser || auth.currentUser.uid !== user.uid) {
        stopApprovalWatch();
        return;
      }
      const profile = snapshot.val() || {};
      const displayName = String(profile.displayName || user.displayName || "").trim();
      if (profile.blocked === true) {
        stopApprovalWatch();
        pendingRegistration = false;
        clearPendingRegistration();
        auth.signOut().finally(() => {
          showAuthForm();
          setAuthMode("login");
          setMessage("Bu hesap yönetici tarafından engellendi.");
        });
        return;
      }
      if (profile.approved === true) {
        stopApprovalWatch();
        pendingRegistration = false;
        clearPendingRegistration();
        location.replace("./");
        return;
      }
      savePendingRegistration({ email: user.email || "", displayName, createdAt: Date.now() });
      showPendingState(user.email || "", displayName);
    };
    approvalListenerRef.on("value", approvalListener, (error) => {
      console.warn("Yönetici onayı canlı dinlenemedi:", error);
      setMessage("Onay durumu alınamadı. İnternet bağlantınızı kontrol edin.");
    });
  };

  const authErrorText = (error) => {
    const messages = {
      "auth/invalid-credential": "E-posta veya parola hatalı.",
      "auth/invalid-email": "Geçerli bir e-posta adresi yazın.",
      "auth/email-already-in-use": "Bu e-posta ile bir hesap zaten var. Giriş yapmayı deneyin.",
      "auth/weak-password": "Parola en az 6 karakter olmalıdır.",
      "auth/user-disabled": "Bu hesap devre dışı bırakılmış.",
      "auth/too-many-requests": "Çok fazla başarısız deneme yapıldı. Bir süre sonra tekrar deneyin.",
      "auth/operation-not-allowed": "E-posta/parola ile kayıt Firebase Authentication'da henüz açılmamış.",
      "auth/requires-recent-login": "Bu işlem için yeniden giriş yapmanız gerekiyor.",
      "auth/network-request-failed": "İnternet bağlantısı kurulamadı. Tekrar deneyin."
    };
    return messages[error?.code] || "Giriş yapılamadı. Firebase Authentication ayarlarını kontrol edin.";
  };

  const setMessage = (message, success = false) => {
    const element = $("#auth-error");
    element.textContent = message;
    element.classList.toggle("form-success", success);
  };

  const showAuthForm = () => {
    $("#auth-form").hidden = false;
    $(".auth-mode-switch").hidden = false;
    $("#auth-note").hidden = false;
    $("#auth-pending").hidden = true;
  };

  const showPendingState = (email, displayName = "") => {
    $("#auth-form").hidden = true;
    $(".auth-mode-switch").hidden = true;
    $("#auth-note").hidden = true;
    $("#auth-pending").hidden = false;
    $("#auth-pending-email").textContent = displayName ? `${displayName} · ${email}` : email;
    $("#auth-kicker").textContent = "Kayıt alındı";
    $("#auth-title").textContent = "Yönetici onayı bekleniyor";
    $("#auth-description").textContent = "Hesabınız oluşturuldu. Çalışma alanına erişim için yöneticinin izin vermesi gerekiyor.";
    $("#auth-pending-back").focus();
  };

  const setAuthMode = (mode) => {
    authMode = mode;
    const registering = mode === "register";
    $("#auth-login-mode").classList.toggle("active", !registering);
    $("#auth-register-mode").classList.toggle("active", registering);
    $("#auth-login-mode").setAttribute("aria-selected", String(!registering));
    $("#auth-register-mode").setAttribute("aria-selected", String(registering));
    $("#auth-password-confirm-field").hidden = !registering;
    $("#auth-password-confirm").required = registering;
    $("#auth-register-fields").hidden = !registering;
    $("#auth-first-name").required = registering;
    $("#auth-last-name").required = registering;
    $("#auth-password").setAttribute("autocomplete", registering ? "new-password" : "current-password");
    $("#auth-submit").textContent = registering ? "Ev sorumlusu hesabı oluştur" : "Giriş yap";
    $("#auth-kicker").textContent = registering ? "Ev sorumlusu kaydı" : "Yönetici ve ev sorumlusu girişi";
    $("#auth-description").textContent = registering
      ? "Kayıt olan hesaplar ev sorumlusu rolüyle başlar. Yönetici yetkisi yalnızca tanımlı tek hesaba aittir."
      : "Yönetici hesabı tüm ayarları yönetir. Diğer hesaplar ev sorumlusu olarak etkinlik kaydı oluşturur.";
    $("#auth-note").textContent = registering
      ? "Kayıt sonrasında yöneticinin izin vermesi beklenir; e-posta gönderilmez."
      : "Yönetici hesabı Firebase Authentication üzerinden oluşturulur. Yeni kayıt olan hesaplar ev sorumlusu rolüyle başlar.";
    if (!$("#auth-error").classList.contains("form-success")) setMessage("");
  };

  const initAuth = () => {
    const config = window.ETKINLIK_FIREBASE_CONFIG;
    if (!config || typeof firebase === "undefined") {
      setMessage("Firebase bağlantısı bulunamadı. Yapılandırmayı kontrol edin.");
      return;
    }

    try {
      const firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
      auth = firebase.auth(firebaseApp);
      database = firebase.database(firebaseApp);
    } catch (error) {
      console.warn("Firebase başlatılamadı:", error);
      setMessage("Firebase başlatılamadı. Yapılandırmayı kontrol edin.");
      return;
    }

    const reason = new URLSearchParams(location.search).get("reason");
    const pendingRegistrationData = readPendingRegistration();
    if (reason === "verify") setMessage("Devam etmek için e-posta adresinizi doğrulayın.");
    if (reason === "pending") setMessage("Hesabınız yönetici onayı bekliyor. İzin verildiğinde ana sayfa otomatik açılır.");
    if (reason === "blocked") setMessage("Bu hesabın erişimi yönetici tarafından engellendi.");

    $("#auth-login-mode").addEventListener("click", () => setAuthMode("login"));
    $("#auth-register-mode").addEventListener("click", () => setAuthMode("register"));
    $("#auth-pending-back").addEventListener("click", () => {
      stopApprovalWatch();
      pendingRegistration = false;
      clearPendingRegistration();
      auth.signOut().finally(() => {
        showAuthForm();
        setAuthMode("login");
        setMessage("");
        $("#auth-email").focus();
      });
    });
    $("#auth-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button[type=submit]");
      const email = $("#auth-email").value.trim();
      const password = $("#auth-password").value;
      const passwordConfirm = $("#auth-password-confirm").value;
      const firstName = $("#auth-first-name").value.trim().replace(/\s+/g, " ");
      const lastName = $("#auth-last-name").value.trim().replace(/\s+/g, " ");
      setMessage("");
      if (!email || !password) {
        setMessage("E-posta ve parola zorunludur.");
        return;
      }
      if (authMode === "register" && (!firstName || !lastName)) {
        setMessage("Ad ve soyad zorunludur.");
        return;
      }
      if (authMode === "register" && password !== passwordConfirm) {
        setMessage("Parola tekrarı aynı olmalıdır.");
        return;
      }
      button.disabled = true;
      button.textContent = authMode === "register" ? "Hesap oluşturuluyor…" : "Giriş yapılıyor…";
      try {
        if (authMode === "register") {
          pendingRegistration = true;
          const credential = await auth.createUserWithEmailAndPassword(email, password);
          const displayName = `${firstName} ${lastName}`;
          try { await credential.user.updateProfile({ displayName }); } catch (profileError) { console.warn("Kullanıcı adı Auth profilinde güncellenemedi:", profileError); }
          await database.ref(`users/${encodeURIComponent(credential.user.uid)}`).set({
            email,
            displayName,
            firstName,
            lastName,
            role: "responsible",
            approved: false,
            blocked: false,
            assignedHomeIds: {},
            createdAt: firebase.database.ServerValue.TIMESTAMP
          });
          savePendingRegistration({ email, displayName, createdAt: Date.now() });
          $("#auth-password").value = "";
          $("#auth-password-confirm").value = "";
          $("#auth-first-name").value = "";
          $("#auth-last-name").value = "";
          showPendingState(email, displayName);
          watchApproval(credential.user);
        } else {
          stopApprovalWatch();
          await auth.signInWithEmailAndPassword(email, password);
          clearPendingRegistration();
        }
      } catch (error) {
        stopApprovalWatch();
        if (authMode === "register" && auth.currentUser) {
          try { await auth.signOut(); } catch (signOutError) { console.warn("Kayıt sonrası oturum kapatılamadı:", signOutError); }
        }
        setMessage(authErrorText(error));
      } finally {
        pendingRegistration = false;
        button.disabled = false;
        button.textContent = authMode === "register" ? "Ev sorumlusu hesabı oluştur" : "Giriş yap";
      }
    });

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        stopApprovalWatch();
        if (pendingRegistration) return;
        const pendingData = readPendingRegistration();
        if (pendingData) showPendingState(String(pendingData.email || ""), String(pendingData.displayName || ""));
        return;
      }
      if (pendingRegistration) return;
      if (String(user.email || "").trim().toLocaleLowerCase("tr-TR") === configuredAdminEmail()) {
        clearPendingRegistration();
        location.replace("./");
        return;
      }
      try {
        const snapshot = await database.ref(`users/${encodeURIComponent(user.uid)}`).once("value");
        const profile = snapshot.val() || {};
        if (profile.blocked === true) {
          clearPendingRegistration();
          await auth.signOut();
          showAuthForm();
          setAuthMode("login");
          setMessage("Bu hesap yönetici tarafından engellendi.");
          return;
        }
        if (profile.approved === true) {
          clearPendingRegistration();
          location.replace("./");
          return;
        }
        const displayName = String(profile.displayName || user.displayName || "").trim();
        savePendingRegistration({ email: user.email || "", displayName, createdAt: Date.now() });
        showPendingState(user.email || "", displayName);
        watchApproval(user);
      } catch (error) {
        console.warn("Kullanıcı onay durumu okunamadı:", error);
        setMessage("Hesap durumu okunamadı. İnternet bağlantınızı kontrol edin.");
      }
    });

    if (reason === "pending" || (pendingRegistrationData && reason !== "blocked")) {
      showPendingState(String(pendingRegistrationData?.email || ""), String(pendingRegistrationData?.displayName || ""));
    }
  };

  initAuth();
})();
