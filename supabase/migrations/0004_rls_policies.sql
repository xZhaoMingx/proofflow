-- ProofFlow 0004 — Row Level Security policies.
-- Run AFTER 0003. Wipes the old company-only policies from 0001 and installs
-- the role-aware staff policies + customer portal policies.
--
-- Model:
--   STAFF     see every row in their company (auth_company_id + auth_is_active),
--             with deletes/settings gated by auth_is_admin / auth_is_owner.
--   CUSTOMERS see only rows for projects they're assigned to
--             (auth_customer_can_see), and never internal notes.
--   SERVICE ROLE bypasses RLS entirely (used by token review links).

-- ---------------------------------------------------------------------------
-- Convenience: can the current customer see this project?
-- ---------------------------------------------------------------------------
create or replace function auth_customer_can_see(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_customers
    where project_id = pid and customer_id = auth_customer_id()
  )
$$;

-- ---------------------------------------------------------------------------
-- Start clean: drop every existing policy in public, then enable RLS on the
-- new tables. Policies are recreated below.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table project_employees   enable row level security;
alter table project_customers   enable row level security;
alter table invitations         enable row level security;
alter table invitation_projects enable row level security;
alter table audit_logs          enable row level security;

-- ===========================================================================
-- companies
-- ===========================================================================
create policy "staff read own company" on companies
  for select using (id = auth_company_id() and auth_is_active());
create policy "owner updates company" on companies
  for update using (id = auth_company_id() and auth_is_owner());
create policy "owner deletes company" on companies
  for delete using (id = auth_company_id() and auth_is_owner());
create policy "customer reads own company" on companies
  for select using (
    id = (select company_id from customers where auth_user_id = auth.uid() and status = 'active')
  );

-- ===========================================================================
-- profiles
-- ===========================================================================
create policy "staff read company members" on profiles
  for select using (company_id = auth_company_id() and auth_is_active());
create policy "user updates self" on profiles
  for update using (id = auth.uid());
create policy "admin manages members" on profiles
  for update using (company_id = auth_company_id() and auth_is_admin());
create policy "admin removes members" on profiles
  for delete using (company_id = auth_company_id() and auth_is_admin() and id <> auth.uid());

-- ===========================================================================
-- customers  (staff manage; a customer can read their own record)
-- ===========================================================================
create policy "staff manage customers" on customers
  for all using (company_id = auth_company_id() and auth_is_active())
  with check (company_id = auth_company_id() and auth_is_active());
create policy "customer reads self" on customers
  for select using (auth_user_id = auth.uid());

-- ===========================================================================
-- projects
-- ===========================================================================
create policy "staff read company projects" on projects
  for select using (company_id = auth_company_id() and auth_is_active());
create policy "staff create projects" on projects
  for insert with check (company_id = auth_company_id() and auth_is_active());
create policy "staff edit projects" on projects
  for update using (company_id = auth_company_id() and auth_is_active())
  with check (company_id = auth_company_id());
create policy "admin deletes projects" on projects
  for delete using (company_id = auth_company_id() and auth_is_admin());
create policy "customer reads assigned projects" on projects
  for select using (auth_customer_can_see(id));

-- ===========================================================================
-- proof_versions  (append-only)
-- ===========================================================================
create policy "staff read versions" on proof_versions
  for select using (company_id = auth_company_id() and auth_is_active());
create policy "staff insert versions" on proof_versions
  for insert with check (company_id = auth_company_id() and auth_is_active());
create policy "customer reads assigned versions" on proof_versions
  for select using (auth_customer_can_see(project_id));

-- ===========================================================================
-- review_links  (staff only; token flow uses service role)
-- ===========================================================================
create policy "staff manage review links" on review_links
  for all using (company_id = auth_company_id() and auth_is_active())
  with check (company_id = auth_company_id() and auth_is_active());

-- ===========================================================================
-- checklist_items  (read by staff + customers; edited by admins)
-- ===========================================================================
create policy "staff read checklist" on checklist_items
  for select using (company_id = auth_company_id() and auth_is_active());
create policy "admin manages checklist" on checklist_items
  for all using (company_id = auth_company_id() and auth_is_admin())
  with check (company_id = auth_company_id() and auth_is_admin());
create policy "customer reads checklist" on checklist_items
  for select using (
    company_id = (select company_id from customers where auth_user_id = auth.uid() and status = 'active')
  );

