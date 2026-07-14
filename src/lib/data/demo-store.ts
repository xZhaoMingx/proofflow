import "server-only";
import { randomUUID } from "crypto";
import type {
  ActivityEvent,
  AppNotification,
  Approval,
  Attachment,
  ChangeRequest,
  ChecklistItem,
  ChecklistResponse,
  ClickUpConnection,
  ClickUpTaskLink,
  Comment,
  Company,
  Customer,
  Profile,
  Project,
  ProofVersion,
  ReviewLink,
} from "@/lib/types";

/**
 * In-memory backend used when Supabase is not configured (demo mode).
 * Mirrors the Postgres schema so the data-access layer can serve identical
 * shapes from either source. State lives on globalThis to survive Next.js
 * dev-server HMR, and resets on process restart.
 */

export interface DemoDb {
  company: Company;
  profiles: Profile[];
  customers: Customer[];
  projects: Project[];
  versions: ProofVersion[];
  reviewLinks: ReviewLink[];
  checklistItems: ChecklistItem[];
  checklistResponses: ChecklistResponse[];
  approvals: Approval[];
  changeRequests: ChangeRequest[];
  comments: Comment[];
  commentReads: { comment_id: string; reader_key: string; read_at: string }[];
  attachments: Attachment[];
  activity: ActivityEvent[];
  notifications: AppNotification[];
  clickupConnection: ClickUpConnection | null;
  clickupTaskLinks: ClickUpTaskLink[];
}

const COMPANY_ID = "11111111-1111-1111-1111-111111111111";
const CUSTOMER_ID = "22222222-2222-2222-2222-222222222222";
const PROJECT_ID = "33333333-3333-3333-3333-333333333333";
const DESIGNER_ID = "55555555-5555-5555-5555-555555555555";
export const DEMO_TOKEN = "demo-review-token-12345";

const daysAgo = (n: number, h = 0) =>
  new Date(Date.now() - n * 86400000 - h * 3600000).toISOString();
const daysFromNow = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

