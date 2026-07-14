"use client";

import { useRef, useState } from "react";
import { format } from "date-fns";
import { FileUp, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { uploadVersionAction } from "@/app/(dashboard)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProofVersion } from "@/lib/types";

export function VersionUploadCard({
  projectId,
  versions,
}: {
  projectId: string;
  versions: ProofVersion[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const latest = versions[0]?.version_number ?? 0;

  async function submit() {
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("file", file);
    form.set("revisionNotes", notes);
    const result = await uploadVersionAction(form);
    setBusy(false);
    if (result.ok) {
      toast.success(`Version ${latest + 1} uploaded — the customer has been notified.`);
      setFile(null);
      setNotes("");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <UploadCloud className="size-4" /> Proof versions
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-xl border border-dashed p-4">
          <input
            ref={inputRef}
            type="file"
            hidden
            accept="image/png,image/jpeg,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              <FileUp className="size-4" /> {file ? "Change file" : "Choose proof file"}
            </Button>
            <span className="truncate text-sm text-muted-foreground">
              {file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)` : "PNG, JPG, or PDF up to 25 MB"}
            </span>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="revision-notes" className="text-xs">
              Revision notes (shown to the customer)
            </Label>
            <Textarea
              id="revision-notes"
              rows={2}
              placeholder={latest === 0 ? "Initial proof." : "What changed in this version?"}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button onClick={submit} disabled={!file || busy} className="self-start">
            {busy && <Loader2 className="size-4 animate-spin" />} Upload version {latest + 1}
          </Button>
        </div>

        {versions.length > 0 && (
          <ul className="flex flex-col gap-2">
            {versions.map((version) => (
              <li
                key={version.id}
                className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    Version {version.version_number}
                    {version.version_number === latest && (
                      <Badge variant="secondary">Current</Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {version.file_name} ·{" "}
                    {format(new Date(version.created_at), "d MMM yyyy, h:mm a")}
                  </p>
                  {version.revision_notes && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      “{version.revision_notes}”
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
