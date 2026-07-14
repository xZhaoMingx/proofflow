-- ProofFlow initial schema
-- Multi-tenant proof review platform: companies, projects, versioned proofs,
-- customizable checklists, approvals, comments, activity, notifications, ClickUp links.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type project_status as enum (
  'draft',
  'awaiting_review',
  'revision_requested',
  'approved',
  'completed',
  'archived'
);

create type profile_role as enum ('admin', 'employee');

create type author_type as enum ('employee', 'customer', 'system');

create type activity_action as enum (
  'project_created',
  'proof_uploaded',
  'proof_viewed',
  'comment_added',
  'revision_requested',
  'version_uploaded',
  'proof_approved',
  'employee_reply',
  'status_changed',
  'review_link_created',
  'clickup_synced'
);

create type notification_type as enum (
  -- employee-facing
  'proof_viewed',
  'proof_approved',
  'revision_requested',
  'comment_added',
  'version_uploaded',
  -- customer-facing
  'proof_ready',
  'designer_replied',
  'revision_uploaded',
  'project_completed'
);

-- ---------------------------------------------------------------------------
-- Tenancy & people
-- ---------------------------------------------------------------------------

create table companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  logo_url    text,
  settings    jsonb not null default '{"require_full_checklist": true, "capture_ip": false}'::jsonb,
  created_at  timestamptz not null default now()
);

create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  company_id  uuid not null references companies (id) on delete cascade,
  role        profile_role not null default 'employee',
  full_name   text not null,
  email       text not null,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table customers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies (id) on delete cascade,
  name          text not null,
  email         text not null,
  company_name  text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Projects & proof versions
-- ---------------------------------------------------------------------------

