-- Server-only storage. The browser has NO read/write access to this table.
create table if not exists public.site_github_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  github_id bigint not null,
  encrypted_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.site_github_connections enable row level security;
revoke all on table public.site_github_connections from public, anon, authenticated;
grant select, insert, update, delete on table public.site_github_connections to service_role;

comment on table public.site_github_connections is
  'GitHub OAuth credentials encrypted by the Edge Function. No client policies.';
