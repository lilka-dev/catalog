import { Hono } from 'hono';
import type { AppEnv } from './env';
import { APP_SELECT, fileUrl, latestApproved, type AppRow } from './apps';
import { parseJsonArray } from './util';

function localized(uk: string | null, en: string | null): Record<string, string> | undefined {
    const out: Record<string, string> = {};
    if (uk) out.uk = uk;
    if (en) out.en = en;
    return Object.keys(out).length ? out : undefined;
}

/**
 * Published apps as catalog `manifest.yml` documents.
 *
 * The catalog build already downloads entry files, icons and screenshots from
 * URLs, scans them with ClamAV, makes `icon_min` and `package.zip`, and writes
 * the JSON that Keira reads. So community apps go through exactly the same
 * pipeline as the ones in the repo, and the device needs no changes.
 */
export const exportRoutes = new Hono<AppEnv>();

exportRoutes.get('/manifests', async (c) => {
    const { results } = await c.env.DB.prepare(`${APP_SELECT} WHERE a.status = 'published' ORDER BY a.slug`).all<AppRow>();
    const latest = await latestApproved(
        c.env,
        results.map((a) => a.id),
    );

    const items = [];
    for (const app of results) {
        const v = latest.get(app.id);
        if (!v) continue;
        const url = (name: string) => fileUrl(c.env, app.slug, v.id, name);
        const isGit = /^https:\/\/(github\.com|gitlab\.com|codeberg\.org)\//.test(app.sources_url);

        const manifest: Record<string, unknown> = {
            name: localized(app.name_uk, app.name_en),
            short_description: localized(app.short_uk, app.short_en),
            description: localized(app.description_uk, app.description_en),
            changelog: v.changelog ?? undefined,
            author: `@${app.owner_login}`,
            license: app.license ?? undefined,
            keira_version: v.keira_version,
            sources: { type: isGit ? 'git' : 'url', location: { origin: app.sources_url } },
            entryfile: { type: v.entry_type, location: { origin: url(v.entry_file) } },
            files: parseJsonArray<string>(v.files).map((name) => ({ location: { origin: url(name) } })),
            icon: v.icon ? url(v.icon) : undefined,
            screenshots: parseJsonArray<string>(v.screenshots).map(url),
            // Not read by build.py; lets the catalog site link back to ratings
            community: { slug: app.slug, version: v.version, version_id: v.id },
        };
        for (const key of Object.keys(manifest)) if (manifest[key] === undefined) delete manifest[key];

        items.push({ dir: app.slug, kind: app.kind, manifest });
    }
    return c.json({ generated_at: new Date().toISOString(), items });
});
