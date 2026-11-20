# Seans Paketi ve Üyelik Modeli: Tasarım

**Tarih:** 20 Kasım 2026
**Durum:** İnceleme bekliyor
**Yol haritası:** 3. adım (`docs/superpowers/specs/2026-11-18-roadmap-and-decisions.md`)

## Amaç

Bazı stüdyolar aylık üyelik yerine seans paketi satıyor (ör. 12 seans). Paketli üyenin de sabit bir grubu var ve tıpkı bugünkü gibi yalnızca gelemeyeceği zaman işaret koyuyor. İki model arasındaki gerçek fark iki şey:

| | Grup + telafi (bugün) | Seans paketi (yeni) |
|---|---|---|
| Üyelik neyle biter | Tarihle (1 ay, 3 ay) | Seans sayısıyla (+ bir geçerlilik süresi) |
| Kaçırılan ders | Telafi hakkı doğar, başka bir derse yazılır | Harcanmaz; paket kendiliğinden uzar |

Her stüdyo bu iki modelden birini kullanır. Model stüdyo açılırken seçilir, yönetici değiştiremez (kullanım sırasında değişirse eski kayıtlar anlamsızlaşır).

**Başarı ölçütleri:**

1. Paketli stüdyoda yönetici paket tanımlar, üyeye paket satar, ödemeleri kaydeder.
2. Kalan seans, yoklama alınmasa bile doğru düşer.
3. Üye kendi ekranında kalan seansını, son tarihini ve (stüdyo izin verirse) ödemelerini görür.
4. Paketi biten üye engellenmez; yönetici Ödemeler'de uyarılır, paketsiz gelinen dersler yeni paketten düşer.
5. Grup + telafi kullanan stüdyolarda (ör. ilk stüdyo) hiçbir şey değişmez.

## Alınan kararlar (Pınar)

| Konu | Karar |
|---|---|
| Paketli üyenin grubu | Var; derslerine grubundan gelir, her ders için "geleceğim" demez |
| Seans ne zaman düşer | Derse gelince |
| Yoklama | Var. İşaretlenmeyen "geldi" sayılır; yönetici yalnızca gelmeyenleri işaretler |
| Paket bitince | Üye gelebilir; yönetici uyarılır; paketsiz dersler yeni paketten düşer |
| Ödeme | Online ödeme yok; yönetici kaydeder; üye kendi ödemelerini görür (mevcut "Üyeler ödeme bilgisini görsün" ayarıyla) |
| Model | Kurulumda seçilir, panelden değiştirilemez |
| Yapım yolu | A: paket, mevcut üyelik döneminin bir türü |

## Yaklaşımlar

- **A (seçildi): Paket, mevcut üyelik döneminin (`memberships`) bir türü.** Döneme "seans sayısı" eklenir. Ödemeler, Ödemeler ekranı, üyenin ödeme bilgisi ve dondurma uzaması olduğu gibi kullanılır. Kalan seans saklanmaz, hesaplanır (doluluk gibi).
- **B: Ayrı paket sistemi.** Ayrı tablolar, ayrı ödemeler, her düşen seans için kayıt. Her seansın hangi paketten düştüğü görünür ama Ödemeler, üye ödeme bilgisi ve dondurmanın ikinci bir kopyası yazılır; iş iki kat, iki sistem zamanla ayrışabilir.

## Kapsam dışı

- Gruba bağlı olmayan ("istediğin derse gel") paketler
- Özel (birebir) ders. Not: Pınar'ın fikri "eğitmenin özel ders saatleri, üye oradan seçer"; ihtiyaç Tua'ya sorulacak, eğitmen rolüyle (6. adım) birlikte düşünülür
- Online ödeme
- Sitede paket fiyatları (5. adım)
- Bir stüdyonun modelini sonradan değiştirmek
- Paket modelinde telafi (kaçırılan ders zaten harcanmıyor)

## Veritabanı

Yeni migration: `016_session_packages.sql`.

**`studio_settings`**
- `membership_model text NOT NULL DEFAULT 'group' CHECK (membership_model IN ('group', 'package'))`. Mevcut bütün stüdyolar `group` olur.
- `late_cancel_burns_session boolean NOT NULL DEFAULT true`: paket modelinde geç iptal edilen seans düşsün mü.

**`packages`** (paket kataloğu)
- `id`, `studio_id` (zorunlu), `name` (2–60 karakter), `session_count` (1–200), `price_kurus` (≥ 0), `validity_days` (1–365), `is_active` (varsayılan true), `created_at`.
- Silinmez, kapatılır (satılmış paketler adını korusun diye ad zaten döneme kopyalanır; kapatma yalnızca yeni satışı engeller).

