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

# smoke-mod has users.role = 'moderator' and a staff row, as migration 0009
# leaves the moderators it moves over
npx wrangler d1 execute lilka-catalog --local --command "
DELETE FROM sessions; DELETE FROM ratings; DELETE FROM reports; DELETE FROM staff; DELETE FROM mod_log; UPDATE apps SET latest_version_id = NULL; DELETE FROM versions; DELETE FROM apps; DELETE FROM users WHERE id != 0;
INSERT INTO users (id, login, role, bio, blog) VALUES (1, 'smoke-dev', 'user', 'Makes <b>tests</b>', 'https://example.com/');
INSERT INTO users (id, login, role) VALUES (2, 'smoke-mod', 'moderator'), (3, 'smoke-fan', 'user'), (7, 'smoke-admin', 'user'), (8, 'smoke-boss', 'user'), (11, 'smoke-keeper', 'user'), (12, 'smoke-author', 'user');
INSERT INTO staff (user_id, role) VALUES (2, 'moderator'), (7, 'admin'), (8, 'main_admin');
INSERT INTO sessions VALUES ('$(sha $USER_TOKEN)', 1, datetime('now', '+1 day'));
INSERT INTO sessions VALUES ('$(sha $MOD_TOKEN)', 2, datetime('now', '+1 day'));
INSERT INTO sessions VALUES ('$(sha fan-token)', 3, datetime('now', '+1 day'));
INSERT INTO sessions VALUES ('$(sha admin-token)', 7, datetime('now', '+1 day'));
INSERT INTO sessions VALUES ('$(sha boss-token)', 8, datetime('now', '+1 day'));
INSERT INTO sessions VALUES ('$(sha keeper-token)', 11, datetime('now', '+1 day'));
INSERT INTO sessions VALUES ('$(sha author-token)', 12, datetime('now', '+1 day'));" >/dev/null

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
admin=(-H "Authorization: Bearer admin-token")
boss=(-H "Authorization: Bearer boss-token")
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
call 400 "mJS is no longer accepted" "${user[@]}" -X POST "$API/apps/smoke-hello/versions" \
    -F version=1.0.0 -F keira_version=1.0.0 -F entry_type=js -F "entry=@$work/hello.lua;filename=hello.js"
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

call 401 "rating needs a session" "${json[@]}" -X PUT "$API/apps/smoke-hello/rating" -d '{"stars":5}'
call 403 "owner cannot rate own app" "${user[@]}" "${json[@]}" -X PUT "$API/apps/smoke-hello/rating" -d '{"stars":5}'
call 400 "stars must be 1..5" "${fan[@]}" "${json[@]}" -X PUT "$API/apps/smoke-hello/rating" -d '{"stars":6}'
call 200 "rate" "${fan[@]}" "${json[@]}" -X PUT "$API/apps/smoke-hello/rating" -d '{"stars":2}'
call 200 "change the rating" "${fan[@]}" "${json[@]}" -X PUT "$API/apps/smoke-hello/rating" -d '{"stars":4}'
check "rating answer has the fresh average" '{"my_rating":4,"average":4,"count":1}' "$(jq -c . "$work/body")"
call 200 "moderator rates too" "${mod[@]}" "${json[@]}" -X PUT "$API/apps/smoke-hello/rating" -d '{"stars":5}'
check "average of two" "4.5 2" "$(jq -r '"\(.average) \(.count)"' "$work/body")"
call 200 "own ratings come with the session check" "${fan[@]}" "$API/auth/me"
check "/auth/me carries the user's ratings" 4 "$(jq -r '.ratings["smoke-hello"]' "$work/body")"
call 200 "remove a rating" "${mod[@]}" -X DELETE "$API/apps/smoke-hello/rating"
check "removed rating is gone" null "$(curl -sS "${mod[@]}" "$API/auth/me" | jq -r '.ratings["smoke-hello"]')"
call 404 "no rating for a draft" "${fan[@]}" "${json[@]}" -X PUT "$API/apps/smoke-mod-x/rating" -d '{"stars":3}'
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
jq -e '.items[] | select(.path == "smoke-hello") | (.added != null) and (.updated != null) and .rating.average == 4 and .rating.count == 1 and .author == "@smoke-dev"' \
    "$work/body" >/dev/null && li=ok || li="$(jq -c '.items[] | select(.path == "smoke-hello")' "$work/body")"
