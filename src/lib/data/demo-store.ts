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
 *
 * Seeded empty: just the company, one admin, and the default checklist.
 * Create projects and upload proofs from the dashboard at /projects.
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
  // Demo mode keeps the API token in memory (and mirrors it to a file so it
  // survives restarts); Supabase mode stores it in the clickup_connections row.
  clickupConnection: (ClickUpConnection & { access_token?: string }) | null;
  clickupTaskLinks: ClickUpTaskLink[];
}

const COMPANY_ID = "11111111-1111-1111-1111-111111111111";

const DEFAULT_CHECKLIST = [
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

function buildSeed(): DemoDb {
  return {
    company: {
      id: COMPANY_ID,
      name: "Summit Signs & Graphics",
      logo_url: null,
      settings: { require_full_checklist: true, capture_ip: false },
    },
    // Employees are real accounts (see lib/data/accounts.ts), not seeded here.
    profiles: [],
    customers: [],
    projects: [],
    versions: [],
    reviewLinks: [],
    checklistItems: DEFAULT_CHECKLIST.map((label, i) => ({
      id: `check-${i}`,
      company_id: COMPANY_ID,
      label,
      sort_order: i,
      is_active: true,
    })),
    checklistResponses: [],
    approvals: [],
    changeRequests: [],
    comments: [],
    commentReads: [],
    attachments: [],
    activity: [],
    notifications: [],
    clickupConnection: null,
    clickupTaskLinks: [],
  };
}

const globalStore = globalThis as unknown as { __proofflowDemoDbV4?: DemoDb };

export function demoDb(): DemoDb {
  if (!globalStore.__proofflowDemoDbV4) {
    globalStore.__proofflowDemoDbV4 = buildSeed();
  }
  return globalStore.__proofflowDemoDbV4;
}

export function demoId(): string {
  return randomUUID();
}
