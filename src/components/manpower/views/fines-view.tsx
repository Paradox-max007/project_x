"use client";

/**
 * FinesView — Task 4-b
 * Issue fines (currency from system settings), list with amounts, rating
 * penalty chips, page totals and the 5-minute delete/undo window.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  BadgeCheck,
  Loader2,
  Plus,
  Receipt,
  Search,
  Trash2,
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
import type { FineRecord } from "@/types/manpower";
import { EmployeeAvatar } from "@/components/manpower/shared/employee-avatar";
import { ConfirmButton } from "@/components/manpower/shared/confirm-dialog";
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
  formatMoney,
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
// Issue fine dialog
// ---------------------------------------------------------------------------

function IssueFineDialog({
  open,
  onOpenChange,
  currency,
  penalty,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  penalty: number;
  onCreated: () => void;
}) {
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEmployee(null);
      setAmount("");
      setReason("");
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    if (!employee) {
      toast.error("Select an employee");
      return;
    }
    const value = Number(amount);
    if (!amount.trim() || !Number.isFinite(value) || value < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/fines", {
        employeeId: employee.id,
        reason: reason.trim(),
        amount: value,
      });
      toast.success(
        `Fine recorded — ${employee.fullName}'s rating drops by ${penalty} (removable for 5 minutes)`
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
          <DialogTitle>Issue a fine</DialogTitle>
          <DialogDescription>
            The employee&apos;s rating is reduced by {penalty} (floor 0). The fine can be undone for
            5 minutes after issuing.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Employee</Label>
            <EmployeePicker value={employee} onChange={setEmployee} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="fine-amount">Amount</Label>
            <div className="relative">
              <Input
                id="fine-amount"
                type="number"
                min={0}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="pr-14"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                {currency}
              </span>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="fine-reason">Reason *</Label>
            <Textarea
              id="fine-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Damaged equipment"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Issue fine
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function FinesView() {
  const now = useNow(30000);
  const settings = useSystemSettings();
  const currency = settings?.currency ?? "SAR";
  const penalty = settings?.fineRatingPenalty ?? 1;

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paged<FineRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [issueOpen, setIssueOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedQuery.trim()) params.set("query", debouncedQuery.trim());
      const res = await apiGet<Paged<FineRecord>>(`/api/fines?${params.toString()}`);
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

  const records = data?.data ?? [];
  const pageTotal = useMemo(
    () => records.reduce((sum, f) => sum + (Number(f.amount) || 0), 0),
    [records]
  );

  const deleteAction = (r: FineRecord) => {
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
        title="Delete this fine?"
        description={
          <>
            The fine of{" "}
            <span className="font-semibold">{formatMoney(r.amount, r.currency || currency)}</span>{" "}
            for <span className="font-semibold">{r.employeeName}</span> is removed and the rating
            penalty is restored. Only the creator can undo within 5 minutes.
          </>
        }
        confirmLabel="Delete fine"
        icon={<Trash2 className="size-3.5" />}
        onConfirm={async () => {
          try {
            await apiDelete(`/api/fines/${r.id}`);
            toast.success("Fine deleted — rating restored");
            await load();
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-4 p-4 sm:space-y-6 sm:p-6"
    >
      <PageHeader
        icon={Receipt}
        title="Fines"
        description={`Financial penalties — each reduces the employee rating by ${penalty}.`}
        actions={
          <Button onClick={() => setIssueOpen(true)}>
            <Plus className="size-4" />
            Issue Fine
          </Button>
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
            {data && data.total > 0 && (
              <p className="ml-auto text-sm text-muted-foreground">
                {records.length} fine{records.length === 1 ? "" : "s"} on this page ·{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatMoney(pageTotal, currency)}
                </span>
              </p>
            )}
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
          icon={BadgeCheck}
          title="No fines issued"
          description={
            debouncedQuery.trim()
              ? "No fines match your search."
              : "No financial penalties have been recorded."
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
                  <TableHead className="text-right">Amount</TableHead>
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
                    <TableCell>
                      <span className="block max-w-[320px] truncate text-sm" title={r.reason}>
                        {r.reason}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-bold tabular-nums">
                        {formatMoney(r.amount, r.currency || currency)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                        −{(r.ratingPenalty ?? penalty).toFixed(1)} rating
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{r.createdByName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground" title={fmtDate(r.createdAt)}>
                        {relTime(r.createdAt)}
                      </p>
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
                  <span className="shrink-0 text-base font-bold tabular-nums">
                    {formatMoney(r.amount, r.currency || currency)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{r.reason}</p>
                <div className="flex items-center justify-between gap-2 border-t pt-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                      −{(r.ratingPenalty ?? penalty).toFixed(1)} rating
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {r.createdByName ?? "—"} · {relTime(r.createdAt)}
                    </p>
                  </div>
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

      <IssueFineDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        currency={currency}
        penalty={penalty}
        onCreated={() => void load()}
      />
    </motion.div>
  );
}

export default FinesView;
