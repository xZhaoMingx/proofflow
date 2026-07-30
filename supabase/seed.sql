-- ProofFlow demo seed data.
-- Run after 0001_init.sql. Creates a demo company, customer, project with two
-- proof versions, the default checklist, and a review link with a fixed token
-- for local testing: /review/demo-review-token-12345
--
-- Note: profiles reference auth.users, so the demo designer is created via
-- Supabase auth admin API (see scripts/seed.ts) or the dashboard; this file
-- seeds everything that does not require an auth user.

insert into companies (id, name, settings) values
  ('11111111-1111-1111-1111-111111111111', 'Summit Signs & Graphics',
   '{"require_full_checklist": true, "capture_ip": false}'::jsonb);

insert into customers (id, company_id, name, email, company_name) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'Sally Johnson', 'sally@cornerbakery.example.com', 'Corner Bakery');

insert into projects (id, company_id, name, customer_id, due_date, status) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Grand Opening Banner', '22222222-2222-2222-2222-222222222222',
   current_date + 7, 'awaiting_review');

-- Default checklist (per-company; admins can add/remove/reorder/rename)
insert into checklist_items (company_id, label, sort_order) values
  ('11111111-1111-1111-1111-111111111111', 'Spelling', 0),
  ('11111111-1111-1111-1111-111111111111', 'Colors', 1),
  ('11111111-1111-1111-1111-111111111111', 'Layout', 2),
  ('11111111-1111-1111-1111-111111111111', 'Dimensions', 3),
  ('11111111-1111-1111-1111-111111111111', 'Logo Placement', 4),
  ('11111111-1111-1111-1111-111111111111', 'Contact Information', 5),
  ('11111111-1111-1111-1111-111111111111', 'QR Code', 6),
  ('11111111-1111-1111-1111-111111111111', 'Safe Area', 7),
  ('11111111-1111-1111-1111-111111111111', 'Material', 8),
  ('11111111-1111-1111-1111-111111111111', 'Finishing', 9);

insert into proof_versions (id, project_id, version_number, file_path, file_name, file_type, file_size, revision_notes) values
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333333', 1,
   '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/v1/banner-v1.png',
   'banner-v1.png', 'image/png', 245760, 'Initial concept.'),
  ('44444444-4444-4444-4444-444444444402', '33333333-3333-3333-3333-333333333333', 2,
   '11111111-1111-1111-1111-111111111111/33333333-3333-3333-3333-333333333333/v2/banner-v2.png',
   'banner-v2.png', 'image/png', 251904, 'Updated headline color and enlarged logo per customer request.');

insert into review_links (project_id, customer_id, token, expires_at) values
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222',
   'demo-review-token-12345', now() + interval '30 days');

insert into activity_events (project_id, actor_type, actor_name, action, metadata) values
  ('33333333-3333-3333-3333-333333333333', 'system', 'System', 'project_created', '{}'),
  ('33333333-3333-3333-3333-333333333333', 'employee', 'Lydia Park', 'proof_uploaded', '{"version": 1}'),
  ('33333333-3333-3333-3333-333333333333', 'customer', 'Sally Johnson', 'comment_added', '{"preview": "Can we make the logo bigger?"}'),
  ('33333333-3333-3333-3333-333333333333', 'customer', 'Sally Johnson', 'revision_requested', '{"version": 1}'),
  ('33333333-3333-3333-3333-333333333333', 'employee', 'Lydia Park', 'version_uploaded', '{"version": 2}');

insert into comments (project_id, author_type, author_name, body, is_internal) values
  ('33333333-3333-3333-3333-333333333333', 'customer', 'Sally Johnson',
   'Can we make the logo bigger? It gets lost at a distance.', false),
  ('33333333-3333-3333-3333-333333333333', 'employee', 'Lydia Park',
   'Absolutely - version 2 is up with a 40% larger logo and a warmer brown.', false),
  ('33333333-3333-3333-3333-333333333333', 'employee', 'Lydia Park',
   'Customer is a rush order - printer needs final art by Friday.', true);
