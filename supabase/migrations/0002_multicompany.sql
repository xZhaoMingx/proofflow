-- ProofFlow 0002 — Multi-company workspaces, roles, invitations, ownership, audit.
-- Run AFTER 0001_init.sql. Paste as one script in the Supabase SQL editor.
--
-- This migration is schema only (columns, enums, tables, indexes). RLS helper
-- functions live in 0003; policies live in 0004. Splitting by concern keeps
-- each file reviewable and lets Postgres commit new enum values before they
-- are used.
--
-- Safe to re-run: guarded with IF NOT EXISTS where Postgres allows it.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Company Owner is the top staff role (first user to sign up a company).
alter type profile_role add value if not exists 'owner';

do $$ begin
  create type account_status as enum ('invited', 'active', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invitation_kind as enum ('employee', 'customer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
exception when duplicate_object then null; end $$;

-- New activity actions for accountability. (Existing values remain.)
alter type activity_action add value if not exists 'employee_assigned';
alter type activity_action add value if not exists 'customer_assigned';
alter type activity_action add value if not exists 'file_deleted';
alter type activity_action add value if not exists 'project_archived';
alter type activity_action add value if not exists 'member_invited';
alter type activity_action add value if not exists 'member_joined';
alter type activity_action add value if not exists 'member_removed';
alter type activity_action add value if not exists 'role_changed';
alter type activity_action add value if not exists 'customer_invited';

-- ---------------------------------------------------------------------------
-- Companies: workspace slug + owner
-- ---------------------------------------------------------------------------

alter table companies add column if not exists slug text;
alter table companies add column if not exists owner_id uuid references profiles (id) on delete set null;

-- Reusable slugifier for backfill and the signup trigger.
create or replace function slugify(input text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'))
$$;

-- Backfill slugs for any existing companies, keeping them unique.
do $$
declare
  rec record;
  base text;
  candidate text;
  n int;
begin
  for rec in select id, name from companies where slug is null loop
    base := nullif(slugify(rec.name), '');
    if base is null then base := 'workspace'; end if;
    candidate := base;
    n := 1;
    while exists (select 1 from companies where slug = candidate) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;
    update companies set slug = candidate where id = rec.id;
  end loop;
end $$;

alter table companies alter column slug set not null;
create unique index if not exists idx_companies_slug on companies (slug);

-- ---------------------------------------------------------------------------
-- Profiles (staff): account lifecycle
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists status account_status not null default 'active';
alter table profiles add column if not exists last_login_at timestamptz;
alter table profiles add column if not exists invited_by uuid references profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Customers: real logins + lifecycle
-- ---------------------------------------------------------------------------

alter table customers add column if not exists auth_user_id uuid references auth.users (id) on delete set null;
alter table customers add column if not exists status account_status not null default 'invited';
alter table customers add column if not exists invited_by uuid references profiles (id) on delete set null;
alter table customers add column if not exists last_login_at timestamptz;
create unique index if not exists idx_customers_auth_user on customers (auth_user_id) where auth_user_id is not null;

-- ---------------------------------------------------------------------------
-- Projects: ownership & audit columns (tracking only; never gates access)
-- ---------------------------------------------------------------------------

alter table projects add column if not exists owner_id uuid references profiles (id) on delete set null;
alter table projects add column if not exists created_by uuid references profiles (id) on delete set null;
alter table projects add column if not exists updated_by uuid references profiles (id) on delete set null;
alter table projects add column if not exists archived_at timestamptz;

-- ---------------------------------------------------------------------------
-- company_id on every child table (backfill from the parent project, then
-- enforce NOT NULL and index). Makes each RLS check a single indexed compare.
-- ---------------------------------------------------------------------------

-- proof_versions
alter table proof_versions add column if not exists company_id uuid references companies (id) on delete cascade;
update proof_versions v set company_id = p.company_id
  from projects p where p.id = v.project_id and v.company_id is null;

-- comments (+ customer author)
alter table comments add column if not exists company_id uuid references companies (id) on delete cascade;
alter table comments add column if not exists customer_id uuid references customers (id) on delete set null;
update comments c set company_id = p.company_id
  from projects p where p.id = c.project_id and c.company_id is null;

-- approvals (+ customer)
alter table approvals add column if not exists company_id uuid references companies (id) on delete cascade;
alter table approvals add column if not exists customer_id uuid references customers (id) on delete set null;
update approvals a set company_id = p.company_id
  from projects p where p.id = a.project_id and a.company_id is null;

-- change_requests (+ customer)
alter table change_requests add column if not exists company_id uuid references companies (id) on delete cascade;
alter table change_requests add column if not exists customer_id uuid references customers (id) on delete set null;
update change_requests r set company_id = p.company_id
  from projects p where p.id = r.project_id and r.company_id is null;

-- checklist_responses (+ customer)
alter table checklist_responses add column if not exists company_id uuid references companies (id) on delete cascade;
alter table checklist_responses add column if not exists customer_id uuid references customers (id) on delete set null;
update checklist_responses cr set company_id = p.company_id
  from projects p where p.id = cr.project_id and cr.company_id is null;

-- activity_events (+ actor)
alter table activity_events add column if not exists company_id uuid references companies (id) on delete cascade;
alter table activity_events add column if not exists actor_id uuid;
update activity_events e set company_id = p.company_id
  from projects p where p.id = e.project_id and e.company_id is null;

-- review_links
alter table review_links add column if not exists company_id uuid references companies (id) on delete cascade;
update review_links l set company_id = p.company_id
  from projects p where p.id = l.project_id and l.company_id is null;

-- Enforce NOT NULL now that everything is backfilled.
alter table proof_versions alter column company_id set not null;
alter table comments alter column company_id set not null;
alter table approvals alter column company_id set not null;
alter table change_requests alter column company_id set not null;
alter table checklist_responses alter column company_id set not null;
alter table activity_events alter column company_id set not null;
alter table review_links alter column company_id set not null;

create index if not exists idx_versions_company on proof_versions (company_id);
create index if not exists idx_comments_company on comments (company_id);
create index if not exists idx_approvals_company on approvals (company_id);
create index if not exists idx_change_requests_company on change_requests (company_id);
create index if not exists idx_responses_company on checklist_responses (company_id);
create index if not exists idx_activity_company on activity_events (company_id);
create index if not exists idx_review_links_company on review_links (company_id);

-- ---------------------------------------------------------------------------
-- Assignment tables
-- ---------------------------------------------------------------------------

-- Assigned employees: accountability only. Does NOT restrict access — every
-- active staff member can still collaborate on any company project.
create table if not exists project_employees (
  project_id   uuid not null references projects (id) on delete cascade,
  employee_id  uuid not null references profiles (id) on delete cascade,
  assigned_by  uuid references profiles (id) on delete set null,
  assigned_at  timestamptz not null default now(),
  primary key (project_id, employee_id)
);

-- Assigned customers: THIS drives customer visibility (see 0004 RLS).
create table if not exists project_customers (
  project_id    uuid not null references projects (id) on delete cascade,
  customer_id   uuid not null references customers (id) on delete cascade,
  can_download  boolean not null default true,
  assigned_by   uuid references profiles (id) on delete set null,
  assigned_at   timestamptz not null default now(),
  primary key (project_id, customer_id)
);
create index if not exists idx_project_customers_customer on project_customers (customer_id);

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

create table if not exists invitations (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies (id) on delete cascade,
  kind         invitation_kind not null,
  email        text not null,
  full_name    text not null,                                  -- name the inviter entered
  role         profile_role,                                   -- employee invites only
  customer_id  uuid references customers (id) on delete cascade, -- customer invites only
  token        text not null unique,
  status       invitation_status not null default 'pending',
  invited_by   uuid references profiles (id) on delete set null,
  expires_at   timestamptz not null default (now() + interval '14 days'),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_invitations_company on invitations (company_id, status);
create index if not exists idx_invitations_token on invitations (token);
create index if not exists idx_invitations_email on invitations (lower(email));

-- Projects to auto-assign a customer the moment they accept.
create table if not exists invitation_projects (
  invitation_id  uuid not null references invitations (id) on delete cascade,
  project_id     uuid not null references projects (id) on delete cascade,
  primary key (invitation_id, project_id)
);

-- ---------------------------------------------------------------------------
-- Audit log (immutable accountability trail for security/admin events)
-- ---------------------------------------------------------------------------

create table if not exists audit_logs (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies (id) on delete cascade,
  actor_id     uuid,                       -- profile or customer id; null for system
  actor_type   author_type not null default 'system',
  actor_name   text not null,
  action       text not null,              -- free text so new events need no enum change
  target_type  text,                       -- 'project' | 'member' | 'customer' | ...
  target_id    uuid,
  project_id   uuid references projects (id) on delete set null,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_audit_company on audit_logs (company_id, created_at desc);
create index if not exists idx_audit_project on audit_logs (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at / updated_by upkeep for projects
-- ---------------------------------------------------------------------------

-- Bump updated_at on every project write (updated_by is set by the app layer,
-- which knows the acting user).
drop trigger if exists projects_updated_at on projects;
create trigger projects_updated_at before update on projects
  for each row execute function set_updated_at();