check "listing has dates, rating and author" ok "$li"
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

call 403 "a moderator cannot import" "${mod[@]}" -X POST "$API/mod/import" -F 'meta={}'
call 201 "an admin imports a repo app" "${admin[@]}" -X POST "$API/mod/import" \
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

# --- moderator tools ------------------------------------------------------
call 200 "all items with counts" "${mod[@]}" "$API/mod/apps"
jq -e '[.items[] | select(.slug == "smoke-hello")][0] | .versions >= 1 and .created_by == "smoke-dev" and (.rating | has("average")) and (.open_reports >= 1)' "$work/body" >/dev/null && ma=ok || ma=bad
check "all items: versions, creator, rating, reports" ok "$ma"
jq -e '[.items[] | select(.slug == "Smoke_Import")][0].created_by == null' "$work/body" >/dev/null && mi=ok || mi=bad
check "an import has no creator" ok "$mi"
call 403 "user details are for moderators" "${fan[@]}" "$API/mod/users/smoke-dev"
call 200 "moderator opens a user" "${mod[@]}" "$API/mod/users/smoke-fan"
jq -e '.stats.created == 20 and .stats.sessions == 1 and (.items | length) == 19 and .user.trusted == false' "$work/body" >/dev/null && ud=ok || ud=bad
check "user details: created 20, owns 19 (one handed away), sessions" ok "$ud"
call 400 "note too long" "${mod[@]}" "${json[@]}" -X PATCH "$API/mod/users/smoke-fan" -d "{\"note\":\"$(printf 'x%.0s' $(seq 1 2001))\"}"
call 403 "users cannot edit users" "${fan[@]}" "${json[@]}" -X PATCH "$API/mod/users/smoke-fan" -d '{"trusted":true}'
call 200 "moderator trusts the fan and leaves a note" "${mod[@]}" "${json[@]}" -X PATCH "$API/mod/users/smoke-fan" -d '{"trusted":true,"note":"knows the hardware"}'
check "a trusted author is past the 20-item cap" 1 "$(spam 1 fan-trusted)"
call 200 "moderator takes trust back" "${mod[@]}" "${json[@]}" -X PATCH "$API/mod/users/smoke-fan" -d '{"trusted":false}'
check "the cap is back" 0 "$(spam 1 fan-untrusted)"
check "the note is kept" "knows the hardware" "$(curl -sS "${mod[@]}" "$API/mod/users/smoke-fan" | jq -r .user.mod_note)"
npx wrangler d1 execute lilka-catalog --local --command "
INSERT INTO users (id, login, role) VALUES (6, 'smoke-temp', 'user');
INSERT INTO sessions VALUES ('$(sha temp-token)', 6, datetime('now', '+30 days'));" >/dev/null
temp=(-H "Authorization: Bearer temp-token")
call 200 "temp user rates" "${temp[@]}" "${json[@]}" -X PUT "$API/apps/smoke-hello/rating" -d '{"stars":2}'
call 200 "moderator removes the user's ratings" "${mod[@]}" -X DELETE "$API/mod/users/smoke-temp/ratings"
check "one rating removed" 1 "$(jq -r .ratings "$work/body")"
call 200 "moderator ends the user's sessions" "${mod[@]}" -X POST "$API/mod/users/smoke-temp/sign-out"
call 401 "the ended session no longer works" "${temp[@]}" "$API/auth/me"

call 201 "moderator makes an item to delete" "${mod[@]}" "${json[@]}" -X POST "$API/apps" \
    -d '{"slug":"smoke-delete","kind":"app","name":"d","short_description":"d","sources_url":"https://github.com/a/b"}'
call 201 "with a version" "${mod[@]}" -X POST "$API/apps/smoke-delete/versions" \
    -F version=1.0.0 -F keira_version=1.0.0 -F entry_type=lua -F "entry=@$work/hello.lua"
