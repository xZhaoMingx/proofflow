import { NextResponse } from "next/server";
import { requestChangesSchema, validateAttachments } from "@/lib/validation";
import { getReviewContext, requestChanges } from "@/lib/data/review";
import { reviewErrorResponse } from "../_lib";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const form = await request.formData();

    const parsed = requestChangesSchema.safeParse({ comment: form.get("comment") });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
        { status: 400 }
      );
    }
    const versionId = form.get("versionId");
    if (typeof versionId !== "string" || !versionId) {
      return NextResponse.json({ error: "Missing version." }, { status: 400 });
    }

    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const fileError = validateAttachments(files);
    if (fileError) {
      return NextResponse.json({ error: fileError }, { status: 400 });
    }

    const context = await getReviewContext(token);
    if (context.project.status === "approved" || context.project.status === "completed") {
      return NextResponse.json(
        { error: "This proof has already been approved — contact your designer directly." },
        { status: 409 }
      );
    }

    await requestChanges(token, { versionId, comment: parsed.data.comment, files });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return reviewErrorResponse(err);
  }
}
