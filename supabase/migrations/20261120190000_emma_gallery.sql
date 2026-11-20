begin;

create table public.emma_assets (
  id uuid primary key default gen_random_uuid(),
  thumbnail text not null unique,
  detail text not null unique,
  site_media boolean not null default false,
  approved boolean not null default false,
  check (thumbnail = id::text || '-thumb.webp'),
  check (detail = id::text || '.webp')
);

create table public.emma_artworks (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.emma_assets(id),
  title text not null default '',
  artist text not null default '',
  caption text not null default '',
  edited boolean not null default false,
  published boolean not null default false,
  check (not published or (btrim(title) <> '' and btrim(artist) <> ''))
);
create index emma_artwork_asset on public.emma_artworks(asset_id) where published;

create table public.emma_pages (
  route text primary key check (route ~ '^[A-Za-z0-9_.-]+[.]html?$'),
  kind text not null check (kind in ('page', 'artist', 'exhibition', 'historical')),
  title text not null check (btrim(title) <> ''),
  html_title text not null,
  body text not null default '',
  body_text text,
  roster_order integer,
  media_ids uuid[] not null default '{}',
  placements jsonb not null default '[]' check (jsonb_typeof(placements) = 'array'),
  published boolean not null default false
);

create table public.emma_settings (
  id boolean primary key default true check (id),
  title text not null,
  address text not null,
  hours text not null,
  logo uuid references public.emma_assets(id),
  background uuid references public.emma_assets(id),
  font_project text not null default '' check (font_project ~ '^[a-zA-Z0-9]*$'),
  features_custom boolean not null default false,
  features jsonb not null default '[]' check (jsonb_typeof(features) = 'array'),
  published boolean not null default false
);

do $$
declare
  name text;
begin
  foreach name in array array['emma_pages', 'emma_artworks', 'emma_assets', 'emma_settings']
  loop
    execute format('alter table public.%I enable row level security', name);
    execute format('revoke all on public.%I from public, anon, authenticated', name);
    execute format('grant select on public.%I to anon, authenticated', name);
    execute format('grant insert, update, delete on public.%I to authenticated', name);
    execute format('create policy emma_staff on public.%I for all to authenticated using ((select public.is_gallery_staff())) with check ((select public.is_gallery_staff()))', name);
  end loop;
end;
$$;

create policy emma_public_site on public.emma_settings for select to anon, authenticated
  using (published);
create function public.emma_public_page(page_route text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'settings', (select to_jsonb(s) from public.emma_settings s where s.published),
    'list', coalesce((select jsonb_agg(jsonb_build_object('route', p.route, 'title', p.title,
      'kind', p.kind, 'roster_order', p.roster_order)) from public.emma_pages p
      where p.published and exists(select 1 from public.emma_settings where published)), '[]'::jsonb),
    'page', (select to_jsonb(p) || jsonb_build_object('placements', coalesce(
      (select jsonb_agg(case when w.id is null then '{}'::jsonb else item.value end order by item.ordinality)
       from jsonb_array_elements(p.placements) with ordinality item(value, ordinality)
       left join public.emma_artworks w on w.id::text = item.value->>'work_id' and w.published),
      '[]'::jsonb)) from public.emma_pages p where p.route = page_route and p.published
      and exists(select 1 from public.emma_settings where published))
  );
$$;
revoke all on function public.emma_public_page(text) from public;
grant execute on function public.emma_public_page(text) to anon, authenticated;

create function public.emma_public_site_image(asset uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.emma_settings s where s.published and (asset = s.logo or asset = s.background)
  ) or (
    exists (select 1 from public.emma_settings where published) and exists (
      select 1 from public.emma_pages p where p.published and p.media_ids @> array[asset]
    )
  );
$$;
revoke all on function public.emma_public_site_image(uuid) from public;
grant execute on function public.emma_public_site_image(uuid) to anon, authenticated;
create policy emma_public_art on public.emma_artworks for select to anon, authenticated
  using (published and exists (select 1 from public.emma_settings where published));
create policy emma_public_assets on public.emma_assets for select to anon, authenticated
  using (approved and exists (select 1 from public.emma_settings where published) and
    ((site_media and public.emma_public_site_image(id)) or exists (
      select 1 from public.emma_artworks
      where asset_id = emma_assets.id and published
    )));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('emma-gallery', 'emma-gallery', false, 6291456, array['image/webp']);

create policy emma_read_display_images on storage.objects for select to anon, authenticated
using (bucket_id = 'emma-gallery' and exists (
  select 1 from public.emma_assets
  where approved and (detail = storage.objects.name or thumbnail = storage.objects.name)
));

create policy emma_staff_storage_read on storage.objects for select to authenticated
using (bucket_id = 'emma-gallery' and (select public.is_gallery_staff()));

create policy emma_staff_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'emma-gallery' and (select public.is_gallery_staff())
  and name ~ '^[a-f0-9-]{36}(-thumb)?[.]webp$');

create policy emma_staff_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'emma-gallery' and (select public.is_gallery_staff())
  and not exists (select 1 from public.emma_assets
    where detail = storage.objects.name or thumbnail = storage.objects.name));

create function public.emma_prepare_release(routes text[], artwork_ids uuid[], site_image_ids uuid[])
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if not (select public.is_gallery_staff()) then
    raise exception 'Gallery staff access is required.';
  end if;
  perform 1 from public.emma_settings where id and not published for update;
  if not found then
    raise exception 'The release can only be prepared while the gallery is private.';
  end if;
  if not ('index.html' = any(routes)) or exists (
    select 1 from unnest(routes) r
    where not exists (select 1 from public.emma_pages where route = r)
  ) then
    raise exception 'The approved pages must include the homepage and all routes must exist.';
  end if;
  if exists (
    select 1 from unnest(artwork_ids) i where not exists (
      select 1 from public.emma_artworks w where w.id = i and btrim(w.title) <> '' and btrim(w.artist) <> ''
    )
  ) then
    raise exception 'Every approved artwork needs a known artist and title.';
  end if;
  if exists (
    select 1 from unnest(site_image_ids) i where not exists (
      select 1 from public.emma_assets a where a.id = i and a.site_media
    )
  ) then
    raise exception 'All approved site images must exist.';
  end if;
  update public.emma_assets a set approved = true
    where a.id = any(site_image_ids) or exists (
      select 1 from public.emma_artworks w where w.asset_id = a.id and w.id = any(artwork_ids)
    );
  update public.emma_artworks set published = true where id = any(artwork_ids);
  update public.emma_pages set published = true where route = any(routes);
end;
$$;
revoke all on function public.emma_prepare_release(text[], uuid[], uuid[]) from public, anon;
grant execute on function public.emma_prepare_release(text[], uuid[], uuid[]) to authenticated;

commit;
