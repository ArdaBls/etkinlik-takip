# Etkinlik Takip — Firebase ve GitHub Pages

Çocuk evlerinin etkinlik katılımlarını kişi bilgisi toplamadan kaydeden, tek yöneticiyle kullanılan statik bir web uygulamasıdır. GitHub Pages üzerinde yayınlanır; veriler Firebase Realtime Database'de, tarayıcıda ise çevrimdışı önbellek olarak tutulur.

## Yerelde açma

`login.html` giriş/kayıt ekranını, `index.html` ise yalnızca yetkili çalışma alanını içerir. Firebase Authentication ve Realtime Database için GitHub Pages veya başka bir HTTP/HTTPS sunucusu kullanın. Excel indirme işlevi için internet bağlantısı gerekir; bu işlev SheetJS'nin tarayıcı sürümünü kullanır.

PWA servis çalışanı `file://` adresinde çalışmaz. PWA kurulumu ve çevrimdışı çalışma testi için siteyi yerel bir HTTP sunucusundan veya GitHub Pages üzerindeki HTTPS adresinden açın.

## Mevcut işlevler

- Açık/koyu tema
- Çocuk evi ve etkinlik odaklı kayıt formu
- Çocuk evi ekleme, yeniden adlandırma ve silme
- Çocuk evi detay sekmesi: ev sorumlusu fotoğrafı, tarih/tür filtreleri ve ev bazlı Excel
- Admin kullanıcı izinleri: onay bekleyen hesapları görme, izin verme/geri alma ve engelleme
- Etkinlik kayıtlarını sonradan düzenleme ve silme
- Arama ve etkinlik türü filtreli kayıt tablosu
- Günlük, son 7 gün, aylık, yıllık veya özel tarih aralıklı raporlama
- Çok sayfalı `.xlsx` raporu: Rapor Özeti, Çocuk Evi Özeti, Ayrıntılı Kayıtlar
- Android ve iOS ana ekrana ekleme desteği
- İlk çevrimiçi açılıştan sonra temel ekranın çevrimdışı açılabilmesi
- Firebase canlı dinleyicileri, atomik çoklu-yol güncellemesi ve değişiklik günlüğü

## Telefona yükleme

- Android/Chrome: GitHub Pages adresini açın. Görünürse üstteki **Uygulamayı yükle** düğmesini kullanın; görünmüyorsa Chrome menüsündeki **Ana ekrana ekle** veya **Uygulamayı yükle** seçeneğini açın.
- iPhone/Safari: GitHub Pages adresini Safari'de açın, **Paylaş** düğmesine dokunun ve **Ana Ekrana Ekle** seçeneğini kullanın.

Kurulan uygulama tarayıcı çubukları olmadan bağımsız pencere olarak açılır. Excel kitaplığı ilk kez çevrimiçi yüklenmelidir.

## Firebase bağlantısı ve kuralları

Firebase Realtime Database bağlantısı `firebase-config.js` içinde tanımlıdır. Firebase Console'da **Authentication → Sign-in method → Email/Password** yöntemini açın. `login.html` içindeki **Kayıt ol** sekmesi e-posta göndermeden yeni hesabı `responsible` (ev sorumlusu) rolünde ve `approved: false` durumunda oluşturur. Kullanıcıya sitede “Kayıt alındı, yönetici onayı bekleniyor” ekranı gösterilir. Tek yönetici hesabı `adminEmail` alanındaki e-posta ile eşleştirilir.

Kuralları uygulamak için hem `firebase/database.rules.json` içindeki hem de `firebase-config.js` içindeki `ADMIN_EMAIL_HERE` değerini yöneticinin doğrulanmış e-posta adresiyle değiştirip Firebase Console'daki Realtime Database **Rules** ekranına aktarın. Firebase CLI kullanıyorsanız kökteki `firebase.json` dosyası bu kural dosyasını gösterir.

Realtime Database'de kişi bazlı çocuk verisi içeren bir koleksiyon oluşturulmayacaktır. Uygulamanın kullandığı yollar:

- `eventRecords/{recordId}`: tarih, çocuk evi, etkinlik türü/adı/yeri/saatleri ve genel açıklama
- `homes/{homeId}`: çocuk evi adı (`name`) ve ev sorumlusu adı (`responsibleName`)
- `homeProfiles/{homeId}`: çocuk evi adı ve sıkıştırılmış base64 fotoğraf veri URL'si
- `auditLogs/{logId}`: değiştirilemeyen ekleme günlüğü (işlem, hedef, kullanıcı ve zaman)

Firebase Authentication ile tek admin ve birden fazla ev sorumlusu giriş yapabilir. Admin; çocuk evi, profil fotoğrafı ve kullanıcı izinlerini yönetir. **Kullanıcı izinleri** panelinden bekleyen hesaplara görüntüleme/kullanma izni (`approved: true`) verilebilir, geri alınabilir veya hesap engellenebilir (`blocked: true`). İzni olmayan/engellenen kullanıcı ana uygulamayı görmeden giriş ekranına döner. Ev sorumluları etkinlik kayıtlarını kullanır; çocuk evi yönetim düğmeleri admin olmayan hesaplarda gizlenir. Yetkilendirme yalnızca arayüzde değil, Realtime Database kurallarında da zorunlu kılınmalıdır. Kural dosyası ayrı klasörde tutulur: `firebase/database.rules.json`.

Kullanıcı profilleri `users/{uid}` altında tutulur. Yeni kayıtlar yalnızca `responsible` rolü ve `approved: false` ile oluşturulabilir; rol ve izin değişikliklerini yalnızca admin yapabilir. Admin yapmak için ilgili kullanıcının `users/{uid}/role` değerini `admin` yapın veya `firebase-config.js` içindeki `adminEmail` değerini kullanın. Kurallar admin e-postasını, admin rolünü ve onay durumunu kontrol eder.

Uygulama açıldığında Firebase verisi yerel önbelleğin üzerine yazılır; Firebase'de silinen kayıtlar tekrar oluşturulmaz. Etkinlik, çocuk evi, profil ve admin kullanıcı yolları Realtime Database canlı dinleyicileriyle izlenir. Etkinlik ve ilgili değişiklik günlüğü tek atomik güncellemede yazılır. Çocuk evleri Firebase'de sabit kimliklerle tutulur; ad değişikliği bu kimliği korur. Kural dosyası veya admin e-postası değiştirildikten sonra ilgili kuralları Firebase Console'da yayımlayın.

Firebase CLI ile yayımlamak için kök klasörde `firebase login` ve ardından `firebase deploy --only database` çalıştırılabilir. GitHub Pages iş akışı (`.github/workflows/pages.yml`) yalnızca statik siteyi yayımlar; Firebase kuralları ayrıca Firebase Console veya CLI üzerinden yayımlanmalıdır.

Ev sorumlusu fotoğrafı tarayıcıda en fazla 640 px kenar ve yaklaşık 700 KB veri URL'si olacak şekilde sıkıştırılır. Firebase'e gönderilen fotoğraf base64 olarak kalır. Üretimde ev kayıtlarına sabit kimlik verilmesi, yeniden adlandırma işlemlerinin de transaction/batch ile yapılması önerilir.

Yeni çocuk evi eklerken forma yalnızca kısa ad yazılır; örneğin `Mercan` otomatik olarak `Mercan Çocuk Evi` şeklinde kaydedilir. Ev sorumlusunun adı ayrıca zorunlu alandır.