-- ===========================================================================
-- checklist_responses
-- ===========================================================================
create policy "staff read responses" on checklist_responses
  for select using (company_id = auth_company_id() and auth_is_active());
create policy "customer reads assigned responses" on checklist_responses
  for select using (auth_customer_can_see(project_id));
create policy "customer writes responses" on checklist_responses
  for insert with check (auth_customer_can_see(project_id) and customer_id = auth_customer_id());
create policy "customer updates responses" on checklist_responses
  for update using (auth_customer_can_see(project_id) and customer_id = auth_customer_id());

-- ===========================================================================
-- approvals  (immutable)
-- ===========================================================================
create policy "staff read approvals" on approvals
  for select using (company_id = auth_company_id() and auth_is_active());
create policy "customer reads assigned approvals" on approvals
  for select using (auth_customer_can_see(project_id));
create policy "customer creates approvals" on approvals
  for insert with check (auth_customer_can_see(project_id) and customer_id = auth_customer_id());

-- ===========================================================================
-- change_requests
-- ===========================================================================
create policy "staff read change requests" on change_requests
  for select using (company_id = auth_company_id() and auth_is_active());
create policy "customer reads assigned change requests" on change_requests
  for select using (auth_customer_can_see(project_id));
create policy "customer creates change requests" on change_requests
  for insert with check (auth_customer_can_see(project_id) and customer_id = auth_customer_id());

-- ===========================================================================
-- comments  (internal notes are staff-only, by construction)
-- ===========================================================================
create policy "staff read comments" on comments
  for select using (company_id = auth_company_id() and auth_is_active());
create policy "staff write comments" on comments
  for insert with check (
    company_id = auth_company_id() and auth_is_active()
    and author_type = 'employee' and author_id = auth.uid()
  );
create policy "customer reads visible comments" on comments
  for select using (is_internal = false and auth_customer_can_see(project_id));
create policy "customer writes comments" on comments
  for insert with check (
    is_internal = false and author_type = 'customer'
    and customer_id = auth_customer_id() and auth_customer_can_see(project_id)
  );

-- ===========================================================================
-- comment_reads  (read receipts)
-- ===========================================================================
create policy "staff read receipts" on comment_reads
  for select using (comment_id in (
    select id from comments where company_id = auth_company_id()
  ));
create policy "staff mark read" on comment_reads
  for insert with check (reader_key = auth.uid()::text);
create policy "customer read receipts" on comment_reads
  for select using (comment_id in (
    select c.id from comments c where auth_customer_can_see(c.project_id)
  ));
create policy "customer marks read" on comment_reads
  for insert with check (reader_key = auth.uid()::text);

-- ===========================================================================
-- attachments  (comment/change-request files)
-- ===========================================================================
create policy "staff read attachments" on attachments
  for select using (company_id = auth_company_id() and auth_is_active());
create policy "staff insert attachments" on attachments
  for insert with check (company_id = auth_company_id() and auth_is_active());
create policy "customer reads assigned attachments" on attachments
  for select using (
    (parent_type = 'comment' and parent_id in (
      select id from comments where auth_customer_can_see(project_id) and is_internal = false))
    or (parent_type = 'change_request' and parent_id in (
      select id from change_requests where auth_customer_can_see(project_id)))
  );
create policy "customer inserts attachments" on attachments
  for insert with check (
    (parent_type = 'comment' and parent_id in (
      select id from comments where auth_customer_can_see(project_id)))
    or (parent_type = 'change_request' and parent_id in (
      select id from change_requests where auth_customer_can_see(project_id)))
  );

-- ===========================================================================
-- activity_events  (append-only timeline)
-- ===========================================================================
create policy "staff read activity" on activity_events
  for select using (company_id = auth_company_id() and auth_is_active());
create policy "staff insert activity" on activity_events
  for insert with check (company_id = auth_company_id() and auth_is_active());
create policy "customer reads assigned activity" on activity_events
  for select using (auth_customer_can_see(project_id));

-- ===========================================================================
-- notifications  (each principal sees their own)
-- ===========================================================================
create policy "recipient reads notifications" on notifications
  for select using (recipient_id = auth.uid() or customer_id = auth_customer_id());
create policy "recipient updates notifications" on notifications
  for update using (recipient_id = auth.uid() or customer_id = auth_customer_id());

