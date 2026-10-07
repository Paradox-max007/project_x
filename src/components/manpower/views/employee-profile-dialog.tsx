"use client";

/**
 * EmployeeProfileDialog — rich, tabbed profile dialog (Overview / Site History /
 * Documents / Warnings & Fines / Uniforms) plus the AssignSiteDialog and small
 * helpers (doc badges, WhatsApp text, PDF download hook) reused by EmployeesView.
 */

import { parseISO } from "date-fns";
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarRange,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileDown,
  FileText,
  Info,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Plane,
  Receipt,
  Repeat2,
  ShieldAlert,
  Shirt,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { EmployeeAvatar } from "@/components/manpower/shared/employee-avatar";
import { RatingStars } from "@/components/manpower/shared/rating-stars";
import { ConfirmDialog } from "@/components/manpower/shared/confirm-dialog";
import {
  EmployeeStatusBadge,
  GenericBadge,
  WorkStatusBadge,
} from "@/components/manpower/shared/status-badges";
import { EmployeeFormDialog } from "@/components/manpower/views/employee-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPost } from "@/lib/api-client";
import {
  formatDateLabel,
  generateEmployeeCV,
  generateEmployeeReport,
  getPdfSettings,
  tenureLabel,
} from "@/lib/pdf";
import { cn } from "@/lib/utils";
import type {
  EmployeeDetail,
  EmployeeProfile,
  EmployeeReport,
  SiteRecord,
} from "@/types/manpower";

const NONE = "none"; // Radix <SelectItem> cannot use ""

// ---------------------------------------------------------------------------
// Document status badge (shared with EmployeesView)
// ---------------------------------------------------------------------------

export const DOC_STATUS_META: Record<
  string,
  { label: string; variant: "success" | "warning" | "info" | "destructive" }
> = {
  valid: { label: "Valid", variant: "success" },
  expiring: { label: "Expiring soon", variant: "warning" },
  renewal_due: { label: "Renewal due", variant: "info" },
  expired: { label: "Expired", variant: "destructive" },
};

export function DocStatusBadge({ status }: { status: string | null | undefined }) {
  const meta = status ? DOC_STATUS_META[status] : undefined;
  if (!meta) return <GenericBadge variant="muted">Not on file</GenericBadge>;
  return <GenericBadge variant={meta.variant}>{meta.label}</GenericBadge>;
}

// ---------------------------------------------------------------------------
// WhatsApp share text (never includes private documents)
// ---------------------------------------------------------------------------

