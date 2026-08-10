-- ProofFlow 0003 — RLS helper functions + the signup/invite trigger.
-- Run AFTER 0002. These functions are the single source of truth that every
-- policy in 0004 reads from, so future roles slot in by editing here, not by
-- rewriting policies.

-- ---------------------------------------------------------------------------
-- Identity helpers (SECURITY DEFINER so they can read profiles/customers
-- regardless of the caller's own RLS; STABLE so the planner can cache them).
-- ---------------------------------------------------------------------------

create or replace function auth_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = auth.uid()
$$;

create or replace function auth_role()
returns profile_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function auth_is_active()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active')
$$;

create or replace function auth_is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'active' and role = 'owner'
  )
$$;

-- "Admin" capabilities belong to both owners and admins.
create or replace function auth_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'active' and role in ('owner', 'admin')
  )
$$;

-- The active customer account for the current user (null for staff/anon).
create or replace function auth_customer_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from customers where auth_user_id = auth.uid() and status = 'active'
$$;

-- ---------------------------------------------------------------------------
-- handle_new_user(): runs after Supabase Auth creates a user. All privileged
-- setup (creating a company, assigning a role, linking a customer) happens
-- here — the client never does it directly. Behaviour is chosen by the
-- `mode` field the app puts in the signup metadata.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta       jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  mode       text  := meta ->> 'mode';
  inv        invitations%rowtype;
  new_company_id uuid;
  base_slug  text;
  candidate  text;
  n int;
begin
  -- 1) New company: the signer becomes the Owner of a fresh workspace.
  if mode = 'company' then
    base_slug := nullif(slugify(coalesce(meta ->> 'company_name', '')), '');
    if base_slug is null then base_slug := 'workspace'; end if;
    candidate := base_slug; n := 1;
    while exists (select 1 from companies where slug = candidate) loop
      n := n + 1; candidate := base_slug || '-' || n;
    end loop;

    insert into companies (name, slug)
      values (coalesce(nullif(meta ->> 'company_name', ''), 'My Company'), candidate)
      returning id into new_company_id;

    insert into profiles (id, company_id, role, status, full_name, email)
      values (
        new.id, new_company_id, 'owner', 'active',
        coalesce(nullif(meta ->> 'full_name', ''), split_part(new.email, '@', 1)),
        new.email
      );

    update companies set owner_id = new.id where id = new_company_id;

    -- Seed the default checklist for the new workspace.
    insert into checklist_items (company_id, label, sort_order)
    select new_company_id, label, ord from (values
      ('Spelling',0),('Colors',1),('Layout',2),('Dimensions',3),('Logo Placement',4),
      ('Contact Information',5),('QR Code',6),('Safe Area',7),('Material',8),('Finishing',9)
    ) as d(label, ord);

    insert into audit_logs (company_id, actor_id, actor_type, actor_name, action, target_type, target_id)
      values (new_company_id, new.id, 'employee',
              coalesce(nullif(meta ->> 'full_name', ''), new.email), 'company_created', 'company', new_company_id);
    return new;
  end if;

  -- 2) Invitation: employee or customer joining an existing company.
  if mode = 'invite' then
    select * into inv from invitations
      where token = (meta ->> 'token')
        and status = 'pending'
        and expires_at > now()
        and lower(email) = lower(new.email)
      limit 1;

    if inv.id is null then
      -- Invalid/expired/mismatched invite: leave the auth user with no profile,
      -- so getSessionProfile returns null and the app shows an error.
      return new;
    end if;

    if inv.kind = 'employee' then
      insert into profiles (id, company_id, role, status, full_name, email, invited_by)
        values (new.id, inv.company_id, coalesce(inv.role, 'employee'), 'active',
                coalesce(inv.full_name, split_part(new.email, '@', 1)), new.email, inv.invited_by);

      insert into audit_logs (company_id, actor_id, actor_type, actor_name, action, target_type, target_id)
        values (inv.company_id, new.id, 'employee', inv.full_name, 'member_joined', 'member', new.id);

    elsif inv.kind = 'customer' then
      -- Link (or create) the customer directory record to this login.
      if inv.customer_id is not null then
        update customers
          set auth_user_id = new.id, status = 'active', last_login_at = now()
          where id = inv.customer_id;
      else
        insert into customers (company_id, name, email, auth_user_id, status, invited_by)
          values (inv.company_id, inv.full_name, new.email, new.id, 'active', inv.invited_by)
          returning id into inv.customer_id;
      end if;

      -- Assign the pre-selected projects.
      insert into project_customers (project_id, customer_id, assigned_by)
        select ip.project_id, inv.customer_id, inv.invited_by
        from invitation_projects ip
        where ip.invitation_id = inv.id
        on conflict do nothing;

      insert into audit_logs (company_id, actor_id, actor_type, actor_name, action, target_type, target_id)
        values (inv.company_id, new.id, 'customer', inv.full_name, 'customer_joined', 'customer', inv.customer_id);
    end if;

    update invitations set status = 'accepted', accepted_at = now() where id = inv.id;
    return new;
  end if;

  -- Any other signup (no recognised mode) creates no profile.
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
