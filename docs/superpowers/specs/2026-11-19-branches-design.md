# Şubeler: Tasarım

**Tarih:** 19 Kasım 2026
**Durum:** İnceleme bekliyor
**Yol haritası:** 2. adım (`docs/superpowers/specs/2026-11-18-roadmap-and-decisions.md`)

## Amaç

Bir stüdyonun birden çok şubesi olabilir (örnek: iki şubeli bir pilates stüdyosu). Bugün şube kavramı yok; şube bilgisi grup adlarının içine yazılıyor ("Konyaaltı · Sabah"). Bu adım şubeleri sisteme tanıtır: her grup bir şubeye ait olur, yönetici şubeleri panelden yönetir, üye derslerin hangi şubede olduğunu görür.

**Başarı ölçütleri:**

1. Yönetici panelden şube ekler, bilgilerini düzenler, kullanılmayan şubeyi kapatır.
2. Her grup tam olarak bir şubeye aittir; bir grubun şubesi başka bir stüdyonun şubesi olamaz (veritabanı düzeyinde).
3. Çok şubeli stüdyoda yönetici "Bugün" ekranında şubeye göre süzebilir; üye derslerin yanında şube adını görür.
4. "Diğer şubelerde telafi" ayarı kapalıyken üye başka şubenin dersine telafi yazdıramaz; bu kural sunucuda uygulanır.
5. Tek şubeli stüdyoda (ör. ilk stüdyo) arayüzde hiçbir şube izi görünmez; bugünkü davranış aynen sürer.

## Alınan kararlar

| Konu | Karar (Pınar) | Gerekçe |
|---|---|---|
| Üyenin şubesi | Grubundan gelir; üyeye ayrı şube alanı yok | Aynı bilgi iki yerde tutulursa biri güncellenmeyi unutur |
| Telafide diğer şube | Stüdyo ayarı: "Üyeler diğer şubelerdeki derslere telafiye gelebilir"; varsayılan **açık** | Üyeler genelde tek şubeye gidiyor ama bunu yönetici bilir; açık varsayılan bugünkü davranışı korur |
| Yönetim | Tek yönetici bütün şubeleri yönetir | Şube sorumlusu ihtiyacı bilinmiyor; ilk sürüm basit kalır |
| Şube bilgileri | Ad, adres, harita bağlantısı panelde; site kendiliğinden güncellenir | Şubenin bilgisi tek yerde; yönetici yeni şubeyi kendisi açabilir |
| Fiyat, eğitmen, WhatsApp | Şubeye bağlanmaz | Şubeler arasında aynı |
| Şube silme | Silinmez, kapatılır; açık grubu olan şube ve son açık şube kapatılamaz | Geçmiş derslerin şubesi kaybolmasın |
| Yapım yolu | A: şube tablosu, dersin şubesi gruptan okunur | Aşağıda "Yaklaşımlar" |

## Yaklaşımlar

- **Elendi: şube grubun metin alanı.** Adres, harita, kapatma ve süzme için şubenin kendi kaydı gerekiyor.
- **A (seçildi): `branches` tablosu + `groups.branch_id`.** Dersin şubesi her zaman grubundan okunur. Bedeli: grubun şubesi değişirse geçmiş dersleri de yeni şubede görünür. Rapor ekranı olmadığı için pratikte fark edilmez.
- **B: şube derse de yazılır (`sessions.branch_id`).** Geçmiş doğru kalır, şube değişikliği tarihten itibaren uygulanır. Bedeli: iş yaklaşık iki katı; telafi, doluluk, "Bugün" ve veri ayrımı testleri dersin şubesine bakacak şekilde değişir, iki kaynak tutarsızlaşabilir. Rapor gelirse A'dan B'ye geçilebilir (sütun eklenir, geçmiş o günkü gruptan doldurulur).

## Kapsam dışı

- Şube sorumlusu ve şubeye göre yetki (gerekirse eğitmen rolüyle, 6. adım)
- Şubeye göre fiyat, eğitmen, WhatsApp hattı
- Geçmiş derslerin şubesini sabitlemek (yaklaşım B)
- Müşteriler ve Ödemeler listelerinde şube filtresi (yalnızca şube adı gösterilir)
- Şube silme (yalnızca kapatma)
- Görsel yenileme: yeni alanlar mevcut bileşenlerle eklenir; tasarım 4. adımda

## Tanım: "çok şubeli stüdyo"

Açık şube sayısı 1'den fazla olan stüdyo. Arayüzdeki bütün şube öğeleri (seçimler, şube adları, filtre, telafi ayarı) yalnızca çok şubeli stüdyoda görünür. Kapalı şubeler sayılmaz: iki şubeden biri kapatılırsa stüdyo tekrar "tek şubeli" görünür.

## Veritabanı

Yeni migration: `014_branches.sql`.

