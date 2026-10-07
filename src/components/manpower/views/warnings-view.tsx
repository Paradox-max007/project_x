"use client";

/**
 * WarningsView — Task 4-b
 * Issue manual warnings, run the absence auto-check, and delete warnings
 * within the 5-minute undo window (rating is restored on delete).
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import type { WarningRecord } from "@/types/manpower";
import { EmployeeAvatar } from "@/components/manpower/shared/employee-avatar";
import { ConfirmButton, ConfirmDialog } from "@/components/manpower/shared/confirm-dialog";
import {
  DataPagination,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
} from "@/components/manpower/shared/page-kit";
import {
  EmployeePicker,
  StickyToolbar,
  fmtDate,
  relTime,
  useDebounced,
  useNow,
  useSystemSettings,
  withinUndoWindow,
  type EmployeeOption,
  type Paged,
} from "@/components/manpower/views/task-4b-shared";

const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Issue warning dialog
// ---------------------------------------------------------------------------

function IssueWarningDialog({
  open,
  onOpenChange,
  penalty,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  penalty: number;
  onCreated: () => void;
}) {
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [reason, setReason] = useState("");
  const [dateDraft, setDateDraft] = useState("");
  const [absentDates, setAbsentDates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEmployee(null);
      setReason("");
      setDateDraft("");
      setAbsentDates([]);
      setBusy(false);
    }
  }, [open]);

  const addDate = () => {
    if (!dateDraft || absentDates.includes(dateDraft)) return;
    setAbsentDates([...absentDates, dateDraft].sort());
    setDateDraft("");
  };

  const submit = async () => {
    if (!employee) {
      toast.error("Select an employee");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/warnings", {
        employeeId: employee.id,
        reason: reason.trim(),
        absentDates: absentDates.length > 0 ? absentDates : undefined,
      });
      toast.success(
        `Warning issued — ${employee.fullName}'s rating drops by ${penalty} (removable for 5 minutes)`
      );
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue a warning</DialogTitle>
          <DialogDescription>
            The employee&apos;s rating is reduced by {penalty} (floor 0). The warning can be undone
            for 5 minutes after issuing.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Employee</Label>
            <EmployeePicker value={employee} onChange={setEmployee} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="warn-reason">Reason *</Label>
            <Textarea
              id="warn-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Repeated unexplained absence"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Absent dates (optional)</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={dateDraft}
                onChange={(e) => setDateDraft(e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={addDate} disabled={!dateDraft}>
                Add
              </Button>
            </div>
            {absentDates.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {absentDates.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs"
                  >
                    {fmtDate(d)}
                    <button
                      type="button"
                      aria-label={`Remove ${fmtDate(d)}`}
                      className="text-muted-foreground transition-colors hover:text-rose-600"
                      onClick={() => setAbsentDates(absentDates.filter((x) => x !== d))}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Issue warning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function WarningsView() {
  const now = useNow(30000);
  const settings = useSystemSettings();
  const threshold = settings?.warningAbsenceThreshold ?? 3;
  const penalty = settings?.warningRatingPenalty ?? 0.5;

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paged<WarningRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [issueOpen, setIssueOpen] = useState(false);
  const [autoCheckOpen, setAutoCheckOpen] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedQuery.trim()) params.set("query", debouncedQuery.trim());
      const res = await apiGet<Paged<WarningRecord>>(`/api/warnings?${params.toString()}`);
      setData(res);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAutoCheck = async () => {
    setAutoBusy(true);
    try {
      const r = await apiPost<{ created: number; employees: string[] }>(
        "/api/warnings/auto-check"
      );
      const created = r?.created ?? 0;
      const codes = (r?.employees ?? []).join(", ");
      if (created > 0) {
        toast.success(
          `Created ${created} auto-warning${created === 1 ? "" : "s"}${codes ? `: ${codes}` : ""}`
        );
      } else {
        toast.info("No new warnings — no qualifying absence runs found.");
      }
      await load();
    } catch (e) {
      toast.error((e as Error).message);
      throw e;
    } finally {
      setAutoBusy(false);
    }
  };

  const records = data?.data ?? [];

  const deleteAction = (r: WarningRecord) => {
    if (!withinUndoWindow(r.createdAt, now)) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="ghost" size="sm" disabled className="text-muted-foreground/50">
                <Trash2 className="size-3.5" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Removable for 5 minutes after creation</TooltipContent>
        </Tooltip>
      );
    }
    return (
      <ConfirmButton
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
        title="Delete this warning?"
        description={
          <>
            The warning for <span className="font-semibold">{r.employeeName}</span> is removed and
            the rating penalty is restored. Only the creator can undo within 5 minutes.
          </>
        }
        confirmLabel="Delete warning"
        icon={<Trash2 className="size-3.5" />}
        onConfirm={async () => {
          try {
            await apiDelete(`/api/warnings/${r.id}`);
            toast.success("Warning deleted — rating restored");
            await load();
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    );
  };

  const reasonCell = (r: WarningRecord) => (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-1.5">
        {r.isAutoGenerated && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <Zap className="size-2.5" />
            Auto
          </span>
        )}
        <span className="max-w-[320px] truncate text-sm" title={r.reason}>
          {r.reason}
        </span>
      </p>
      {(r.absentDates?.length ?? 0) > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {r.absentDates.slice(0, 3).map((d) => (
            <span
              key={d}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
            >
              {fmtDate(d)}
            </span>
          ))}
          {r.absentDates.length > 3 && (
            <span
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
              title={r.absentDates.map((d) => fmtDate(d)).join(", ")}
            >
              +{r.absentDates.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-4 p-4 sm:space-y-6 sm:p-6"
    >
      <PageHeader
        icon={AlertTriangle}
        title="Warnings"
        description={`Disciplinary warnings — each reduces the employee rating by ${penalty}.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setAutoCheckOpen(true)}>
              <Sparkles className="size-4" />
              Run Auto-Check
            </Button>
            <Button onClick={() => setIssueOpen(true)}>
              <Plus className="size-4" />
              Issue Warning
            </Button>
          </>
        }
      />

      <StickyToolbar>
        <Card className="gap-3 p-3 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 sm:max-w-[280px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search employee or reason…"
                className="pl-8"
              />
            </div>
            <p className="ml-auto hidden text-xs text-muted-foreground sm:block">
              Auto-Check scans for {threshold}+ consecutive unexplained absences
            </p>
          </div>
        </Card>
      </StickyToolbar>

      {loading ? (
        <Card className="p-4 sm:p-6">
          <TableSkeleton rows={4} cols={5} />
        </Card>
      ) : error ? (
        <ErrorState message={error} retry={() => void load()} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No warnings issued"
          description={
            debouncedQuery.trim()
              ? "No warnings match your search."
              : "Employees are all in good standing. Run the auto-check to scan for absence patterns."
          }
          action={
            <Button variant="outline" size="sm" onClick={() => setAutoCheckOpen(true)}>
              <Sparkles className="size-4" />
              Run Auto-Check
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden gap-0 py-0 lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Penalty</TableHead>
                  <TableHead>Issued by</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <EmployeeAvatar name={r.employeeName} className="h-9 w-9" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{r.employeeCode}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{reasonCell(r)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                        −{(r.ratingPenalty ?? penalty).toFixed(1)} rating
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{r.createdByName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{relTime(r.createdAt)}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">{deleteAction(r)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile cards */}
          <div className="grid gap-3 lg:hidden">
            {records.map((r) => (
              <Card key={r.id} className="gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <EmployeeAvatar name={r.employeeName} className="h-9 w-9" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.employeeName}</p>
                      <p className="text-xs text-muted-foreground">{r.employeeCode}</p>
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                    −{(r.ratingPenalty ?? penalty).toFixed(1)} rating
                  </span>
                </div>
                {reasonCell(r)}
                <div className="flex items-center justify-between gap-2 border-t pt-2.5">
                  <p className="text-xs text-muted-foreground">
                    Issued by {r.createdByName ?? "—"} · {relTime(r.createdAt)}
                  </p>
                  {deleteAction(r)}
                </div>
              </Card>
            ))}
          </div>

          {data && data.total > 0 && (
            <DataPagination
              page={data.page || page}
              pageSize={data.pageSize || PAGE_SIZE}
              total={data.total}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      <IssueWarningDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        penalty={penalty}
        onCreated={() => void load()}
      />

      <ConfirmDialog
        open={autoCheckOpen}
        onOpenChange={(o) => {
          if (!o && !autoBusy) setAutoCheckOpen(false);
        }}
        title="Run absence auto-check"
        description={
          <>
            Scan all employees for <span className="font-semibold">{threshold}+ consecutive
            unexplained absences</span>{" "}
            (per settings)? Matching employees get an automatic warning with a −{penalty} rating
            penalty. Existing warnings for the same dates are skipped.
          </>
        }
        confirmLabel="Run scan"
        destructive={false}
        onConfirm={runAutoCheck}
      />
    </motion.div>
  );
}

export default WarningsView;
