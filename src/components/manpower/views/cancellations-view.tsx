"use client";

/**
 * CancellationsView — Task 4-b
 * Cancellation (employee deletion) requests. Only the Super Admin can
 * approve/reject; non-super admins get a read-only view with a hint.
 * Approval soft-deletes the employee while preserving all history.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Check,
  Info,
  Loader2,
  Plus,
  Search,
  UserX,
  X,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAppStore } from "@/stores/app-store";
import type { CancellationRecord, CancellationStatus } from "@/types/manpower";
import { EmployeeAvatar } from "@/components/manpower/shared/employee-avatar";
import {
  CancellationStatusBadge,
  GenericBadge,
} from "@/components/manpower/shared/status-badges";
import { ConfirmDialog } from "@/components/manpower/shared/confirm-dialog";
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
  relTime,
  useDebounced,
  type EmployeeOption,
  type Paged,
} from "@/components/manpower/views/task-4b-shared";

const PAGE_SIZE = 10;

type StatusTab = "all" | CancellationStatus;

// ---------------------------------------------------------------------------
// New request dialog
// ---------------------------------------------------------------------------

function NewCancellationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEmployee(null);
      setReason("");
      setBusy(false);
    }
  }, [open]);

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
      await apiPost("/api/cancellation-requests", {
        employeeId: employee.id,
        reason: reason.trim(),
      });
      toast.success(
        `Cancellation requested for ${employee.fullName} — awaiting Super Admin approval`
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
          <DialogTitle>Request employee cancellation</DialogTitle>
          <DialogDescription>
            The employee is flagged for deletion and a Super Admin must approve it. All historical
            records are always preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Employee</Label>
            <EmployeePicker value={employee} onChange={setEmployee} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cancel-reason">Reason *</Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why should this employee be cancelled? (e.g. contract ended, resignation)"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function CancellationsView() {
  const user = useAppStore((s) => s.user);
  const isSuperAdmin = user?.role === "super_admin";

  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paged<CancellationRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<CancellationRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<CancellationRecord | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (statusTab !== "all") params.set("status", statusTab);
      if (debouncedQuery.trim()) params.set("query", debouncedQuery.trim());
      const res = await apiGet<Paged<CancellationRecord>>(
        `/api/cancellation-requests?${params.toString()}`
      );
      setData(res);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [statusTab, page, debouncedQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const afterAction = () => {
    void load();
    useAppStore.getState().bumpNotifVersion();
  };

  const doReject = async () => {
    if (!rejectTarget) return;
    setRejectBusy(true);
    try {
      await apiPost(`/api/cancellation-requests/${rejectTarget.id}/reject`, {
        note: rejectNote.trim() || null,
      });
      toast.success(`Rejected — ${rejectTarget.employeeName} stays active`);
      setRejectTarget(null);
      setRejectNote("");
      afterAction();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRejectBusy(false);
    }
  };

  const records = data?.data ?? [];

  const actionsFor = (r: CancellationRecord) => {
    if (r.status !== "pending" || !isSuperAdmin) return null;
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="outline"
          size="sm"
          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950"
          onClick={() => setApproveTarget(r)}
        >
          <Check className="size-3.5" />
          <span className="hidden xl:inline">Approve</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950"
          onClick={() => setRejectTarget(r)}
        >
          <X className="size-3.5" />
          <span className="hidden xl:inline">Reject</span>
        </Button>
      </div>
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
        icon={UserX}
        title="Cancellation Requests"
        description="Employee deletion requires Super Admin approval. History is always preserved."
        actions={
          <Button variant="outline" onClick={() => setNewOpen(true)}>
            <Plus className="size-4" />
            New Request
          </Button>
        }
      />

      <StickyToolbar>
        <Card className="gap-3 p-3 shadow-sm sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              value={statusTab}
              onValueChange={(v) => {
                setStatusTab(v as StatusTab);
                setPage(1);
              }}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative ml-auto min-w-[160px] flex-1 sm:max-w-[260px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search employee…"
                className="pl-8"
              />
            </div>
          </div>
        </Card>
      </StickyToolbar>

      {!isSuperAdmin && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            Only the Super Admin can review cancellation requests. You can submit requests and
            follow their status here.
          </p>
        </div>
      )}

      {loading ? (
        <Card className="p-4 sm:p-6">
          <TableSkeleton rows={4} cols={5} />
        </Card>
      ) : error ? (
        <ErrorState message={error} retry={() => void load()} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={UserX}
          title="No cancellation requests"
          description={
            debouncedQuery.trim()
              ? "No requests match your search."
              : "Requests submitted here must be approved by a Super Admin before an employee is deleted."
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
                  <TableHead>Requested by</TableHead>
                  <TableHead>Status</TableHead>
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
                        {r.employeeSiteName ? (
                          <GenericBadge variant="muted">{r.employeeSiteName}</GenericBadge>
                        ) : (
                          <GenericBadge variant="muted">Idle</GenericBadge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-[280px] truncate text-sm" title={r.reason}>
                        {r.reason}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{r.requestedByName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{relTime(r.createdAt)}</p>
                    </TableCell>
                    <TableCell>
                      <CancellationStatusBadge status={r.status} />
                      {r.reviewedByName && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          by {r.reviewedByName}
                          {r.reviewedAt ? ` · ${relTime(r.reviewedAt)}` : ""}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>{actionsFor(r)}</TableCell>
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
                      <p className="text-xs text-muted-foreground">
                        {r.employeeCode} · {r.employeeSiteName ?? "Idle"}
                      </p>
                    </div>
                  </div>
                  <CancellationStatusBadge status={r.status} />
                </div>
                <p className="text-sm text-muted-foreground">{r.reason}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
                  <p className="text-xs text-muted-foreground">
                    Requested by {r.requestedByName ?? "—"} · {relTime(r.createdAt)}
                    {r.reviewedByName && (
                      <>
                        <br />
                        Reviewed by {r.reviewedByName}
                        {r.reviewedAt ? ` · ${relTime(r.reviewedAt)}` : ""}
                      </>
                    )}
                  </p>
                  {actionsFor(r)}
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

      {/* New request */}
      <NewCancellationDialog open={newOpen} onOpenChange={setNewOpen} onCreated={afterAction} />

      {/* Approve — strong warning */}
      <ConfirmDialog
        open={!!approveTarget}
        onOpenChange={(o) => {
          if (!o) setApproveTarget(null);
        }}
        title="Permanently delete this employee?"
        description={
          approveTarget && (
            <>
              Permanently mark <span className="font-semibold">{approveTarget.employeeName}</span>{" "}
              ({approveTarget.employeeCode}) as deleted? All historical records (attendance,
              warnings, fines, leave, uniforms, site history) are preserved.{" "}
              <span className="font-semibold">This cannot be undone.</span>
            </>
          )
        }
        confirmLabel="Delete employee"
        destructive={true}
        onConfirm={async () => {
          if (!approveTarget) return;
          try {
            await apiPost(`/api/cancellation-requests/${approveTarget.id}/approve`);
            toast.success(
              `${approveTarget.employeeName} marked as deleted — history preserved`
            );
            afterAction();
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />

      {/* Reject with note */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => {
          if (!o) {
            setRejectTarget(null);
            setRejectNote("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject cancellation request</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  Reject the deletion of{" "}
                  <span className="font-semibold">{rejectTarget.employeeName}</span>? The employee
                  will return to active status.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="cxl-reject-note">Note (optional)</Label>
            <Textarea
              id="cxl-reject-note"
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Reason for rejection…"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={rejectBusy}
              onClick={() => {
                setRejectTarget(null);
                setRejectNote("");
              }}
            >
              Keep request
            </Button>
            <Button variant="destructive" onClick={doReject} disabled={rejectBusy}>
              {rejectBusy && <Loader2 className="size-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

export default CancellationsView;
