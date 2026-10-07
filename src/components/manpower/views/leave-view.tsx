"use client";

/**
 * LeaveView — Task 4-b
 * Status tabs + search, new request dialog (employee picker, type, range),
 * approve / reject (with note) / cancel on pending requests.
 * Approvals automatically mark attendance as leave (server-side).
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  CalendarOff,
  Check,
  Loader2,
  Plus,
  Search,
  X,
  XCircle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { LeaveRequestRecord, LeaveStatus, LeaveType } from "@/types/manpower";
import { EmployeeAvatar } from "@/components/manpower/shared/employee-avatar";
import { GenericBadge, LeaveStatusBadge } from "@/components/manpower/shared/status-badges";
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
  fmtRange,
  inclusiveDays,
  relTime,
  useDebounced,
  type EmployeeOption,
  type Paged,
} from "@/components/manpower/views/task-4b-shared";

const PAGE_SIZE = 10;

type StatusTab = "all" | LeaveStatus;

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "casual", label: "Casual" },
  { value: "sick", label: "Sick" },
  { value: "annual", label: "Annual" },
  { value: "emergency", label: "Emergency" },
  { value: "marriage", label: "Marriage" },
  { value: "other", label: "Other" },
];

function leaveTypeLabel(r: LeaveRequestRecord): string {
  if (r.leaveType === "other") {
    return r.otherType ? `Other · ${r.otherType}` : "Other";
  }
  return LEAVE_TYPES.find((t) => t.value === r.leaveType)?.label ?? r.leaveType;
}

// ---------------------------------------------------------------------------
// New request dialog
// ---------------------------------------------------------------------------

function NewLeaveDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [leaveType, setLeaveType] = useState<LeaveType>("casual");
  const [otherType, setOtherType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEmployee(null);
      setLeaveType("casual");
      setOtherType("");
      setStartDate("");
      setEndDate("");
      setReason("");
      setBusy(false);
    }
  }, [open]);

  const days = inclusiveDays(startDate, endDate);
  const invalidRange = days !== null && days < 1;

  const submit = async () => {
    if (!employee) {
      toast.error("Select an employee");
      return;
    }
    if (leaveType === "other" && !otherType.trim()) {
      toast.error("Describe the other leave type");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Pick the start and end dates");
      return;
    }
    if (invalidRange) {
      toast.error("The end date must be on or after the start date");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/api/leave-requests", {
        employeeId: employee.id,
        leaveType,
        otherType: leaveType === "other" ? otherType.trim() : null,
        startDate,
        endDate,
        reason: reason.trim() || null,
      });
      toast.success(
        `Leave request created for ${employee.fullName} (${days} day${days === 1 ? "" : "s"})`
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New leave request</DialogTitle>
          <DialogDescription>
            Once approved, attendance is automatically marked as leave for the whole range.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Employee</Label>
            <EmployeePicker value={employee} onChange={setEmployee} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Leave type</Label>
              <Select value={leaveType} onValueChange={(v) => setLeaveType(v as LeaveType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {leaveType === "other" && (
              <div className="grid gap-1.5">
                <Label htmlFor="leave-other">Specify type</Label>
                <Input
                  id="leave-other"
                  value={otherType}
                  onChange={(e) => setOtherType(e.target.value)}
                  placeholder="e.g. Study leave"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="leave-start">Start date</Label>
              <Input
                id="leave-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="leave-end">End date</Label>
              <Input
                id="leave-end"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                aria-invalid={invalidRange}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Total duration</span>
            <span className="font-semibold">
              {days !== null && days > 0 ? `${days} day${days === 1 ? "" : "s"}` : "—"}
            </span>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="leave-reason">Reason (optional)</Label>
            <Textarea
              id="leave-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Add a short reason…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Row actions
// ---------------------------------------------------------------------------

function RowActions({
  record,
  canReview,
  onApprove,
  onReject,
  onCancel,
}: {
  record: LeaveRequestRecord;
  canReview: boolean;
  onApprove: (r: LeaveRequestRecord) => void;
  onReject: (r: LeaveRequestRecord) => void;
  onCancel: (r: LeaveRequestRecord) => void;
}) {
  if (record.status !== "pending" || !canReview) return null;
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="outline"
        size="sm"
        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950"
        onClick={() => onApprove(record)}
      >
        <Check className="size-3.5" />
        <span className="hidden xl:inline">Approve</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950"
        onClick={() => onReject(record)}
      >
        <X className="size-3.5" />
        <span className="hidden xl:inline">Reject</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => onCancel(record)}
      >
        <XCircle className="size-3.5" />
        <span className="hidden xl:inline">Cancel</span>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function LeaveView() {
  const user = useAppStore((s) => s.user);
  const canReview =
    !!user && (user.role === "super_admin" || user.permissions?.leave_requests === true);

  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paged<LeaveRequestRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<LeaveRequestRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<LeaveRequestRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<LeaveRequestRecord | null>(null);
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
      const res = await apiGet<Paged<LeaveRequestRecord>>(
        `/api/leave-requests?${params.toString()}`
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
      await apiPost(`/api/leave-requests/${rejectTarget.id}/reject`, {
        note: rejectNote.trim() || null,
      });
      toast.success(`Rejected — ${rejectTarget.employeeName}'s leave request`);
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
  const emptyTitle =
    statusTab === "all"
      ? "No leave requests"
      : `No ${statusTab} requests`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-4 p-4 sm:space-y-6 sm:p-6"
    >
      <PageHeader
        icon={CalendarOff}
        title="Leave Requests"
        description="Request, review and track employee leave — approvals auto-mark attendance."
        actions={
          <Button onClick={() => setNewOpen(true)}>
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
              <TabsList className="flex-wrap">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
                <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
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

      {loading ? (
        <Card className="p-4 sm:p-6">
          <TableSkeleton rows={5} cols={6} />
        </Card>
      ) : error ? (
        <ErrorState message={error} retry={() => void load()} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title={emptyTitle}
          description={
            debouncedQuery.trim()
              ? "No requests match your search."
              : "Create a new request with the button above."
          }
          action={
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" />
              New Request
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
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-center">Days</TableHead>
                  <TableHead>Reason</TableHead>
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
                          <p className="text-xs text-muted-foreground">
                            {r.employeeCode} · by {r.createdByName ?? "—"} · {relTime(r.createdAt)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <GenericBadge variant="info">{leaveTypeLabel(r)}</GenericBadge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmtRange(r.startDate, r.endDate)}
                    </TableCell>
                    <TableCell className="text-center">
                      <GenericBadge variant="muted">{r.totalDays} d</GenericBadge>
                    </TableCell>
                    <TableCell>
                      {r.reason ? (
                        <span className="block max-w-[220px] truncate text-sm" title={r.reason}>
                          {r.reason}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <LeaveStatusBadge status={r.status} />
                      {r.reviewedByName && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          by {r.reviewedByName} · {relTime(r.reviewedAt)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <RowActions
                        record={r}
                        canReview={canReview}
                        onApprove={setApproveTarget}
                        onReject={setRejectTarget}
                        onCancel={setCancelTarget}
                      />
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
                  <LeaveStatusBadge status={r.status} />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <GenericBadge variant="info">{leaveTypeLabel(r)}</GenericBadge>
                  <GenericBadge variant="muted">{r.totalDays} days</GenericBadge>
                </div>

                <p className="text-sm font-medium">{fmtRange(r.startDate, r.endDate)}</p>
                {r.reason && <p className="line-clamp-2 text-sm text-muted-foreground">{r.reason}</p>}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
                  <p className="text-xs text-muted-foreground">
                    Created by {r.createdByName ?? "—"} · {relTime(r.createdAt)}
                    {r.reviewedByName && (
                      <>
                        <br />
                        Reviewed by {r.reviewedByName} · {relTime(r.reviewedAt)}
                      </>
                    )}
                  </p>
                  <RowActions
                    record={r}
                    canReview={canReview}
                    onApprove={setApproveTarget}
                    onReject={setRejectTarget}
                    onCancel={setCancelTarget}
                  />
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
      <NewLeaveDialog open={newOpen} onOpenChange={setNewOpen} onCreated={afterAction} />

      {/* Approve */}
      <ConfirmDialog
        open={!!approveTarget}
        onOpenChange={(o) => {
          if (!o) setApproveTarget(null);
        }}
        title="Approve this leave?"
        description={
          approveTarget && (
            <>
              Attendance will be marked as <span className="font-semibold">leave</span> for{" "}
              {fmtRange(approveTarget.startDate, approveTarget.endDate)} (
              {approveTarget.totalDays} day{approveTarget.totalDays === 1 ? "" : "s"}) for{" "}
              <span className="font-semibold">{approveTarget.employeeName}</span>.
            </>
          )
        }
        confirmLabel="Approve"
        destructive={false}
        onConfirm={async () => {
          if (!approveTarget) return;
          try {
            await apiPost(`/api/leave-requests/${approveTarget.id}/approve`);
            toast.success(
              `Approved — ${approveTarget.employeeName} is on leave ${fmtRange(
                approveTarget.startDate,
                approveTarget.endDate
              )}`
            );
            afterAction();
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />

      {/* Cancel */}
      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
        title="Cancel this request?"
        description={
          cancelTarget && (
            <>
              The pending leave request for{" "}
              <span className="font-semibold">{cancelTarget.employeeName}</span> will be
              withdrawn. No attendance will be changed.
            </>
          )
        }
        confirmLabel="Cancel request"
        destructive={false}
        onConfirm={async () => {
          if (!cancelTarget) return;
          try {
            await apiPost(`/api/leave-requests/${cancelTarget.id}/cancel`);
            toast.success("Leave request cancelled");
            afterAction();
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />

      {/* Reject with optional note */}
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
            <DialogTitle>Reject leave request</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>
                  Reject <span className="font-semibold">{rejectTarget.employeeName}</span>'s leave
                  for {fmtRange(rejectTarget.startDate, rejectTarget.endDate)}? Attendance stays
                  unmarked.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="reject-note">Note (optional)</Label>
            <Textarea
              id="reject-note"
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

export default LeaveView;