**`memberships`** (mevcut tabloya ek)
- `session_count integer NULL CHECK (session_count > 0)`: doluysa bu dönem bir paket.
- `package_name text NULL`: satış anındaki paket adı (kopya).
- Paket döneminde `starts_on` paketin başladığı gün, `ends_on` = `starts_on + validity_days - 1` (geçerlilik bitişi). `fee_kurus` satış anındaki fiyat (kopya). Katalog sonradan değişse de satılmış paket değişmez.
- Mevcut çakışma kuralı (aynı üyenin iki dönemi çakışamaz) paketlerde de geçerli.

**`attendance`** (yoklama: yalnızca "gelmedi" işaretleri)
- `session_id`, `user_id` (birincil anahtar ikisi birlikte), `marked_at`, `marked_by` (yönetici).
- Satır yoksa üye "geldi" sayılır.

## Seansın düşmesi (paket modeli)

Bir ders, üye için şu koşulların hepsi tutuyorsa **düşen seans** sayılır:

1. Ders, üyenin o tarihte üyesi olduğu grubun dersi (mevcut `group_members` tarih kuralı) ya da üye bu derse yönetici tarafından eklenmiş (mevcut "derse kişi ekle" kaydı).
2. Ders bitti (`starts_at + süre <= şimdi`) ve stüdyo tarafından iptal edilmedi.
3. Üye o tarihte dondurulmuş değil.
4. Üye dersi iptal etmediyse → düşer (geldi ya da yoklamada "gelmedi" işaretli; ikisi de düşer).
5. Üye dersi iptal ettiyse: son iptal saatinden önce → düşmez; sonra (geç iptal) → `late_cancel_burns_session` açıksa düşer.

| Durum | Düşer mi? |
|---|---|
| Geldi / yoklamada işaretlenmedi | Evet |
| Haber vermedi, yoklamada "gelmedi" | Evet |
| Son iptal saatinden önce "Gelemiyorum" | Hayır |
| Geç "Gelemiyorum" | Ayara göre |
| Stüdyo dersi iptal etti | Hayır |
| Üye dondurulmuş | Hayır |

