# Arayüzü Prototipe Çevirme: Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Üye paneli, yönetici paneli ve tanıtım sitesini Tua prototipinin görünümüne çevirmek; ders takip davranışı değişmeden.

**Architecture:** Önce `index.css`'te anlamlı adlı CSS değişkenleri (eski adlar tek seferde eşlenir), sonra varsayılan krem/zeytin palet ve yazı tipleri, sonra ortak bileşenler (`Toast`, `Button`, `Sheet` …), sonra ekran ekran CSS modülleri. Tanıtım sitesi ayrı PR: önce `/api/site` yeni `site.json` alanlarını okur (testli), sonra site prototipe göre yeniden yazılır.

**Tech Stack:** React 19 + Vite 8, CSS modules, oxlint; Node/Express 5 + PostgreSQL, `node:test`. İstemcide test çalıştırıcı yok: istemci görevleri lint + build + tarayıcıda (test veritabanı) doğrulanır.

**Spec:** `docs/superpowers/specs/2026-11-21-ui-redesign-design.md` (onaylı). Prototip kaynakları (repo dışı): `~/Documents/02 Projeler/studio-booking-notes/prototip/` — `Uye.dc.html`, `Admin.dc.html`, `Main.dc.html`. Ölçüler (boşluk, yazı boyutu, köşe, renk) bu dosyalardaki satır içi stillerden alınır.

## Global Constraints

- Arayüz metinleri Türkçe; açıklamalar Türkçe (teknik terim parantez içinde İngilizce).
- Kodda gerçek stüdyo adı, şehir, kişi adı, alan adı yok; içerik `site.json`'dan.
- Sağlık verisi yok: test cevapları yalnızca tarayıcı belleğinde, hiçbir yere gönderilmez/kaydedilmez, WhatsApp mesajına eklenmez.
- Sunucu davranışı değişmez. Tek istisna PR 2'de `/api/site`'ın yeni alanları okuması. `cd server && npm test` her görevde yeşil.
- Yazı tipleri `@fontsource` paketlerinden (Google Fonts'a istek yok).
- Projede Prettier yok: dosyaları biçimlendirici ile baştan biçimlendirme; mevcut elle yazılmış biçimi koru (istemcide `.jsx` noktalı virgüllü, `main.jsx` noktalı virgülsüz).
- Commit ve push'u Pınar yapar: her görevin sonunda tek tek `git add …` / `git commit -m "…"` komutları verilir. Commit mesajlarında ve PR'da Co-Authored-By ya da Claude adı yok.
- Her görevden sonra repo dışındaki `~/Documents/02 Projeler/studio-booking-notes/PROJE_GUNLUGU.md` günlüğüne sade Türkçe kayıt.
- Tarayıcı denemesi test veritabanında: `.claude/launch.json`'a `DB_NAME=studio_booking_test` ile `server-demo` yapılandırması geçici eklenir, iş bitince dosya geri alınır. Model değiştirmek için test veritabanında `UPDATE studio_settings SET membership_model = 'package' | 'group'`.
- Her ekran telefon (375px) ve masaüstü (1280px), grup ve paket modelinde.
- Dokunma alanı en az 44px (`--tap`); `prefers-reduced-motion: reduce` iken animasyon yok.
- Pınar öğrenmek istiyor: "Pınar yazabilir" işaretli 5–10 satırlık yerleri önce ona öner; "sen yaz" derse yaz.

## Review Focus

1. **Paket modelinde paketi olmayan, seansları bitmiş, son günü geçmiş ya da paketsiz dersi olan üye:** kart çökmez, halka 0'da/boş, metin bugünkü `packageLine` metniyle aynı. → Görev 4 tarayıcı adımı (test veritabanında dört durum).
2. **Uzun metinler 375px'te:** uzun ad soyad (≥ 30 karakter), uzun grup/şube adı, uzun paket adı taşmaz, butonlar alt satıra iner ama kesilmez. → Görev 4, 6, 7 tarayıcı adımları.
3. **Geç iptal uyarısı yalnızca doğru durumda:** paket modeli + son iptal saati geçmiş + `lateCancelBurnsSession = true`. Ayar kapalıyken ya da grup modelinde kırmızı pencere çıkmaz. → Görev 4.
4. **Yan menü eşiği:** 899/900px civarında ve telefon yatayda (812×375) yönetici kabuğu ne yan menü ne alt çubuk eksik kalır; içerik menünün altında kalmaz. → Görev 6.
5. **Bozuk `site.json`:** döngülü ya da olmayan sonuca giden test seçeneği, eşleşmeyen şube adı, `javascript:` bağlantı; sunucu atar, site o bölümü ya da öğeyi göstermez, menüde gizli bölümün bağlantısı olmaz. → Görev 10 testleri, Görev 12 tarayıcı adımı.

---

# PR 1 — Temel ve paneller (dal: `feat/ui-panels`)

Pınar dalı açar:

```bash
git switch -c feat/ui-panels
```

### Task 1 (Görev 1): Değişkenleri anlamlı adlara çevirme (görünüm aynı)

**Files:**
- Modify: `client/src/index.css:7-60` (`:root`)
- Modify: bütün `client/src/**/*.module.css` (12 dosya: `admin/Admin.module.css`, `components/{Button,Monogram,Sheet,TextField}.module.css`, `pages/{AuthPage,MySessionsPage,MakeupPickerPage}.module.css`, `site/{PublicSite,PrivacyPage,HostMessage}.module.css`)

**Interfaces:**
- Produces: aşağıdaki değişken adları; sonraki bütün görevler yalnızca bunları kullanır.

Bu görevde **değerler eski renkler kalır** (ekran aynı görünür); yalnızca adlar değişir.

| Eski | Yeni |
|---|---|
| `--violet` | `--brand` |
| `--violet-soft` | `--brand-soft` |
| `--aubergine` | `--brand-strong` |
| `--pink` | `--accent` |
| `--pink-text` | `--accent-text` |
| `--pink-hover` | `--accent-hover` |
| `--pink-disabled` | `--accent-disabled` |
| `--paper` | `--surface` |
| `--blush` | `--surface-sunken` |
| `--white` (zemin olarak) | `--surface-raised` |
| `--white` (koyu/marka zemin üstünde yazı olarak) | `--on-brand` |
| `--on-dark-soft` | `--on-brand-soft` |
| `--alert-text` | `--warning` |
| `--switch-off` | `--control-off` |
| `--ink`, `--ink-soft`, `--ink-faint`, `--line`, `--line-strong`, `--danger` | aynı ad |

Yalnızca tanıtım sitesinin kullandığı adlar (`--lavender`, `--lilac`, `--lavender-line`, `--lavender-strong`, `--ghost-hero`, `--ghost-lilac`, `--ghost-dark`, `--on-dark-muted`, `--pink-on-dark`, `--phone-frame`): `index.css`'ten çıkar, kullanıldıkları site CSS dosyasının en üstünde `.site { --site-…: değer; }` gibi yerel değişken olur (PR 2'de site yeniden yazılınca silinir). Ayrıca `--on-danger: #ffffff`, `--radius-card: 18px`, `--radius-panel: 24px`, `--tap: 44px` eklenir.

