import { NextResponse } from "next/server";
import { z } from "zod";
import { approveSchema } from "@/lib/validation";
import { approveProof, getReviewContext } from "@/lib/data/review";
import { clientIp, parseBrowser, parseDevice } from "@/lib/device";
import { reviewErrorResponse } from "../_lib";

const payloadSchema = approveSchema.extend({ versionId: z.string().min(1) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const parsed = payloadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid payload." },
        { status: 400 }
      );
    }

    const context = await getReviewContext(token);

    // Server-side guards mirror the UI rules.
    const latest = context.versions[context.versions.length - 1];
    if (parsed.data.versionId !== latest?.id) {
      return NextResponse.json(
        { error: "Only the latest version can be approved." },
        { status: 409 }
      );
    }
    if (context.project.status === "approved" || context.project.status === "completed") {
      return NextResponse.json(
        { error: "This proof has already been approved." },
        { status: 409 }
      );
    }
    if (context.company.settings.require_full_checklist !== false) {
      const checkedIds = new Set(
        context.checklistResponses
          .filter((r) => r.proof_version_id === latest.id && r.checked)
          .map((r) => r.checklist_item_id)
      );
      if (!context.checklistItems.every((item) => checkedIds.has(item.id))) {
        return NextResponse.json(
          { error: "Please complete the review checklist before approving." },
          { status: 409 }
        );
      }
    }

    const userAgent = request.headers.get("user-agent") ?? "";
    const approval = await approveProof(token, {
      versionId: parsed.data.versionId,
      comment: parsed.data.comment,
      checklist: parsed.data.checklist,
      browser: parseBrowser(userAgent),
      device: parseDevice(userAgent),
      ipAddress: clientIp(request.headers),
    });

    return NextResponse.json({ ok: true, approvalId: approval.id });
  } catch (err) {
    return reviewErrorResponse(err);
  }
}