create table projects (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies (id) on delete cascade,
  name         text not null,
  job_number   text,
  customer_id  uuid references customers (id) on delete set null,
  designer_id  uuid references profiles (id) on delete set null,
  due_date     date,
  status       project_status not null default 'draft',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Append-only: versions are never overwritten or deleted.
create table proof_versions (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects (id) on delete cascade,
  version_number  int not null,
  file_path       text not null,
  file_name       text not null,
  file_type       text not null, -- mime type: image/png, image/jpeg, application/pdf
  file_size       bigint not null default 0,
  uploaded_by     uuid references profiles (id) on delete set null,
  revision_notes  text,
  created_at      timestamptz not null default now(),
  unique (project_id, version_number)
);

create table review_links (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects (id) on delete cascade,
  customer_id  uuid references customers (id) on delete set null,
  token        text not null unique,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_by   uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Checklist (per-company template, never hardcoded in the app)
-- ---------------------------------------------------------------------------

create table checklist_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies (id) on delete cascade,
  label       text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table checklist_responses (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects (id) on delete cascade,
  proof_version_id   uuid not null references proof_versions (id) on delete cascade,
  checklist_item_id  uuid not null references checklist_items (id) on delete cascade,
  checked            boolean not null default false,
  responded_by       text, -- customer name/email; free text because customers have no auth account
  updated_at         timestamptz not null default now(),
  unique (proof_version_id, checklist_item_id)
);

-- ---------------------------------------------------------------------------
-- Approvals & change requests (append-only audit records)
-- ---------------------------------------------------------------------------

create table approvals (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references projects (id) on delete cascade,
  proof_version_id    uuid not null references proof_versions (id) on delete cascade,
  customer_name       text not null,
  customer_email      text not null,
  comment             text,
  checklist_snapshot  jsonb not null default '[]'::jsonb, -- [{label, checked}]
  browser             text,
  device              text,
  ip_address          text,
  created_at          timestamptz not null default now()
);

create table change_requests (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects (id) on delete cascade,
  proof_version_id   uuid not null references proof_versions (id) on delete cascade,
  comment            text not null,
  requested_by_name  text not null,
  requested_by_email text not null,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Comments (customer-visible thread + employee-only internal notes)
-- ---------------------------------------------------------------------------

create table comments (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects (id) on delete cascade,
  author_type  author_type not null,
  author_id    uuid, -- profiles.id for employees; null for customers
  author_name  text not null,
  body         text not null,
  is_internal  boolean not null default false,
  created_at   timestamptz not null default now()
);

create table comment_reads (
  comment_id  uuid not null references comments (id) on delete cascade,
  reader_key  text not null, -- profile id or review-link token hash
  read_at     timestamptz not null default now(),
  primary key (comment_id, reader_key)
);

create table attachments (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies (id) on delete cascade,
  parent_type  text not null check (parent_type in ('comment', 'change_request')),
  parent_id    uuid not null,
  file_path    text not null,
  file_name    text not null,
  file_type    text not null,
  file_size    bigint not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Activity & notifications
-- ---------------------------------------------------------------------------

create table activity_events (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects (id) on delete cascade,
  actor_type  author_type not null,
  actor_name  text not null,
  action      activity_action not null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies (id) on delete cascade,
  recipient_id  uuid references profiles (id) on delete cascade, -- null => customer notification
  customer_id   uuid references customers (id) on delete cascade,
  type          notification_type not null,
  payload       jsonb not null default '{}'::jsonb,
  read_at       timestamptz,
  emailed_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ClickUp integration
-- ---------------------------------------------------------------------------

create table clickup_connections (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null unique references companies (id) on delete cascade,
  workspace_id   text not null,
  space_id       text,
  folder_id      text,
  list_id        text,
  webhook_id     text,
  access_token   text not null, -- stored server-side only; never exposed via RLS select for non-admins
  sync_settings  jsonb not null default '{"sync_status": true, "sync_due_date": true, "sync_comments": false, "sync_attachments": false}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table clickup_task_links (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null unique references projects (id) on delete cascade,
  task_id           text not null,
  task_url          text,
  clickup_status    text,
  clickup_assignee  text,
  last_synced_at    timestamptz,
  sync_error        text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index idx_profiles_company on profiles (company_id);
create index idx_customers_company on customers (company_id);
create index idx_projects_company on projects (company_id, status);
create index idx_versions_project on proof_versions (project_id, version_number desc);
create index idx_review_links_token on review_links (token);
create index idx_checklist_company on checklist_items (company_id, sort_order);
create index idx_responses_version on checklist_responses (proof_version_id);
create index idx_comments_project on comments (project_id, created_at);
create index idx_activity_project on activity_events (project_id, created_at);
create index idx_notifications_recipient on notifications (recipient_id, read_at);
create index idx_attachments_parent on attachments (parent_type, parent_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger projects_updated_at before update on projects
  for each row execute function set_updated_at();

create trigger clickup_connections_updated_at before update on clickup_connections
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function auth_company_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = auth.uid()
$$;

create or replace function auth_is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Employees/admins query through the anon/authenticated key and are scoped to
-- their company. Customers never query directly: all customer traffic goes
-- through server routes that validate a review-link token and use the service
-- role, so no anon policies are defined.
-- ---------------------------------------------------------------------------

alter table companies enable row level security;
alter table profiles enable row level security;
alter table customers enable row level security;
alter table projects enable row level security;
alter table proof_versions enable row level security;
alter table review_links enable row level security;
alter table checklist_items enable row level security;
alter table checklist_responses enable row level security;
alter table approvals enable row level security;
alter table change_requests enable row level security;
alter table comments enable row level security;
alter table comment_reads enable row level security;
alter table attachments enable row level security;
alter table activity_events enable row level security;
alter table notifications enable row level security;
alter table clickup_connections enable row level security;
alter table clickup_task_links enable row level security;

create policy "members read own company" on companies
  for select using (id = auth_company_id());
create policy "admins update own company" on companies
  for update using (id = auth_company_id() and auth_is_admin());

create policy "members read company profiles" on profiles
  for select using (company_id = auth_company_id());
create policy "users update own profile" on profiles
  for update using (id = auth.uid());

create policy "members manage customers" on customers
  for all using (company_id = auth_company_id());

create policy "members manage projects" on projects
  for all using (company_id = auth_company_id());

create policy "members read versions" on proof_versions
  for select using (project_id in (select id from projects where company_id = auth_company_id()));
create policy "members insert versions" on proof_versions
  for insert with check (project_id in (select id from projects where company_id = auth_company_id()));
-- no update/delete policies: version history is immutable

create policy "members manage review links" on review_links
  for all using (project_id in (select id from projects where company_id = auth_company_id()));

create policy "members read checklist" on checklist_items
  for select using (company_id = auth_company_id());
create policy "admins manage checklist" on checklist_items
  for all using (company_id = auth_company_id() and auth_is_admin());

create policy "members read responses" on checklist_responses
  for select using (project_id in (select id from projects where company_id = auth_company_id()));

create policy "members read approvals" on approvals
  for select using (project_id in (select id from projects where company_id = auth_company_id()));
-- insert happens via service role only; approvals are immutable

create policy "members read change requests" on change_requests
  for select using (project_id in (select id from projects where company_id = auth_company_id()));

create policy "members read comments" on comments
  for select using (project_id in (select id from projects where company_id = auth_company_id()));
create policy "members write comments" on comments
  for insert with check (
    project_id in (select id from projects where company_id = auth_company_id())
    and author_type = 'employee'
    and author_id = auth.uid()
  );

create policy "members read comment reads" on comment_reads
  for select using (comment_id in (
    select c.id from comments c
    join projects p on p.id = c.project_id
    where p.company_id = auth_company_id()
  ));
create policy "members mark reads" on comment_reads
  for insert with check (reader_key = auth.uid()::text);

create policy "members read attachments" on attachments
  for select using (company_id = auth_company_id());
create policy "members insert attachments" on attachments
  for insert with check (company_id = auth_company_id());

create policy "members read activity" on activity_events
  for select using (project_id in (select id from projects where company_id = auth_company_id()));
create policy "members insert activity" on activity_events
  for insert with check (project_id in (select id from projects where company_id = auth_company_id()));
-- append-only: no update/delete

create policy "recipients read notifications" on notifications
  for select using (recipient_id = auth.uid());
create policy "recipients mark notifications read" on notifications
  for update using (recipient_id = auth.uid());

create policy "admins manage clickup connection" on clickup_connections
  for all using (company_id = auth_company_id() and auth_is_admin());

create policy "members read clickup links" on clickup_task_links
  for select using (project_id in (select id from projects where company_id = auth_company_id()));
create policy "members manage clickup links" on clickup_task_links
  for all using (project_id in (select id from projects where company_id = auth_company_id()));

-- ---------------------------------------------------------------------------
-- Storage buckets (private; access via signed URLs only)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('proofs', 'proofs', false, 26214400, array['image/png', 'image/jpeg', 'application/pdf']),
  ('attachments', 'attachments', false, 26214400, null)
on conflict (id) do nothing;

create policy "members upload proofs" on storage.objects
  for insert with check (
    bucket_id in ('proofs', 'attachments')
    and (storage.foldername(name))[1] = auth_company_id()::text
  );

create policy "members read own company files" on storage.objects
  for select using (
    bucket_id in ('proofs', 'attachments')
    and (storage.foldername(name))[1] = auth_company_id()::text
  );
