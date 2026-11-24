// Sunucuyu açar ve port gerçekten dinlenmeye başlayınca server nesnesiyle döner. Express 5'te app.listen'in geri
// çağrısı port alınamadığında da çalışır ve hatayı ilk argüman olarak verir (Express 4'te yalnızca başarıda
// çalışıyordu). Bu argümana bakılmazsa sunucu, port doluyken "çalışıyor" yazıp hiçbir şeyi dinlemeden açık kalır.
export function startServer(app, port, host) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, (err) => (err ? reject(err) : resolve(server)));
  });
}
