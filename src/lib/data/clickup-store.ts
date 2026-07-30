import "server-only";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import type { ClickUpConnection } from "@/lib/types";

/**
 * Demo-mode persistence for the ClickUp connection. The in-memory demo store
 * resets on every restart, which made ClickUp settings vanish and forced
 * re-editing .env.local. Persisting to a file under the user's home dir lets
 * the connection (token + chosen submissions list) survive restarts, so it's
 * configured once from the Settings page and then left alone.
 *
 * Not used in Supabase mode, where clickup_connections is the source of truth.
 */

export type StoredClickUpConnection = ClickUpConnection & { access_token: string };

const CONFIG_DIR = path.join(os.homedir(), ".proofflow");
const CONFIG_PATH = path.join(CONFIG_DIR, "clickup.json");

export function loadClickUpConnection(): StoredClickUpConnection | null {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoredClickUpConnection;
    if (parsed && typeof parsed.access_token === "string") return parsed;
    return null;
  } catch {
    // Missing or unreadable file just means "not configured yet".
    return null;
  }
}

export function saveClickUpConnection(connection: StoredClickUpConnection): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(connection, null, 2), "utf8");
  } catch (err) {
    console.error("[clickup] could not persist connection:", err);
  }
}