delete_prefix=$(npx wrangler d1 execute lilka-catalog --local --json --command "SELECT v.storage_prefix FROM versions v JOIN apps a ON a.id = v.app_id WHERE a.slug = 'smoke-delete'" 2>/dev/null | jq -r '.[0].results[0].storage_prefix')
call 400 "delete needs the slug repeated" "${admin[@]}" "${json[@]}" -X DELETE "$API/mod/apps/smoke-delete" -d '{"confirm":"smoke"}'
call 403 "users cannot delete items" "${user[@]}" "${json[@]}" -X DELETE "$API/mod/apps/smoke-delete" -d '{"confirm":"smoke-delete"}'
call 403 "a moderator cannot delete items" "${mod[@]}" "${json[@]}" -X DELETE "$API/mod/apps/smoke-delete" -d '{"confirm":"smoke-delete"}'
call 200 "an admin deletes the item" "${admin[@]}" "${json[@]}" -X DELETE "$API/mod/apps/smoke-delete" -d '{"confirm":"smoke-delete"}'
call 404 "deleted item is gone" "${mod[@]}" "$API/apps/smoke-delete"
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
check "a deleted item's files are gone" 0 "$(r2_list | grep -c "^$delete_prefix/" || true)"
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

# --- new versions: keep_* and version order --------------------------------
# smoke-keeper's own item: the upload limits of smoke-dev and the item
# limit of smoke-fan are used up by the checks above
keeper=(-H "Authorization: Bearer keeper-token")
approve() { # version id
    call 200 "processor clears $1" "${scanner[@]}" -X POST "$API/scan/versions/$1" -F result=clean
    call 200 "moderator approves $1" "${mod[@]}" "${json[@]}" -X POST "$API/mod/versions/$1/approve" -d '{}'
}
latest_of() { npx wrangler d1 execute lilka-catalog --local --json --command "SELECT latest_version_id FROM apps WHERE slug = '$1'" 2>/dev/null | jq -r '.[0].results[0].latest_version_id'; }
printf 'level data\n' > "$work/data.txt"
call 201 "create an item to version" "${keeper[@]}" "${json[@]}" -X POST "$API/apps" \
    -d '{"slug":"smoke-keep","kind":"app","name":"Keep","short_description":"Versions","sources_url":"https://github.com/smoke-keeper/keep","license":"MIT"}'
call 409 "keep_* needs an approved version" "${keeper[@]}" -X POST "$API/apps/smoke-keep/versions" \
    -F version=1.0.0 -F keira_version=1.0.0 -F entry_type=lua -F "entry=@$work/hello.lua" -F keep_icon=1
call 201 "first version with icon, screenshots and a file" "${keeper[@]}" -X POST "$API/apps/smoke-keep/versions" \
    -F version=1.0.0 -F keira_version=1.0.0 -F entry_type=lua -F changelog='Перша' -F "entry=@$work/hello.lua" \
    -F "icon=@$work/icon.png" -F "screenshots=@$work/icon.png;filename=shot.png" \
    -F "screenshots=@$work/icon.png;filename=shot2.png" -F "files=@$work/data.txt"
keep_v1=$(jq -r .id "$work/body")
approve "$keep_v1"
call 201 "next version keeps icon, screenshots and files" "${keeper[@]}" -X POST "$API/apps/smoke-keep/versions" \
    -F version=1.1.0 -F keira_version=1.1.0 -F entry_type=lua -F changelog='Друга' -F "entry=@$work/hello.lua" \
    -F keep_icon=1 -F keep_screenshots=1 -F keep_files=1 -F "screenshots=@$work/icon.png;filename=shot3.png"
keep_v2=$(jq -r .id "$work/body")
check "kept icon, screenshots in order plus the new one, kept file" "icon.png shot.png,shot2.png,shot3.png data.txt" \
    "$(jq -r '"\(.icon.name) \([.screenshots[].name] | join(",")) \([.files[].name] | join(","))"' "$work/body")"
call 200 "kept file is in the new version" "${keeper[@]}" "$API/files/smoke-keep/$keep_v2/data.txt"
cmp -s "$work/body" "$work/data.txt" && kb=ok || kb=differs
check "kept file has the same bytes" ok "$kb"
check "kept files are copied into the new version's folder" 4 \
    "$(r2_list | grep -cE "^$(prefix_of "$keep_v2")/(icon|shot|shot2|data)\.(png|txt)$" || true)"
call 409 "a lower version number is refused" "${keeper[@]}" -X POST "$API/apps/smoke-keep/versions" \
    -F version=1.0.5 -F keira_version=1.0.0 -F entry_type=lua -F "entry=@$work/hello.lua"
