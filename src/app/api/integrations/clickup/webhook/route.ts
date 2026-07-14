import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { applyWebhookEvent } from "@/services/clickup/sync";

/**
 * Inbound ClickUp webhook: task status/assignee changes update the cached
 * task link. Signature is verified when CLICKUP_WEBHOOK_SECRET is set
 * (ClickUp signs payloads with the secret issued at webhook creation).
 */
export async function POST(request: Request) {
  const raw = await request.text();

  const secret = process.env.CLICKUP_WEBHOOK_SECRET;
  if (secret) {
    const signature = request.headers.get("x-signature") ?? "";
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const valid =
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }
  }

  try {
    const payload = JSON.parse(raw) as { task_id?: string; event?: string };
    if (payload.task_id) {
      await applyWebhookEvent(payload.task_id);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
}
