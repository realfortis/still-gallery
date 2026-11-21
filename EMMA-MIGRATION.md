# Emma Butler Gallery migration

The public copy uses the existing GitHub Pages deployment and the existing Supabase staff accounts. The new gallery tables and image bucket keep the client catalog separate from the demo catalog. The public site reads the published records directly from Supabase.

## Review privately

With Node.js installed, run `npm ci`. For the public-source capture script, use an isolated Python environment with `beautifulsoup4` and `Pillow` installed.

```sh
python3 migration/emma/capture.py /private/path/emma
npm run emma:build -- local /private/path/emma/preview.json /private/path/emma
python3 -m http.server 4180 --bind 127.0.0.1 --directory /private/path/emma
```

Open [the local copy](http://127.0.0.1:4180/). The private directory contains all downloaded media and a reconciliation report in JSON. Keep it outside the repository. For the final review, reconcile it against the client inventory and originals. Check captions, credits, prices if shown, ambiguous matches, and image permissions. Keep the original files privately and use the generated WebP copies in the web gallery.

## Import and review in the existing backend

1. Export the current Supabase database and keep a private copy of the existing storage buckets. Save the deployed Git commit SHA as a rollback point.
2. Apply `supabase/migrations/20261120190000_emma_gallery.sql` through the repo’s existing migration integration. It adds the `emma_*` tables and a private storage bucket. It uses the existing gallery staff allowlist.
3. For first-time setup, open the [local catalog import](http://127.0.0.1:4180/admin.html?view=import), sign in with your existing staff account, and choose **Import catalog as private drafts**. As an alternative, run `npm run emma:import -- /private/path/emma/preview.json` in a private terminal. A repeated import skips rows and files already staged. It stops if the client gallery is already public. Inspect the reconciliation report for files that the source site could not supply.
4. Use the private preview and its staff portal to review draft content. If you already signed in at the public site, the local preview uses a separate browser session. After review, mark only the approved artwork, pages, and site media as publishable. For a bulk release, create a private JSON file containing arrays named `pages` (approved route strings), `artwork_ids` (approved artwork UUIDs), and `site_image_ids` (approved site image UUIDs from the private capture). Include `index.html`, the logo, and the background. Run `npm run emma:import -- --approve-reviewed /private/path/reviewed.json`. This prepares approved records while the global public setting stays off. Review the site with the preview flag while public availability is disabled.

## Release

Build on a case-sensitive Linux filesystem so both `Knowling.htm` and `knowling.htm` retain their original meaning. From the private reviewed manifest:

```sh
npm run emma:build -- release /private/path/emma/preview.json /private/path/emma-release
```

The release build contains page shells, styles, and scripts. Verify that the output has no `preview.json`, media folder, or client exports. Use the existing `main` and `/docs` publishing setup to deploy the reviewed output. Enable public availability from **Gallery details** at cutover and check the live home, Contact, artist and archive routes, and the staff sign-in. Keep a previous deployment reference for rollback. To suspend public visibility, turn it off in **Gallery details**.

The original source uses Adobe Fonts. Use the gallery’s approved web project ID in **Gallery details**. The review copy otherwise uses system fallback fonts.