call 400 "kept screenshots count toward the limit" "${keeper[@]}" -X POST "$API/apps/smoke-keep/versions" \
    -F version=1.2.0 -F keira_version=1.0.0 -F entry_type=lua -F "entry=@$work/hello.lua" -F keep_screenshots=1 \
    $(for i in 1 2 3 4 5 6; do printf -- '-F screenshots=@%s;filename=n%s.png ' "$work/icon.png" "$i"; done)
call 201 "a version without keep_* starts empty" "${keeper[@]}" -X POST "$API/apps/smoke-keep/versions" \
    -F version=1.2.0 -F keira_version=1.1.0 -F entry_type=lua -F changelog='Третя' -F "entry=@$work/hello.lua"
keep_v3=$(jq -r .id "$work/body")
check "no icon unless kept" "null 0" "$(jq -r '"\(.icon) \(.screenshots | length)"' "$work/body")"
# Approved out of order: 1.2.0 first, then 1.1.0
approve "$keep_v3"
call 200 "processor clears the older one" "${scanner[@]}" -X POST "$API/scan/versions/$keep_v2" -F result=clean
call 200 "approve the older version last" "${mod[@]}" "${json[@]}" -X POST "$API/mod/versions/$keep_v2/approve" -d '{}'
check "the answer says it did not become the latest" false "$(jq -r .latest "$work/body")"
check "the highest approved version stays the latest" "$keep_v3" "$(latest_of smoke-keep)"
call 200 "listing.json with the latest version's facts" "${mirror[@]}" "$API/catalog/apps/listing.json"
check "listing: version, Keira version, entry type, license" "1.2.0 1.1.0 lua MIT" \
    "$(jq -r '.items[] | select(.path == "smoke-keep") | "\(.version) \(.keira_version) \(.entry_type) \(.license)"' "$work/body")"
call 200 "versions.json" "${mirror[@]}" "$API/catalog/apps/smoke-keep/versions.json"
check "versions.json: every approved version, highest first, with changelogs" "1.2.0 1.2.0,1.1.0,1.0.0 Третя" \
    "$(jq -r '"\(.latest) \([.versions[].version] | join(",")) \(.versions[0].localization.uk.changelog)"' "$work/body")"
call 200 "export with versions.json" "${mirror[@]}" "$API/catalog/export.json"
check "export carries versions.json" ok \
    "$(jq -e '.documents["apps/smoke-keep/versions.json"] | fromjson | .versions | length == 3' "$work/body" >/dev/null && echo ok || echo missing)"
check "index.json keeps the fields Keira knows" ok \
    "$(jq -e '.documents["apps/smoke-keep/index.json"] | fromjson | (has("version") or has("license")) | not' "$work/body" >/dev/null && echo ok || echo changed)"
# --- moderation log, hiding, drafts, withdrawing (migration 0010) ---------
author=(-H "Authorization: Bearer author-token")
call 403 "the log is for staff" "${fan[@]}" "$API/mod/log"
call 200 "reviews are in the log" "${mod[@]}" "$API/mod/log?app=smoke-keep"
check "log: the last approval, by whom, not the latest" "version.approve smoke-mod 1.1.0 false smoke-keeper" \
    "$(jq -r '.items[0] | "\(.action) \(.actor) \(.version) \(.detail.latest) \(.user_login)"' "$work/body")"
call 200 "a rejection keeps its reason in the log" "${mod[@]}" "$API/mod/log?app=smoke-case"
check "log: reject with the note" "version.reject 2.0.0 not a case" \
    "$(jq -r '[.items[] | select(.action == "version.reject")][0] | "\(.action) \(.version) \(.detail.note)"' "$work/body")"
call 200 "the log of the import" "${mod[@]}" "$API/mod/log?app=Smoke_Import"
check "log: hand-over from the catalog account" "item.owner lilka-catalog smoke-dev" \
    "$(jq -r '[.items[] | select(.action == "item.owner")][0] | "\(.action) \(.detail.from) \(.detail.to)"' "$work/body")"

call 200 "a moderator hides an item with a reason" "${mod[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" \
    -d '{"status":"hidden","note":"the source link is broken"}'
