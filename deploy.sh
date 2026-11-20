#!/usr/bin/env bash
# Manual only. Never starts the application or runs database migrations.
set -euo pipefail
trap 'printf "%s\n" "Update abgebrochen. Anwendung gestoppt lassen; Ursache und Sicherung prüfen." >&2' ERR
mode=check
branch=main
backup_root=
while (($#)); do
  case "$1" in
    --check) mode=check; shift ;;
    --apply) mode=apply; shift ;;
    --branch) branch="${2:?Branch fehlt}"; shift 2 ;;
    --backup-dir) backup_root="${2:?Sicherungsverzeichnis fehlt}"; shift 2 ;;
    *) printf 'Unbekannte Option: %s\n' "$1" >&2; exit 1 ;;
  esac
done
project=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
cd -- "$project"
for command in git node npm tar; do command -v "$command" >/dev/null || { printf 'Befehl fehlt: %s\n' "$command" >&2; exit 1; }; done
git check-ref-format --branch "$branch" >/dev/null
node tools/deployment-check.cjs --branch "$branch"
if [[ "$mode" == check ]]; then
  printf '%s\n' 'Nur geprüft. Kein Fetch/Pull, keine Installation, keine Migration, kein Neustart.'
  exit 0
fi
[[ "${COCKPIT_APP_STOPPED:-}" == 1 ]] || { printf '%s\n' 'Zuerst Webprozess und Mail-Cronjob stoppen. Danach COCKPIT_APP_STOPPED=1 setzen.' >&2; exit 1; }
[[ -n "$backup_root" ]] || { printf '%s\n' '--backup-dir mit vorhandenem privaten absoluten Verzeichnis erforderlich.' >&2; exit 1; }
# Resolve and validate without importing any application/database-writing modules.
backup_root=$(node -e 'const fs=require("fs"),p=require("path"),c=require("./tools/deployment-check.cjs");const v=process.argv[1];if(!p.isAbsolute(v))throw Error("Sicherungspfad muss absolut sein");const b=fs.realpathSync(v),d=c.check({repository:false}).data,r=fs.realpathSync(c.project);if(b===r||b.startsWith(r+p.sep)||b===d||b.startsWith(d+p.sep))throw Error("Sicherung ausserhalb Projekt und Datenverzeichnis wählen");if(!fs.statSync(b).isDirectory())throw Error("Kein Sicherungsverzeichnis");process.stdout.write(b);' "$backup_root")
git fetch origin "$branch"
target=$(git rev-parse FETCH_HEAD)
old=$(git rev-parse HEAD)
git merge-base --is-ancestor "$old" "$target" || { printf '%s\n' 'Historie ist divergiert. Kein automatischer Merge oder Reset.' >&2; exit 1; }
umask 077
backup="$backup_root/cockpit-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -- "$backup"
data=$(node -e 'process.stdout.write(require("./tools/deployment-check.cjs").check({repository:false}).data)')
git archive --format=tar.gz --output="$backup/code.tar.gz" HEAD
(cd -- "$backup" && tar -czf data.tar.gz -C "$data" .)
if [[ -f .env.production ]]; then cp -- .env.production "$backup/env.production.private"; fi
printf 'before=%s\nfetched=%s\nbranch=%s\n' "$old" "$target" "$branch" > "$backup/release.txt"
(cd -- "$backup" && tar -tzf code.tar.gz >/dev/null && tar -tzf data.tar.gz >/dev/null)
printf 'Kalte Sicherung: %s\n' "$backup"
# Use precisely the inspected commit from FETCH_HEAD; equivalent to a fast-forward pull.
git merge --ff-only "$target"
npm ci --omit=dev --ignore-scripts
node tools/check-syntax.cjs
printf '%s\n' 'Code und Dependencies aktualisiert. Keine Datenbankmigration und kein Start ausgeführt.'
printf '%s\n' 'Migrationen separat freigeben; danach im Manager mit npm run start:production starten und prüfen.'
