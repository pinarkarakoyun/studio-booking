# Pilates Stüdyosu Rezervasyon Sistemi: Proje Günlüğü

Bu dosya, projede ne yaptığımızı ve neden yaptığımızı sade bir dille anlatır. Her önemli adımdan sonra en alta yeni bir kayıt eklenir. Birkaç hafta sonra dönüp okuduğunda "neredeydik, neden böyle karar verdik" sorusunun cevabını burada bulabilirsin.

---

## 1. Proje nedir?

Mahalledeki bir Pilates stüdyosu için, telefondan rahat kullanılan bir web uygulaması.

- Müşteri sabit grubuna gider. Bir gün gelemezse, başka bir dersteki boş yere **telafi** kaydı yapar.
- Stüdyo sahibi grupları, müşterileri ve doluluğu tek yerden yönetir.
- Yanında stüdyoyu tanıtan basit, herkese açık bir sayfa vardır.

**Amaç:** Hem gerçek bir stüdyonun işine yarayacak bir sistem yapmak, hem de portfolyoya koyulacak, uçtan uca bir proje geliştirmeyi öğrenmek.

**Çalışma şeklimiz:** Önce düşünüp karar veriyoruz, sonra küçük adımlarla kod yazıyoruz. Her adımda ne yaptığımızı bu günlüğe ekliyoruz.

---

## 2. Aşama 0-1: Gereksinim analizi (tamamlandı, 18 Ekim 2026)

Kod yazmadan önce sistemin nasıl çalışacağını konuşup karara bağladık.

### 2.1 En önemli fikir: Grup ve Ders ayrı şeylerdir

| Kavram | Örnek | Ne işe yarar |
|---|---|---|
| **Grup** | "Pzt-Çar-Cum 09:00 grubu" | Müşterinin sabit üyeliği |
| **Ders** | "20 Ekim Pazartesi 09:00 dersi" | O tarihte yapılan tek ders |

Kapasite, doluluk, iptal ve telafi her zaman **tek bir ders** üzerinden hesaplanır.

Doluluk kaydedilmez, **hesaplanır**:

> O dersteki kişi sayısı = grubun normal üyeleri (dondurulmuşlar hariç) − o ders için iptal edenler + o ders için telafi yapanlar

### 2.2 Telafi nasıl çalışır?

- Telafi, ayrı bir "telafi dersi" demek değildir. **Boş yeri olan herhangi bir derse** yapılan kayıttır.
- Telafi yapan kişinin normal grubu değişmez.
- Müşteri bir dersi iptal ederse **1 telafi hakkı** doğar.
- Hak, yöneticinin belirlediği gün sayısı içinde kullanılmazsa yanar.
- Telafi, iptal edilen dersten önceki veya sonraki bir derse yapılabilir.
- Aynı günde iki farklı derse gelmek serbesttir. Aynı derse iki kez kayıt olunamaz.

### 2.3 Kullanıcılar

| Rol | Neler yapar |
|---|---|
| **Müşteri** | Giriş yapar, grubunu ve yaklaşan derslerini görür, dersi iptal eder, telafi seçer |
| **Yönetici** (stüdyo sahibi, aynı zamanda eğitmen) | Müşteri ve grupları yönetir, üyelik dondurur, kuralları ayarlar |

İlk sürümde ayrı bir "eğitmen" rolü yok.

### 2.4 Hesaplar nasıl açılır?

- "Kayıt Ol" ekranı **yok**. Hesapları yalnızca yönetici açar (ad, soyad, telefon numarası).
- Giriş: telefon numarası + şifre. Telefon numarası herkeste farklı olmalı.
- Yönetici geçici bir şifre verir. Müşteri ilk girişte kendi şifresini belirler.
- Şifre unutulursa yönetici yeni geçici şifre verir.

### 2.5 Müşteri durumları

| Durum | Giriş yapabilir mi? | Rezervasyon yapabilir mi? |
|---|---|---|
| Aktif | Evet | Evet |
| Dondurulmuş | Evet | Hayır |
| Ayrıldı | Hayır | Hayır |

- Müşteri **silinmez**, durumu değişir (geçmiş kayıtlar bozulmasın, geri dönene hesabı hazır olsun diye).
- Dondurmayı yalnızca yönetici yapar. Dondurmanın bitiş tarihi olmak zorunda değil.
- Dondurulmuş müşterinin yeri boşalır. Bu dönemde kaçırdığı derslerden telafi hakkı doğmaz.
- Müşteri "ayrıldı" olunca gelecekteki rezervasyonları iptal edilir. Yönetici önce "3 rezervasyon iptal edilecek, onaylıyor musun?" sorusunu görür.
- Dondurma çözülürken eski grup doluysa sistem yöneticiyi **uyarır**. Karar yöneticide.
- Grup değiştirmeyi yalnızca yönetici yapar.

### 2.6 Yöneticinin ayarlayabileceği kurallar

Her stüdyonun kuralı farklı olabileceği için bunlar kodun içine yazılmaz, yönetici panelinden ayarlanır:

- Telafi hakkının geçerlilik süresi (örnek: 7 gün)
- Dersten kaç saat öncesine kadar iptal edilebilir
- Telafi iptal edilirse hak geri gelsin mi
- Aylık en fazla telafi sayısı (isteğe bağlı)
- Stüdyo adı, logo, renk, çalışma saatleri

### 2.7 Web sitesi

