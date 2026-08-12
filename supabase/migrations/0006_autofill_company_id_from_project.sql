-- Child rows carry company_id (NOT NULL, used by RLS) but several insert paths
-- don't set it (review_links, comments, activity_events, proof_versions, and the
-- customer-side approvals/change_requests/checklist_responses). Derive it from the
-- parent project when omitted, so both the employee (RLS) client and the
-- customer-side (admin) client always satisfy the NOT NULL + RLS company scoping.
-- Runs BEFORE INSERT so company_id is populated before the RLS WITH CHECK
-- (company_id = auth_company_id()) is evaluated.

create or replace function public.set_company_from_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null and new.project_id is not null then
    select p.company_id into new.company_id
    from public.projects p
    where p.id = new.project_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.set_company_from_project() from anon, authenticated;

do $$
declare
  t text;
  tables text[] := array[
    'review_links','comments','activity_events','proof_versions',
    'approvals','change_requests','checklist_responses'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_set_company_from_project on public.%I', t);
    execute format(
      'create trigger trg_set_company_from_project before insert on public.%I
       for each row execute function public.set_company_from_project()', t);
  end loop;
end;
$$;
