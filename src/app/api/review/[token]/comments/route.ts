import { NextResponse } from "next/server";
import { commentSchema, validateAttachments } from "@/lib/validation";
import { addCustomerComment } from "@/lib/data/review";
import { reviewErrorResponse } from "../_lib";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const form = await request.formData();

    const parsed = commentSchema.safeParse({ body: form.get("body") });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
        { status: 400 }
      );
    }

    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const fileError = validateAttachments(files);
    if (fileError) {
      return NextResponse.json({ error: fileError }, { status: 400 });
    }

    const comment = await addCustomerComment(token, { body: parsed.data.body, files });
    return NextResponse.json({ ok: true, commentId: comment.id });
  } catch (err) {
    return reviewErrorResponse(err);
  }
}
