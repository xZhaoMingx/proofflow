-- ProofFlow 0005 — Security hardening (addresses Supabase advisor warnings).
--
-- 1. Pin search_path on the two utility functions that lacked it.
-- 2. Revoke API execute on handle_new_user — it is only ever run by the
--    auth.users trigger, never called directly, so no role needs REST access.
--
-- The auth_* helper functions intentionally keep EXECUTE for authenticated:
-- RLS policies that reference them require the querying role to hold EXECUTE,
-- and each returns only the caller's own company / role / customer scope —
-- nothing about anyone else — so exposure is harmless.

create or replace function slugify(input text)
returns text language sql immutable set search_path = '' as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

revoke execute on function handle_new_user() from anon, authenticated;
