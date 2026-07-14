/** Lightweight user-agent parsing for the approval audit record. */

export function parseBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return "Microsoft Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  return "Unknown browser";
}

export function parseDevice(ua: string): string {
  if (/ipad|tablet/i.test(ua)) return "Tablet";
  if (/mobi|iphone|android/i.test(ua)) return "Mobile";
  if (/windows|macintosh|linux|cros/i.test(ua)) return "Desktop";
  return "Unknown device";
}

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip");
}