**Not (Pınar'ın kararı, 20 Kasım):** Bu kurallarla yoklamadaki "gelmedi" işareti seans sayısını değiştirmez (gelen de haber vermeden gelmeyen de düşer). Yoklama ilk sürümde yalnızca kayıttır: yönetici kimin gelmediğini görür, eğitmen rolü (6. adım) bunun üzerine kurulur. Gerekçe: haber vermeden gelmemek, geç iptalden daha avantajlı olmamalı.

**Seansların paketlere dağılımı:** Üyenin düşen seansları zaman sırasıyla paketlerine dağıtılır. Her ders, başlangıcı o dersten önce ya da aynı gün olan, son tarihi geçmemiş ve hâlâ boş yeri olan en eski pakete yazılır. Hiçbir pakete sığmayan dersler **paketsiz** sayılır ve üyenin bir sonraki paketine (başlangıç tarihinden bağımsız olarak) önce onlar yazılır. Son tarihi geçen paketin kalan seansları yanar.

**Hesaplanan bilgiler** (saklanmaz): her paket için kullanılan, kalan, yanan; üye için paketsiz ders sayısı.

## İptal (paket modeli)

- İptal bugünkü gibi bir `credits` satırı ile tutulur (doluluk hesabı buna bakıyor). Paket modelinde bu satır **telafiye kullanılamaz**: oluşturulurken `forfeited_at` doldurulur. Böylece `session_occupancy` görünümü değişmeden çalışır.
- Paket modelinde iptal, ders başlayana kadar yapılabilir. Son iptal saatinden sonra yapılan iptal "geç iptal" sayılır (iptal anı ile dersin son iptal saati karşılaştırılır).
- Grup modelinde iptal kuralları değişmez (son iptal saatinden sonra iptal yok).
- Paket modelinde telafi uçları (`PUT /api/sessions/:id/makeup`, `swap`) `409 MAKEUP_NOT_AVAILABLE` döner; "İptali geri al" ders başlayana kadar kullanılabilir (seans düşmez hâle geri döner).

## Sunucu

| Uç / yer | Değişiklik |
|---|---|
| `GET/POST /api/admin/packages`, `PUT /api/admin/packages/:id`, `POST .../close`, `.../reopen` | Paket kataloğu (yalnızca paket modelinde; grup modelinde `404 NOT_AVAILABLE_FOR_MODEL`) |
| `POST /api/admin/customers/:id/memberships` | Paket modelinde gövde `{ packageId, startsOn }` (fiyat ve seans katalogdan kopyalanır, isteğe bağlı fiyat değişikliği `feeKurus`); grup modelinde bugünkü gibi |
| Üyelik dönemi yanıtları | Paketlerde `sessionCount`, `packageName`, `used`, `remaining`, `burned` |
| `GET /api/admin/payments` | Paket modelinde yeni liste `packageFinished` (kalan 0 ya da son tarihi geçmiş, yenisi yok; paketsiz ders sayısıyla) |
| `GET /api/admin/sessions/:id` (katılımcı listesi) | Her üyede `absent: boolean`; ders başladıktan sonra |
| `PUT/DELETE /api/admin/sessions/:id/attendance/:userId` | "Gelmedi" işaretle / kaldır (ders başlamış olmalı) |
| `/api/me/membership` | Pakette kalan seans, son tarih, paketsiz ders sayısı |
| Ayarlar | `membershipModel` (salt okunur), `lateCancelBurnsSession` (yalnızca paket modelinde) |
| `/api/studio` | `membershipModel` (istemci ekranları buna göre gösterir) |
| `create-admin` | Yeni stüdyo için `--model paket` seçeneği; varsayılan grup. Mevcut stüdyoya eklemede yok sayılır |
| `seed:dev` | Demo dosyası `membershipModel` ve `packages` verebilir |

Bütün yeni `:id` uçları veri ayrımı matrisine eklenir; gövdedeki `packageId` başka stüdyonunsa `404`.

## İstemci

Görsel yenileme yok (4. adım); mevcut bileşenler.

| Ekran | Paket modeli | Grup modeli |
|---|---|---|
| Ayarlar | "Paketler" bölümü (liste, ekle, düzenle, kapat/aç); "Geç iptalde seans yansın"; telafi ayarları gizli; "Üyelik modeli: Seans paketi" (yazı) | Bugünkü gibi; "Üyelik modeli: Grup + telafi" (yazı) |
| Müşteri detayı | "Paket ekle" (katalogdan seç, başlangıç tarihi); her pakette kalan/kullanılan; "Telafi hakkı ver" gizli | Bugünkü gibi |
| Ödemeler | "Paketi bitti" listesi | Bugünkü gibi |
| Ders detayı (katılımcılar) | Ders başladıktan sonra her üyede "Gelmedi" anahtarı | Aynı anahtar (yoklama iki modelde de kayıt olarak işe yarar) |
| Derslerim (üye) | "Paketin: 12 seans · 7 kaldı · son tarih 15 Ocak"; geç iptalde "Bu seans düşecek" uyarısı; "Telafi seç" yok | Bugünkü gibi |

## Hata davranışı

| Durum | Sonuç |
|---|---|
| Grup modelinde paket uçları | `404 NOT_AVAILABLE_FOR_MODEL` |
| Paket modelinde telafi/swap | `409 MAKEUP_NOT_AVAILABLE` |
| Kapalı paketle satış | `400 PACKAGE_CLOSED` |
| Başka stüdyonun paketi | `404 PACKAGE_NOT_FOUND` |
| Henüz başlamamış derste yoklama | `409 SESSION_NOT_STARTED` |
| Ayar PUT'unda `membershipModel` gönderilirse | Yok sayılır |

## Testler

- Migration: mevcut stüdyolar `group`; `session_count` ve paket kuralları.
- Seans düşme kuralları: tablodaki her satır için ayrı test; yoklama alınmasa da düşme; dondurma; stüdyo iptali; geç iptal ayarı açık/kapalı.
- Dağılım: iki ardışık paket; ilk paketin son tarihi geçince kalanın yanması; paketsiz dersin yeni paketten düşmesi.
- İptal: paket modelinde geç iptal mümkün, telafi hakkı kullanılamaz; grup modelinde değişiklik yok.
- Grup modelinde paket uçları kapalı; paket modelinde telafi kapalı.
- Ödemeler'de "Paketi bitti"; üye ekranında kalan seans; ödeme bilgisi ayarı.
- Veri ayrımı: yeni uçlar matriste; gövdede başka stüdyonun `packageId`'si.
- Tarayıcı: paketli demo ve mevcut grup demosu, telefon ve masaüstü.

## Bilinen sınırlamalar

- Yoklamadaki "gelmedi" işareti seans sayısını değiştirmez (yukarıdaki not).
- Hangi seansın hangi paketten düştüğü saklanmaz; her seferinde hesaplanır. Paket sayısı küçük olduğu için performans sorunu beklenmez.
- Model sonradan değiştirilemez.

## Uygulayıcıya bırakılanlar

- Dağılım hesabının SQL mi JavaScript mi olacağı (davranış yukarıdaki kurala uymalı).
- Paket formunun ve "Paketler" bölümünün düzeni (Şubeler bölümüyle aynı desen).
- Hata mesajlarının tam Türkçe metni.
