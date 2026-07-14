import { NextResponse } from "next/server";
import { z } from "zod";
import { recordProofViewed } from "@/lib/data/review";
import { reviewErrorResponse } from "../_lib";

const schema = z.object({ versionNumber: z.number().int().positive() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }
    await recordProofViewed(token, parsed.data.versionNumber);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return reviewErrorResponse(err);
  }
}
