"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { createProjectAction } from "@/app/(dashboard)/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const result = await createProjectAction({
      name: form.get("name"),
      jobNumber: form.get("jobNumber") ?? "",
      customerName: form.get("customerName"),
      customerEmail: form.get("customerEmail"),
      customerCompany: form.get("customerCompany") ?? "",
      dueDate: form.get("dueDate") ?? "",
    });
    setBusy(false);
    if (result.ok && result.data) {
      setOpen(false);
      toast.success("Project created.");
      router.push(`/projects/${result.data.projectId}`);
    } else if (!result.ok) {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Set up the job and customer. You&apos;ll upload the first proof next.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="name">Project name</Label>
            <Input id="name" name="name" required placeholder="Storefront window decals" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="jobNumber">Job number</Label>
              <Input id="jobNumber" name="jobNumber" placeholder="JOB-1043" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" name="dueDate" type="date" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="customerName">Customer name</Label>
            <Input id="customerName" name="customerName" required placeholder="Sally Johnson" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="customerEmail">Customer email</Label>
              <Input
                id="customerEmail"
                name="customerEmail"
                type="email"
                required
                placeholder="sally@example.com"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="customerCompany">Customer company</Label>
              <Input id="customerCompany" name="customerCompany" placeholder="Corner Bakery" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
