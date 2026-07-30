import { z } from "zod";
import {
  fileExtension,
  MAX_ATTACHMENTS,
  MAX_FILE_SIZE,
  PROOF_EXTENSIONS,
  PROOF_MIME_TYPES,
} from "@/lib/types";

export const approveSchema = z.object({
  confirmed: z.literal(true, {
    message: "You must confirm you have reviewed this proof.",
  }),
  comment: z.string().trim().max(5000).optional().default(""),
  checklist: z
    .array(z.object({ label: z.string().max(200), checked: z.boolean() }))
    .max(100)
    .default([]),
});

export const requestChangesSchema = z.object({
  comment: z.string().trim().min(1, "Please describe the changes you need.").max(10000),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty.").max(10000),
});

export const checklistResponseSchema = z.object({
  versionId: z.string().uuid().or(z.string().min(1)),
  itemId: z.string().min(1),
  checked: z.boolean(),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required.").max(200),
  assignedTo: z.string().trim().max(200).optional().default(""),
  customerName: z.string().trim().min(1, "Customer name is required.").max(200),
  customerEmail: z.string().trim().email("Enter a valid customer email.").max(320),
  customerCompany: z.string().trim().max(200).optional().default(""),
  dueDate: z.string().optional().default(""),
});

export const uploadVersionSchema = z.object({
  revisionNotes: z.string().trim().max(2000).optional().default(""),
});

export const checklistItemSchema = z.object({
  label: z.string().trim().min(1, "Label is required.").max(200),
});

export const clickupSettingsSchema = z.object({
  // Optional: falls back to CLICKUP_API_TOKEN in .env.local when left blank,
  // so changing the submissions list never requires re-typing the token.
  accessToken: z.string().trim().max(500).optional().default(""),
  workspaceId: z.string().trim().max(50).optional().default(""),
  spaceId: z.string().trim().max(50).optional().default(""),
  folderId: z.string().trim().max(50).optional().default(""),
  listId: z.string().trim().max(50).optional().default(""),
  syncStatus: z.boolean().default(true),
  syncDueDate: z.boolean().default(true),
  syncComments: z.boolean().default(false),
  syncAttachments: z.boolean().default(false),
});

const ATTACHMENT_MIME_TYPES = [
  ...PROOF_MIME_TYPES,
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export function validateProofFile(file: File): string | null {
  // Match on either signal: browsers report an empty MIME type for some
  // formats (.heic, .ai, .psd) and a wrong one for others.
  const typeOk = PROOF_MIME_TYPES.includes(file.type);
  const extOk = PROOF_EXTENSIONS.includes(fileExtension(file.name));
  if (!typeOk && !extOk) {
    return `"${file.name}" isn't a supported proof. Use an image (PNG, JPG, GIF, WEBP, AVIF, SVG, BMP, TIFF, HEIC), a PDF, or AI/EPS/PSD.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(0)} MB — proofs must be ${MAX_FILE_SIZE / 1024 / 1024} MB or smaller.`;
  }
  return null;
}

export function validateAttachments(files: File[]): string | null {
  if (files.length > MAX_ATTACHMENTS) {
    return `You can attach up to ${MAX_ATTACHMENTS} files.`;
  }
  for (const file of files) {
    if (!ATTACHMENT_MIME_TYPES.includes(file.type)) {
      return `"${file.name}" is not a supported file type.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `"${file.name}" exceeds the 25 MB limit.`;
    }
  }
  return null;
}