export function whatsappSummaryText(emp: {
  fullName: string;
  employeeCode: string;
  position: string;
  nationality: string;
  siteName: string | null;
  rating: number;
  companyName: string | null;
}): string {
  const lines = [
    "ASM Manpower — Employee Summary",
    `Name: ${emp.fullName}`,
    `ID: ${emp.employeeCode}`,
    `Position: ${emp.position}`,
    `Nationality: ${emp.nationality}`,
    `Site: ${emp.siteName ?? "Idle (no site)"}`,
    `Rating: ${emp.rating.toFixed(1)}/5`,
  ];
  if (emp.companyName) lines.push(`Company: ${emp.companyName}`);
  lines.push("", "Full CV/report PDF available — generated via ASM Manpower System");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// PDF download hook (fetch report → generate → save)
// ---------------------------------------------------------------------------

export function useEmployeeDownloads() {
  const [busy, setBusy] = useState<"cv" | "report" | null>(null);

  const run = useCallback(async (kind: "cv" | "report", employeeId: string) => {
    if (!employeeId) return;
    setBusy(kind);
    try {
      const [report, settings] = await Promise.all([
        apiGet<EmployeeReport>(`/api/employees/${employeeId}/report`),
        getPdfSettings(),
      ]);
      if (kind === "cv") await generateEmployeeCV(report, settings);
      else await generateEmployeeReport(report, settings);
      toast.success(
        `${kind === "cv" ? "CV" : "Report"} downloaded — ${report.employee.employeeCode}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate PDF");
    } finally {
      setBusy(null);
    }
  }, []);

  const downloadCV = useCallback((id: string) => run("cv", id), [run]);
  const downloadReport = useCallback((id: string) => run("report", id), [run]);

  return { busy, downloadCV, downloadReport };
}

// ---------------------------------------------------------------------------
// Assign to site dialog
// ---------------------------------------------------------------------------

export function AssignSiteDialog({
  open,
  onOpenChange,
  employee,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: {
    id: string;
    fullName: string;
    employeeCode: string;
    currentSiteId: string | null;
  } | null;
  onAssigned?: () => void;
}) {
  const [sites, setSites] = useState<SiteRecord[] | null>(null);
  const [target, setTarget] = useState<string>(NONE);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTarget(employee?.currentSiteId ?? NONE);
    setReason("");
    setSites(null);
    let cancelled = false;
    apiGet<SiteRecord[]>("/api/sites?includeInactive=true")
      .then((all) => {
        if (!cancelled) setSites(all.filter((s) => s.isActive));
      })
      .catch(() => {
        if (!cancelled) setSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, employee]);

  const isTeamLeader = (sites ?? []).some((s) => s.teamLeaderId === employee?.id);
  const targetSite = (sites ?? []).find((s) => s.id === target) ?? null;

  const submit = async () => {
    if (!employee || busy) return;
    setBusy(true);
    try {
      await apiPost(`/api/employees/${employee.id}/assign`, {
        siteId: target === NONE ? null : target,
        reason: reason.trim() || undefined,
      });
      toast.success(
        targetSite
          ? `${employee.fullName} assigned to ${targetSite.name}`
          : `${employee.fullName} is now idle (no site)`
      );
      onOpenChange(false);
      onAssigned?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign employee");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-emerald-600" />
            Assign to site
          </DialogTitle>
          <DialogDescription>
            {employee
              ? `${employee.fullName} • ${employee.employeeCode}`
              : "Move this employee to another site, or make them idle."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Site</Label>
            <Select value={target} onValueChange={setTarget} disabled={busy}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Idle — remove from site</SelectItem>
                {(sites ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sites === null && (
              <p className="text-xs text-muted-foreground">Loading sites…</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Project reassignment"
              disabled={busy}
            />
          </div>

          {isTeamLeader && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Note: moving a team leader removes their leadership of the current
                site.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || sites === null}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {target === NONE ? "Remove from site" : "Assign to site"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function InfoItem({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 break-words text-sm font-medium">
        {value && value.trim() !== "" ? value : "—"}
      </p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </h4>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

const TONE_CLASS = {
  emerald:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  rose: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
  teal: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300",
  amber:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  zinc: "border-border bg-muted/50 text-muted-foreground",
} as const;

function StatChip({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone: keyof typeof TONE_CLASS;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3 py-2",
        TONE_CLASS[tone]
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <div className="leading-tight">
        <p className="text-sm font-bold tabular-nums">{value}</p>
        <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">
          {label}
        </p>
      </div>
    </div>
  );
}

function daysUntil(dateStr: string): number {
  try {
    return Math.ceil((parseISO(dateStr).getTime() - Date.now()) / 86_400_000);
  } catch {
    return Number.NaN;
  }
}

function RenewalBadge({ renewalDate }: { renewalDate: string }) {
  const days = daysUntil(renewalDate);
  if (Number.isNaN(days)) return null;
  if (days < 0)
    return (
      <GenericBadge variant="destructive">Overdue by {Math.abs(days)}d</GenericBadge>
    );
  if (days <= 30) return <GenericBadge variant="warning">Due in {days}d</GenericBadge>;
  return <GenericBadge variant="muted">Due {formatDateLabel(renewalDate)}</GenericBadge>;
}

function DocumentRow({
  label,
  masked,
  status,
  field,
  revealed,
  onReveal,
  onHide,
}: {
  label: string;
  masked: string | null;
  status: string | null;
  field: "passport_number" | "id_number";
  revealed: { field: "passport_number" | "id_number"; value: string } | null;
  onReveal: (field: "passport_number" | "id_number") => void;
  onHide: () => void;
}) {
  const isRevealed = revealed?.field === field;
  const hasDoc = !!masked;
  return (
    <div className="rounded-lg border p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p
            className={cn(
              "mt-1 font-mono text-sm tracking-wider",
              isRevealed && "rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            )}
          >
            {isRevealed
              ? revealed?.value || "Not on file"
              : masked ?? "Not on file"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DocStatusBadge status={status} />
          {hasDoc && !isRevealed && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onReveal(field)}
            >
              <Eye />
              Reveal
            </Button>
          )}
          {isRevealed && (
            <Button variant="outline" size="sm" onClick={onHide}>
              <EyeOff />
              Hide
            </Button>
          )}
        </div>
      </div>
      {isRevealed && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Visible for 30 seconds — re-masks automatically.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile dialog
// ---------------------------------------------------------------------------

export function EmployeeProfileDialog({
  open,
  onOpenChange,
  employeeId,
  onEdited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string | null;
  /** notify parent to refresh its list after edit/assign */
  onEdited?: () => void;
}) {
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [report, setReport] = useState<EmployeeReport | null>(null);
  const [reportFailed, setReportFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [revealed, setRevealed] = useState<{
    field: "passport_number" | "id_number";
    value: string;
  } | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { busy: downloading, downloadCV, downloadReport } = useEmployeeDownloads();

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError(null);
    try {
      const d = await apiGet<EmployeeDetail>(`/api/employees/${employeeId}`);
      setDetail(d);
      // secondary payload for the warnings/fines/uniforms tabs
      setReportFailed(false);
      apiGet<EmployeeReport>(`/api/employees/${employeeId}/report`)
        .then(setReport)
        .catch(() => {
          setReport(null);
          setReportFailed(true);
        });
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : "Failed to load employee");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    if (open && employeeId) {
      setDetail(null);
      setReport(null);
      setTab("overview");
      load();
    }
    if (!open && revealTimer.current) {
      clearTimeout(revealTimer.current);
      revealTimer.current = null;
      setRevealed(null);
    }
  }, [open, employeeId, load]);

  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    []
  );

  const revealDoc = async (field: "passport_number" | "id_number") => {
    if (!employeeId) return;
    try {
      const res = await apiGet<{ value: string | null }>(
        `/api/employees/${employeeId}/documents/reveal?field=${field}`
      );
      if (revealTimer.current) clearTimeout(revealTimer.current);
      setRevealed({ field, value: res.value ?? "" });
      revealTimer.current = setTimeout(() => setRevealed(null), 30_000);
      toast.info("Document revealed — re-masks in 30 seconds. This access is audited.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reveal document");
    }
  };

  const hideDoc = () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = null;
    setRevealed(null);
  };

  const sortedHistory = useMemo(
    () =>
      [...(detail?.siteHistory ?? [])].sort((a, b) =>
        (b.startDate ?? "").localeCompare(a.startDate ?? "")
      ),
    [detail]
  );

  const renewedIds = useMemo(
    () =>
      new Set(
        (report?.uniforms ?? [])
          .filter((u) => u.previousIssueId)
          .map((u) => u.previousIssueId as string)
      ),
    [report]
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex max-h-[92vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">
            Employee profile — {employeeId}
          </DialogTitle>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-4 p-6">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-16 w-16 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-56" />
                    <Skeleton className="h-4 w-80" />
                  </div>
                </div>
                <Skeleton className="h-9 w-full max-w-md" />
                <div className="grid gap-4 sm:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              </div>
            ) : error ? (
              <div className="p-6">
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <p className="font-medium text-destructive">
                    Could not load employee
                  </p>
                  <p className="max-w-md text-sm text-muted-foreground">{error}</p>
                  <Button variant="outline" size="sm" onClick={load}>
                    Try again
                  </Button>
                </div>
              </div>
            ) : detail ? (
              <>
                {/* ---- header ---- */}
                <div className="border-b bg-muted/40 px-6 pb-4 pt-6 pr-10">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-4">
                      <EmployeeAvatar
                        name={detail.fullName}
                        photoUrl={detail.photoUrl}
                        className="h-16 w-16 text-xl"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-bold tracking-tight">
                            {detail.fullName}
                          </h2>
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-muted-foreground">
                            {detail.employeeCode}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <GenericBadge variant="outline">{detail.position}</GenericBadge>
                          {detail.currentSiteName ? (
                            <GenericBadge variant="info">
                              <MapPin />
                              {detail.currentSiteName}
                            </GenericBadge>
                          ) : (
                            <GenericBadge variant="muted">
                              <MapPin />
                              Idle
                            </GenericBadge>
                          )}
                          <EmployeeStatusBadge status={detail.status} />
                          <WorkStatusBadge working={!!detail.currentSiteId} />
                        </div>
                        <div className="mt-2">
                          <RatingStars value={detail.rating} size={15} />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                        <Pencil />
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                        <ArrowRightLeft />
                        Assign
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={downloading !== null}
                        onClick={() => downloadCV(detail.id)}
                      >
                        {downloading === "cv" ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <FileDown />
                        )}
                        CV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={downloading !== null}
                        onClick={() => downloadReport(detail.id)}
                      >
                        {downloading === "report" ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <FileText />
                        )}
                        Report
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                        onClick={() => setShareOpen(true)}
                      >
                        <MessageCircle />
                        Share
                      </Button>
                    </div>
                  </div>
                </div>

                {/* ---- tabs ---- */}
                <Tabs value={tab} onValueChange={setTab} className="gap-0">
                  <div className="px-6 pt-3">
                    <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="history">Site History</TabsTrigger>
                      <TabsTrigger value="documents">Documents</TabsTrigger>
                      <TabsTrigger value="warnings">Warnings &amp; Fines</TabsTrigger>
                      <TabsTrigger value="uniforms">Uniforms</TabsTrigger>
                    </TabsList>
                  </div>

                  {/* Overview */}
                  <TabsContent value="overview" className="space-y-6 px-6 py-4">
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div>
                        <SectionTitle>Personal Information</SectionTitle>
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3.5">
                          <InfoItem label="Full name" value={detail.fullName} />
                          <InfoItem
                            label="Date of birth"
                            value={formatDateLabel(detail.dateOfBirth)}
                          />
                          <InfoItem label="Nationality" value={detail.nationality} />
                          <InfoItem label="Phone" value={detail.phone} />
                          <InfoItem
                            label="Email"
                            value={detail.email}
                            className="col-span-2 break-all"
                          />
                          <InfoItem
                            label="Address"
                            value={detail.address}
                            className="col-span-2"
                          />
                          <InfoItem
                            label="Emergency contact"
                            value={detail.emergencyContact}
                            className="col-span-2"
                          />
                        </div>
                      </div>
                      <div>
                        <SectionTitle>Employment</SectionTitle>
                        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3.5">
                          <InfoItem label="Position" value={detail.position} />
                          <InfoItem label="Company" value={detail.companyName} />
                          <InfoItem
                            label="Join date"
                            value={formatDateLabel(detail.joinDate)}
                          />
                          <InfoItem label="Tenure" value={tenureLabel(detail.joinDate)} />
                          <InfoItem label="Current site" value={detail.currentSiteName} />
                          <InfoItem label="Team leader" value={detail.teamLeaderName} />
                          <InfoItem
                            label="Team leader site"
                            value={detail.teamLeaderName ? detail.currentSiteName : null}
                          />
                          <InfoItem
                            label="Registered"
                            value={formatDateLabel(detail.createdAt)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <StatChip
                        icon={AlertTriangle}
                        label="Warnings"
                        value={detail.warningsCount}
                        tone="amber"
                      />
                      <StatChip
                        icon={Receipt}
                        label="Fines"
                        value={detail.finesCount}
                        tone="rose"
                      />
                      <StatChip
                        icon={CalendarRange}
                        label="Leave requests"
                        value={detail.leaveCount}
                        tone="teal"
                      />
                      <StatChip
                        icon={Shirt}
                        label="Uniform issues"
                        value={detail.uniformCount}
                        tone="emerald"
                      />
                    </div>

                    <div className="rounded-lg border p-3.5">
                      <SectionTitle>Document Status</SectionTitle>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
                          <span className="text-sm font-medium">Passport</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {detail.passportNumberMasked ?? "—"}
                            </span>
                            <DocStatusBadge status={detail.passportStatus} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
                          <span className="text-sm font-medium">National ID</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {detail.idNumberMasked ?? "—"}
                            </span>
                            <DocStatusBadge status={detail.idStatus} />
                          </div>
                        </div>
                      </div>
                      <p className="mt-2.5 text-[11px] text-muted-foreground">
                        Full numbers are encrypted — open the{" "}
                        <button
                          type="button"
                          className="font-medium underline underline-offset-2 hover:text-foreground"
                          onClick={() => setTab("documents")}
                        >
                          Documents tab
                        </button>{" "}
                        to reveal (audited).
                      </p>
                    </div>
                  </TabsContent>

                  {/* Site history */}
                  <TabsContent value="history" className="px-6 py-4">
                    {sortedHistory.length === 0 ? (
                      <EmptyRow>No site assignments recorded yet.</EmptyRow>
                    ) : (
                      <ol className="relative ml-2 space-y-0 border-l border-border">
                        {sortedHistory.map((h, idx) => (
                          <li key={h.id} className="relative pb-6 pl-5 last:pb-0">
                            <span
                              className={cn(
                                "absolute -left-[6.5px] top-1 h-3 w-3 rounded-full border-2 border-background",
                                idx === 0 && !h.endDate
                                  ? "bg-emerald-500"
                                  : "bg-zinc-300 dark:bg-zinc-600"
                              )}
                            />
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                              <p className="text-sm font-semibold">{h.siteName}</p>
                              <p className="text-xs tabular-nums text-muted-foreground">
                                {formatDateLabel(h.startDate)} →{" "}
                                {h.endDate ? formatDateLabel(h.endDate) : (
                                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                    Present
                                  </span>
                                )}
                              </p>
                            </div>
                            {h.reason && (
                              <p className="mt-0.5 text-xs italic text-muted-foreground">
                                “{h.reason}”
                              </p>
                            )}
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Recorded by {h.createdByName ?? "—"}
                            </p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </TabsContent>

                  {/* Documents */}
                  <TabsContent value="documents" className="space-y-4 px-6 py-4">
                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <p className="text-xs">
                        Sensitive — authorized access is audited. Every reveal is
                        logged with your admin name and a timestamp.
                      </p>
                    </div>
                    <DocumentRow
                      label="Passport"
                      masked={detail.passportNumberMasked}
                      status={detail.passportStatus}
                      field="passport_number"
                      revealed={revealed}
                      onReveal={revealDoc}
                      onHide={hideDoc}
                    />
                    <DocumentRow
                      label="National ID"
                      masked={detail.idNumberMasked}
                      status={detail.idStatus}
                      field="id_number"
                      revealed={revealed}
                      onReveal={revealDoc}
                      onHide={hideDoc}
                    />
                  </TabsContent>

                  {/* Warnings & fines */}
                  <TabsContent value="warnings" className="space-y-6 px-6 py-4">
                    {!report ? (
                      reportFailed ? (
                        <div className="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 py-8 text-center">
                          <p className="text-sm font-medium text-destructive">
                            Could not load records
                          </p>
                          <Button variant="outline" size="sm" onClick={load}>
                            Try again
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full" />
                          ))}
                        </div>
                      )
                    ) : (
                      <>
                        <div>
                          <SectionTitle>Attendance Summary (All Time)</SectionTitle>
                          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <StatChip
                              icon={CheckCircle2}
                              label="Present"
                              value={report.attendanceSummary?.present ?? 0}
                              tone="emerald"
                            />
                            <StatChip
                              icon={XCircle}
                              label="Absent"
                              value={report.attendanceSummary?.absent ?? 0}
                              tone="rose"
                            />
                            <StatChip
                              icon={Plane}
                              label="Leave"
                              value={report.attendanceSummary?.leave ?? 0}
                              tone="teal"
                            />
                            <StatChip
                              icon={Clock}
                              label={`Overtime (${report.attendanceSummary?.overtimeHours ?? 0}h)`}
                              value={report.attendanceSummary?.overtime ?? 0}
                              tone="amber"
                            />
                          </div>
                        </div>

                        <div>
                          <SectionTitle>Warnings ({report.warnings.length})</SectionTitle>
                          <div className="mt-2.5 space-y-2">
                            {report.warnings.length === 0 ? (
                              <EmptyRow>No warnings on record.</EmptyRow>
                            ) : (
                              report.warnings.map((w) => (
                                <div key={w.id} className="rounded-lg border p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-medium">{w.reason}</p>
                                    <div className="flex items-center gap-1.5">
                                      {w.isAutoGenerated && (
                                        <GenericBadge variant="info">Auto-generated</GenericBadge>
                                      )}
                                      <GenericBadge variant="destructive">
                                        −{w.ratingPenalty} rating
                                      </GenericBadge>
                                    </div>
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {formatDateLabel(w.createdAt)} • by{" "}
                                    {w.createdByName ?? "—"}
                                  </p>
                                  {w.absentDates && w.absentDates.length > 0 && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Absent dates: {w.absentDates.join(", ")}
                                    </p>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div>
                          <SectionTitle>Fines ({report.fines.length})</SectionTitle>
                          <div className="mt-2.5 space-y-2">
                            {report.fines.length === 0 ? (
                              <EmptyRow>No fines on record.</EmptyRow>
                            ) : (
                              report.fines.map((f) => (
                                <div key={f.id} className="rounded-lg border p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-medium">{f.reason}</p>
                                    <div className="flex items-center gap-1.5">
                                      <GenericBadge variant="warning">
                                        {f.amount} {f.currency}
                                      </GenericBadge>
                                      <GenericBadge variant="destructive">
                                        −{f.ratingPenalty} rating
                                      </GenericBadge>
                                    </div>
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {formatDateLabel(f.createdAt)} • by{" "}
                                    {f.createdByName ?? "—"}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </TabsContent>

                  {/* Uniforms */}
                  <TabsContent value="uniforms" className="px-6 py-4">
                    {!report ? (
                      reportFailed ? (
                        <div className="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 py-8 text-center">
                          <p className="text-sm font-medium text-destructive">
                            Could not load uniform records
                          </p>
                          <Button variant="outline" size="sm" onClick={load}>
                            Try again
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} className="h-20 w-full" />
                          ))}
                        </div>
                      )
                    ) : report.uniforms.length === 0 ? (
                      <EmptyRow>No uniforms issued to this employee yet.</EmptyRow>
                    ) : (
                      <div className="space-y-3">
                        {report.uniforms.map((u) => (
                          <div key={u.id} className="rounded-lg border p-3.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">
                                  {u.tokenNumber}
                                </span>
                                {u.isRenewal && (
                                  <GenericBadge variant="info">
                                    <Repeat2 />
                                    Renewal
                                  </GenericBadge>
                                )}
                                {renewedIds.has(u.id) && (
                                  <GenericBadge variant="muted">Superseded</GenericBadge>
                                )}
                              </div>
                              <RenewalBadge renewalDate={u.renewalDate} />
                            </div>
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {u.items.map((it) => (
                                <Badge key={it.itemId} variant="outline">
                                  {it.name} × {it.quantity}
                                </Badge>
                              ))}
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Issued {formatDateLabel(u.issuedAt)} • Renewal due{" "}
                              {formatDateLabel(u.renewalDate)}
                              {u.siteName ? ` • Site: ${u.siteName}` : ""}
                              {u.teamLeaderName ? ` • Leader: ${u.teamLeaderName}` : ""}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </>
            ) : (
              <div className="p-6" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* nested dialogs */}
      {detail && (
        <>
          <EmployeeFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            employee={detail as EmployeeProfile}
            onSaved={() => {
              load();
              onEdited?.();
            }}
          />
          <AssignSiteDialog
            open={assignOpen}
            onOpenChange={setAssignOpen}
            employee={{
              id: detail.id,
              fullName: detail.fullName,
              employeeCode: detail.employeeCode,
              currentSiteId: detail.currentSiteId,
            }}
            onAssigned={() => {
              load();
              onEdited?.();
            }}
          />
          <ConfirmDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            title="Share via WhatsApp?"
            description="This will open WhatsApp with the employee's basic details (name, ID, position, nationality, site, rating). Private documents are NOT included. Continue?"
            confirmLabel="Continue"
            destructive={false}
            onConfirm={async () => {
              window.open(
                `https://wa.me/?text=${encodeURIComponent(
                  whatsappSummaryText({
                    fullName: detail.fullName,
                    employeeCode: detail.employeeCode,
                    position: detail.position,
                    nationality: detail.nationality,
                    siteName: detail.currentSiteName,
                    rating: detail.rating,
                    companyName: detail.companyName,
                  })
                )}`,
                "_blank"
              );
            }}
          />
        </>
      )}
    </>
  );
}
