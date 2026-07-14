# ProofFlow

Customer proof review and approval for print/sign shops — a modern take on the proofing
workflow: send a customer a secure link, they review the artwork, tick a checklist,
approve or request changes, and your team gets notified. Built with Next.js 16, React 19,
TypeScript, Tailwind CSS v4, shadcn/ui, and Supabase.

## Features

**Customer review page** (`/review/<token>` — no account needed)
- Proof viewer with zoom, pan, fit-to-screen, actual size, fullscreen, mouse-wheel zoom,
  and touch gestures; PNG/JPG and multi-page PDF rendering (pdf.js)
- Version switcher with upload dates and revision notes; full version history
- Company-customizable review checklist (must be completed before approving, configurable)
- Approve flow: confirmation dialog, optional comment; records date/time, name, email,
  browser, device, optional IP, and a checklist snapshot for the audit trail
- Request changes: comment + multi-file attachments; flips status and notifies the team
- Conversation thread with attachments, timestamps, and read receipts
- Activity timeline (created, uploaded, viewed, commented, revision requested, approved…)
- Light/dark mode, responsive single-column mobile layout

**Employee dashboard** (`/projects`)
- Project list and detail: upload proof versions (append-only, never overwritten),
  manage expiring review links, change status, reply to customers
- Internal notes tab — never visible to customers (enforced at the data layer/RLS)
- In-app notification bell + optional email via Resend
- Checklist admin: add, rename, remove (soft-delete), reorder
- ClickUp integration: connect a workspace, link tasks, push status changes, webhook
  for inbound updates, manual "Sync now" — fully failure-tolerant (ProofFlow keeps
  working when ClickUp is down)

## Quick start (demo mode)

```bash
npm install
npm run dev
```

With no Supabase configuration, the app runs on an in-memory demo dataset:

- Customer review page: http://localhost:3000/review/demo-review-token-12345
- Employee dashboard: http://localhost:3000/projects (signed in as a demo admin)

Demo data resets when the dev server restarts.

## Going live with Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/0001_init.sql` (SQL editor or `supabase db push`) — creates
   all tables, enums, indexes, RLS policies, and private storage buckets.
3. Optionally run `supabase/seed.sql` for sample data.
4. Create an employee: add an auth user, then insert a matching `profiles` row with
   `role = 'admin'` and a `company_id`.
5. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; used for token-authenticated customer routes)
   - `RESEND_API_KEY` / `EMAIL_FROM` for email notifications (optional)
   - `CLICKUP_WEBHOOK_SECRET` to verify inbound ClickUp webhooks (optional)

### Security model

- Employees sign in with Supabase Auth; every table is protected by RLS scoped to the
  user's company. Internal notes and the ClickUp token have stricter policies.
- Customers never authenticate: they use single-purpose review links (long random
  tokens with expiry/revocation). All customer traffic goes through server routes that
  validate the token and query with the service role, scoped to that link's project.
- Proofs and attachments live in private buckets; the browser only ever receives
  short-lived signed URLs. Uploads are validated server-side (MIME type, 25 MB cap).
- Approvals, proof versions, and activity events are append-only.

## ClickUp

Settings → ClickUp: paste a personal API token (verified against the ClickUp API before
saving), workspace ID, and per-company sync toggles (status, due date, comments,
attachments). On a project, link a task ID to enable "Open in ClickUp", cached
status/assignee display, push-on-status-change, and "Sync now". Point a ClickUp webhook
at `/api/integrations/clickup/webhook` for inbound updates.

## Project structure

```
supabase/            migrations + seed (schema, RLS, buckets)
src/
  app/
    review/[token]/  customer review page
    (dashboard)/     employee pages + server actions
    api/review/…     token-validated customer APIs
    api/…            attachments, ClickUp webhook
  components/        viewer/, review/, comments/, timeline/, versions/, dashboard/, ui/
  lib/               supabase clients, auth, storage, notifications, validation, types
    data/            data-access layer (Supabase mode + in-memory demo mode)
  services/clickup/  isolated, failure-tolerant ClickUp client + sync
```
