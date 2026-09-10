# Etkinlik Takip — Firebase ve GitHub Pages

Çocuk evlerinin etkinlik katılımlarını kişi bilgisi toplamadan kaydeden, tek yöneticiyle kullanılan statik bir web uygulamasıdır. GitHub Pages üzerinde yayınlanır; veriler Firebase Realtime Database'de, tarayıcıda ise çevrimdışı önbellek olarak tutulur.

## Yerelde açma

`index.html` dosyasını tarayıcıda açmak arayüzü görmeye yeterlidir. Firebase Authentication ve Realtime Database için GitHub Pages veya başka bir HTTP/HTTPS sunucusu kullanın. Excel indirme işlevi için internet bağlantısı gerekir; bu işlev SheetJS'nin tarayıcı sürümünü kullanır.

PWA servis çalışanı `file://` adresinde çalışmaz. PWA kurulumu ve çevrimdışı çalışma testi için siteyi yerel bir HTTP sunucusundan veya GitHub Pages üzerindeki HTTPS adresinden açın.

## Mevcut işlevler

- Açık/koyu tema
- Çocuk evi ve etkinlik odaklı kayıt formu
- Çocuk evi ekleme, yeniden adlandırma ve silme
- Çocuk evi detay sekmesi: ev sorumlusu fotoğrafı, tarih/tür filtreleri ve ev bazlı Excel
- Etkinlik kayıtlarını sonradan düzenleme ve silme
- Arama ve etkinlik türü filtreli kayıt tablosu
- Günlük, son 7 gün, aylık, yıllık veya özel tarih aralıklı raporlama
- Çok sayfalı `.xlsx` raporu: Rapor Özeti, Çocuk Evi Özeti, Ayrıntılı Kayıtlar
- Android ve iOS ana ekrana ekleme desteği
- İlk çevrimiçi açılıştan sonra temel ekranın çevrimdışı açılabilmesi

## Telefona yükleme

- Android/Chrome: GitHub Pages adresini açın. Görünürse üstteki **Uygulamayı yükle** düğmesini kullanın; görünmüyorsa Chrome menüsündeki **Ana ekrana ekle** veya **Uygulamayı yükle** seçeneğini açın.
- iPhone/Safari: GitHub Pages adresini Safari'de açın, **Paylaş** düğmesine dokunun ve **Ana Ekrana Ekle** seçeneğini kullanın.

Kurulan uygulama tarayıcı çubukları olmadan bağımsız pencere olarak açılır. Excel kitaplığı ilk kez çevrimiçi yüklenmelidir.

## Firebase bağlantısı ve kuralları

Firebase Realtime Database bağlantısı `firebase-config.js` içinde tanımlıdır. Firebase Console'da **Authentication → Sign-in method → Email/Password** yöntemini açın. Giriş ekranındaki **Kayıt ol** sekmesi yeni hesapları varsayılan olarak `responsible` (ev sorumlusu) rolünde oluşturur ve e-posta doğrulaması ister. Tek yönetici hesabı `adminEmail` alanındaki e-posta ile eşleştirilir.

Kuralları uygulamak için hem `firebase/database.rules.json` içindeki hem de `firebase-config.js` içindeki `ADMIN_EMAIL_HERE` değerini yöneticinin doğrulanmış e-posta adresiyle değiştirip Firebase Console'daki Realtime Database **Rules** ekranına aktarın. Firebase CLI kullanıyorsanız kökteki `firebase.json` dosyası bu kural dosyasını gösterir.

Realtime Database'de kişi bazlı çocuk verisi içeren bir koleksiyon oluşturulmayacaktır. Uygulamanın kullandığı yollar:

- `eventRecords/{recordId}`: tarih, çocuk evi, etkinlik türü/adı/yeri/saatleri ve genel açıklama
- `homes/{homeId}`: çocuk evi adı
- `homeProfiles/{homeId}`: çocuk evi adı ve sıkıştırılmış base64 fotoğraf veri URL'si

Firebase Authentication ile tek admin ve birden fazla ev sorumlusu giriş yapabilir. Admin; çocuk evi, profil fotoğrafı ve kullanıcı rolü ayarlarını yönetir. Ev sorumluları etkinlik kayıtlarını kullanır; çocuk evi yönetim düğmeleri admin olmayan hesaplarda gizlenir. Yetkilendirme yalnızca arayüzde değil, Realtime Database kurallarında da zorunlu kılınmalıdır. Kural dosyası ayrı klasörde tutulur: `firebase/database.rules.json`.

Kayıt olan hesapların Firebase Authentication'da e-posta doğrulaması yapması gerekir. Kullanıcı rolleri `users/{uid}` altında tutulur; yeni kayıtlar yalnızca `responsible` rolüyle oluşturulabilir. Admin rolü Firebase Console üzerinden atanır veya `adminEmail` eşleşmesiyle tanınır.

Firebase CLI ile yayımlamak için kök klasörde `firebase login` ve ardından `firebase deploy --only database` çalıştırılabilir. GitHub Pages iş akışı (`.github/workflows/pages.yml`) yalnızca statik siteyi yayımlar; Firebase kuralları ayrıca Firebase Console veya CLI üzerinden yayımlanmalıdır.

Ev sorumlusu fotoğrafı tarayıcıda en fazla 640 px kenar ve yaklaşık 700 KB veri URL'si olacak şekilde sıkıştırılır. Firebase'e gönderilen fotoğraf base64 olarak kalır. Üretimde ev kayıtlarına sabit kimlik verilmesi, yeniden adlandırma işlemlerinin de transaction/batch ile yapılması önerilir.