**`branches`**

| Sütun | Kural |
|---|---|
| `id` | kimlik |
| `studio_id` | `NOT NULL`, `studios`'a bağlı |
| `name` | `NOT NULL`, 2–60 karakter (boşluklar sadeleştirilir) |
| `address` | isteğe bağlı metin, en fazla 300 karakter |
| `maps_url` | isteğe bağlı; yalnızca `https://` ile başlayan bağlantı (`CHECK`) |
| `is_active` | `NOT NULL DEFAULT true` |
| `created_at` | |

- Aynı stüdyoda aynı ad iki kez olamaz: `(studio_id, lower(name))` üzerinde benzersiz index (kapalı şubeler dahil, karışıklık olmasın).
- `UNIQUE (id, studio_id)`: birleşik yabancı anahtar için.

**`groups.branch_id`**

- Önce boş olabilir eklenir; her stüdyoya **"Merkez"** adında bir şube açılır ve o stüdyonun bütün grupları ona bağlanır; ardından `NOT NULL`.
- Birleşik yabancı anahtar: `FOREIGN KEY (branch_id, studio_id) REFERENCES branches (id, studio_id)`. Bir grup başka stüdyonun şubesine bağlanamaz; hiçbir yol bunu aşamaz.

**`studio_settings.makeup_other_branches`**: `boolean NOT NULL DEFAULT true`.

**İlk şube:** Stüdyo açan her yol (`create-admin`, `seed:dev`, test yardımcısı `createStudio`) stüdyoyla birlikte "Merkez" şubesini de açar. `seed:dev`'deki demo dosyası şube listesi verebilir (`branches: [{ name, address? }]`, grupların `branch` alanı); verilmezse tek şube.

## Sunucu

### Şube uçları (yalnızca yönetici)

| Uç | Davranış |
|---|---|
| `GET /api/admin/branches` | Stüdyonun bütün şubeleri (açık ve kapalı), her birinin açık grup sayısıyla |
| `POST /api/admin/branches` | Yeni şube: `{ name, address?, mapsUrl? }` |
| `PUT /api/admin/branches/:id` | Ad, adres, harita bağlantısı |
| `POST /api/admin/branches/:id/close` | Kapatır. Açık grubu varsa `409 BRANCH_HAS_GROUPS` (grup adlarıyla); son açık şubeyse `409 LAST_BRANCH` |
| `POST /api/admin/branches/:id/reopen` | Yeniden açar |

Başka stüdyonun şube kimliği: `404 BRANCH_NOT_FOUND`. Yeni `:id` uçları veri ayrımı test matrisine eklenir (mevcut "her :id ucu matriste" testi bunu zorunlu kılar).

### Gruplar

- Grup oluşturma ve düzenleme `branchId` alır. Stüdyonun tek açık şubesi varsa `branchId` verilmeyebilir; o şube kullanılır. Çok şubeli stüdyoda zorunludur.
- Şube aynı stüdyonun **açık** şubesi olmalı; değilse `404 BRANCH_NOT_FOUND` (kapalı şube için `400 BRANCH_CLOSED`).
- Düzenlemede şube değişikliği hemen uygulanır (yaklaşım A); önizleme (`preview`) ekranında "Şube: Konyaaltı → Kepez" satırı görünür.
- Grup yanıtlarına `branch: { id, name }` eklenir.

### Yönetici listeleri

- "Bugün" ve gün ekranı: her derse `branch: { id, name }`. Süzme istemcide yapılır (bir günün ders sayısı küçük).
- Müşteri listesi ve detayı, Ödemeler: üyenin bugünkü grubunun şubesi (`branchName`; grupsuzsa `null`).

### Ayarlar

- `makeupOtherBranches` (boolean) ayarlara eklenir. Mevcut ayarların hiçbiri değişmez.
- Ayar yanıtına `branchCount` (açık şube sayısı) eklenir; istemci ayarı ve "Şubeler" bölümünü buna göre gösterir.

### Üye tarafı

- Ders yanıtlarına (`/api/me/sessions`, `/api/sessions`) `branchName` eklenir.
- **Üyenin şubesi:** dersin tarihinde üyesi olduğu grubun şubesi (`group_members` tarih aralığına göre, mevcut `is_member` mantığıyla aynı).
- `makeupOtherBranches` kapalıyken:
  - `/api/sessions` (telafi listesi) yalnızca üyenin şubesindeki dersleri döndürür. Grubu olmayan üye (ör. yalnızca telafiye gelen) bütün şubeleri görür.
  - **Sunucu da reddeder:** başka şubedeki derse telafi (`PUT /api/sessions/:id/makeup`) ve "bunun yerine şuna gel" (`swap`) `409 OTHER_BRANCH` ("Bu ders başka bir şubede.") alır. Listeden gizlemek yetmez; istek elle de gönderilebilir.