check "the owner sees that a moderator hid it, and why" "true the source link is broken" \
    "$(curl -sS "${user[@]}" "$API/users/smoke-dev/apps" | jq -r '.items[] | select(.slug == "smoke-hello") | "\(.mod_hidden) \(.hidden_note)"')"
call 403 "the owner cannot bring back what a moderator hid" "${user[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" -d '{"status":"published"}'
call 200 "the owner hiding it again" "${user[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" -d '{"status":"hidden"}'
call 403 "does not unlock it" "${user[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" -d '{"status":"published"}'
call 200 "the owner can still fix it" "${user[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" -d '{"sources_url":"https://github.com/smoke-dev/hello"}'
call 200 "a moderator publishes it again" "${mod[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" -d '{"status":"published"}'
check "and the lock is gone" "published false null" "$(jq -r '"\(.status) \(.mod_hidden) \(.hidden_note)"' "$work/body")"
call 200 "the log of the item" "${mod[@]}" "$API/mod/log?app=smoke-hello"
check "log: publish, hide with its note, the owner named; the owner's own edits are not logged" \
    "item.publish item.hide the source link is broken smoke-dev 2" \
    "$(jq -r '"\(.items[0].action) \(.items[1].action) \(.items[1].detail.note) \(.items[1].user_login) \([.items[] | select(.action == "item.hide" or .action == "item.publish")] | length)"' "$work/body")"
call 200 "the owner hides and returns their own item" "${user[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" -d '{"status":"hidden"}'
call 200 "as before" "${user[@]}" "${json[@]}" -X PATCH "$API/apps/smoke-hello" -d '{"status":"published"}'

call 200 "detail: latest_version is the highest approved, not the newest approval" "${fan[@]}" "$API/apps/smoke-keep"
check "latest_version of smoke-keep" 1.2.0 "$(jq -r .latest_version.version "$work/body")"
race=$(for i in 1 2 3; do curl -s -o /dev/null -w '%{http_code}\n' "${admin[@]}" "${json[@]}" -X POST "$API/apps" \
    -d '{"slug":"smoke-race","kind":"app","name":"r","short_description":"r","sources_url":"https://github.com/a/b"}' & done; wait)
check "three creates of one slug at once: one 201, two 409, no 500" "201 409 409" "$(sort <<<"$race" | xargs)"

call 201 "an author makes a draft" "${author[@]}" "${json[@]}" -X POST "$API/apps" \
    -d '{"slug":"smoke-draft","kind":"app","name":"Draft","short_description":"by mistake","sources_url":"https://github.com/smoke-author/draft"}'
call 201 "with an upload" "${author[@]}" -X POST "$API/apps/smoke-draft/versions" \
    -F version=1.0.0 -F keira_version=1.0.0 -F entry_type=lua -F "entry=@$work/hello.lua"
draft_prefix=$(prefix_of "$(jq -r .id "$work/body")")
call 404 "nobody else deletes it" "${fan[@]}" "${json[@]}" -X DELETE "$API/apps/smoke-draft" -d '{"confirm":"smoke-draft"}'
call 400 "deleting repeats the slug" "${author[@]}" "${json[@]}" -X DELETE "$API/apps/smoke-draft" -d '{"confirm":"smoke"}'
call 200 "the author deletes the draft" "${author[@]}" "${json[@]}" -X DELETE "$API/apps/smoke-draft" -d '{"confirm":"smoke-draft"}'
call 404 "it is gone" "${author[@]}" "$API/apps/smoke-draft"
check "with its files" 0 "$(r2_list | grep -c "^$draft_prefix/" || true)"
call 409 "an item that was approved is hidden, not deleted" "${keeper[@]}" "${json[@]}" -X DELETE "$API/apps/smoke-keep" -d '{"confirm":"smoke-keep"}'
call 201 "the slug is free again" "${author[@]}" "${json[@]}" -X POST "$API/apps" \
    -d '{"slug":"smoke-draft","kind":"app","name":"Draft","short_description":"again","sources_url":"https://github.com/smoke-author/draft"}'

printf 'display.fill_screen(display.color565(255, 0, 0))\ndisplay.queue_draw()\n' > "$work/red.lua"
call 201 "an upload with the wrong file" "${author[@]}" -X POST "$API/apps/smoke-draft/versions" \
    -F version=1.0.0 -F keira_version=1.0.0 -F entry_type=lua -F "entry=@$work/red.lua;filename=hello.lua"