- [ ] **Step 1: Eski adların listesini çıkar (kırmızı)**

Run: `cd client && grep -rnoE -- "--(violet|pink|aubergine|paper|blush|white|on-dark-soft|alert-text|switch-off)\b[-a-z]*" src | grep -v "\-\-site-" | wc -l`
Expected: 0'dan büyük (≈ 180).

- [ ] **Step 2: `index.css`'te yeni adları tanımla, eski adları sil; her CSS modülünde eşlemeyi uygula**

`--white` için her kullanımı tek tek değerlendir: `background`/`background-color` → `--surface-raised`; `color`/`fill` ve marka/koyu zemin üstündeyse → `--on-brand`. Diğerleri mekanik değiştirilebilir (dosya dosya, `sed -i ''` ya da Edit). `index.css` başındaki açıklama yorumu yeni adlandırma ilkesini anlatacak şekilde güncellenir ("ad rolü söyler, rengi değil").

- [ ] **Step 3: Eski adlar kalmadı (yeşil)**

Run: Step 1'deki komut. Expected: `0`.
Run: `cd client && npm run lint && npm run build` Expected: hata yok.

- [ ] **Step 4: Ekran aynı mı (tarayıcı)**

Test veritabanıyla demo'yu aç: site, giriş, Derslerim, yönetici Bugün ve Ayarlar. Görev öncesiyle aynı görünmeli (renkler, butonlar, koyu bantlar). Konsolda CSS hatası yok.

- [ ] **Step 5: Commit (Pınar)**

```bash
git add client/src
git commit -m "refactor(client): rename CSS variables to role-based names"
```

### Task 2 (Görev 2): Varsayılan krem/zeytin palet ve yazı tipleri