- Açıkken: bütün şubeler listelenir; aynı gün içinde üyenin kendi şubesinin dersleri önce gelir.
- **Yönetici bu kurala takılmaz:** "Derse kişi ekle" ile bir üyeyi başka şubenin dersine ekleyebilir. Ayar, üyenin kendi başına yaptığı telafiyi sınırlar; yönetici istisna yapabilmeli.

### Tanıtım sitesi ve stüdyo bilgisi

- `/api/site` yanıtına `branches: [{ name, address, mapsUrl }]` (yalnızca açık şubeler, oluşturulma sırasıyla).
- **Geçiş kuralı:** Hiçbir açık şubenin adresi dolu değilse site bugünkü gibi `site.json`'daki `address`'i gösterir. Bir şubenin adresi doldurulduğunda şube adresleri kullanılır.
- `/api/studio` yanıtına `branchCount` eklenir (üye ekranları şube adını göstermeye buna göre karar verir).

## İstemci

Görsel yenileme yok; mevcut bileşenler kullanılır.

| Ekran | Değişiklik (yalnızca çok şubeli stüdyoda görünür, "Şubeler" bölümü hariç) |
|---|---|
| Ayarlar | Yeni "Şubeler" bölümü: liste, ekle, düzenle (ad, adres, harita bağlantısı), kapat/aç. Tek şubede de görünür (ikinci şubeyi açmak için). "Diğer şubelerde telafi" anahtarı yalnızca çok şubede |
| Grup formu | "Şube" seçimi (yalnızca açık şubeler) |
| Gruplar listesi, grup detayı | Şube adı |
| Bugün / gün ekranı | Her derste şube adı; üstte "Tüm şubeler / <şube>…" seçimi |
| Müşteriler, müşteri detayı, Ödemeler | Şube adı |
| Derslerim, telafi listesi | Her derste şube adı |
| Tanıtım sitesi "Bize ulaş" | Her açık şube: ad, adres, "Haritada aç". Tek şubede şube adı yazmaz |

## Hata davranışı

| Durum | Sonuç |
|---|---|
| Başka stüdyonun şube kimliği (uçta ya da grup gövdesinde) | `404 BRANCH_NOT_FOUND`, hiçbir veri değişmez |
| Kapalı şubeye grup bağlama | `400 BRANCH_CLOSED` |
| Açık grubu olan şubeyi kapatma | `409 BRANCH_HAS_GROUPS`, grup adlarıyla |
| Son açık şubeyi kapatma | `409 LAST_BRANCH` |
| Aynı adlı ikinci şube | `409 BRANCH_NAME_TAKEN` |
| Geçersiz harita bağlantısı (`https://` değil) | `400 INVALID_MAPS_URL` |
| Ayar kapalıyken başka şubede telafi ya da swap | `409 OTHER_BRANCH` |

## Testler

- **Migration:** Mevcut stüdyolara "Merkez" açılır, bütün gruplar bağlanır; başka stüdyonun şubesine grup bağlamak veritabanında reddedilir; ad benzersizliği; `maps_url` kuralı.
- **Şube uçları:** ekle, düzenle, kapat (açık grup ve son şube kuralları), yeniden aç.
- **Gruplar:** tek şubede `branchId`'siz oluşturma; çok şubede zorunluluk; kapalı ve başka stüdyonun şubesi reddedilir; şube değişikliği.
- **Telafi kuralı:** ayar açık/kapalı; liste süzmesi; sunucunun `makeup` ve `swap`'ı reddetmesi; grupsuz üye.
- **Yanıtlar:** "Bugün", müşteri, ödeme, üye ders yanıtlarında şube; `/api/site` şube listesi ve `site.json` adresine geri dönüş.
- **Veri ayrımı:** Yeni `:id` uçları matrise eklenir; gövdede başka stüdyonun `branchId`'si (grup oluşturma/düzenleme) "gövdeyle gelen kimlik" testlerine eklenir.
- **İstemci:** tarayıcıda tek şubeli (ilk stüdyo) ve iki şubeli demo stüdyoyla, telefon ve masaüstü genişliğinde.

## Bilinen sınırlamalar

- Bir grubun şubesi değişirse geçmiş dersleri de yeni şubede görünür (yaklaşım A).
- Kapalı şubenin geçmiş dersleri şube adını göstermeye devam eder (kayıt silinmediği için).
- Şube sorumlusu yok; her yönetici bütün şubeleri görür.

## Uygulayıcıya bırakılanlar

- Migration'daki adımların sırası ve index adları.
- "Şubeler" bölümünün form düzeni (mevcut Ayarlar bileşenleriyle).
- Hata mesajlarının tam Türkçe metni (`sen` diliyle, mevcut mesajlara uygun).
- Demo verisinde (`seed:dev`) şube listesinin biçimi.