wrong_id=$(jq -r .id "$work/body")
wrong_prefix=$(prefix_of "$wrong_id")
call 404 "nobody else withdraws it" "${fan[@]}" -X DELETE "$API/apps/smoke-draft/versions/$wrong_id"
call 200 "the author withdraws it" "${author[@]}" -X DELETE "$API/apps/smoke-draft/versions/$wrong_id"
call 404 "the processor finds nothing to scan" "${scanner[@]}" "$API/scan/versions/$wrong_id"
check "its files are gone" 0 "$(r2_list | grep -c "^$wrong_prefix/" || true)"
call 201 "the same number again" "${author[@]}" -X POST "$API/apps/smoke-draft/versions" \
    -F version=1.0.0 -F keira_version=1.0.0 -F entry_type=lua -F "entry=@$work/hello.lua"
retry_id=$(jq -r .id "$work/body")
call 200 "processor clears it" "${scanner[@]}" -X POST "$API/scan/versions/$retry_id" -F result=clean
call 200 "a moderator rejects it" "${mod[@]}" "${json[@]}" -X POST "$API/mod/versions/$retry_id/reject" -d '{"note":"add an icon"}'
call 409 "a rejected version is not withdrawn" "${author[@]}" -X DELETE "$API/apps/smoke-draft/versions/$retry_id"
call 201 "a rejected number can be sent again" "${author[@]}" -X POST "$API/apps/smoke-draft/versions" \
    -F version=1.0.0 -F keira_version=1.0.0 -F entry_type=lua -F "entry=@$work/hello.lua" \
    -F "icon=@$work/icon.png" -F "files=@$work/data.txt"
fixed_id=$(jq -r .id "$work/body")
check "one row per number: the rejected one is replaced" 1 \
    "$(curl -sS "${author[@]}" "$API/apps/smoke-draft" | jq '[.versions[] | select(.version == "1.0.0")] | length')"
call 200 "the rejection stays in the log" "${mod[@]}" "$API/mod/log?user=smoke-author"
check "log of the author: the rejection with its reason" "version.reject 1.0.0 add an icon" \
    "$(jq -r '[.items[] | select(.action == "version.reject")][0] | "\(.action) \(.version) \(.detail.note)"' "$work/body")"
approve "$fixed_id"
call 409 "an approved version is not withdrawn" "${author[@]}" -X DELETE "$API/apps/smoke-draft/versions/$fixed_id"
call 409 "nor is its item deleted" "${author[@]}" "${json[@]}" -X DELETE "$API/apps/smoke-draft" -d '{"confirm":"smoke-draft"}'

call 201 "a new version keeps the icon and the file, and changes the code" "${author[@]}" -X POST "$API/apps/smoke-draft/versions" \
    -F version=1.1.0 -F keira_version=1.0.0 -F entry_type=lua -F "entry=@$work/red.lua;filename=hello.lua" \
    -F keep_icon=1 -F keep_files=1
next_id=$(jq -r .id "$work/body")
check "the version says what it kept" "data.txt,icon.png" "$(jq -r '.kept | sort | join(",")' "$work/body")"
call 200 "processor clears it" "${scanner[@]}" -X POST "$API/scan/versions/$next_id" -F result=clean
call 200 "the queue compares it with the approved version" "${mod[@]}" "$API/mod/queue"
check "queue: previous is 1.0.0, and hello.lua differs from it" "1.0.0 different" \
    "$(jq -r --argjson id "$next_id" '.items[] | select(.version.id == $id) |
        "\(.previous.version) \(if ([.version.checksums[] | select(.name == "hello.lua")][0].sha256) == ([.previous.checksums[] | select(.name == "hello.lua")][0].sha256) then "same" else "different" end)"' "$work/body")"
call 200 "versions waiting for the scan" "${mod[@]}" "$API/mod/queue?status=pending_scan"
check "queue: a first version has nothing to compare with" "1.0.0 null" \
    "$(jq -r '[.items[] | select(.app.slug == "smoke-case")][0] | "\(.version.version) \(.previous)"' "$work/body")"

