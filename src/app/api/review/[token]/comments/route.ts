import { NextResponse } from "next/server";
import { commentSchema, validateAttachments } from "@/lib/validation";
import { addCustomerComment, getReviewContext, markCommentsRead } from "@/lib/data/review";
import { reviewErrorResponse } from "../_lib";

/** Lightweight poll for the customer thread so replies appear without refresh. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const context = await getReviewContext(token);
    // Opening the thread counts as reading the latest employee replies.
    await markCommentsRead(token);
    return NextResponse.json({ ok: true, comments: context.comments });
  } catch (err) {
    return reviewErrorResponse(err);
  }
}

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