- **Tanıtım sayfası (herkese açık):** Tek, aşağı kaydırılan bir sayfa. Stüdyo tanıtımı, sistem nasıl çalışır, fotoğraflar, çalışma günleri, iletişim, WhatsApp butonu, "Üye Girişi" butonu. İçeriği sabittir.
- **Ders programı herkese açık değildir.** Yalnızca giriş yapan müşteriler görür. Böylece programı elle güncellemek gerekmez.
- **Uygulama paneli:** Müşteri ve yönetici girişinden sonra açılan kısım. Telefonda "ana ekrana ekle" ile uygulama gibi açılması (PWA) ilk sürümden sonra eklenecek.

### 2.8 İlk sürümde YOK (sonraya bıraktıklarımız)

Online ödeme, WhatsApp/SMS hatırlatma, bekleme listesi, müşterinin kendi kendine kayıt olması, müşterinin grup değiştirme talebi, eğitmen rolü, raporlar, birden fazla stüdyo ekranları, mobil uygulama.

### 2.9 Çoklu stüdyo kararı

Ürünü **genel** yapacağız, sonra stüdyoya göre kişiselleştireceğiz. Veritabanında en başta bir "stüdyo" kaydı olacak (şimdilik tek stüdyo). Birden fazla stüdyonun aynı sistemde çalışması ilk sürümde yok, çünkü güvenlik tarafı çok daha zor. Önce tek stüdyoda çalıştıracağız.

---

## 3. İş kuralları listesi (güncel)

| Kod | Kural |
|---|---|
| BR-01 | Müşterinin tek bir normal grubu olur (grup haftada 2 veya 3 gün olabilir) |
| BR-02 | Bir dersin kapasitesi aşılamaz (normal üyeler + telafiler) |
| BR-03 | Telafi, müşterinin normal grubunu değiştirmez |
| BR-04 | Geçmiş bir derse kayıt yapılamaz |
| BR-05 | Müşteri aynı derse iki kez kayıtlı olamaz |
| BR-06 | Dersi iptal edince 1 telafi hakkı doğar |
| BR-07 | Telafi hakkı ayarlı süre içinde kullanılmazsa yanar |
| BR-08 | İptal, dersten ayarlı saat öncesine kadar yapılabilir |
| BR-09 | Kurallar yönetici tarafından ayarlanır, kodda sabit değildir |
| BR-10 | Üyeliği yalnızca yönetici dondurur ve çözer |
| BR-11 | Dondurmanın başlangıç tarihi vardır, bitiş tarihi boş olabilir |
| BR-12 | Dondurulmuş müşteri kapasiteyi doldurmaz ve telafi yapamaz |
| BR-13 | Dondurma süresindeki dersler için telafi hakkı doğmaz |
| BR-14 | Müşteri silinmez, durumu aktif / dondurulmuş / ayrıldı olarak tutulur |
| BR-15 | Grup değişimini yalnızca yönetici yapar |
| BR-16 | Dondurma çözülürken eski grup doluysa sistem yöneticiyi uyarır |
| BR-17 | Stüdyo ayarları (isim, logo, renk, kurallar) yönetici tarafından değiştirilir |
| BR-18 | Hesapları yalnızca yönetici açar |
| BR-19 | Giriş telefon numarası + şifre ile yapılır, telefon numarası benzersizdir |
| BR-20 | İlk şifre geçicidir, müşteri ilk girişte değiştirmek zorundadır |
| BR-21 | Unutulan şifreyi yönetici sıfırlar |
| BR-22 | Aktif ve dondurulmuş müşteri giriş yapar, ayrılan yapamaz |
| BR-23 | Müşteri "ayrıldı" olunca gelecek rezervasyonları, yönetici onayıyla iptal edilir |
| BR-24 | Ders programı ve doluluk yalnızca giriş yapanlara görünür |
| BR-25 | Tanıtım sitesi herkese açık ve sabit içeriklidir |

---

## 4. Henüz netleşmeyenler

- Stüdyonun gerçek telafi kuralları (kaç gün, kaç saat önce iptal). Teyzenden veya stüdyo sahibinden öğrenilecek. Sistem ayarlanabilir olduğu için bu bilgi geç gelse de sorun olmaz.
- Telafi hakkı süresinin tam formülü (iptal edilen dersten önce ve sonra kaç gün).
- Stüdyonun kaç grubu var, bir grupta kaç kişi olabiliyor.

---

## 5. Küçük sözlük

| Terim | Sade anlamı |
|---|---|
| Veritabanı (database) | Bilgilerin düzenli saklandığı büyük bir dijital defter |
| API | Ekran (ön yüz) ile veritabanı (arka yüz) arasında konuşan aracı |
| Yarış durumu (race condition) | İki kişinin aynı anda son boş yere basması, sistemin yanlışlıkla ikisini de kabul etmesi riski |
| Soft delete (yumuşak silme) | Bir kaydı gerçekten silmeyip "pasif" olarak işaretlemek |
| Ayarlanabilir kural (configurable rule) | Kodu değiştirmeden panelden değiştirilebilen kural |
| Çoklu stüdyo (multi-tenant) | Tek sistemde birçok stüdyonun verisini birbirinden ayrı tutmak |
| PWA | Web sitesinin telefonda ana ekrana eklenip uygulama gibi açılması |

---

## 6. Günlük kayıtları

### 18 Ekim 2026: Planlama
- Projenin amacı, kullanıcılar, iş kuralları ve MVP kapsamı konuşuldu.
- Tüm kararlar bu dosyada toplandı.
- **Sıradaki adım:** GitHub'da proje deposunu (repository) oluşturmak ve bu günlüğü ilk dosya olarak yüklemek.
