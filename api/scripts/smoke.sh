#!/usr/bin/env bash
# End-to-end check against `wrangler dev`: upload -> process -> approve -> /catalog.
#
# GitHub login cannot run locally, so two users and their sessions are written
# straight into the local D1. Needs `npm run db:migrate:local` and a running
# `npm run dev`, with SCAN_SECRET in .dev.vars.
set -euo pipefail
cd "$(dirname "$0")/.."

API=${API:-http://localhost:8787}
SCAN_SECRET=$(grep '^SCAN_SECRET=' .dev.vars | cut -d= -f2-)
MIRROR_SECRET=$(grep '^MIRROR_SECRET=' .dev.vars | cut -d= -f2-)
USER_TOKEN=smoke-user-token
MOD_TOKEN=smoke-mod-token
sha() { printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1; }

npx wrangler d1 execute lilka-catalog --local --command "
DELETE FROM sessions; DELETE FROM ratings; DELETE FROM reports; UPDATE apps SET latest_version_id = NULL; DELETE FROM versions; DELETE FROM apps; DELETE FROM users WHERE id != 0;
INSERT INTO users (id, login, role, bio, blog) VALUES (1, 'smoke-dev', 'user', 'Makes <b>tests</b>', 'https://example.com/');
INSERT INTO users (id, login, role) VALUES (2, 'smoke-mod', 'moderator'), (3, 'smoke-fan', 'user');
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
mirror=(-H "Authorization: Bearer $MIRROR_SECRET")
json=(-H 'Content-Type: application/json')

call 401 "me without session" "$API/auth/me"
call 200 "me with session" "${user[@]}" "$API/auth/me"
call 400 "login rejects foreign return" "$API/auth/login?return=https://evil.example/"

call 201 "create app" "${user[@]}" "${json[@]}" -X POST "$API/apps" \
    -d '{"slug":"smoke-hello","kind":"app","name":{"uk":"Привіт","en":"Hello"},"short_description":"Синій екран","sources_url":"https://github.com/lilka-dev/examples"}'
call 409 "duplicate slug" "${user[@]}" "${json[@]}" -X POST "$API/apps" \
    -d '{"slug":"smoke-hello","kind":"app","name":"x","short_description":"x","sources_url":"https://github.com/x/y"}'
call 404 "draft is invisible to others" "${fan[@]}" "$API/apps/smoke-hello"
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
call 400 "processor cannot write foreign files" "${scanner[@]}" -X POST "$API/scan/versions/$version_id" \
    -F result=clean -F "artifact=@$work/hello.lua;filename=../evil.lua"
call 200 "processor reports clean" "${scanner[@]}" -X POST "$API/scan/versions/$version_id" \
    -F result=clean -F detail=smoke -F icon_min=icon_min.bin -F package=package.zip \
    -F 'security={"scan_date":"smoke","clamav_available":true,"files":[]}' \
    -F "artifact=@$work/icon.png;filename=icon_min.bin" -F "artifact=@$work/hello.lua;filename=package.zip"
call 409 "second verdict ignored" "${scanner[@]}" -X POST "$API/scan/versions/$version_id" -F result=infected

call 200 "moderator queue" "${mod[@]}" "$API/mod/queue"
[ "$(jq -r '.items | length' "$work/body")" = 1 ] || { echo "FAIL queue length"; exit 1; }
call 200 "approve" "${mod[@]}" "${json[@]}" -X POST "$API/mod/versions/$version_id/approve" -d '{"note":"ok"}'

call 200 "list (signed in)" "${fan[@]}" "$API/apps?kind=app"
[ "$(jq -r '.items[0].slug' "$work/body")" = smoke-hello ] || { echo "FAIL list"; exit 1; }
call 200 "search" "${fan[@]}" "$API/apps?q=Hel"
[ "$(jq -r '.items | length' "$work/body")" = 1 ] || { echo "FAIL search"; exit 1; }
call 200 "detail (signed in)" "${fan[@]}" "$API/apps/smoke-hello"
call 404 "approved file is not served to strangers" "${fan[@]}" "$API/files/smoke-hello/$version_id/hello.lua"
call 200 "owner gets the approved file" "${user[@]}" "$API/files/smoke-hello/$version_id/hello.lua"
call 200 "HEAD for the owner" -I "${user[@]}" "$API/files/smoke-hello/$version_id/hello.lua"

call 201 "report" "${fan[@]}" "${json[@]}" -X POST "$API/apps/smoke-hello/reports" -d '{"reason":"smoke"}'
call 200 "open reports" "${mod[@]}" "$API/mod/reports"

call 200 "catalog index lists the app" "${mirror[@]}" "$API/catalog/apps/index_0.json"
jq -e '.manifests | index("smoke-hello")' "$work/body" >/dev/null || { echo "FAIL catalog index"; exit 1; }
call 200 "catalog index.json" "${mirror[@]}" "$API/catalog/apps/smoke-hello/index.json"
jq -e '.entryfile.location == "hello.lua" and .icon_min == "icon_min.bin" and .package == "package.zip" and .author == "@smoke-dev"' \
    "$work/body" >/dev/null || { echo "FAIL catalog doc"; cat "$work/body"; exit 1; }
call 200 "catalog index_short.json" "${mirror[@]}" "$API/catalog/apps/smoke-hello/index_short.json"
call 200 "catalog static entry file" "${mirror[@]}" "$API/catalog/apps/smoke-hello/static/hello.lua"
cmp -s "$work/body" "$work/hello.lua" || { echo "FAIL catalog static bytes"; exit 1; }
call 200 "catalog icon_min" "${mirror[@]}" "$API/catalog/apps/smoke-hello/static/icon_min.bin"
call 404 "catalog refuses unlisted file" "${mirror[@]}" "$API/catalog/apps/smoke-hello/static/secret.txt"
call 200 "catalog package download" "${mirror[@]}" "$API/catalog/apps/smoke-hello/package.zip?download"
call 200 "catalog authors.json" "${mirror[@]}" "$API/catalog/authors.json"
jq -e '."@smoke-dev"[0].path == "smoke-hello"' "$work/body" >/dev/null || { echo "FAIL authors"; exit 1; }
call 404 "catalog unknown kind" "${mirror[@]}" "$API/catalog/games/index_0.json"
call 401 "listing.json needs the mirror secret" "$API/catalog/apps/listing.json"
call 200 "listing.json for the site" "${mirror[@]}" "$API/catalog/apps/listing.json"
jq -e '.items[] | select(.path == "smoke-hello") | (.added != null) and (.updated != null) and .author == "@smoke-dev"' \
    "$work/body" >/dev/null && li=ok || li="$(jq -c '.items[] | select(.path == "smoke-hello")' "$work/body")"
check "listing has dates and author" ok "$li"
pub=$(npx wrangler d1 execute lilka-catalog --local --json --command "SELECT published_at FROM apps WHERE slug = 'smoke-hello'" 2>/dev/null | jq -r '.[0].results[0].published_at')
check "published_at set on first approval" ok "$([ -n "$pub" ] && [ "$pub" != null ] && echo ok || echo missing)"

# wrangler dev's local explorer lists the bucket; R2 keys are <app id>-<slug>/v/<version>/<file>
r2_keys=$(curl -sS "$API/cdn-cgi/local/explorer/api/r2/buckets/lilka-catalog-files/objects?limit=1000" | jq -r '.result[].key')
echo "$r2_keys" | grep -q "^[0-9]*-smoke-hello/v/1\.0\.0/hello\.lua$" && r2=ok || r2=missing
check "R2 layout <id>-<slug>/v/<version>/<file>" ok "$r2"

call 201 "create mod" "${user[@]}" "${json[@]}" -X POST "$API/apps" \
    -d '{"slug":"smoke-case","kind":"mod","name":"Корпус","short_description":"Друкований корпус","sources_url":"https://www.printables.com/model/1"}'
printf 'solid case\nendsolid case\n' > "$work/case.stl"
call 400 "mod rejects entry file" "${user[@]}" -X POST "$API/apps/smoke-case/versions" -F version=1.0.0 -F "entry=@$work/hello.lua"
call 201 "mod upload without entry" "${user[@]}" -X POST "$API/apps/smoke-case/versions" \
    -F version=1.0.0 -F "files=@$work/case.stl" -F "icon=@$work/icon.png" -F "screenshots=@$work/icon.png"

printf 'X5O!P%%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n' > "$work/evil.lua"
call 201 "upload infected version" "${user[@]}" -X POST "$API/apps/smoke-hello/versions" \
    -F version=1.0.1 -F keira_version=1.0.0 -F entry_type=lua -F "entry=@$work/evil.lua"
evil_id=$(jq -r .id "$work/body")
call 200 "processor reports infected" "${scanner[@]}" -X POST "$API/scan/versions/$evil_id" -F result=infected -F 'detail=evil.lua: Eicar FOUND'
call 409 "infected version cannot be approved" "${mod[@]}" "${json[@]}" -X POST "$API/mod/versions/$evil_id/approve" -d '{}'
call 200 "catalog still serves the clean version" "${mirror[@]}" "$API/catalog/apps/smoke-hello/index.json"
jq -e '.entryfile.location == "hello.lua"' "$work/body" >/dev/null || { echo "FAIL infected leaked"; exit 1; }

call 201 "moderator imports a repo app" "${mod[@]}" -X POST "$API/mod/import" \
    -F 'meta={"slug":"Smoke_Import","kind":"app","author":"@smoke-dev","name":{"uk":"Імпорт"},"short_description":{"uk":"з репозиторію\n"},"sources":{"type":"git","origin":"https://github.com/smoke-dev/x"}}' \
    -F version=1.0.0 -F keira_version=1.0.0 -F entry_type=lua -F "entry=@$work/hello.lua"
import_id=$(jq -r .version_id "$work/body")
call 200 "queue shows the import" "${mod[@]}" "$API/mod/queue?status=pending_scan"
jq -e --argjson id "$import_id" '.items[] | select(.version.id == $id) | .app.author == "@smoke-dev" and .app.owner == "lilka-catalog" and .app.unclaimed == true' \
    "$work/body" >/dev/null && imp=ok || imp=wrong
check "queue gives author, owner and unclaimed" ok "$imp"
call 409 "catalog account cannot be banned" "${mod[@]}" -X POST "$API/mod/users/lilka-catalog/ban"
call 404 "hand over needs a signed-in user" "${mod[@]}" "${json[@]}" -X PATCH "$API/apps/Smoke_Import" -d '{"owner":"nobody-here"}'
call 200 "moderator hands the import over" "${mod[@]}" "${json[@]}" -X PATCH "$API/apps/Smoke_Import" -d '{"owner":"smoke-dev"}'
check "new owner sees it in their apps" ok "$(curl -sS "${user[@]}" "$API/users/smoke-dev/apps" | jq -r '[.items[].slug] | index("Smoke_Import") | if . == null then "missing" else "ok" end')"
# The import handed over today was created by the import, not by smoke-dev:
# with their own 2 items today they may add a 3rd, and only the 4th is refused
newapp() { curl -s -o "$work/body" -w '%{http_code}' "${user[@]}" "${json[@]}" -X POST "$API/apps" \
    -d "{\"slug\":\"$1\",\"kind\":\"app\",\"name\":\"s\",\"short_description\":\"s\",\"sources_url\":\"https://github.com/a/b\"}"; }
check "a handed-over import does not count as a new item" 201 "$(newapp smoke-third)"
check "the 4th own item in a day is refused" 429 "$(newapp smoke-fourth)"
call 200 "app after hand-over" "${mod[@]}" "$API/apps/Smoke_Import"
check "author line kept after hand-over" "@smoke-dev" "$(jq -r .author "$work/body")"
call 404 "import is not public before processing" "${mirror[@]}" "$API/catalog/apps/Smoke_Import/index.json"

# --- security regressions -----------------------------------------------
call 200 "huge page number is clamped" "${fan[@]}" "$API/apps?page=99999999999999999999"
call 409 "second report on the same app" "${fan[@]}" "${json[@]}" -X POST "$API/apps/smoke-hello/reports" -d '{"reason":"again"}'
spam() { # count of 201s out of $1 new apps by the fan, slugs from $2
    local made=0 i s
    for i in $(seq 1 "$1"); do
        s=$(curl -s -o "$work/body" -w '%{http_code}' "${fan[@]}" "${json[@]}" -X POST "$API/apps" \
            -d "{\"slug\":\"$2-$i\",\"kind\":\"app\",\"name\":\"s\",\"short_description\":\"s\",\"sources_url\":\"https://github.com/a/b\"}")
        [ "$s" = 201 ] && made=$((made+1))
    done
    echo "$made"
}
check "new items per day capped at 3" 3 "$(spam 6 fan-spam)"
grep -q "per day" "$work/body" && msg=ok || msg=other
check "daily cap says so" ok "$msg"
# Yesterday's items no longer count, but 20 per account still holds
npx wrangler d1 execute lilka-catalog --local --command "
UPDATE apps SET created_at = datetime('now', '-2 days') WHERE owner_id = 3;
INSERT INTO apps (slug, owner_id, created_by, kind, sources_url, created_at)
SELECT 'fan-old-' || value, 3, 3, 'app', 'https://github.com/a/b', datetime('now', '-2 days')
  FROM json_each('[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]');" >/dev/null
check "a day later the fan can add again" 1 "$(spam 1 fan-next)"
check "apps per account capped at 20" 0 "$(spam 1 fan-over)"
grep -q "20 apps" "$work/body" && msg=ok || msg=other
check "account cap says so" ok "$msg"

# --- moderator lists and hand-over ---------------------------------------
call 403 "users list is for moderators" "${user[@]}" "$API/mod/users"
call 200 "moderator lists users" "${mod[@]}" "$API/mod/users"
jq -e '(.items[0].system == true) and ([.items[] | select(.login == "smoke-fan")][0].items == 20)' "$work/body" >/dev/null && ul=ok || ul=bad
check "users list: catalog account first, item counts" ok "$ul"
call 403 "apps list is for moderators" "${fan[@]}" "$API/mod/apps"
call 200 "moderator lists every item" "${mod[@]}" "$API/mod/apps"
jq -e '[.items[] | select(.slug == "fan-old-1")][0] | .owner == "smoke-fan" and .status == "draft"' "$work/body" >/dev/null && al=ok || al=bad
check "apps list has drafts with their owner" ok "$al"
call 403 "owner cannot hand an app over" "${fan[@]}" "${json[@]}" -X PATCH "$API/apps/fan-old-1" -d '{"owner":"smoke-dev"}'
call 200 "moderator hands an app to another user" "${mod[@]}" "${json[@]}" -X PATCH "$API/apps/fan-old-1" -d '{"owner":"smoke-dev"}'
check "the new owner has it" smoke-dev "$(jq -r .owner.login "$work/body")"
call 200 "moderator hands it back to the catalog account" "${mod[@]}" "${json[@]}" -X PATCH "$API/apps/fan-old-1" -d '{"owner":"lilka-catalog"}'
npx wrangler d1 execute lilka-catalog --local --command "INSERT INTO users (id, login, role) VALUES (4, 'smoke-banned', 'banned');" >/dev/null
call 409 "no hand-over to a banned user" "${mod[@]}" "${json[@]}" -X PATCH "$API/apps/fan-old-1" -d '{"owner":"smoke-banned"}'
call 200 "download name is encoded" -I "${user[@]}" "$API/files/smoke-hello/$version_id/hello.lua?download"
grep -qi "filename\*=UTF-8''hello.lua" "$work/body" && dl=ok || dl=raw
check "Content-Disposition uses filename*" ok "$dl"
r2_list() { curl -sS "$API/cdn-cgi/local/explorer/api/r2/buckets/lilka-catalog-files/objects?limit=1000" | jq -r '.result[].key'; }
# The local bucket outlives the database between runs, so look only at this run's folders
prefix_of() { npx wrangler d1 execute lilka-catalog --local --json --command "SELECT storage_prefix FROM versions WHERE id = $1" 2>/dev/null | jq -r '.[0].results[0].storage_prefix'; }
check "infected files are deleted" 0 "$(r2_list | grep -c "^$(prefix_of "$evil_id")/" || true)"
call 201 "upload a version to reject" "${user[@]}" -X POST "$API/apps/smoke-case/versions" -F version=2.0.0 -F "files=@$work/case.stl"
reject_id=$(jq -r .id "$work/body")
call 200 "processor clears it" "${scanner[@]}" -X POST "$API/scan/versions/$reject_id" -F result=clean
call 200 "moderator rejects it" "${mod[@]}" "${json[@]}" -X POST "$API/mod/versions/$reject_id/reject" -d '{"note":"not a case"}'
sleep 1
check "rejected files are deleted" 0 "$(r2_list | grep -c "^$(prefix_of "$reject_id")/" || true)"
check "approved files are kept" 1 "$(r2_list | grep -c "^$(prefix_of "$version_id")/hello.lua$" || true)"

call 200 "owner hides app" "${user[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" -d '{"status":"hidden"}'
call 404 "hidden app leaves the catalog" "${mirror[@]}" "$API/catalog/apps/smoke-hello/index.json"
call 403 "author change needs moderator" "${user[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" -d '{"author":"@someone"}'
call 200 "moderator sets author" "${mod[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" -d '{"author":"@historic"}'
call 200 "owner republishes" "${user[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" -d '{"status":"published"}'

# --- denial-of-service hardening -----------------------------------------
call 401 "anonymous app list refused" "$API/apps"
call 401 "anonymous user list refused" "$API/users/smoke-dev/apps"
call 401 "catalog without the mirror secret" "$API/catalog/export.json"
call 401 "catalog with a wrong secret" -H "Authorization: Bearer nope" "$API/catalog/apps/index_0.json"
call 401 "scanner route with the mirror secret" "${mirror[@]}" "$API/scan/pending"
# An author line naming someone else gets no profile: the owner's stays theirs
call 200 "author info: export with a foreign author line" "${mirror[@]}" "$API/catalog/authors_info.json"
jq -e '.authors | length == 1 and .[0].id == "historic" and .[0].registered == false and .[0].bio == null' "$work/body" >/dev/null && fa=ok || fa=bad
check "a foreign author line does not borrow the owner's profile" ok "$fa"
call 200 "moderator clears the author line" "${mod[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" -d '{"author":null}'
call 200 "export for the mirror job" "${mirror[@]}" "$API/catalog/export.json"
jq -e '.items["apps/smoke-hello"].version and .documents["apps/smoke-hello/index.json"]' "$work/body" >/dev/null && ex=ok || ex=bad
check "export lists the app" ok "$ex"
jq -e '.documents["authors_info.json"] | fromjson | .authors[] | select(.id == "smoke-dev") | .registered and .login == "smoke-dev" and .bio == "Makes <b>tests</b>" and .blog == "https://example.com/" and .counts.apps >= 1' "$work/body" >/dev/null && ai=ok || ai=bad
check "authors_info.json: one author per login, with the profile" ok "$ai"
latest=$(npx wrangler d1 execute lilka-catalog --local --json --command "SELECT latest_version_id FROM apps WHERE slug = 'smoke-hello'" 2>/dev/null | jq -r '.[0].results[0].latest_version_id')
check "latest_version_id is the approved version, not the infected one" "$version_id" "$latest"
location=$(curl -sS -o /dev/null -w '%{redirect_url}' "$API/auth/login?return=http://localhost:8000/")
state=$(printf '%s' "$location" | sed -n 's/.*[?&]state=\([^&]*\).*/\1/p')
check "OAuth state is a signed token, not a stored row" ok "$(printf '%s' "$state" | grep -qE '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' && echo ok || echo "$state")"
# Flip the signature's first character: the last one also carries padding
# bits the decoder ignores, so changing it can leave the same bytes
sig=${state#*.}; first=${sig:0:1}; [ "$first" = A ] && swap=B || swap=A
call 400 "tampered OAuth state refused" "$API/auth/callback?code=x&state=${state%%.*}.$swap${sig:1}"
call 400 "made-up OAuth state refused" "$API/auth/callback?code=x&state=eyJyIjoiaHR0cHM6Ly9ldmlsLmV4YW1wbGUvIn0.AAAA"

# Last, because it uses up this IP's budget for a minute
limited=$(seq 1 330 | xargs -P 30 -I{} curl -s -o /dev/null -w '%{http_code}\n' "$API/" | grep -c '^429$' || true)
check "per-IP rate limit kicks in" yes "$([ "$limited" -gt 0 ] && echo yes || echo "no 429 in 330 requests")"
cors=$(curl -sS -o /dev/null -D - -H 'Origin: http://localhost:8000' "${user[@]}" "$API/auth/me" | tr -d '\r')
check "a 429 still has CORS headers, so the site can read it" ok \
    "$(grep -q '^HTTP/[0-9.]* 429' <<<"$cors" && grep -qi '^access-control-allow-origin: http://localhost:8000' <<<"$cors" && echo ok || echo "$cors")"

echo "all $pass checks passed"
