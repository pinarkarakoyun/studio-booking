// Kullanıcıya gösterilebilecek, beklenen hatalar (yanlış şifre, dolu ders...).
// `code` istemcinin hangi durumda olduğunu anlaması için, `message` ekranda göstermek için,
// `status` HTTP durum kodu. Bunun dışındaki her hata beklenmeyen bir hatadır ve 500 döner.
export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}
