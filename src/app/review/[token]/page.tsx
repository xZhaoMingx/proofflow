import type { Metadata } from "next";
import { FileQuestion } from "lucide-react";
import { getReviewContext, ReviewLinkError } from "@/lib/data/review";
import { getProofUrl } from "@/lib/storage";
import { ReviewShell } from "@/components/review/review-shell";

export const metadata: Metadata = {
  title: "Proof Review",
};

export const dynamic = "force-dynamic";

const LINK_ERROR_COPY: Record<string, { title: string; body: string }> = {
  not_found: {
    title: "This review link doesn't exist",
    body: "Double-check the link from your email, or ask your designer to send a fresh one.",
  },
  expired: {
    title: "This review link has expired",
    body: "For security, review links only work for a limited time. Ask your designer to send a fresh one.",
  },
  revoked: {
    title: "This review link is no longer active",
    body: "A newer link may have been issued. Check your latest email or contact your designer.",
  },
};

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let context;
  try {
    context = await getReviewContext(token);
  } catch (err) {
    const reason = err instanceof ReviewLinkError ? err.reason : "not_found";
    const copy = LINK_ERROR_COPY[reason];
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border bg-card p-10 text-center shadow-sm">
          <FileQuestion className="mx-auto mb-4 size-12 text-muted-foreground" />
          <h1 className="text-xl font-semibold">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
        </div>
      </main>
    );
  }

  // Sign all proof URLs server-side; the browser never sees storage paths.
  const proofUrls: Record<string, string> = {};
  await Promise.all(
    context.versions.map(async (version) => {
      proofUrls[version.id] = await getProofUrl(version);
    })
  );

  return <ReviewShell token={token} context={context} proofUrls={proofUrls} />;
}
