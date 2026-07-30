"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  FileWarning,
  Maximize,
  Minimize,
  Scan,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PdfCanvas } from "@/components/viewer/pdf-canvas";
import { fileExtension, proofKind, type ProofVersion } from "@/lib/types";

interface ProofViewerProps {
  version: ProofVersion;
  proofUrl: string;
  versionCount: number;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  isLatest: boolean;
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className="size-8"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ProofViewer({
  version,
  proofUrl,
  versionCount,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  isLatest,
}: ProofViewerProps) {
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [contentSize, setContentSize] = useState<{ w: number; h: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const kind = proofKind(version.file_type, version.file_name);
  const canZoom = kind !== "file";

  // Set once the viewer has zoomed/panned by hand, so automatic refits stop
  // fighting the customer's chosen view.
  const userAdjusted = useRef(false);

  /**
   * Record the proof's natural size. Used as a ref callback as well as an
   * onLoad handler: a cached image is already complete before React attaches,
   * so its load event never fires and onLoad alone would leave us unmeasured
   * (and therefore never fitted).
   */
  const measureImage = useCallback((img: HTMLImageElement | null) => {
    if (!img || !img.complete || !img.naturalWidth) return;
    setContentSize((prev) =>
      prev && prev.w === img.naturalWidth && prev.h === img.naturalHeight
        ? prev
        : { w: img.naturalWidth, h: img.naturalHeight }
    );
  }, []);

  const fitToScreen = useCallback(
    (animationTime = 200) => {
      const container = containerRef.current;
      if (!container || !contentSize) return;
      const { clientWidth, clientHeight } = container;
      // The element can measure ~0 before layout settles; fitting against that
      // yields a microscopic scale that clamps to minScale. Wait for a real box.
      if (clientWidth < 80 || clientHeight < 80) return;
      const padding = 32;
      const scale = Math.min(
        (clientWidth - padding) / contentSize.w,
        (clientHeight - padding) / contentSize.h,
        1
      );
      transformRef.current?.centerView(scale, animationTime);
    },
    [contentSize]
  );

  const actualSize = useCallback(() => {
    userAdjusted.current = true;
    transformRef.current?.centerView(1, 200);
  }, []);

  // Fit when the proof is measured or the version changes, and again whenever
  // the viewer is resized into a usable box (first layout, window resize,
  // entering fullscreen) — until the viewer is touched by hand.
  useEffect(() => {
    userAdjusted.current = false;
    const container = containerRef.current;
    if (!container || !contentSize) return;
    fitToScreen(0);
    const observer = new ResizeObserver(() => {
      if (!userAdjusted.current) fitToScreen(0);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [contentSize, version.id, fitToScreen]);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current?.closest("[data-viewer-root]");
    if (!document.fullscreenElement && el) {
      el.requestFullscreen().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  return (
    <section
      data-viewer-root
      className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
      aria-label="Proof viewer"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1">
          <ToolbarButton label="Previous version" onClick={onPrev} disabled={!hasPrev}>
            <ChevronLeft className="size-4" />
          </ToolbarButton>
          <div className="flex items-center gap-2 px-1 text-sm font-medium">
            <span>
              Version {version.version_number}
              <span className="text-muted-foreground"> / {versionCount}</span>
            </span>
            {isLatest ? (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                Current
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="hidden border-amber-400 text-amber-600 sm:inline-flex dark:text-amber-400"
              >
                Older version
              </Badge>
            )}
          </div>
          <ToolbarButton label="Next version" onClick={onNext} disabled={!hasNext}>
            <ChevronRight className="size-4" />
          </ToolbarButton>
        </div>

        <div className="flex items-center gap-1">
          <ToolbarButton
            label="Zoom out"
            disabled={!canZoom}
            onClick={() => {
              userAdjusted.current = true;
              transformRef.current?.zoomOut(0.3);
            }}
          >
            <ZoomOut className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Zoom in"
            disabled={!canZoom}
            onClick={() => {
              userAdjusted.current = true;
              transformRef.current?.zoomIn(0.3);
            }}
          >
            <ZoomIn className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="Fit to screen" disabled={!canZoom} onClick={() => fitToScreen()}>
            <Scan className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="Actual size (100%)" disabled={!canZoom} onClick={actualSize}>
            <Expand className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            disabled={!canZoom}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </ToolbarButton>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" asChild>
                <a href={proofUrl} download={version.file_name} aria-label="Download proof">
                  <Download className="size-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download proof</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        onWheelCapture={() => {
          userAdjusted.current = true;
        }}
        onPointerDownCapture={() => {
          userAdjusted.current = true;
        }}
        className="relative h-[52dvh] touch-none bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] [background-size:20px_20px] lg:h-[calc(100dvh-220px)] lg:min-h-[420px]"
      >
        {kind === "file" ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm">
              <FileWarning className="mx-auto mb-3 size-9 text-muted-foreground" />
              <p className="font-medium">
                Browsers can&apos;t display {fileExtension(version.file_name) || "this"} files
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The proof uploaded fine and is saved in full. Download it to open in your
                design software — or re-upload a PDF/JPG version for on-screen review.
              </p>
              <Button className="mt-4" asChild>
                <a href={proofUrl} download={version.file_name}>
                  <Download className="size-4" /> Download proof
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <TransformWrapper
            ref={transformRef}
            minScale={0.05}
            maxScale={8}
            limitToBounds={false}
            centerOnInit
            // smooth mode multiplies step by the wheel deltaY, so keep it tiny
            wheel={{ step: 0.006 }}
            pinch={{ step: 3 }}
            zoomAnimation={{ animationTime: 180, animationType: "easeOut" }}
            doubleClick={{ mode: "toggle", animationTime: 200 }}
          >
            <TransformComponent
              wrapperClass="!h-full !w-full"
              contentStyle={{ cursor: "grab" }}
            >
              {kind === "pdf" ? (
                <PdfCanvas url={proofUrl} onSize={(w, h) => setContentSize({ w, h })} />
              ) : (
                // Proof files come from private storage via signed URLs; next/image
                // optimization would re-proxy and cache them, so use a plain img.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  // Remount per version so the ref callback re-measures, even
                  // when the next proof comes straight from cache.
                  key={version.id}
                  ref={measureImage}
                  src={proofUrl}
                  alt={`Proof version ${version.version_number}: ${version.file_name}`}
                  draggable={false}
                  onLoad={(e) => measureImage(e.currentTarget)}
                  className="max-w-none select-none shadow-lg"
                />
              )}
            </TransformComponent>
          </TransformWrapper>
        )}
      </div>

      {/* Version meta */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <span className="truncate font-medium text-foreground">{version.file_name}</span>
        <span>
          Uploaded {format(new Date(version.created_at), "EEE, d MMM yyyy 'at' h:mm a")}
        </span>
      </div>
      {version.revision_notes && (
        <div className="border-t bg-muted/50 px-4 py-2.5 text-sm">
          <span className="font-medium">Revision notes: </span>
          <span className="text-muted-foreground">{version.revision_notes}</span>
        </div>
      )}
    </section>
  );
}
