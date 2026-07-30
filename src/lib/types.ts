// Domain types shared across the app. These mirror supabase/migrations/0001_init.sql.

export type ProjectStatus =
  | "draft"
  | "awaiting_review"
  | "revision_requested"
  | "approved"
  | "completed"
  | "archived";

export type ProfileRole = "admin" | "employee";

export type AuthorType = "employee" | "customer" | "system";

export type ActivityAction =
  | "project_created"
  | "proof_uploaded"
  | "proof_viewed"
  | "comment_added"
  | "revision_requested"
  | "version_uploaded"
  | "proof_approved"
  | "employee_reply"
  | "status_changed"
  | "review_link_created"
  | "clickup_synced";

export type NotificationType =
  | "proof_viewed"
  | "proof_approved"
  | "revision_requested"
  | "comment_added"
  | "version_uploaded"
  | "proof_ready"
  | "designer_replied"
  | "revision_uploaded"
  | "project_completed";

export interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  settings: {
    require_full_checklist?: boolean;
    capture_ip?: boolean;
  };
}

export interface Profile {
  id: string;
  company_id: string;
  role: ProfileRole;
  full_name: string;
  email: string;
  avatar_url: string | null;
}

export interface Customer {
  id: string;
  company_id: string;
  name: string;
  email: string;
  company_name: string | null;
}

export interface Project {
  id: string;
  company_id: string;
  name: string;
  customer_id: string | null;
  designer_id: string | null;
  // Free-text name of the person handling this project, shown to the customer
  // as their contact. Falls back to the designer's name when blank.
  contact_name: string | null;
  due_date: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface ProofVersion {
  id: string;
  project_id: string;
  version_number: number;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  uploaded_by: string | null;
  revision_notes: string | null;
  created_at: string;
}

export interface ReviewLink {
  id: string;
  project_id: string;
  customer_id: string | null;
  token: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  company_id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

export interface ChecklistResponse {
  id: string;
  project_id: string;
  proof_version_id: string;
  checklist_item_id: string;
  checked: boolean;
  responded_by: string | null;
}

export interface Approval {
  id: string;
  project_id: string;
  proof_version_id: string;
  customer_name: string;
  customer_email: string;
  comment: string | null;
  checklist_snapshot: { label: string; checked: boolean }[];
  browser: string | null;
  device: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface ChangeRequest {
  id: string;
  project_id: string;
  proof_version_id: string;
  comment: string;
  requested_by_name: string;
  requested_by_email: string;
  created_at: string;
}

export interface Comment {
  id: string;
  project_id: string;
  author_type: AuthorType;
  author_id: string | null;
  author_name: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  attachments?: Attachment[];
  read_by?: string[];
}

export interface Attachment {
  id: string;
  company_id: string;
  parent_type: "comment" | "change_request";
  parent_id: string;
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export interface ActivityEvent {
  id: string;
  project_id: string;
  actor_type: AuthorType;
  actor_name: string;
  action: ActivityAction;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AppNotification {
  id: string;
  company_id: string;
  recipient_id: string | null;
  customer_id: string | null;
  type: NotificationType;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface ClickUpConnection {
  id: string;
  company_id: string;
  workspace_id: string;
  space_id: string | null;
  folder_id: string | null;
  list_id: string | null;
  webhook_id: string | null;
  sync_settings: {
    sync_status?: boolean;
    sync_due_date?: boolean;
    sync_comments?: boolean;
    sync_attachments?: boolean;
  };
}

export interface ClickUpTaskLink {
  id: string;
  project_id: string;
  task_id: string;
  task_url: string | null;
  clickup_status: string | null;
  clickup_assignee: string | null;
  last_synced_at: string | null;
  sync_error: string | null;
}

/** Everything the customer review page needs, fetched server-side after token validation. */
export interface ReviewContext {
  company: Company;
  project: Project;
  customer: Customer | null;
  designer: Pick<Profile, "id" | "full_name"> | null;
  versions: ProofVersion[];
  checklistItems: ChecklistItem[];
  checklistResponses: ChecklistResponse[];
  comments: Comment[]; // customer-visible only (is_internal = false)
  activity: ActivityEvent[];
  approval: Approval | null;
  changeRequests: ChangeRequest[];
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  awaiting_review: "Awaiting Review",
  revision_requested: "Revision Requested",
  approved: "Approved",
  completed: "Completed",
  archived: "Archived",
};

/** Images a browser renders directly, so they open in the zoomable viewer. */
export const PREVIEWABLE_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "image/bmp",
];

/**
 * Formats print shops send that browsers can't render. They upload, version,
 * and download fine; the viewer offers a download instead of a preview.
 */
export const NON_PREVIEWABLE_PROOF_TYPES = [
  "image/tiff",
  "image/heic",
  "image/heif",
  "application/postscript", // .ai / .eps
  "image/vnd.adobe.photoshop", // .psd
];

export const PROOF_MIME_TYPES = [
  ...PREVIEWABLE_IMAGE_TYPES,
  "application/pdf",
  ...NON_PREVIEWABLE_PROOF_TYPES,
];

const PREVIEWABLE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".svg",
  ".bmp",
];

/** Some browsers report an empty MIME type (.heic, .ai, .psd), so we also match extensions. */
export const PROOF_EXTENSIONS = [
  ...PREVIEWABLE_EXTENSIONS,
  ".pdf",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ".ai",
  ".eps",
  ".psd",
];

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

/** How the viewer should present a proof. */
export function proofKind(fileType: string, fileName: string): "image" | "pdf" | "file" {
  const ext = fileExtension(fileName);
  if (fileType === "application/pdf" || ext === ".pdf") return "pdf";
  if (PREVIEWABLE_IMAGE_TYPES.includes(fileType)) return "image";
  if (PREVIEWABLE_EXTENSIONS.includes(ext)) return "image";
  return "file";
}

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_ATTACHMENTS = 10;

/** How long a customer review link stays valid. */
export const REVIEW_LINK_DAYS = 30;
