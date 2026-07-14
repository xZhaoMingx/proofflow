import { NextResponse } from "next/server";
import { checklistResponseSchema } from "@/lib/validation";
import { setChecklistResponse } from "@/lib/data/review";
import { reviewErrorResponse } from "../_lib";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const parsed = checklistResponseSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }
    await setChecklistResponse(token, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return reviewErrorResponse(err);
  }
}
