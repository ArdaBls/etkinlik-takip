# Etkinlik Takip — yerel taslak

Bu sürüm, çocuk evlerinin etkinliklerinin kişi bilgisi içermeden kaydedilmesi için hazırlanmış statik ön yüz taslağıdır.

## Yerelde açma

`index.html` dosyasını tarayıcıda açmak yeterlidir. Excel indirme işlevi için internet bağlantısı gerekir; bu işlev SheetJS'nin tarayıcı sürümünü kullanır.

Taslakta oluşturulan kayıtlar yalnızca o tarayıcının `localStorage` alanında tutulur. Gerçek kullanıcı, yetki ve ortak veri erişimi henüz yoktur.

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

## Firebase'e geçerken

Firebase yapılandırması bu repoya eklenmeden önce proje açılmalı ve yönetici kullanıcı belirlenmelidir. Firestore'da kişi bazlı çocuk verisi içeren bir koleksiyon oluşturulmayacaktır. Önerilen tek veri koleksiyonu `eventRecords` olup her kayıtta yalnızca şunlar bulunur:

- tarih, çocuk evi, etkinlik türü/adı/yeri/saatleri
- genel açıklama notu
- kayıt oluşturma ve güncelleme zamanları

Firebase Authentication ile yalnızca tek ev sorumlusu giriş yapacak ve tüm kayıtları, çocuk evlerini ve raporları yönetebilecektir. Bu yetkilendirme yalnızca arayüzde değil, Firestore kurallarında da zorunlu kılınmalıdır.

Ev sorumlusu fotoğrafı yerel taslakta sıkıştırılmış base64 veri URL'si olarak tutulur. Firebase'e geçerken çocuk evlerine sabit bir `homeId` verilmeli; profil fotoğrafı da `homeProfiles/{homeId}` altında saklanmalıdır. Ev adı değişiklikleri ev, profil ve etkinlik kayıtlarını birlikte güncelleyen bir transaction/batch ile yapılmalıdır.
