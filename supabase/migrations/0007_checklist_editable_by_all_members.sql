-- Any active team member can manage the review checklist (not just admins).
-- The single shared team has owner + employees and no "admin" role, so the
-- old admin-only policy locked everyone out. Replace it with an active-member
-- policy, matching how projects/review_links are scoped.

drop policy if exists "admin manages checklist" on public.checklist_items;

create policy "staff manages checklist"
  on public.checklist_items
  for all
  using (company_id = auth_company_id() and auth_is_active())
  with check (company_id = auth_company_id() and auth_is_active());
