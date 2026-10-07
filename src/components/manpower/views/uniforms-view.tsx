"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  addMonths,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";
import {
  CalendarClock,
  ChevronsUpDown,
  Minus,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  Shirt,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { EmployeeAvatar } from "@/components/manpower/shared/employee-avatar";
import { GenericBadge } from "@/components/manpower/shared/status-badges";
import { ConfirmDialog } from "@/components/manpower/shared/confirm-dialog";
import {
  DataPagination,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
} from "@/components/manpower/shared/page-kit";
import type {
  SiteRecord,
  SystemSettings,
  UniformIssueRecord,
  UniformItemRecord,
} from "@/types/manpower";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 15;
const MAX_QTY = 10;
const DOCUMENT_TYPES = ["Iqama", "Passport", "ID Card", "Other"] as const;

type EmployeeOption = {
  id: string;
  employeeCode: string;
  fullName: string;
  position: string;
  siteId: string | null;
};

type Paged<T> = { data: T[]; total: number; page: number; pageSize: number };

function safeDate(value: string): Date | null {
  try {
    const d = parseISO(value);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function fmtDate(value: string, pattern = "d MMM yyyy"): string {
  const d = safeDate(value);
  return d ? format(d, pattern) : "—";
}

function renewalStateOf(
  renewalDate: string
): { state: "overdue" | "due_soon" | "active"; days: number } {
  const d = safeDate(renewalDate);
  if (!d) return { state: "active", days: 0 };
  const days = differenceInCalendarDays(d, new Date());
  if (days < 0) return { state: "overdue", days };
  if (days <= 30) return { state: "due_soon", days };
  return { state: "active", days };
}

function RenewalStatusChip({ renewalDate }: { renewalDate: string }) {
  const { state, days } = renewalStateOf(renewalDate);
  if (state === "overdue")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-transparent bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300">
        Overdue {Math.abs(days)}d
      </span>
    );
  if (state === "due_soon")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-transparent bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
        Due in {days}d
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-transparent bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
      Active
    </span>
  );
}

function TokenBadge({ token }: { token: string }) {
  return (
    <span className="inline-flex items-center rounded-md border bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {token}
    </span>
  );
}

function RenewedBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-default items-center gap-1 rounded-full border border-transparent bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-700 dark:bg-teal-950 dark:text-teal-300">
          <RefreshCw className="h-3 w-3" />
          renewed
        </span>
      </TooltipTrigger>
      <TooltipContent>Renewal of previous token</TooltipContent>
    </Tooltip>
  );
}

