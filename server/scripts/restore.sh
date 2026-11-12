#!/usr/bin/env bash
# Şifreli bir yedeği YENİ ve BOŞ bir veritabanına geri yükler. Var olan veritabanının üzerine yazmaz:
# önce yedeği ayrı bir veritabanına aç, kontrol et, sonra uygulamayı ona yönlendir.
# Ayda bir "geri yükleme denemesi" için de kullanılır: yedeğin gerçekten açılabildiğini kanıtlar.
#
# Kullanım: scripts/restore.sh <yedek.dump.enc> <yeni_veritabani_adi>
# Ortam değişkenleri: BACKUP_PASSPHRASE_FILE; pg araçları için PGHOST/PGUSER/PGPASSWORD ya da
# BACKUP_DOCKER_CONTAINER (backup.sh ile aynı).
set -euo pipefail

file="${1:?Kullanım: restore.sh <yedek.dump.enc> <yeni_veritabani_adi>}"
target="${2:?Kullanım: restore.sh <yedek.dump.enc> <yeni_veritabani_adi>}"
: "${BACKUP_PASSPHRASE_FILE:?BACKUP_PASSPHRASE_FILE gerekli}"

[[ "$target" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "Veritabanı adı küçük harf, rakam ve _ olmalı." >&2; exit 1; }

# Bozulma kontrolü: yedeğin yanındaki özet tutuyor mu?
if [ -f "$file.sha256" ]; then
  ( cd "$(dirname "$file")" && shasum -a 256 -c "$(basename "$file").sha256" ) >/dev/null \
    || { echo "Yedek dosyası bozuk (sha256 tutmuyor): $file" >&2; exit 1; }
fi

pg() { # $1: araç (psql, createdb, pg_restore); kalanlar argüman
  local tool="$1"; shift
  if [ -n "${BACKUP_DOCKER_CONTAINER:-}" ]; then
    docker exec -i "$BACKUP_DOCKER_CONTAINER" "$tool" -U "${PGUSER:-postgres}" "$@"
  else
    "$tool" "$@"
  fi
}

exists="$(pg psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$target'")"
if [ "$exists" = "1" ]; then
  echo "\"$target\" zaten var. Geri yükleme yalnızca yeni bir veritabanına yapılır (üzerine yazılmaz)." >&2
  exit 1
fi

pg createdb "$target"
# Çözme (yanlış parola) ya da geri yükleme başarısız olursa yarım veritabanı geride kalmasın.
if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass "file:$BACKUP_PASSPHRASE_FILE" < "$file" \
  | pg pg_restore --no-owner --no-privileges --exit-on-error -d "$target"; then
  pg dropdb "$target"
  echo "Geri yükleme başarısız (parola yanlış ya da yedek bozuk); \"$target\" silindi." >&2
  exit 1
fi

echo "Geri yüklendi: $target"
pg psql -d "$target" -tAc "SELECT 'stüdyo: ' || count(*) FROM studios UNION ALL SELECT 'kullanıcı: ' || count(*) FROM users UNION ALL SELECT 'ders: ' || count(*) FROM sessions UNION ALL SELECT 'ödeme: ' || count(*) FROM payments"
echo "Kontrol ettikten sonra: uygulamayı bu veritabanına yönlendir ya da deneme ise sil (dropdb $target)."
