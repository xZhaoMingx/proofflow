"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

interface PdfCanvasProps {
  url: string;
  onSize: (width: number, height: number) => void;
}

/** Renders every page of a PDF proof into stacked canvases via pdf.js. */
export function PdfCanvas({ url, onSize }: PdfCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setState("loading");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled || !hostRef.current) return;

        hostRef.current.replaceChildren();
        // Render at 2x for crisp zooming.
        const RENDER_SCALE = 2;
        let maxWidth = 0;
        let totalHeight = 0;

        for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
          const page = await doc.getPage(pageNo);
          if (cancelled || !hostRef.current) return;
          const viewport = page.getViewport({ scale: RENDER_SCALE });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          // Display at CSS size = PDF points, so "actual size" is meaningful.
          canvas.style.width = `${viewport.width / RENDER_SCALE}px`;
          canvas.style.height = `${viewport.height / RENDER_SCALE}px`;
          canvas.style.display = "block";
          canvas.className = "shadow-lg mb-4 last:mb-0 bg-white";
          hostRef.current.appendChild(canvas);
          await page.render({
            canvas,
            canvasContext: canvas.getContext("2d")!,
            viewport,
          }).promise;
          maxWidth = Math.max(maxWidth, viewport.width / RENDER_SCALE);
          totalHeight += viewport.height / RENDER_SCALE + (pageNo > 1 ? 16 : 0);
        }

        if (!cancelled) {
          onSize(maxWidth, totalHeight);
          setState("ready");
        }
      } catch (err) {
        console.error("[pdf] render failed:", err);
        if (!cancelled) setState("error");
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <div className="relative">
      {state === "loading" && (
        <div className="flex h-64 w-96 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" /> Rendering PDF…
        </div>
      )}
      {state === "error" && (
        <div className="flex h-64 w-96 items-center justify-center rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          This PDF couldn&apos;t be displayed. Use the Download button to view it instead.
        </div>
      )}
      <div ref={hostRef} className={state === "ready" ? "" : "hidden"} />
    </div>
  );
}
