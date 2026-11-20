# Sill Gallery

A starter website for a fictional contemporary art gallery. Visitors can browse, search, filter by medium, and open artwork detail pages. Staff can manage images, edit details, save private drafts, publish or unpublish work, select a homepage feature, and delete records.

## Run locally

With Node.js 22.13 or newer:

```sh
npm run seed
npm run admin -- you@example.com
npm start
```

Open the [local gallery](http://127.0.0.1:3000/) or [staff portal](http://127.0.0.1:3000/admin). The seed command adds the example collection once. The admin command asks for a password of at least 14 characters. Rerun it with the same email to change the password and revoke existing sessions, or use another email to add a staff account.

No third-party packages are required. The built-in SQLite module may print an experimental-feature warning on Node 22. Run `npm test` to verify staff access, draft privacy, publishing, unpublishing, image replacement, persistence, and live catalog access.

## Publish the static gallery on GitHub Pages

In [repository Pages settings](https://github.com/realfortis/still-gallery/settings/pages), choose **Deploy from a branch**, select **main** and **/docs**, then save. The expected address is [realfortis.github.io/still-gallery](https://realfortis.github.io/still-gallery/). Until the backend is connected, Pages displays the included sample collection.

## Deploy the staff portal and catalog

The included [Render Blueprint](render.yaml) provisions a Node web service and a 1 GB persistent disk. Render requires paid compute for persistent disks. A paid service is needed only if you choose this hosting option. [Render disk documentation](https://render.com/docs/disks)

1. In Render, create a Blueprint from this GitHub repository and supply `PAGES_ORIGIN=https://realfortis.github.io`. Confirm the service and disk pricing in Render before deploying. The origin is the scheme and hostname, without the repository name.
2. When the service is live, use its Render Shell to run `npm run admin -- you@example.com` and enter your own password at the prompt. The first startup seeds the example collection on the persistent disk. Staff sign in at the backend URL followed by `/admin`.
3. Configure the Pages frontend with the deployed backend URL and publish the updated `pages/config.json` and `docs/` files:

   ```sh
   npm run pages:build -- --backend https://YOUR-SERVICE.onrender.com
   git add pages/config.json docs
   git commit -m "Connect GitHub Pages to the gallery backend"
   git push
   ```

The Pages frontend fetches the public catalog from `GET /api/artworks`, then loads artwork images from the backend. The backend sends the CORS header for the configured Pages origin. Staff forms and session cookies stay on the backend origin. Only published artwork is available through the catalog and public image routes. Adding, editing, or unpublishing a work takes effect on the next page load.

## Use an existing Node host

Run `npm run seed` and `npm start` with a persistent writable data directory, behind an HTTPS proxy. Use one app instance for SQLite.

| Variable | Example | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `production` | Requires an HTTPS origin for staff sessions. |
| `PUBLIC_ORIGIN` | `https://gallery-api.example.com` | Backend's public HTTPS origin. Render supplies its own default. |
| `PAGES_ORIGIN` | `https://realfortis.github.io` | Origin allowed to read the catalog in a browser. |
| `DATA_DIR` | `/var/lib/sill-gallery` | Persistent directory for SQLite and its journal. |
| `HOST` | `0.0.0.0` | Service's listening address. Local default is `127.0.0.1`. |
| `PORT` | `3000` | Backend port behind the proxy. |

Use the same `DATA_DIR` for the admin provisioning command. Back up the database with a SQLite-aware backup or an appropriate volume snapshot. Git tracks source code and sample artwork. Staff accounts, uploads, and sessions live in the runtime database.

The three sample artworks were created with ImageGen. See the [image prompts](artwork/PROMPTS.md) for details.
