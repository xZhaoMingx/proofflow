import { NextResponse } from "next/server";
import { ReviewLinkError } from "@/lib/data/review";

/** Map review-link failures to appropriate HTTP responses. */
export function reviewErrorResponse(err: unknown): NextResponse {
  if (err instanceof ReviewLinkError) {
    const status = err.reason === "not_found" ? 404 : 410;
    return NextResponse.json({ error: `Review link ${err.reason}.` }, { status });
  }
  console.error("[api/review] unexpected error:", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