-- ===========================================================================
-- clickup  (admin-managed integration)
-- ===========================================================================
create policy "admin manages clickup connection" on clickup_connections
  for all using (company_id = auth_company_id() and auth_is_admin())
  with check (company_id = auth_company_id() and auth_is_admin());
create policy "staff read clickup links" on clickup_task_links
  for select using (auth_is_active() and project_id in (
    select id from projects where company_id = auth_company_id()));
create policy "staff manage clickup links" on clickup_task_links
  for all using (auth_is_active() and project_id in (
    select id from projects where company_id = auth_company_id()))
  with check (project_id in (select id from projects where company_id = auth_company_id()));

-- ===========================================================================
-- project_employees  (assignment = accountability, not access)
-- ===========================================================================
create policy "staff read employee assignments" on project_employees
  for select using (auth_is_active() and project_id in (
    select id from projects where company_id = auth_company_id()));
create policy "staff manage employee assignments" on project_employees
  for all using (auth_is_active() and project_id in (
    select id from projects where company_id = auth_company_id()))
  with check (project_id in (select id from projects where company_id = auth_company_id()));

-- ===========================================================================
-- project_customers  (assignment DRIVES customer visibility)
-- ===========================================================================
create policy "staff read customer assignments" on project_customers
  for select using (auth_is_active() and project_id in (
    select id from projects where company_id = auth_company_id()));
create policy "staff manage customer assignments" on project_customers
  for all using (auth_is_active() and project_id in (
    select id from projects where company_id = auth_company_id()))
  with check (project_id in (select id from projects where company_id = auth_company_id()));
create policy "customer reads own assignments" on project_customers
  for select using (customer_id = auth_customer_id());

-- ===========================================================================
-- invitations  (employees can invite customers; only admins invite employees)
-- ===========================================================================
create policy "staff read invitations" on invitations
  for select using (company_id = auth_company_id() and auth_is_active());
create policy "staff create invitations" on invitations
  for insert with check (
    company_id = auth_company_id() and auth_is_active()
    and (kind = 'customer' or (kind = 'employee' and auth_is_admin()))
  );
create policy "staff update invitations" on invitations
  for update using (
    company_id = auth_company_id() and auth_is_active()
    and (kind = 'customer' or auth_is_admin())
  );
create policy "staff delete invitations" on invitations
  for delete using (
    company_id = auth_company_id() and auth_is_active()
    and (kind = 'customer' or auth_is_admin())
  );

create policy "staff manage invitation projects" on invitation_projects
  for all using (auth_is_active() and invitation_id in (
    select id from invitations where company_id = auth_company_id()))
  with check (invitation_id in (
    select id from invitations where company_id = auth_company_id()));

-- ===========================================================================
-- audit_logs  (admins read; any active staff action may append; immutable)
-- ===========================================================================
create policy "admin reads audit" on audit_logs
  for select using (company_id = auth_company_id() and auth_is_admin());
create policy "staff append audit" on audit_logs
  for insert with check (company_id = auth_company_id() and auth_is_active());

-- ---------------------------------------------------------------------------
-- Storage. Paths are  <company_id>/<project_id>/...  — element [1] is the
-- company, element [2] is the project. Staff access their company's folder;
-- customers access only assigned projects' folders.
-- ---------------------------------------------------------------------------
drop policy if exists "staff upload company files" on storage.objects;
create policy "staff upload company files" on storage.objects
  for insert with check (
    bucket_id in ('proofs', 'attachments')
    and (storage.foldername(name))[1] = auth_company_id()::text
    and auth_is_active()
  );

drop policy if exists "staff read company files" on storage.objects;
create policy "staff read company files" on storage.objects
  for select using (
    bucket_id in ('proofs', 'attachments')
    and (storage.foldername(name))[1] = auth_company_id()::text
    and auth_is_active()
  );

drop policy if exists "customers read assigned files" on storage.objects;
create policy "customers read assigned files" on storage.objects
  for select using (
    bucket_id in ('proofs', 'attachments')
    and (storage.foldername(name))[2] in (
      select project_id::text from project_customers where customer_id = auth_customer_id()
    )
  );

drop policy if exists "customers upload change files" on storage.objects;
create policy "customers upload change files" on storage.objects
  for insert with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[2] in (
      select project_id::text from project_customers where customer_id = auth_customer_id()
    )
  );
