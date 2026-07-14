import { NextResponse } from "next/server";
import { markCommentsRead } from "@/lib/data/review";
import { reviewErrorResponse } from "../../_lib";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    await markCommentsRead(token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return reviewErrorResponse(err);
  }
}
