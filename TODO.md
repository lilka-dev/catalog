# TODO

## Move the API to catalog-api.lilka.org (paused)

Why: on a domain in our own Cloudflare zone a WAF rate-limiting rule can stop
floods before they reach the Worker. Blocked requests do not count against the
Worker's free 100k/day limit; on `*.workers.dev` nothing can be filtered.
`lilka.org` is already a zone in the Cloudflare account (registered through
Cloudflare Registrar).

The code is ready on branch `yboichuk/feat/api_domain` (commit `37c6772`,
tested locally: `wrangler deploy --dry-run`, 86 smoke checks). Rebase it on
`main` before merging.

### Step 1: switch to the new address (workers.dev stays on)

Do these in this order: the site switches as soon as it deploys, so the API
has to be ready first.

1. Cloudflare → My Profile → API Tokens → edit the token stored as the
   `CLOUDFLARE_API_TOKEN` secret: add **Zone → Workers Routes: Edit** and
   **Zone → DNS: Edit**, limited to `lilka.org`. The value stays the same.
2. GitHub OAuth App (Client ID `Ov23li85…`): add the redirect URI
   `https://catalog-api.lilka.org/auth/callback`. Keep the workers.dev one.
3. Merge `yboichuk/feat/api_domain`. Check `https://catalog-api.lilka.org/`
   answers, sign-in works, the mirror deploy passes.
4. Cloudflare → lilka.org → Security → Security rules → Create rule →
   **Rate limiting rule**:
   - If incoming requests match: Hostname equals `catalog-api.lilka.org`
   - With the same characteristics: IP
   - When rate exceeds: 100 requests per 10 seconds
   - Then: Block, for 10 seconds

   Leave Bot Fight Mode off: it would challenge the GitHub Actions jobs. The
   mirror (5 req/s) and the processor (one per 0.2 s) stay under the rule.

### Step 2: close the old address

1. `api/wrangler.toml`: `workers_dev = false`, so the WAF cannot be bypassed
   through `lilka-catalog-api.black-ghost-ukraine.workers.dev`.
2. `site/index.html`: remove the workers.dev host from the CSP `connect-src`.
3. GitHub OAuth App: remove the workers.dev redirect URI.
4. Update the API URL in `api/README.md` (Deploying, diagrams) if anything
   still names workers.dev.

## Other open items

- Archive `lilka-dev/catalog-api` (Settings → Danger Zone) and delete its
  Actions secrets; the repository only holds a pointer README now.
- Set the `DISPATCH_TOKEN` secret (fine-grained PAT for `lilka-dev/catalog`,
  Contents: Read and write) so uploads are processed and approvals reach
  devices within minutes instead of the 6-hourly and hourly schedules.
- Branch protection on `main`: require a PR, the **API / test** check and
  code-owner review; optionally a reviewer for the `production` environment.
- "Publish" from the web IDE (lilka-web-ide), and running Lua apps from the
  catalog in the browser.
