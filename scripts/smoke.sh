#!/usr/bin/env bash
# End-to-end check against `wrangler dev`: upload -> scan -> approve -> export.
#
# GitHub login cannot run locally, so two users and their sessions are written
# straight into the local D1. Needs `npm run db:migrate:local` and a running
# `npm run dev`, with SCAN_SECRET in .dev.vars.
set -euo pipefail
cd "$(dirname "$0")/.."

API=${API:-http://localhost:8787}
SCAN_SECRET=$(grep '^SCAN_SECRET=' .dev.vars | cut -d= -f2-)
USER_TOKEN=smoke-user-token
MOD_TOKEN=smoke-mod-token
sha() { printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1; }

npx wrangler d1 execute lilka-catalog --local --command "
DELETE FROM sessions; DELETE FROM ratings; DELETE FROM reports; DELETE FROM versions; DELETE FROM apps; DELETE FROM users;
INSERT INTO users (id, login, role) VALUES (1, 'smoke-dev', 'user'), (2, 'smoke-mod', 'moderator'), (3, 'smoke-fan', 'user');
INSERT INTO sessions VALUES ('$(sha $USER_TOKEN)', 1, datetime('now', '+1 day'));
INSERT INTO sessions VALUES ('$(sha $MOD_TOKEN)', 2, datetime('now', '+1 day'));
INSERT INTO sessions VALUES ('$(sha fan-token)', 3, datetime('now', '+1 day'));" >/dev/null

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
printf 'display.fill_screen(display.color565(0, 0, 255))\ndisplay.queue_draw()\n' > "$work/hello.lua"
# 1x1 PNG
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01\x01\x00\xc9\xfe\x92\xef\x00\x00\x00\x00IEND\xaeB`\x82' > "$work/icon.png"

pass=0
check() { # name expected-status actual-status
    if [ "$2" = "$3" ]; then pass=$((pass + 1)); echo "ok   $1"; else echo "FAIL $1: expected $2, got $3"; cat "$work/body"; exit 1; fi
}
call() { # expected name curl-args...
    local expected=$1 name=$2; shift 2
    local status
    status=$(curl -sS -o "$work/body" -w '%{http_code}' "$@")
    check "$name" "$expected" "$status"
}
user=(-H "Authorization: Bearer $USER_TOKEN")
mod=(-H "Authorization: Bearer $MOD_TOKEN")
fan=(-H "Authorization: Bearer fan-token")
scanner=(-H "Authorization: Bearer $SCAN_SECRET")
json=(-H 'Content-Type: application/json')

call 401 "me without session" "$API/auth/me"
call 200 "me with session" "${user[@]}" "$API/auth/me"
call 400 "login rejects foreign return" "$API/auth/login?return=https://evil.example/"

call 201 "create app" "${user[@]}" "${json[@]}" -X POST "$API/apps" \
    -d '{"slug":"smoke-hello","kind":"app","name":{"uk":"Привіт","en":"Hello"},"short_description":"Синій екран","sources_url":"https://github.com/lilka-dev/examples"}'
call 409 "duplicate slug" "${user[@]}" "${json[@]}" -X POST "$API/apps" \
    -d '{"slug":"smoke-hello","kind":"app","name":"x","short_description":"x","sources_url":"https://github.com/x/y"}'
call 404 "draft is invisible to others" "$API/apps/smoke-hello"
call 403 "moderation needs moderator" "${user[@]}" "$API/mod/queue"

call 400 "entry type mismatch" "${user[@]}" -X POST "$API/apps/smoke-hello/versions" \
    -F version=1.0.0 -F keira_version=1.0.0 -F entry_type=binary -F "entry=@$work/hello.lua"
call 201 "upload version" "${user[@]}" -X POST "$API/apps/smoke-hello/versions" \
    -F version=1.0.0 -F keira_version=1.0.0 -F entry_type=lua -F changelog='First' \
    -F "entry=@$work/hello.lua" -F "icon=@$work/icon.png" -F "screenshots=@$work/icon.png;filename=shot.png"
version_id=$(jq -r .id "$work/body")

call 404 "pending file is private" "$API/files/smoke-hello/$version_id/hello.lua"
call 200 "owner can preview pending file" "${user[@]}" "$API/files/smoke-hello/$version_id/hello.lua"
call 409 "cannot approve before scan" "${mod[@]}" "${json[@]}" -X POST "$API/mod/versions/$version_id/approve" -d '{}'

call 401 "scanner needs secret" "$API/scan/pending"
call 200 "scanner lists pending" "${scanner[@]}" "$API/scan/pending"
[ "$(jq -r '.ids[0]' "$work/body")" = "$version_id" ] || { echo "FAIL pending id"; exit 1; }
call 200 "scanner reads version" "${scanner[@]}" "$API/scan/versions/$version_id"
call 200 "scanner downloads file" "${scanner[@]}" "$(jq -r '.files[0].url' "$work/body")"
cmp -s "$work/body" "$work/hello.lua" || { echo "FAIL scanned file differs"; exit 1; }
call 200 "scanner reports clean" "${scanner[@]}" "${json[@]}" -X POST "$API/scan/versions/$version_id" -d '{"result":"clean","detail":"smoke"}'
call 409 "second verdict ignored" "${scanner[@]}" "${json[@]}" -X POST "$API/scan/versions/$version_id" -d '{"result":"infected"}'

call 200 "moderator queue" "${mod[@]}" "$API/mod/queue"
[ "$(jq -r '.items | length' "$work/body")" = 1 ] || { echo "FAIL queue length"; exit 1; }
call 200 "approve" "${mod[@]}" "${json[@]}" -X POST "$API/mod/versions/$version_id/approve" -d '{"note":"ok"}'

call 200 "public list" "$API/apps?kind=app"
[ "$(jq -r '.items[0].slug' "$work/body")" = smoke-hello ] || { echo "FAIL list"; exit 1; }
call 200 "search" "$API/apps?q=Hel"
[ "$(jq -r '.items | length' "$work/body")" = 1 ] || { echo "FAIL search"; exit 1; }
call 200 "public detail" "$API/apps/smoke-hello"
call 200 "public file" "$API/files/smoke-hello/$version_id/hello.lua"
call 200 "HEAD on public file" -I "$API/files/smoke-hello/$version_id/hello.lua"
grep -qi '^cross-origin-resource-policy: cross-origin' "$work/body" || { echo "FAIL CORP header"; exit 1; }

call 403 "owner cannot rate own app" "${user[@]}" "${json[@]}" -X PUT "$API/apps/smoke-hello/rating" -d '{"stars":5}'
call 200 "rate" "${fan[@]}" "${json[@]}" -X PUT "$API/apps/smoke-hello/rating" -d '{"stars":4}'
call 201 "report" "${fan[@]}" "${json[@]}" -X POST "$API/apps/smoke-hello/reports" -d '{"reason":"smoke"}'
call 200 "open reports" "${mod[@]}" "$API/mod/reports"

call 200 "export" "$API/export/manifests"
jq -e '.items[0].manifest.entryfile.location.origin | endswith("/hello.lua")' "$work/body" >/dev/null || { echo "FAIL export"; exit 1; }
cp "$work/body" "${EXPORT_OUT:-/dev/null}"

call 200 "owner hides app" "${user[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" -d '{"status":"hidden"}'
call 200 "hidden app leaves export" "$API/export/manifests"
[ "$(jq -r '.items | length' "$work/body")" = 0 ] || { echo "FAIL hidden in export"; exit 1; }
call 200 "owner republishes" "${user[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" -d '{"status":"published"}'

echo "all $pass checks passed"