function buildSeed(): DemoDb {
  const checklistLabels = [
    "Spelling",
    "Colors",
    "Layout",
    "Dimensions",
    "Logo Placement",
    "Contact Information",
    "QR Code",
    "Safe Area",
    "Material",
    "Finishing",
  ];

  const checklistItems: ChecklistItem[] = checklistLabels.map((label, i) => ({
    id: `check-${i}`,
    company_id: COMPANY_ID,
    label,
    sort_order: i,
    is_active: true,
  }));

  const versions: ProofVersion[] = [
    {
      id: "version-1",
      project_id: PROJECT_ID,
      version_number: 1,
      file_path: "/demo/banner-v1.svg",
      file_name: "grand-opening-banner-v1.png",
      file_type: "image/svg+xml",
      file_size: 245760,
      uploaded_by: DESIGNER_ID,
      revision_notes: "Initial concept.",
      created_at: daysAgo(3, 4),
    },
    {
      id: "version-2",
      project_id: PROJECT_ID,
      version_number: 2,
      file_path: "/demo/banner-v2.svg",
      file_name: "grand-opening-banner-v2.png",
      file_type: "image/svg+xml",
      file_size: 251904,
      uploaded_by: DESIGNER_ID,
      revision_notes: "Enlarged logo 40% and warmed up the background per your feedback.",
      created_at: daysAgo(1, 2),
    },
  ];

  const comments: Comment[] = [
    {
      id: "comment-1",
      project_id: PROJECT_ID,
      author_type: "customer",
      author_id: null,
      author_name: "Sally Johnson",
      body: "Can we make the logo bigger? It gets lost at a distance.",
      is_internal: false,
      created_at: daysAgo(2, 6),
    },
    {
      id: "comment-2",
      project_id: PROJECT_ID,
      author_type: "employee",
      author_id: DESIGNER_ID,
      author_name: "Lydia Park",
      body: "Absolutely — version 2 is up with a 40% larger logo and a warmer brown. Let me know what you think!",
      is_internal: false,
      created_at: daysAgo(1, 1),
    },
    {
      id: "comment-3",
      project_id: PROJECT_ID,
      author_type: "employee",
      author_id: DESIGNER_ID,
      author_name: "Lydia Park",
      body: "Rush order — printer needs final art by Friday.",
      is_internal: true,
      created_at: daysAgo(1),
    },
  ];

  const activity: ActivityEvent[] = [
    {
      id: "act-1",
      project_id: PROJECT_ID,
      actor_type: "system",
      actor_name: "System",
      action: "project_created",
      metadata: {},
      created_at: daysAgo(4),
    },
    {
      id: "act-2",
      project_id: PROJECT_ID,
      actor_type: "employee",
      actor_name: "Lydia Park",
      action: "proof_uploaded",
      metadata: { version: 1 },
      created_at: daysAgo(3, 4),
    },
    {
      id: "act-3",
      project_id: PROJECT_ID,
      actor_type: "customer",
      actor_name: "Sally Johnson",
      action: "proof_viewed",
      metadata: { version: 1 },
      created_at: daysAgo(2, 7),
    },
    {
      id: "act-4",
      project_id: PROJECT_ID,
      actor_type: "customer",
      actor_name: "Sally Johnson",
      action: "comment_added",
      metadata: { preview: "Can we make the logo bigger?" },
      created_at: daysAgo(2, 6),
    },
    {
      id: "act-5",
      project_id: PROJECT_ID,
      actor_type: "employee",
      actor_name: "Lydia Park",
      action: "version_uploaded",
      metadata: { version: 2 },
      created_at: daysAgo(1, 2),
    },
  ];

  return {
    company: {
      id: COMPANY_ID,
      name: "Summit Signs & Graphics",
      logo_url: null,
      settings: { require_full_checklist: true, capture_ip: false },
    },
    profiles: [
      {
        id: DESIGNER_ID,
        company_id: COMPANY_ID,
        role: "admin",
        full_name: "Lydia Park",
        email: "lydia@summitsigns.example.com",
        avatar_url: null,
      },
    ],
    customers: [
      {
        id: CUSTOMER_ID,
        company_id: COMPANY_ID,
        name: "Sally Johnson",
        email: "sally@cornerbakery.example.com",
        company_name: "Corner Bakery",
      },
    ],
    projects: [
      {
        id: PROJECT_ID,
        company_id: COMPANY_ID,
        name: "Grand Opening Banner",
        job_number: "JOB-1042",
        customer_id: CUSTOMER_ID,
        designer_id: DESIGNER_ID,
        due_date: daysFromNow(7).slice(0, 10),
        status: "awaiting_review",
        created_at: daysAgo(4),
        updated_at: daysAgo(1, 2),
      },
    ],
    versions,
    reviewLinks: [
      {
        id: "link-1",
        project_id: PROJECT_ID,
        customer_id: CUSTOMER_ID,
        token: DEMO_TOKEN,
        expires_at: daysFromNow(30),
        revoked_at: null,
        created_at: daysAgo(3),
      },
    ],
    checklistItems,
    checklistResponses: [],
    approvals: [],
    changeRequests: [],
    comments,
    commentReads: [
      { comment_id: "comment-1", reader_key: DESIGNER_ID, read_at: daysAgo(2, 5) },
    ],
    attachments: [],
    activity,
    notifications: [],
    clickupConnection: null,
    clickupTaskLinks: [
      {
        id: "cu-link-1",
        project_id: PROJECT_ID,
        task_id: "86dqdemo1",
        task_url: "https://app.clickup.com/t/86dqdemo1",
        clickup_status: "in review",
        clickup_assignee: "Lydia Park",
        last_synced_at: daysAgo(0, 3),
        sync_error: null,
      },
    ],
  };
}

const globalStore = globalThis as unknown as { __proofflowDemoDb?: DemoDb };

export function demoDb(): DemoDb {
  if (!globalStore.__proofflowDemoDb) {
    globalStore.__proofflowDemoDb = buildSeed();
  }
  return globalStore.__proofflowDemoDb;
}

export function demoId(): string {
  return randomUUID();
}

export function demoProfile(): Profile {
  return demoDb().profiles[0];
}