function selectedItems(quantities: Record<string, number>) {
  return Object.entries(quantities)
    .filter(([, q]) => q > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
}

// ---------------------------------------------------------------------------
// Items quantity picker (used by Issue + Renew dialogs)
// ---------------------------------------------------------------------------

function ItemsPicker({
  items,
  quantities,
  onChange,
}: {
  items: UniformItemRecord[];
  quantities: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        No uniform items available yet — add some via “Manage Items”.
      </p>
    );
  }
  const setQty = (id: string, qty: number) =>
    onChange({ ...quantities, [id]: Math.max(0, Math.min(MAX_QTY, qty)) });

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((item) => {
        const qty = quantities[item.id] ?? 0;
        const active = qty > 0;
        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            aria-pressed={active}
            onClick={() => setQty(item.id, active ? 0 : 1)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setQty(item.id, active ? 0 : 1);
              }
            }}
            title={item.description ?? undefined}
            className={cn(
              "flex cursor-pointer select-none items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
              active
                ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                : "hover:bg-accent",
              !item.isActive && "opacity-60"
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium">{item.name}</span>
              {!item.isActive && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  inactive
                </span>
              )}
            </span>
            {active ? (
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={`Decrease ${item.name} quantity`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setQty(item.id, qty - 1);
                  }}
                  className="rounded-md p-1 transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-900"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-5 text-center text-xs font-bold tabular-nums">{qty}</span>
                <button
                  type="button"
                  aria-label={`Increase ${item.name} quantity`}
                  disabled={qty >= MAX_QTY}
                  onClick={(e) => {
                    e.stopPropagation();
                    setQty(item.id, qty + 1);
                  }}
                  className="rounded-md p-1 transition-colors hover:bg-emerald-100 disabled:opacity-40 dark:hover:bg-emerald-900"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <Plus className="h-3.5 w-3.5 shrink-0 opacity-40" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employee combobox picker
// ---------------------------------------------------------------------------

function EmployeePicker({
  employees,
  loading,
  value,
  onChange,
}: {
  employees: EmployeeOption[];
  loading: boolean;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = employees.find((e) => e.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{selected.fullName}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {selected.employeeCode}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              {loading ? "Loading employees…" : "Search employee…"}
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search by name, code or position…" />
          <CommandList>
            <CommandEmpty>
              {loading ? "Loading…" : "No employee found."}
            </CommandEmpty>
            <CommandGroup>
              {employees.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`${e.fullName} ${e.employeeCode} ${e.position}`}
                  onSelect={() => {
                    onChange(e.id);
                    setOpen(false);
                  }}
                >
                  <EmployeeAvatar name={e.fullName} className="h-6 w-6 text-[9px]" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{e.fullName}</span>
                    <span className="text-xs text-muted-foreground">
                      {e.employeeCode} · {e.position}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Issue Uniform dialog
// ---------------------------------------------------------------------------

const SITE_DEFAULT = "__employee_site__";

function IssueUniformDialog({
  open,
  onOpenChange,
  items,
  sites,
  renewalMonths,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: UniformItemRecord[] | null;
  sites: SiteRecord[];
  renewalMonths: number;
  onCreated: () => void;
}) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [documentType, setDocumentType] = useState<string>("Iqama");
  const [documentNumber, setDocumentNumber] = useState("");
  const [siteId, setSiteId] = useState<string>(SITE_DEFAULT);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // reset form each time the dialog opens
    setEmployeeId("");
    setDocumentType("Iqama");
    setDocumentNumber("");
    setSiteId(SITE_DEFAULT);
    setQuantities({});
    setEmpLoading(true);
    let cancelled = false;
    apiGet<EmployeeOption[]>("/api/employees/select")
      .then((res) => {
        if (!cancelled) setEmployees(Array.isArray(res) ? res : []);
      })
      .catch(() => {
        if (!cancelled) {
          setEmployees([]);
          toast.error("Failed to load employees — try reopening the dialog");
        }
      })
      .finally(() => {
        if (!cancelled) setEmpLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedEmployee = employees.find((e) => e.id === employeeId) ?? null;
  const activeSites = sites.filter((s) => s.isActive);
  const previewDate = format(addMonths(new Date(), renewalMonths), "d MMM yyyy");

  const submit = async () => {
    if (!selectedEmployee) {
      toast.error("Please select an employee");
      return;
    }
    if (!documentNumber.trim()) {
      toast.error("Document number is required");
      return;
    }
    const payloadItems = selectedItems(quantities);
    if (payloadItems.length === 0) {
      toast.error("Select at least one uniform item");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        employeeId: selectedEmployee.id,
        documentType,
        documentNumber: documentNumber.trim(),
        items: payloadItems,
      };
      if (siteId !== SITE_DEFAULT) body.siteId = siteId;
      const record = await apiPost<UniformIssueRecord>("/api/uniform-issues", body);
      toast.success(`Uniform issued — Token ${record.tokenNumber}`);
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to issue uniform");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Issue Uniform</DialogTitle>
          <DialogDescription>
            Register a new uniform handout for an employee.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Employee *</Label>
            <EmployeePicker
              employees={employees}
              loading={empLoading}
              value={employeeId}
              onChange={setEmployeeId}
            />
            {selectedEmployee && (
              <p className="text-xs text-muted-foreground">
                {selectedEmployee.position}
                {selectedEmployee.siteId
                  ? ` · Current site will be used by default`
                  : " · No current site"}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Document type *</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-number">Document number *</Label>
              <Input
                id="doc-number"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="e.g. 245789632"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Site</Label>
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SITE_DEFAULT}>
                  {selectedEmployee?.siteId
                    ? "Employee’s current site (default)"
                    : "Employee’s site (default)"}
                </SelectItem>
                {activeSites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Items *</Label>
            <ItemsPicker
              items={items ?? []}
              quantities={quantities}
              onChange={setQuantities}
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Renewal date will be set to{" "}
              <strong className="font-semibold">{previewDate}</strong> (
              {renewalMonths} months from today, per system settings).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Issuing…" : "Issue Uniform"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Renew Uniform dialog
// ---------------------------------------------------------------------------

function RenewUniformDialog({
  open,
  onOpenChange,
  record,
  items,
  renewalMonths,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: UniformIssueRecord | null;
  items: UniformItemRecord[] | null;
  renewalMonths: number;
  onDone: () => void;
}) {
  const [documentNumber, setDocumentNumber] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !record) return;
    setDocumentNumber("");
    const prefill: Record<string, number> = {};
    for (const it of record.items) prefill[it.itemId] = it.quantity;
    setQuantities(prefill);
  }, [open, record]);

  if (!record) return null;

  // active items + any item currently on the record (even if deactivated since)
  const currentIds = new Set(record.items.map((i) => i.itemId));
  const list = (items ?? []).filter((i) => i.isActive || currentIds.has(i.id));
  const previewDate = format(addMonths(new Date(), renewalMonths), "d MMM yyyy");

  const submit = async () => {
    const payloadItems = selectedItems(quantities);
    if (payloadItems.length === 0) {
      toast.error("Select at least one uniform item");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { items: payloadItems };
      if (documentNumber.trim()) body.documentNumber = documentNumber.trim();
      const renewed = await apiPost<UniformIssueRecord>(
        `/api/uniform-issues/${record.id}/renew`,
        body
      );
      toast.success(`Renewed — new token ${renewed.tokenNumber}`);
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to renew uniform");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Renew Uniform
          </DialogTitle>
          <DialogDescription>
            Issue a fresh set against token{" "}
            <span className="font-mono font-semibold text-foreground">
              {record.tokenNumber}
            </span>{" "}
            for {record.employeeName}. The original record stays in history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">{record.employeeName}</span>{" "}
              ({record.employeeCode}) · {record.documentType}{" "}
              <span className="font-mono">{record.documentNumber}</span>
            </p>
            <p className="mt-0.5">
              Issued {fmtDate(record.issuedAt)} · Renewal was due{" "}
              {fmtDate(record.renewalDate)}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="renew-doc">New document number (optional)</Label>
            <Input
              id="renew-doc"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              placeholder={`Keep current (${record.documentNumber})`}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Items *</Label>
            <ItemsPicker
              items={list}
              quantities={quantities}
              onChange={setQuantities}
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              New renewal date will be set to{" "}
              <strong className="font-semibold">{previewDate}</strong> (
              {renewalMonths} months from today).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Renewing…" : "Confirm Renewal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Manage Items dialog
// ---------------------------------------------------------------------------

function ManageItemsDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (items: UniformItemRecord[]) => void;
}) {
  const [items, setItems] = useState<UniformItemRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<UniformItemRecord[]>("/api/uniform-items");
      setItems(Array.isArray(res) ? res : []);
      onChanged(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load uniform items");
    } finally {
      setLoading(false);
    }
  }, [onChanged]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const addItem = async () => {
    if (!name.trim()) {
      toast.error("Item name is required");
      return;
    }
    setAdding(true);
    try {
      await apiPost<UniformItemRecord>("/api/uniform-items", {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      toast.success(`Item “${name.trim()}” added`);
      setName("");
      setDescription("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Uniform Items</DialogTitle>
          <DialogDescription>
            Catalogue of items that can be issued with a uniform record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : error ? (
            <ErrorState message={error} retry={load} />
          ) : (items ?? []).length === 0 ? (
            <EmptyState
              icon={Shirt}
              title="No uniform items"
              description="Add the first item to the catalogue below."
            />
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {(items ?? []).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    {item.description && (
                      <p className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                  </div>
                  {item.isActive ? (
                    <GenericBadge variant="success">Active</GenericBadge>
                  ) : (
                    <GenericBadge variant="muted">Inactive</GenericBadge>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <p className="text-sm font-medium">Add new item</p>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Item name (e.g. Safety Boots)"
              disabled={adding}
            />
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              disabled={adding}
            />
            <Button size="sm" onClick={addItem} disabled={adding} className="w-full">
              <Plus className="h-4 w-4" />
              {adding ? "Adding…" : "Add Item"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function UniformsView() {
  // list state
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [renewalFilter, setRenewalFilter] = useState<"all" | "upcoming" | "overdue">("all");
  const [page, setPage] = useState(1);
  const [issues, setIssues] = useState<Paged<UniformIssueRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // auxiliary data (fetched once, defensively)
  const [items, setItems] = useState<UniformItemRecord[] | null>(null);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [renewalMonths, setRenewalMonths] = useState(6);

  // dialogs
  const [issueOpen, setIssueOpen] = useState(false);
  const [renewTarget, setRenewTarget] = useState<UniformIssueRecord | null>(null);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UniformIssueRecord | null>(null);

  // debounce search input
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 300);
    return () => clearTimeout(t);
  }, [queryInput]);

  // reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [query, siteFilter, renewalFilter]);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      if (siteFilter !== "all") params.set("siteId", siteFilter);
      if (renewalFilter !== "all") params.set("renewal", renewalFilter);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      const res = await apiGet<Paged<UniformIssueRecord>>(
        `/api/uniform-issues?${params.toString()}`
      );
      setIssues(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load uniform records");
    } finally {
      setLoading(false);
    }
  }, [query, siteFilter, renewalFilter, page]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  // auxiliary data on mount (silent failures — features degrade gracefully)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [itemsRes, sitesRes, settingsRes] = await Promise.allSettled([
        apiGet<UniformItemRecord[]>("/api/uniform-items"),
        apiGet<SiteRecord[]>("/api/sites?includeInactive=true"),
        apiGet<SystemSettings>("/api/settings"),
      ]);
      if (cancelled) return;
      if (itemsRes.status === "fulfilled" && Array.isArray(itemsRes.value))
        setItems(itemsRes.value);
      if (sitesRes.status === "fulfilled" && Array.isArray(sitesRes.value))
        setSites(sitesRes.value);
      if (settingsRes.status === "fulfilled" && settingsRes.value?.uniformRenewalMonths)
        setRenewalMonths(settingsRes.value.uniformRenewalMonths);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeSites = sites.filter((s) => s.isActive);
  const hasFilters = query !== "" || siteFilter !== "all" || renewalFilter !== "all";
  const rows = issues?.data ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-4 p-4 sm:p-6"
    >
      <PageHeader
        icon={Shirt}
        title="Uniform Registry"
        description="Issue, track and renew employee uniforms."
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search token, uniform ID, employee…"
            className="pl-8 pr-8"
          />
          {queryInput && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQueryInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select value={siteFilter} onValueChange={setSiteFilter}>
          <SelectTrigger size="sm" className="w-full sm:w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            {activeSites.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={renewalFilter}
          onValueChange={(v) => setRenewalFilter(v as "all" | "upcoming" | "overdue")}
        >
          <SelectTrigger size="sm" className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All renewals</SelectItem>
            <SelectItem value="upcoming">Upcoming (30 days)</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" onClick={() => setItemsOpen(true)}>
            <PackageOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Manage Items</span>
            <span className="sm:hidden">Items</span>
          </Button>
          <Button onClick={() => setIssueOpen(true)}>
            <Plus className="h-4 w-4" />
            Issue Uniform
          </Button>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <ErrorState message={error} retry={loadIssues} />
      ) : issues === null ? (
        <TableSkeleton rows={6} cols={7} />
      ) : rows.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={Shirt}
            title="No uniform records match"
            description="Try adjusting your search or filters."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQueryInput("");
                  setSiteFilter("all");
                  setRenewalFilter("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Shirt}
            title="No uniform records"
            description="Issue the first uniform to start building the registry."
            action={
              <Button size="sm" onClick={() => setIssueOpen(true)}>
                <Plus className="h-4 w-4" />
                Issue Uniform
              </Button>
            }
          />
        )
      ) : (
        <div className={cn("space-y-4 transition-opacity", loading && "opacity-60")}>
          {/* Desktop table */}
          <div className="hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="pl-4">Uniform ID</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead className="hidden lg:table-cell">Document</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="hidden xl:table-cell">Site</TableHead>
                  <TableHead className="hidden lg:table-cell">Issued</TableHead>
                  <TableHead>Renewal</TableHead>
                  <TableHead className="hidden xl:table-cell">Created by</TableHead>
                  <TableHead className="pr-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold">
                          {r.uniformCode}
                        </span>
                        {r.isRenewal && <RenewedBadge />}
                      </div>
                      <div className="mt-1">
                        <TokenBadge token={r.tokenNumber} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <EmployeeAvatar
                          name={r.employeeName}
                          className="h-8 w-8 text-[10px]"
                        />
                        <div>
                          <p className="max-w-[160px] truncate font-medium leading-tight">
                            {r.employeeName}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {r.employeeCode}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <p className="text-sm">{r.documentType}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {r.documentNumber}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-[240px] flex-wrap gap-1 whitespace-normal">
                        {r.items.map((it) => (
                          <span
                            key={it.itemId}
                            className="inline-flex items-center rounded-md border bg-muted/60 px-1.5 py-0.5 text-[11px]"
                          >
                            {it.name}
                            <span className="ml-1 font-semibold text-muted-foreground">
                              ×{it.quantity}
                            </span>
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {r.siteName ? (
                        <GenericBadge variant="info">{r.siteName}</GenericBadge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">
                      {fmtDate(r.issuedAt)}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{fmtDate(r.renewalDate)}</p>
                      <div className="mt-1">
                        <RenewalStatusChip renewalDate={r.renewalDate} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell max-w-[140px] truncate text-sm text-muted-foreground">
                      {r.createdByName ?? "—"}
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setRenewTarget(r)}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Renew uniform</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                              onClick={() => setDeleteTarget(r)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete record</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <EmployeeAvatar name={r.employeeName} className="h-9 w-9 text-xs" />
                    <div>
                      <p className="font-medium leading-tight">{r.employeeName}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {r.employeeCode}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setRenewTarget(r)}
                      aria-label="Renew uniform"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-rose-600 dark:text-rose-400"
                      onClick={() => setDeleteTarget(r)}
                      aria-label="Delete record"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <TokenBadge token={r.tokenNumber} />
                  {r.isRenewal && <RenewedBadge />}
                  <RenewalStatusChip renewalDate={r.renewalDate} />
                  {r.siteName && <GenericBadge variant="info">{r.siteName}</GenericBadge>}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {r.documentType} · <span className="font-mono">{r.documentNumber}</span> ·{" "}
                  <span className="font-mono">{r.uniformCode}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.items.map((it) => (
                    <span
                      key={it.itemId}
                      className="inline-flex items-center rounded-md border bg-muted/60 px-1.5 py-0.5 text-[11px]"
                    >
                      {it.name}
                      <span className="ml-1 font-semibold text-muted-foreground">
                        ×{it.quantity}
                      </span>
                    </span>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Issued</p>
                    <p className="font-medium">{fmtDate(r.issuedAt)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Renewal date</p>
                    <p className="font-medium">{fmtDate(r.renewalDate)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Created by</p>
                    <p className="font-medium">{r.createdByName ?? "—"}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <DataPagination
            page={issues.page ?? page}
            pageSize={PAGE_SIZE}
            total={issues.total ?? 0}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Dialogs */}
      <IssueUniformDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        items={items}
        sites={sites}
        renewalMonths={renewalMonths}
        onCreated={() => {
          // reset to first page; effect refetches when page changes
          if (page === 1) loadIssues();
          else setPage(1);
        }}
      />

      <RenewUniformDialog
        open={!!renewTarget}
        onOpenChange={(o) => {
          if (!o) setRenewTarget(null);
        }}
        record={renewTarget}
        items={items}
        renewalMonths={renewalMonths}
        onDone={loadIssues}
      />

      <ManageItemsDialog
        open={itemsOpen}
        onOpenChange={setItemsOpen}
        onChanged={setItems}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title={`Delete uniform record ${deleteTarget?.tokenNumber ?? ""}?`}
        description="This permanently removes the uniform record and its items. This cannot be done once the record has been renewed."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await apiDelete(`/api/uniform-issues/${deleteTarget.id}`);
            toast.success(`Uniform record ${deleteTarget.tokenNumber} deleted`);
            setDeleteTarget(null);
            loadIssues();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to delete record");
          }
        }}
      />
    </motion.div>
  );
}

export default UniformsView;
