# Sill Gallery

A fictional contemporary art gallery with a public collection and a staff portal. Visitors can search by title or artist and filter by medium. Staff can add artwork, upload and replace images, save private drafts, publish or unpublish work, select one homepage feature, and delete records.

## Live site

- [Public gallery](https://realfortis.github.io/still-gallery/)
- [Staff portal](https://realfortis.github.io/still-gallery/admin.html)

GitHub Pages hosts the website from the `main` branch's `/docs` folder. Supabase stores artwork details, images, and staff sign-in. When staff publish a change, visitors see it on their next page load. The starter images are included in Git. New uploads go to private Supabase Storage and receive time-limited image links when a viewer is allowed to see them.

## Give someone staff access

1. In [Supabase Authentication → Users](https://supabase.com/dashboard/project/yexecawftuosunjnolvp/auth/users), choose **Add user → Create new user**. Enter the staff member's email and a password, and select **Auto Confirm User** if shown.
2. Copy the new user's **UID**. Open the [SQL Editor](https://supabase.com/dashboard/project/yexecawftuosunjnolvp/sql/new), paste the following statement, replace the placeholder with that UID, and click **Run**.

   ```sql
   insert into public.gallery_staff (user_id)
   values ('PASTE-YOUR-UID-HERE')
   on conflict do nothing;
   ```

3. Have the staff member sign in on the [staff portal](https://realfortis.github.io/still-gallery/admin.html). A Supabase Auth account requires a matching entry in `gallery_staff` to manage artwork.

## Supabase setup for a fresh project

Apply [the gallery migration](supabase/migrations/20261120163000_gallery.sql) using the SQL Editor or the Supabase CLI. The migration recognizes the completed initial setup if it was first applied in the SQL Editor.

Set the project URL and **publishable key** in `pages/config.json`. Keep the Supabase secret key, service-role key, and database password out of Git.

## Edit website code

With Node.js 22.13 or newer:

```sh
npm ci
npm run pages:build
npm test
```

Commit the regenerated `docs/` folder with the source changes. GitHub Pages deploys it from `main`. Changes made in the staff portal go directly to Supabase.

The original local Node and SQLite starter is still available. Run `npm run seed`, `npm run admin -- you@example.com`, and `npm start` to use it at [http://127.0.0.1:3000/](http://127.0.0.1:3000/). Its SQLite data is separate from the live gallery.

The three sample artworks were created with ImageGen. See the [image prompts](artwork/PROMPTS.md).
