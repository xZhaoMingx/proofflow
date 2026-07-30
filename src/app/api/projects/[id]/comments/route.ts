import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { getProjectComments } from "@/lib/data/projects";

/** Lightweight poll for the employee dashboard thread (customer + internal). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { id } = await params;
  const comments = await getProjectComments(profile, id);
  return NextResponse.json({ ok: true, comments });
}