**Files:**
- Modify: `client/src/index.css` (değerler, `--font-ui`)
- Modify: `client/src/main.jsx:5-8` (font importları)
- Modify: `client/package.json` (`@fontsource/dm-sans` eklenir)
- Modify (repo dışı, commit'e girmez): `~/Documents/02 Projeler/studio-booking-brands/tua/theme.css`

**Interfaces:**
- Consumes: Görev 1'deki değişken adları.
- Produces: varsayılan palet değerleri (spec tablosu).

- [ ] **Step 1: DM Sans'ı ekle**

Run: `cd client && npm install @fontsource/dm-sans`
`main.jsx`'e `@fontsource/dm-sans/400.css`, `500.css`, `700.css` ve `@fontsource/cormorant-garamond/600.css`, `700.css` eklenir. Archivo importu ve paketi **PR 2'ye kadar kalır** (eski sitedeki `RotatingWord` genişlik eksenini kullanıyor); yalnızca `--font-ui` DM Sans olur: `'DM Sans', system-ui, -apple-system, 'Segoe UI', sans-serif`.

- [ ] **Step 2: Değerleri prototip paletine çevir**

`--brand #4B5530`, `--brand-strong #2F361D`, `--brand-soft #DCE0CC`, `--on-brand #F5F0E6`, `--on-brand-soft #E9E6D8`, `--surface #F5F0E6`, `--surface-raised #FBF8F2`, `--surface-sunken #E8E3D6`, `--ink #2F361D`, `--ink-soft #5C5A4E`, `--line #C9C6B4` civarı, `--danger #8A2E1E`, `--on-danger #FFFFFF`. `--accent` ve türevleri, `--ink-faint`, `--line-strong`, `--warning`, `--control-off`: paletle uyumlu tonlar seç.

- [ ] **Step 3: Kontrast kontrolü**

Şu çiftleri WCAG oranıyla hesapla (tek seferlik küçük bir script scratchpad'de, repoya girmez): `--ink`/`--surface`, `--ink-soft`/`--surface`, `--ink-soft`/`--surface-raised`, `--on-brand`/`--brand`, `--on-brand-soft`/`--brand`, `--on-brand`/`--brand-strong`, `--on-danger`/`--danger`, `--danger`/`--surface-raised`, `--accent-text`/`--surface`, `--ink-faint`/`--surface` (pasif yazı, 3:1 yeter).
Expected: hepsi ≥ 4.5 (`--ink-faint` ≥ 3). Geçmeyen tonu koyulaştır, sonucu günlüğe yaz.

- [ ] **Step 4: Tua temasını yeni adlara ve prototip renklerine çevir (repo dışı)**

Dosyanın açıklama yorumu güncellenir; altın kahve buton kalkar; değerler varsayılanla aynı.

- [ ] **Step 5: Ezmenin çalıştığını doğrula**

Test veritabanındaki demo için geçici `BRAND_DIR/demo/theme.css`'e `html:root { --brand: #b00060; }` yaz, Derslerim ve yönetici panelinde ana rengin değiştiğini gör, dosyayı sil.
Run: `cd client && npm run lint && npm run build` Expected: hata yok.

- [ ] **Step 6: Commit (Pınar)**

```bash
git add client/package.json client/package-lock.json client/src/index.css client/src/main.jsx
git commit -m "feat(client): cream and olive default palette, DM Sans"
```

### Task 3 (Görev 3): Ortak bileşenler (Toast, Button, Sheet, TextField, Monogram, hareket)

**Files:**
- Create: `client/src/components/Toast.jsx`, `client/src/components/Toast.module.css`
- Modify: `client/src/components/{Button,Sheet,TextField,Monogram}.module.css`, gerekirse `Button.jsx` (tür adları)
- Modify: `client/src/index.css` (ortak `@keyframes fadeUp`, `.tap:active` yerine bileşen içi, reduced-motion bloğu)
- Modify: `client/src/pages/MySessionsPage.jsx:59-78,131-135` ve `MySessionsPage.module.css` (eski toast kodu kalkar)

**Interfaces:**
- Produces:
  - `useToast(duration = 5000) → { toast: {tone:'success'|'error', text:string} | null, showToast(tone, text): void }` (named export, `Toast.jsx`)
  - `export default function Toast({ toast })` — `toast` null ise hiçbir şey çizmez; `role="status"`, `aria-live="polite"`.
  - `Button` türleri: `variant: 'primary' | 'secondary' | 'danger' | 'text'` (bugünkü prop adı farklıysa onu koru ve bu dört türü destekle); `size: 'md' | 'lg'` (lg = 48px).

- [ ] **Step 1: `Toast.jsx` ve `useToast`**

Görünüm: ekranın altında ortalı, `--brand-strong` zemin, `--on-brand` yazı, 14px köşe, en fazla 360px, gölge; hata tonunda `--danger` zemin. Alttan kayarak gelir (reduced-motion'da yok). Zamanlayıcı yeni toast gelince sıfırlanır.

- [ ] **Step 2: Üye panelini `useToast`'a taşı**

`MySessionsPage`'deki `toast` state'i, zamanlayıcı `useEffect`'i ve `toastView` kalkar; `perform` `showToast` kullanır. Metinler aynı.

- [ ] **Step 3: Button, Sheet, TextField, Monogram görünümü**

Prototip ölçüleri: hap butonlar, `min-height: var(--tap)`, ikincil buton 1.5px `--brand` çerçeve; `Sheet` üst köşeler `--radius-panel`, arka plan `rgba(30,34,18,.55)`, alttan kayarak açılır, masaüstünde (≥ 900px) ortada kart; `TextField` `--surface-raised` zemin, 14px köşe, odakta `--brand` çerçeve; dokununca `transform: scale(.97)`.

- [ ] **Step 4: Doğrula**

Run: `cd client && npm run lint && npm run build` Expected: hata yok.
Tarayıcı (375 ve 1280): Derslerim'de "Gelemiyorum" → pencere açılır, Esc kapatır, Tab odak halkası görünür; bir iptal yap → toast alttan gelir, 5 sn sonra kaybolur. macOS "Hareketi azalt" (ya da DevTools emulation) açıkken animasyon yok.

- [ ] **Step 5: Commit (Pınar)**

```bash
git add client/src/components client/src/index.css client/src/pages/MySessionsPage.jsx client/src/pages/MySessionsPage.module.css
git commit -m "feat(client): shared Toast and restyled Button, Sheet, TextField"
```

### Task 4 (Görev 4): Üye paneli (Derslerim)

**Files:**
- Create: `client/src/pages/MembershipSummary.jsx` (koyu üyelik kartı; `MySessionsPage.jsx`'teki `MembershipInfo`, `packageLine` ve telafi kutusu buraya taşınır), `client/src/pages/PackageRing.jsx`
- Modify: `client/src/pages/MySessionsPage.jsx`, `client/src/pages/MySessionsPage.module.css`

**Interfaces:**
- Consumes: `useToast`, `Toast`, `Sheet`, `Button` (Görev 3).
- Produces:
  - `PackageRing({ remaining: number, total: number, size = 120 })` — SVG halka, `role="img"`, `aria-label="{total} seanstan {remaining} seans kaldı"`; ortada serif büyük sayı, altında "seans kaldı".
  - `MembershipSummary({ membership, credits, packageModel, timeZone, onPickMakeup })`.
  - `lateCancelHours(session) → number` (`MySessionsPage.jsx` içinde): `Math.round((new Date(session.startsAt) - new Date(session.cancelDeadlineAt)) / 3_600_000)`. **Pınar yazabilir** (halka yay hesabıyla birlikte: `stroke-dasharray = C * remaining/total`, `C = 2πr`).

- [ ] **Step 1: Üst kısım** — "Merhaba," (`--ink-soft`, 14px) + serif tam ad (28px, 700); sağda hesap hapı (ilk ad), bugünkü hesap penceresini açar; Monogram küçük, üstte.

- [ ] **Step 2: `MembershipSummary` + `PackageRing`**
  - Paket modeli, paket var: koyu kart (`--brand`, `--radius-panel`), solda halka (`remaining`/`sessionCount`), sağda paket adı (serif 26px), "Son gün: …", "N kullanıldı". Bittiyse/süresi geçtiyse halka 0 ve bugünkü `packageLine` metni; `unpackaged > 0` ise bugünkü uyarı cümlesi.
  - Paket modeli, paket yok: sade kutu "Henüz bir paketin yok."
  - Grup modeli: koyu kartta üyelik bitiş cümlesi; telafi hakkı varsa sayı, ilk hakkın son günü, kart içinde "Telafi seç" (açık zeminli hap).
  - Ödeme bilgisi (`membership.period` varsa): kartın altında `--surface-raised` kutuda tutar/ödenen/kalan çubuğu ve "Ödemelerim" — bugünkü metinler.

- [ ] **Step 3: Sıradaki ders ve haftalık liste** — kartlar `--surface-raised`, `--radius-card`; saat serif 24px; durum metinleri (iptal edildi, telafi) `--surface-sunken` rozet; "Sonraki dersleri göster" ikincil buton.

- [ ] **Step 4: "Gelemiyorum" penceresi ve geç iptal onayı** — seçenekler büyük kart-butonlar. `packageModel && studio.lateCancelBurnsSession && isPast(session.cancelDeadlineAt, now)` iken "İptal et" doğrudan iptal etmez; aynı `Sheet` içinde onay görünümüne geçer: başlık "Derse {lateCancelHours(session)} saatten az kaldı" (serif 28px), açıklama "{gün} {saat} dersini şimdi iptal edersen bu seans paketinden düşülür ve iade edilmez.", `danger` lg buton "Yine de iptal et (seans yanar)" → `cancelOnly`, `secondary` lg buton "Vazgeç, derse geleceğim" → pencereyi kapatır. Diğer bütün durumlarda bugünkü metin ve akış.

- [ ] **Step 5: Doğrula**

Run: `cd client && npm run lint && npm run build` Expected: hata yok.
Tarayıcı, test veritabanı, 375 ve 1280:
- Grup modeli: telafi hakkı olan ve olmayan üye; "Gelemiyorum" → başka derse geç / iptal; toast metinleri bugünküyle aynı.
- Paket modeli: paketli üye (halka doğru), paketi olmayan, seansları bitmiş, son günü geçmiş, paketsiz dersi olan üye (Review Focus 1).
- Geç iptal: ayar açıkken kırmızı onay çıkar; ayar kapalıyken çıkmaz; grup modelinde çıkmaz (Review Focus 3).
- Uzun ad soyad (≥ 30 karakter) ve uzun şube adı taşmıyor (Review Focus 2).

- [ ] **Step 6: Commit (Pınar)**

```bash
git add client/src/pages
git commit -m "feat(member): prototype look for My sessions, package ring, late-cancel confirm"
```

### Task 5 (Görev 5): Telafi seçme ekranı ve giriş ekranları

**Files:**
- Modify: `client/src/pages/MakeupPickerPage.jsx`, `MakeupPickerPage.module.css`
- Modify: `client/src/pages/AuthPage.module.css`, gerekirse `LoginPage.jsx`, `ChangePasswordPage.jsx`
- Modify: `client/src/App.jsx:69-90` ("Bağlantı kurulamadı"), `client/src/site/HostMessage.module.css` (`RootPage`, `StudioNotFound`)

- [ ] **Step 1: Telafi seçme** — gün başlıkları; her ders prototipteki ders satırı: solda serif saat, ortada ders/grup adı ve "N yer boş · x/y", sağda `primary` "Bu derse gel"; dolu/geçmiş ders `--surface-sunken` rozet. Davranış aynı.
- [ ] **Step 2: Giriş, yeni şifre, bağlantı hatası, kök sayfa, stüdyo bulunamadı** — krem zemin, ortada serif başlık, form `--surface-raised` kart içinde (`--radius-panel`), `lg` butonlar.
- [ ] **Step 3: Doğrula** — lint + build; tarayıcıda (375, 1280): giriş (yanlış şifre hatası alanın yanında), geçici şifreyle yeni şifre ekranı, `yok.localhost:5173` ("bulunamadı"), `localhost:5173` (kök), sunucu kapalıyken "Bağlantı kurulamadı"; grup modelinde telafi seç → kaydet → toast.
- [ ] **Step 4: Commit (Pınar)**

```bash
git add client/src/pages client/src/App.jsx client/src/site/HostMessage.module.css
git commit -m "feat(client): prototype look for makeup picker and sign-in screens"
```

### Task 6 (Görev 6): Yönetici kabuğu, Bugün ve ders detayı

**Files:**
- Modify: `client/src/admin/AdminApp.jsx:120-159`, `client/src/admin/Admin.module.css`
- Modify: `client/src/admin/TodayPage.jsx`, `client/src/admin/SessionRosterPage.jsx`

**Interfaces:**
- Consumes: `useToast`, `Toast`.
- Produces: `AdminApp` bir `showToast` fonksiyonunu alt sayfalara prop olarak verir (`showToast(tone, text)`); Görev 7–8 aynı prop adını kullanır. `<Toast>` yalnızca `AdminApp`'te bir kez çizilir.

- [ ] **Step 1: Kabuk** — `min-width: 900px` medya sorgusunda: solda sabit koyu yan menü (`--brand-strong`, ~220px): logo/stüdyo adı (serif), beş sekme (seçili sekme `--brand` zemin hap), altta hesap butonu (bugünkü hesap penceresi). Altında: bugünkü alt sekme çubuğu yeni renklerle. Sayfa başlığı serif 36px, üstünde bugünün tarihi (`--ink-soft`, stüdyo saat diliminde, `format.js`'teki yardımcılarla).
- [ ] **Step 2: Bugün** — üstte istatistik kartları (`--surface-raised`, serif büyük sayı): yalnızca `TodayPage`'in zaten çektiği veriden (ör. bugünkü ders sayısı, bugünkü toplam kayıtlı kişi; seçim builder'ın, yeni uç nokta yok). Ders listesi: serif saat + ad + doluluk kartları.
- [ ] **Step 3: Ders detayı** — katılımcı satırı: baş harf dairesi (`--brand-soft`), ad, alt satırda paket/durum, sağda "Gelmedi" hap (davranış aynı). İptal / kişi ekleme pencereleri yeni `Sheet` görünümünde. Başarı mesajları toast'a döner (form hataları yerinde).
- [ ] **Step 4: Doğrula** — lint + build; tarayıcı: 1280 (yan menü), 899 ve 900px (eşik), 812×375 yatay telefon, 375 (alt çubuk) (Review Focus 4); ders detayında "Gelmedi" ve geri alma, ders iptali, kişi ekleme → toast; iki modelde.
- [ ] **Step 5: Commit (Pınar)**

```bash
git add client/src/admin
git commit -m "feat(admin): sidebar shell, Today stats and roster in prototype look"
```

### Task 7 (Görev 7): Müşteriler, müşteri detayı, yeni müşteri, giriş bilgileri

**Files:**
- Modify: `client/src/admin/{CustomersPage,CustomerDetailPage,NewCustomerPage,CredentialsPage,MembershipCard}.jsx`, `Admin.module.css`

- [ ] **Step 1: Müşteriler** — ≥ 900px: prototipteki tablo (başlık satırı `--surface-sunken`; sütunlar ad, paket/üyelik, kalan, son gün, durum); paket modelinde "Kalan" = kalan seans, grup modelinde bu sütun yerine üyelik bitişi. Yalnızca listenin bugün verdiği alanlar; bir alan listede yoksa sütun konmaz. Telefonda kart listesi. Satır tıklanınca detay (bugünkü gibi).
- [ ] **Step 2: Müşteri detayı ve `MembershipCard`** — kartlar, butonlar, pencereler yeni görünüm; başarı mesajları (`Paket eklendi`, `Ödeme kaydedildi`, dondurma, grup değişikliği …) `showToast`.
- [ ] **Step 3: Yeni müşteri, giriş bilgileri** — form kartları, `lg` butonlar.
- [ ] **Step 4: Doğrula** — lint + build; tarayıcı iki modelde, 375 ve 1280: listeden detaya, paket ekle (paket modeli), yeni dönem başlat (grup), ödeme kaydet, telafi hakkı ver (grup), yeni müşteri ekle → giriş bilgileri; uzun ad tabloda ve kartta taşmıyor (Review Focus 2).
- [ ] **Step 5: Commit (Pınar)**

```bash
git add client/src/admin
git commit -m "feat(admin): customers table and detail screens in prototype look"
```

### Task 8 (Görev 8): Gruplar, Ödemeler, Ayarlar

**Files:**
- Modify: `client/src/admin/{GroupsPage,GroupDetailPage,GroupFormPage,PaymentsPage,SettingsPage,BranchesSection,PackagesSection}.jsx`, `Admin.module.css`

- [ ] **Step 1: Gruplar ve grup formu** — kart listesi, form kartları; gün seçimi hap düğmeler (`groupDays.js` aynı).
- [ ] **Step 2: Ödemeler** — listeler kartlarda; "Paketi bitti, yenilenmedi" ve "süresi doldu" bölümleri başlıklı kartlar.
- [ ] **Step 3: Ayarlar** — her bölüm yuvarlak kart; paketler prototipteki paket kartları (tür rozeti, serif ad, fiyat, "Geçerlilik: N gün"; aktif üye sayısı yalnızca veri varsa); sayısal ayarlar −/+ görünümlü olabilir, kaydetme bugünkü gibi; "Kaydedildi" toast.
- [ ] **Step 4: Doğrula** — lint + build; iki modelde 375 ve 1280: grup ekle/düzenle/kapat, paket ekle/düzenle/kapat/aç (paket modeli), şube ekle (tek şubede şube seçimi görünmüyor), ayar kaydet → toast.
- [ ] **Step 5: Commit (Pınar)**

```bash
git add client/src/admin
git commit -m "feat(admin): groups, payments and settings in prototype look"
```

### Task 9 (Görev 9): PR 1 son kontrol, README, PR

**Files:**
- Modify: `README.md` (İngilizce: "UI" bölümü — role-based CSS variables, default palette, theme override, toast/sheet conventions; yol haritası kutusu işaretlenmez, PR 2 sonrası)

- [ ] **Step 1: Tam tur** — test veritabanında iki modelde bütün panel ekranları 375 ve 1280; konsolda hata yok.
- [ ] **Step 2: Kontroller**

Run: `cd server && npm test` Expected: tümü geçer (bugün 333).
Run: `cd client && npm run lint && npm run build` Expected: hata yok.
Run: `grep -rnE -- "--(violet|pink|aubergine|paper|blush|white)\b" client/src` Expected: çıktı yok.

- [ ] **Step 3: Bağımsız inceleme** (superpowers:requesting-code-review), bulguları düzelt.
- [ ] **Step 4: `.claude/launch.json`'ı geri al**; README'yi güncelle; günlüğe yaz.
- [ ] **Step 5: Commit ve PR (Pınar)**

```bash
git add README.md
git commit -m "docs: UI conventions in README"
git push -u origin feat/ui-panels
```

PR başlığı: "UI redesign 1/2: variables, shared components, panels". Açıklamada Claude adı yok.

---

# PR 2 — Tanıtım sitesi (dal: `feat/ui-site`, PR 1 main'e birleştikten sonra)

```bash
git switch main
git pull
git switch -c feat/ui-site
```

### Task 10 (Görev 10): `/api/site` yeni alanlar (TDD)

**Files:**
- Modify: `server/src/routes/studio.js:84-150`
- Modify: `server/site.example.json`
- Test: `server/test/site.test.js`

**Interfaces:**
- Produces (`/api/site` → `site` içinde yeni anahtarlar; hepsi yoksa boş/null):
  - `hero: { eyebrow: string|null }`
  - `courses: [{ title, text, highlight: boolean, link: string|null }]` — en fazla 6; `title` ve `text` zorunlu; `link` yalnızca `/^[a-z][a-z-]{0,30}$/` (sayfa içi bölüm kimliği), değilse null.
  - `quiz: { title, intro, questions: [{ id, text, options: [{ label, next: string|null, result: string|null }] }], results: [{ id, title, text }] } | null` — en fazla 5 soru, soru başına 4 seçenek, 6 sonuç. Seçenek yalnızca **tam olarak biri** dolu ve geçerliyse kalır: `next` kendinden **sonraki** bir sorunun `id`'si (döngü olamaz), `result` var olan bir sonucun `id`'si. Seçeneği kalmayan soru atılır; ilk soru atılırsa ya da hiç sonuç yoksa `quiz: null`. **Pınar yazabilir** (seçenek geçerlilik kuralı, ~8 satır).
  - `spotlight: { eyebrow, title, text, photoUrl, tabs: [{ label, meta, title, items: string[] }] } | null` — `title` yoksa null; en fazla 4 sekme, sekme başına 6 madde; `photo` → `brandFile()`.
  - `branches[i]`'ye eklenen alanlar: `badge`, `description`, `schedule: [{ day, classes }]` — `site.json`'daki `branchDetails[]`'dan **şube adıyla tam eşleşerek**; eşleşmeyen `branchDetails` öğesi yok sayılır; `schedule` en fazla 7 satır.
  - `stats: [{ value, label }]` — en fazla 3; `value` en fazla 12 karakter.
  - Bütün metinler `text()` ile; diziler `Array.isArray` + `slice`.

- [ ] **Step 1: Testleri yaz** (`site.test.js`, mevcut kalıp: geçici `BRAND_DIR`, `test-1/site.json`)
  - `works without … site.json`: anahtar listesine `courses`, `hero`, `quiz`, `spotlight`, `stats` eklenir; `hero.eyebrow === null`, `courses`/`stats` `[]`, `quiz`/`spotlight` `null`; şubelerde `badge: null, description: null, schedule: []`.
  - `site.json courses: incomplete dropped, at most six, link only a section id` — 7 geçerli kart → 6; `{ title: 'A' }` atılır; `link: 'javascript:alert(1)'` → `null`; `link: 'test'` → `'test'`.
  - `site.json quiz: options must point forward or to an existing result` — seçenek `next` önceki soruya → atılır; `result: 'yok'` → atılır; hem `next` hem `result` → atılır; seçeneği kalmayan 2. soru atılır ve ona giden `next` seçeneği de atılır; sonuç yoksa `quiz === null`.
  - `site.json spotlight and stats: limits` — 5 sekme → 4; 7 madde → 6; `title` yoksa `null`; 4 stat → 3; 20 karakterlik `value` atılır.
  - `branch details are matched by exact branch name` — panelde "Merkez" şubesi; `branchDetails` "Merkez" ve "Yok" → "Merkez" alanları gelir, "Yok" hiçbir yerde görünmez; 8 satırlık program → 7.
- [ ] **Step 2: Kırmızı** — Run: `cd server && node --test test/site.test.js` Expected: yeni testler FAIL.
- [ ] **Step 3: Uygula** — `studio.js`'te her alan için küçük bir okuma fonksiyonu (`readCourses(site)`, `readQuiz(site)`, `readSpotlight(site)`, `readStats(site)`, `branchDetailsByName(site)`), `router.get('/api/site')` bunları çağırır. `site.example.json`'a her alandan genel (stüdyo adı içermeyen) birer örnek.
- [ ] **Step 4: Yeşil** — Run: `cd server && npm test` Expected: tümü geçer.
- [ ] **Step 5: Commit (Pınar)**

```bash
git add server/src/routes/studio.js server/site.example.json server/test/site.test.js
git commit -m "feat(site): read courses, quiz, spotlight, branch details and stats from site.json"
```

### Task 11 (Görev 11): Site iskeleti: menü, hero, kayan bant, altbilgi, WhatsApp

**Files:**
- Modify: `client/src/site/PublicSite.jsx` (baştan), `PublicSite.module.css` (baştan; Görev 1'deki geçici `--site-*` değişkenleri kalkar), `SiteNav.jsx`
- Delete: `client/src/site/RotatingWord.jsx`
- Modify: `client/src/main.jsx` (Archivo importu kalkar, `@fontsource/great-vibes/400.css` eklenir), `client/package.json` (Archivo çıkar, Great Vibes girer), `client/src/index.css` (`--font-script: 'Great Vibes', cursive`)

**Interfaces:**
- Consumes: `/api/site` (Görev 10), `/api/studio` (`membershipModel`, `lateCancelBurnsSession`).
- Produces: `PublicSite` iki isteği birlikte yapar: `Promise.all([api('/api/site'), api('/api/studio')])`; hata olursa site yer tutucularla açılır (bugünkü ilke). Bölüm bileşenleri `site` ve `studio` nesnelerini prop olarak alır. Görünen bölümlerin listesi tek yerde hesaplanır (`visibleSections(site) → [{ id, label }]`) ve hem menü hem sayfa onu kullanır.

- [ ] **Step 1: Paketler** — Run: `cd client && npm uninstall @fontsource-variable/archivo && npm install @fontsource/great-vibes`
- [ ] **Step 2: Menü** — logo + stüdyo adı, yalnızca görünen bölümlerin bağlantıları, "Üye Girişi" hapı (`/giris`); telefonda bugünkü aç/kapa davranışı.
- [ ] **Step 3: Hero** — `hero.eyebrow` (`--font-script`, 44px), `tagline` (serif büyük), `subline`, haplar ("Sana hangi ders uygun?" yalnızca `quiz` varsa → `#test`; "WhatsApp'tan yaz"), `photos[0]` alanı, süs yaprak SVG (prototipteki, `aria-hidden`), "N. yıl" rozeti (`instructor.years` ya da `stats[0]`; yoksa rozet yok).
- [ ] **Step 4: Kayan bant** — `courses[].title` + `branches[].name`, "·" ile; iki kopya yan yana sonsuz kayar; `aria-hidden`; reduced-motion'da durur; içerik yoksa bant yok.
- [ ] **Step 5: Altbilgi ve yüzen WhatsApp** — stüdyo adı, `hero.eyebrow` slogan olarak, şube adları, telefon, Instagram, KVKK bağlantısı (`PRIVACY_PATH`); sağ altta yuvarlak WhatsApp butonu (`whatsappPhone` varsa, `aria-label="WhatsApp ile yaz"`).
- [ ] **Step 6: Doğrula** — lint + build; tarayıcı 375 ve 1280: demo (az içerik) ve Tua içeriğiyle (Görev 13'te yazılacak `site.json`'ın taslağı geçici olarak demo klasörüne) — menüde yalnızca görünen bölümler.
- [ ] **Step 7: Commit (Pınar)**

```bash
git add client/package.json client/package-lock.json client/src
git commit -m "feat(site): new site shell with hero, marquee, footer and WhatsApp button"
```

### Task 12 (Görev 12): Neden biz, Dersler, test, öne çıkan program

**Files:**
- Create: `client/src/site/{Reasons,Courses,Quiz,Spotlight}.jsx` (stiller `PublicSite.module.css`'te ya da her birinin kendi modülünde — mevcut kalıba göre)
- Modify: `client/src/site/PublicSite.jsx`

**Interfaces:**
- `Reasons({ reasons, packageModel })` — `reasons` boşsa genel kartlar: grup modelinde bugünkü dört kart; paket modelinde "Telafi hakkı" yerine `{ title: 'Esnek iptal', text: 'Gelemeyeceğin dersi önceden bildir, seansın yanmasın.' }`.
- `Quiz({ quiz, whatsappPhone })` — state yalnızca bileşende (`useState`): şu anki soru `id`'si ve sonuç `id`'si. İlerleme noktaları soru sayısı kadar. Sonuçta "Deneme dersi iste" WhatsApp bağlantısı **sabit mesajla** (`'Merhaba, deneme dersi hakkında bilgi almak istiyorum.'`), cevaplar eklenmez; "Baştan başla".
- `Spotlight({ spotlight })` — sekmeler `role="tablist"`/`role="tab"`/`aria-selected`; ilerleme çizgisi seçili sekme sırasına göre genişler.

- [ ] **Step 1: Neden biz** — prototip kart görünümü, en fazla 4.
- [ ] **Step 2: Dersler** — `courses` kartları; `highlight` kart koyu (`--brand`), `link` varsa "Detaylı bilgi →" o bölüme.
- [ ] **Step 3: Test** — koyu bölüm; "SORU n / toplam"; seçenek hapları; sonuç kartı.
- [ ] **Step 4: Öne çıkan program** — başlık, metin, fotoğraf alanı, sekmeler, işaretli maddeler.
- [ ] **Step 5: Doğrula** — lint + build; 375 ve 1280: testi her yoldan sonuna kadar götür; ağ sekmesinde cevap seçerken hiçbir istek gitmediğini gör; bozuk quiz'li `site.json` ile (döngülü seçenek) test bölümü/seçenek görünmüyor (Review Focus 5); paket modelinde genel "Neden biz" kartlarında telafi sözü yok.
- [ ] **Step 6: Commit (Pınar)**

```bash
git add client/src/site
git commit -m "feat(site): reasons, courses, class quiz and spotlight sections"
```

### Task 13 (Görev 13): Şubeler, eğitmen, Nasıl işler, SSS, aydınlatma sayfası

**Files:**
- Create: `client/src/site/{Branches,Instructor}.jsx`
- Modify: `client/src/site/{HowItWorks,Faq,PrivacyPage}.jsx`, `PrivacyPage.module.css`, `PublicSite.jsx`

**Interfaces:**
- `HowItWorks({ packageModel })`, `Faq({ rules, packageModel, lateCancelBurnsSession })` — telafi metinleri yalnızca `packageModel === false`; paket modelinde: iptal sorusunun cevabı "Dersten {hours} saat öncesine kadar uygulamadan iptal edersen seansın paketinden düşmez." + `lateCancelBurnsSession` ise " Daha geç iptallerde seans kullanılmış sayılır." (`hours` bugünkü gibi `rules.cancellationDeadlineHours`'tan). Adım metinlerinde telafi yerine "Kalan seansını uygulamadan takip et."
- `Instructor({ instructor, stats })` — sayılar `IntersectionObserver` ile ekrana girince 0'dan sayarak artar (yalnızca baştaki sayı kısmı, ör. "12B" → 12'ye kadar, "B" sabit); reduced-motion'da doğrudan son değer.

- [ ] **Step 1: Şubeler** — birden çok şubede hap sekmeler; seçili şubenin rozeti, adı, açıklaması, adresi, telefon, harita bağlantısı, haftalık program satırları; tek şubede sekme yok.
- [ ] **Step 2: Eğitmen** — fotoğraf, ad, bio, sertifikalar, sayı kartları.
- [ ] **Step 3: Nasıl işler ve SSS** — yeni görünüm, modele göre metin.
- [ ] **Step 4: Aydınlatma sayfası** — yeni görünüm, içerik aynı.
- [ ] **Step 5: Doğrula** — lint + build; 375 ve 1280; iki modelde sayfada (Cmd+F) "telafi" arandığında paket modelinde sonuç yok (spec başarı ölçütü 4); tek şubeli ve iki şubeli demo; eşleşmeyen `branchDetails` adı görünmüyor.
- [ ] **Step 6: Commit (Pınar)**

```bash
git add client/src/site
git commit -m "feat(site): branches, instructor, model-aware how-it-works and FAQ"
```

### Task 14 (Görev 14): İçerik, son kontrol, README, PR

**Files:**
- Modify (repo dışı): `~/Documents/02 Projeler/studio-booking-brands/tua/site.json` (prototipteki metinler: hero, dersler, test, öne çıkan program, şube ayrıntıları, sayılar; "Telafi hakkı" kartı Tua'nın modeline göre düzeltilir), `~/Documents/02 Projeler/studio-booking-notes/marka/demo/site.json` (deneme için birkaç alan)
- Modify: `README.md` (site.json alanları; yol haritasında 4. adım kutusu)

- [ ] **Step 1: İçerik** — Tua metinleri prototipten (`Main.dc.html`) aktarılır; hiçbiri repoya girmez.
- [ ] **Step 2: Tam tur** — test veritabanında site: demo (grup ve paket modeli), Tua içeriğiyle bir kez; 375 ve 1280; konsol temiz.
- [ ] **Step 3: Kontroller** — `cd server && npm test`, `cd client && npm run lint && npm run build` yeşil; `grep -rn "Tua\|Konyaaltı\|Kepez\|Antalya" client/src server/src server/site.example.json` çıktı yok.
- [ ] **Step 4: Bağımsız inceleme**, düzeltmeler; `.claude/launch.json` geri alınır; günlük.
- [ ] **Step 5: Commit ve PR (Pınar)**

```bash
git add README.md
git commit -m "docs: site.json sections and roadmap step 4"
git push -u origin feat/ui-site
```

PR başlığı: "UI redesign 2/2: public site". Açıklamada Claude adı yok.
