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
import type { ProofVersion } from "@/lib/types";

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
  const isPdf = version.file_type === "application/pdf";

  const fitScale = useCallback(() => {
    const container = containerRef.current;
    if (!container || !contentSize) return 1;
    const padding = 32;
    return Math.min(
      (container.clientWidth - padding) / contentSize.w,
      (container.clientHeight - padding) / contentSize.h,
      1
    );
  }, [contentSize]);

  const fitToScreen = useCallback(() => {
    transformRef.current?.centerView(fitScale(), 200);
  }, [fitScale]);

  const actualSize = useCallback(() => {
    transformRef.current?.centerView(1, 200);
  }, []);

  // Refit whenever the version changes or its content finishes measuring.
  useEffect(() => {
    if (contentSize) {
      const id = requestAnimationFrame(() => transformRef.current?.centerView(fitScale(), 0));
      return () => cancelAnimationFrame(id);
    }
  }, [contentSize, version.id, fitScale]);

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
          <ToolbarButton label="Zoom out" onClick={() => transformRef.current?.zoomOut(0.3)}>
            <ZoomOut className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="Zoom in" onClick={() => transformRef.current?.zoomIn(0.3)}>
            <ZoomIn className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="Fit to screen" onClick={fitToScreen}>
            <Scan className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="Actual size (100%)" onClick={actualSize}>
            <Expand className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
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
        className="relative h-[52dvh] touch-none bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] [background-size:20px_20px] lg:h-[calc(100dvh-220px)] lg:min-h-[420px]"
      >
        <TransformWrapper
          ref={transformRef}
          minScale={0.05}
          maxScale={8}
          limitToBounds={false}
          centerOnInit
          wheel={{ step: 0.15 }}
          doubleClick={{ mode: "toggle" }}
        >
          <TransformComponent
            wrapperClass="!h-full !w-full"
            contentStyle={{ cursor: "grab" }}
          >
            {isPdf ? (
              <PdfCanvas
                url={proofUrl}
                onSize={(w, h) => setContentSize({ w, h })}
              />
            ) : (
              // Proof files come from private storage via signed URLs; next/image
              // optimization would re-proxy and cache them, so use a plain img.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proofUrl}
                alt={`Proof version ${version.version_number}: ${version.file_name}`}
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setContentSize({ w: img.naturalWidth, h: img.naturalHeight });
                }}
                className="max-w-none select-none shadow-lg"
              />
            )}
          </TransformComponent>
        </TransformWrapper>
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
