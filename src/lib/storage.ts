import "server-only";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { isDemoMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Attachment, ProofVersion } from "@/lib/types";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/** Resolve a browser-loadable URL for a proof file. */
export async function getProofUrl(version: ProofVersion): Promise<string> {
  if (isDemoMode()) return version.file_path;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from("proofs")
    .createSignedUrl(version.file_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw new Error(`Could not sign proof URL: ${error?.message}`);
  return data.signedUrl;
}

export async function getAttachmentUrl(attachment: Attachment): Promise<string> {
  if (isDemoMode()) return attachment.file_path;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(attachment.file_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) throw new Error(`Could not sign attachment URL: ${error?.message}`);
  return data.signedUrl;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

/**
 * Store an uploaded file and return its storage path.
 * Supabase mode: private bucket keyed company/project/... (signed URLs only).
 * Demo mode: written under public/demo-uploads (dev-only convenience).
 */
export async function storeFile(
  bucket: "proofs" | "attachments",
  keyParts: string[],
  file: File
): Promise<string> {
  const key = [...keyParts, safeName(file.name)].join("/");

  if (isDemoMode()) {
    const dir = path.join(process.cwd(), "public", "demo-uploads", bucket, ...keyParts);
    await mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, safeName(file.name)), buffer);
    return `/demo-uploads/${bucket}/${key}`;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(bucket).upload(key, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return key;
}
