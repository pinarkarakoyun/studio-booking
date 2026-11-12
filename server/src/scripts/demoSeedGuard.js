// Demo verisi betikleri bilinen şifrelerle hesap açar (şifreler herkese açık repoda yazıyor). Yanlışlıkla
// gerçek bir veritabanında çalışırlarsa, o şifreyle yönetici paneline girilebilirdi. Bu yüzden:
// - üretim ortamında hiç çalışmazlar,
// - her çalıştırmada açık izin isterler: ALLOW_DEMO_SEED=1 npm run seed:dev
// (npm script'ine gömülmedi: izin, komutu yazan kişinin bilinçli kararı olmalı.)
export function assertDemoSeedAllowed(scriptName) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${scriptName} üretim ortamında çalıştırılamaz.`);
  }
  if (process.env.ALLOW_DEMO_SEED !== '1') {
    throw new Error(
      `${scriptName} bilinen şifrelerle deneme hesapları açar. Sadece geliştirme veritabanında, `
        + `açıkça izin vererek çalıştır: ALLOW_DEMO_SEED=1 npm run ${scriptName}`,
    );
  }
}