location=$(curl -sS -o /dev/null -w '%{redirect_url}' "$API/auth/login?return=http://localhost:8000/")
state=$(printf '%s' "$location" | sed -n 's/.*[?&]state=\([^&]*\).*/\1/p')
check "OAuth state is a signed token, not a stored row" ok "$(printf '%s' "$state" | grep -qE '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' && echo ok || echo "$state")"
# Flip the signature's first character: the last one also carries padding
# bits the decoder ignores, so changing it can leave the same bytes
sig=${state#*.}; first=${sig:0:1}; [ "$first" = A ] && swap=B || swap=A
call 400 "tampered OAuth state refused" "$API/auth/callback?code=x&state=${state%%.*}.$swap${sig:1}"
call 400 "made-up OAuth state refused" "$API/auth/callback?code=x&state=eyJyIjoiaHR0cHM6Ly9ldmlsLmV4YW1wbGUvIn0.AAAA"

npx wrangler d1 execute lilka-catalog --local --command "
INSERT INTO users (id, login, role) VALUES (5, 'smoke-troll', 'user');
INSERT INTO sessions VALUES ('$(sha troll-token)', 5, datetime('now', '+1 day'));" >/dev/null
call 200 "troll rates" -H "Authorization: Bearer troll-token" "${json[@]}" -X PUT "$API/apps/smoke-hello/rating" -d '{"stars":1}'
call 200 "moderator bans the troll" "${mod[@]}" -X POST "$API/mod/users/smoke-troll/ban"
trolls=$(npx wrangler d1 execute lilka-catalog --local --json --command "SELECT COUNT(*) AS n FROM ratings WHERE user_id = 5" 2>/dev/null | jq -r '.[0].results[0].n')
check "a ban removes the user's ratings" 0 "$trolls"
call 200 "a ban is in the log" "${mod[@]}" "$API/mod/log?user=smoke-troll"
check "log: the troll's ban" "user.ban smoke-troll" "$(jq -r '.items[0] | "\(.action) \(.user_login)"' "$work/body")"

# --- roles and permissions (permissions.ts) ------------------------------
npx wrangler d1 execute lilka-catalog --local --command "
INSERT INTO users (id, login, role) VALUES (9, 'smoke-new', 'user'), (10, 'smoke-legacy', 'moderator');
INSERT INTO sessions VALUES ('$(sha new-token)', 9, datetime('now', '+1 day'));
INSERT INTO sessions VALUES ('$(sha legacy-token)', 10, datetime('now', '+1 day'));" >/dev/null
new=(-H "Authorization: Bearer new-token")
has() { jq -r --arg p "$1" '.user.permissions | index($p) != null' "$work/body"; }
call 200 "main admin session" "${boss[@]}" "$API/auth/me"
check "a main admin can make admins and main admins" "main_admin true true" "$(jq -r .user.role "$work/body") $(has roles.admin) $(has roles.main_admin)"
call 200 "moderator session" "${mod[@]}" "$API/auth/me"
check "a moderator reviews, but neither deletes nor grants roles" "moderator true false false" \
    "$(jq -r .user.role "$work/body") $(has review) $(has items.delete) $(has roles.moderator)"
call 200 "admin session" "${admin[@]}" "$API/auth/me"
check "an admin deletes and makes moderators, not admins" "admin true true false" \
    "$(jq -r .user.role "$work/body") $(has items.delete) $(has roles.moderator) $(has roles.admin)"
call 403 "users.role = moderator alone is no role" -H "Authorization: Bearer legacy-token" "$API/mod/queue"
call 403 "the Roles tab is for staff" "${new[@]}" "$API/mod/roles"
call 200 "a moderator reads the matrix" "${mod[@]}" "$API/mod/roles"
jq -e '(.assignable == []) and (.matrix.moderator | index("roles.moderator") == null) and (.matrix.main_admin | index("roles.admin") != null)
       and ([.staff[] | "\(.login):\(.role)"] == ["smoke-boss:main_admin", "smoke-admin:admin", "smoke-mod:moderator"])' "$work/body" >/dev/null && rm_=ok || rm_=bad
check "roles: matrix and staff, highest role first" ok "$rm_"
call 200 "the main admin may grant every role" "${boss[@]}" "$API/mod/roles"
check "assignable for the main admin" '["main_admin","admin","moderator"]' "$(jq -c .assignable "$work/body")"
role() { curl -sS -o "$work/body" -w '%{http_code}' -H "Authorization: Bearer $1" "${json[@]}" -X PUT "$API/mod/users/$2/role" -d "{\"role\":\"$3\"}"; }
check "a moderator cannot grant roles" 403 "$(role "$MOD_TOKEN" smoke-new moderator)"
check "owner is not a role" 400 "$(role boss-token smoke-new owner)"
check "banned is not a role to grant" 400 "$(role boss-token smoke-new banned)"
check "an admin makes a moderator" 200 "$(role admin-token smoke-new moderator)"
call 200 "the new moderator reviews at once, no new sign-in" "${new[@]}" "$API/mod/queue"
call 403 "but cannot delete items" "${new[@]}" "${json[@]}" -X DELETE "$API/mod/apps/smoke-case" -d '{"confirm":"smoke-case"}'
check "an admin cannot make admins" 403 "$(role admin-token smoke-new admin)"
check "nobody changes their own role" 409 "$(role admin-token smoke-admin user)"
check "an admin cannot demote a main admin" 403 "$(role admin-token smoke-boss user)"
check "the main admin makes an admin" 200 "$(role boss-token smoke-new admin)"
check "who granted it is kept" "admin smoke-boss" "$(curl -sS "${boss[@]}" "$API/mod/users/smoke-new" | jq -r '"\(.user.role) \(.user.role_granted_by)"')"
check "an admin cannot demote another admin" 403 "$(role admin-token smoke-new moderator)"
call 409 "staff cannot be banned" "${admin[@]}" -X POST "$API/mod/users/smoke-new/ban"
call 409 "a main admin cannot be banned" "${admin[@]}" -X POST "$API/mod/users/smoke-boss/ban"
call 403 "a moderator cannot end an admin's sessions" "${mod[@]}" -X POST "$API/mod/users/smoke-new/sign-out"
call 200 "the users list shows roles" "${mod[@]}" "$API/mod/users"
check "users list: admin, main admin, a leftover is a user" "admin main_admin user" \
    "$(jq -r '[.items[] | select(.login == "smoke-new" or .login == "smoke-boss" or .login == "smoke-legacy")] | sort_by(.login) | map(.role) | "\(.[2]) \(.[0]) \(.[1])"' "$work/body")"
check "the main admin takes the role back" 200 "$(role boss-token smoke-new user)"
call 403 "and it applies at the next request" "${new[@]}" "$API/mod/queue"
check "an admin cannot make main admins" 403 "$(role admin-token smoke-new main_admin)"
check "a main admin makes a second main admin" 200 "$(role boss-token smoke-new main_admin)"
call 200 "the second main admin's session" "${new[@]}" "$API/auth/me"
check "they can make main admins too" "main_admin true" "$(jq -r .user.role "$work/body") $(has roles.main_admin)"
check "nobody steps down on their own, so one main admin always stays" 409 "$(role new-token smoke-new user)"
check "one main admin takes the role from another" 200 "$(role boss-token smoke-new user)"
call 403 "the former main admin is out" "${new[@]}" "$API/mod/roles"
check "a banned user gets no role" 409 "$(role boss-token smoke-troll moderator)"
check "an admin takes the moderator role back" 200 "$(role admin-token smoke-mod user)"
call 403 "the former moderator is out" "${mod[@]}" "$API/mod/queue"
leftover=$(npx wrangler d1 execute lilka-catalog --local --json --command "SELECT role FROM users WHERE id = 2" 2>/dev/null | jq -r '.[0].results[0].role')
check "taking the role back also clears users.role = moderator" user "$leftover"

# Last, because it uses up this IP's budget for a minute
limited=$(seq 1 330 | xargs -P 30 -I{} curl -s -o /dev/null -w '%{http_code}\n' "$API/" | grep -c '^429$' || true)
check "per-IP rate limit kicks in" yes "$([ "$limited" -gt 0 ] && echo yes || echo "no 429 in 330 requests")"
cors=$(curl -sS -o /dev/null -D - -H 'Origin: http://localhost:8000' "${user[@]}" "$API/auth/me" | tr -d '\r')
check "a 429 still has CORS headers, so the site can read it" ok \
    "$(grep -q '^HTTP/[0-9.]* 429' <<<"$cors" && grep -qi '^access-control-allow-origin: http://localhost:8000' <<<"$cors" && echo ok || echo "$cors")"

echo "all $pass checks passed"
