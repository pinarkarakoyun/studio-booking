#!/usr/bin/env bash
# Veritabanının şifreli yedeğini alır ve eski yedekleri siler. Günde bir kez zamanlanmış görevle (cron) çalışır.
#
# Gerekenler (ortam değişkenleri):
#   PGDATABASE                 yedeklenecek veritabanı
#   BACKUP_DIR                 yedeklerin yazılacağı klasör (sunucu dışına ayrıca kopyalanmalı, bkz. README)
#   BACKUP_PASSPHRASE_FILE     şifreleme parolasının durduğu dosya (chmod 600; parola yedeklerden AYRI saklanmalı)
# İsteğe bağlı:
#   PGHOST, PGPORT, PGUSER, PGPASSWORD   pg_dump bağlantısı (pg_dump bu makinede kuruluysa)
#   BACKUP_DOCKER_CONTAINER    pg_dump bu makinede yoksa, Postgres'in çalıştığı Docker konteyneri
#   BACKUP_KEEP_DAYS           kaç günlük yedek tutulsun (varsayılan 14)
#
# Çıktı: BACKUP_DIR/studio-booking_YYYY-MM-DD_HHMM.dump.enc ve yanında .sha256 dosyası.
# Geri yükleme: scripts/restore.sh
set -euo pipefail

: "${PGDATABASE:?PGDATABASE gerekli}"
: "${BACKUP_DIR:?BACKUP_DIR gerekli}"
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE gerekli}"
[ -r "$BACKUP_PASSPHRASE_FILE" ] || { echo "Parola dosyası okunamıyor: $BACKUP_PASSPHRASE_FILE" >&2; exit 1; }
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

umask 077 # yedekleri sadece bu kullanıcı okuyabilsin
mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y-%m-%d_%H%M)"
out="$BACKUP_DIR/studio-booking_${stamp}.dump.enc"

dump() {
  # -Fc: sıkıştırılmış özel biçim; pg_restore ile seçici geri yükleme yapılabilir.
  # --no-owner --no-privileges: geri yüklendiği yerde rol adları farklı olabilir.
  if [ -n "${BACKUP_DOCKER_CONTAINER:-}" ]; then
    docker exec "$BACKUP_DOCKER_CONTAINER" pg_dump -Fc --no-owner --no-privileges -U "${PGUSER:-postgres}" "$PGDATABASE"
  else
    pg_dump -Fc --no-owner --no-privileges "$PGDATABASE"
  fi
}

# Önce geçici dosyaya: yarıda kalan bir yedek, sağlam bir yedek gibi görünmesin (pipefail ile hata yakalanır).
dump | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass "file:$BACKUP_PASSPHRASE_FILE" > "$out.tmp"
mv "$out.tmp" "$out"
( cd "$BACKUP_DIR" && shasum -a 256 "$(basename "$out")" > "$(basename "$out").sha256" )

size="$(wc -c < "$out" | tr -d ' ')"
echo "Yedek alındı: $out ($size bayt)"

# Eski yedekleri sil (yalnızca bu betiğin adlandırdığı dosyalar).
find "$BACKUP_DIR" -maxdepth 1 -name 'studio-booking_*.dump.enc*' -mtime +"$KEEP_DAYS" -print -delete
