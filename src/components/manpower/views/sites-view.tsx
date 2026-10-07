"use client";

/**
 * SitesView — responsive card grid of project sites with add/edit,
 * team-leader assignment, deactivate/activate and guarded delete.
 */

import { motion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  Loader2,
  MapPin,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  PowerOff,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/manpower/shared/confirm-dialog";
import { EmployeeAvatar } from "@/components/manpower/shared/employee-avatar";
import {
  EmptyState,
  ErrorState,
  PageHeader,
} from "@/components/manpower/shared/page-kit";
import { SiteStatusBadge } from "@/components/manpower/shared/status-badges";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Switch } from "@/components/ui/switch";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import type { EmployeeRow, SiteRecord } from "@/types/manpower";

// ---------------------------------------------------------------------------
// small field helper
// ---------------------------------------------------------------------------

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// add / edit site dialog
// ---------------------------------------------------------------------------

function SiteFormDialog({
  open,
  onOpenChange,
  site,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create mode */
  site: SiteRecord | null;
  onSaved?: () => void;
}) {
  const isEdit = !!site;
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(site?.name ?? "");
    setClientName(site?.clientName ?? "");
    setProjectName(site?.projectName ?? "");
    setIsActive(site?.isActive ?? true);
    setTouched(false);
  }, [open, site]);

  const nameError =
    touched && name.trim().length < 2 ? "Site name is required" : undefined;
  const clientError =
    touched && clientName.trim().length < 2 ? "Client name is required" : undefined;
  const valid = !nameError && !clientError && name.trim() && clientName.trim();

  const submit = async () => {
    setTouched(true);
    if (!valid || busy) return;
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        clientName: clientName.trim(),
        projectName: projectName.trim(),
        ...(isEdit ? { isActive } : {}),
      };
      if (isEdit && site) {
        await apiPatch<SiteRecord>(`/api/sites/${site.id}`, payload);
      } else {
        await apiPost<SiteRecord>("/api/sites", payload);
      }
      toast.success(
        isEdit ? `${name.trim()} updated` : `Site “${name.trim()}” created`
      );
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save site");
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
          <DialogTitle>{isEdit ? "Edit site" : "Add site"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update the details of ${site?.name}.`
              : "Create a new project site. Employees can be assigned once it exists."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Site name" required error={nameError}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Riviera Tower — Site A"
              autoComplete="off"
            />
          </Field>
          <Field label="Client name" required error={clientError}>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Al-Rashid Group"
              autoComplete="off"
            />
          </Field>
          <Field label="Project name">
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Riviera Tower Construction"
              autoComplete="off"
            />
          </Field>

          {isEdit && (
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">
                  Deactivating unassigns employees and keeps history. You can also
                  toggle this from the site card.
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create site"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// team leader dialog
// ---------------------------------------------------------------------------

function SiteLeaderDialog({
  open,
  onOpenChange,
  site,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: SiteRecord | null;
  onSaved?: () => void;
}) {
  const [employees, setEmployees] = useState<EmployeeRow[] | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);

  useEffect(() => {
    if (!open || !site) return;
    setSelected("");
    setEmployees(null);
    let cancelled = false;
    apiGet<EmployeeRow[]>(`/api/sites/${site.id}/employees`)
      .then((rows) => {
        if (!cancelled) setEmployees(rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setEmployees([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, site]);

  const assign = async () => {
    if (!site || !selected || busy) return;
    setBusy(true);
    try {
      await apiPatch<SiteRecord>(`/api/sites/${site.id}`, {
        teamLeaderId: selected,
      });
      const emp = (employees ?? []).find((e) => e.id === selected);
      toast.success(
        `${emp?.fullName ?? "Employee"} is now team leader of ${site.name}`
      );
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign leader");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!site || busy) return;
    setBusy(true);
    try {
      await apiPatch<SiteRecord>(`/api/sites/${site.id}`, { teamLeaderId: null });
      toast.success(`Team leadership removed from ${site.name}`);
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove leader");
    } finally {
      setBusy(false);
    }
  };

  const tryAssign = () => {
    if (site?.teamLeaderId) {
      setReplaceOpen(true); // spec §13: confirm before replacing a leader
    } else {
      assign();
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!busy) onOpenChange(o);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-emerald-600" />
              Team leader
            </DialogTitle>
            <DialogDescription>
              {site
                ? `${site.name} — one leader per site; the leader must be assigned to this site.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {site?.teamLeaderName && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Current leader:{" "}
                <span className="font-semibold">{site.teamLeaderName}</span>
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={remove}
                className="h-7"
              >
                Remove
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Assign leader</Label>
            <Select value={selected} onValueChange={setSelected} disabled={busy}>
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    employees === null ? "Loading employees…" : "Select employee"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(employees ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.fullName} ({e.employeeCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {employees !== null && employees.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No employees assigned to this site yet — assign employees first.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={tryAssign}
              disabled={busy || !selected || (employees?.length ?? 0) === 0}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Assign leader
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={replaceOpen}
        onOpenChange={setReplaceOpen}
        title="Replace current leader?"
        description={`This site already has a team leader (${
          site?.teamLeaderName ?? "—"
        }). Assigning a new leader will replace them. Continue?`}
        confirmLabel="Replace leader"
        destructive={false}
        onConfirm={assign}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// site card
// ---------------------------------------------------------------------------

function SiteCard({
  site,
  index,
  busy,
  onEdit,
  onAssignLeader,
  onDeactivate,
  onActivate,
  onDelete,
  onViewEmployees,
}: {
  site: SiteRecord;
  index: number;
  busy: boolean;
  onEdit: (site: SiteRecord) => void;
  onAssignLeader: (site: SiteRecord) => void;
  onDeactivate: (site: SiteRecord) => void;
  onActivate: (site: SiteRecord) => void;
  onDelete: (site: SiteRecord) => void;
  onViewEmployees: (site: SiteRecord) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.3) }}
      className="h-full"
    >
      <Card
        className={cn(
          "h-full gap-4 p-4 sm:p-5",
          !site.isActive && "opacity-75 grayscale-[35%]"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-semibold leading-tight">{site.name}</h3>
              <p
                className="mt-0.5 truncate text-xs text-muted-foreground"
                title={`${site.clientName} • ${site.projectName}`}
              >
                {site.clientName} • {site.projectName}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <SiteStatusBadge isActive={site.isActive} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Site actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => onEdit(site)}>
                  <Pencil />
                  Edit
                </DropdownMenuItem>
                {site.isActive && (
                  <DropdownMenuItem onClick={() => onAssignLeader(site)}>
                    <UserCog />
                    Team leader…
                  </DropdownMenuItem>
                )}
                {site.isActive ? (
                  <DropdownMenuItem onClick={() => onDeactivate(site)}>
                    <PowerOff />
                    Deactivate
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    disabled={busy}
                    onClick={() => onActivate(site)}
                  >
                    {busy ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Play />
                    )}
                    Activate
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDelete(site)}
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {site.teamLeaderName ? (
            <>
              <EmployeeAvatar
                name={site.teamLeaderName}
                className="h-8 w-8 text-[10px]"
              />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Team leader
                </p>
                <p className="truncate text-sm font-medium">
                  {site.teamLeaderName}
                </p>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed">
                <UserCog className="h-4 w-4" />
              </div>
              <span>No team leader assigned</span>
            </div>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold tabular-nums">{site.employeeCount}</span>
            <span className="text-xs text-muted-foreground">
              {site.employeeCount === 1 ? "employee" : "employees"}
            </span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
            onClick={() => onViewEmployees(site)}
          >
            View
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// view
// ---------------------------------------------------------------------------

export function SitesView() {
  const navigate = useAppStore((s) => s.navigate);
  const setEmployeesPreset = useAppStore((s) => s.setEmployeesPreset);

  const [sites, setSites] = useState<SiteRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editSite, setEditSite] = useState<SiteRecord | null>(null);
  const [leaderOpen, setLeaderOpen] = useState(false);
  const [leaderSite, setLeaderSite] = useState<SiteRecord | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<SiteRecord | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SiteRecord | null>(null);

  const fetchSites = useCallback(async () => {
    setError(null);
    try {
      const all = await apiGet<SiteRecord[]>("/api/sites?includeInactive=true");
      setSites(all ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load sites";
      setError(message);
      toast.error(message);
    }
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  const activate = async (site: SiteRecord) => {
    if (busyId) return;
    setBusyId(site.id);
    try {
      await apiPost(`/api/sites/${site.id}/activate`);
      toast.success(`${site.name} re-activated`);
      await fetchSites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to activate site");
    } finally {
      setBusyId(null);
    }
  };

  const viewEmployees = (site: SiteRecord) => {
    setEmployeesPreset({ siteId: site.id });
    navigate("employees");
  };

  const sorted = [...(sites ?? [])].sort(
    (a, b) =>
      Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)
  );
  const activeCount = (sites ?? []).filter((s) => s.isActive).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-4 p-4 sm:p-6"
    >
      <PageHeader
        icon={MapPin}
        title="Sites"
        description={
          sites === null
            ? "Loading sites…"
            : `${sites.length} ${sites.length === 1 ? "site" : "sites"} • ${activeCount} active`
        }
        actions={
          <Button
            onClick={() => {
              setEditSite(null);
              setFormOpen(true);
            }}
          >
            <Plus />
            Add site
          </Button>
        }
      />

      {sites === null && !error ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[190px] rounded-xl" />
          ))}
        </div>
      ) : error && !sites ? (
        <ErrorState message={error} retry={fetchSites} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No sites yet"
          description="Create your first project site to start assigning employees."
          action={
            <Button
              size="sm"
              onClick={() => {
                setEditSite(null);
                setFormOpen(true);
              }}
            >
              <Plus />
              Add site
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((site, i) => (
            <SiteCard
              key={site.id}
              site={site}
              index={i}
              busy={busyId === site.id}
              onEdit={(s) => {
                setEditSite(s);
                setFormOpen(true);
              }}
              onAssignLeader={(s) => {
                setLeaderSite(s);
                setLeaderOpen(true);
              }}
              onDeactivate={(s) => {
                setDeactivateTarget(s);
                setDeactivateOpen(true);
              }}
              onActivate={activate}
              onDelete={(s) => {
                setDeleteTarget(s);
                setDeleteOpen(true);
              }}
              onViewEmployees={viewEmployees}
            />
          ))}
        </div>
      )}

      {/* ---- dialogs ---- */}
      <SiteFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        site={editSite}
        onSaved={fetchSites}
      />

      <SiteLeaderDialog
        open={leaderOpen}
        onOpenChange={setLeaderOpen}
        site={leaderSite}
        onSaved={fetchSites}
      />

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title={`Deactivate ${deactivateTarget?.name ?? "site"}?`}
        description={
          <span>
            This will unassign{" "}
            <strong>{deactivateTarget?.employeeCount ?? 0}</strong> employee(s) and
            remove team leadership. Historical attendance and records are
            preserved. The site can be re-activated later.
          </span>
        }
        confirmLabel="Deactivate"
        onConfirm={async () => {
          const site = deactivateTarget;
          if (!site) return;
          try {
            const res = await apiPost<{ reassignedEmployees: number }>(
              `/api/sites/${site.id}/deactivate`
            );
            toast.success(
              `${site.name} deactivated — ${
                res?.reassignedEmployees ?? 0
              } employee(s) are now idle`
            );
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to deactivate site"
            );
          } finally {
            fetchSites();
          }
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${deleteTarget?.name ?? "site"}?`}
        description="This permanently removes the site. Only sites with no assignment history can be deleted — if this site was ever used, deactivate it instead. This action cannot be undone."
        confirmLabel="Delete site"
        onConfirm={async () => {
          const site = deleteTarget;
          if (!site) return;
          try {
            await apiDelete(`/api/sites/${site.id}`);
            toast.success(`${site.name} deleted`);
          } catch (err) {
            // 409 when the site has history — surface the server explanation
            toast.error(err instanceof Error ? err.message : "Failed to delete site");
          } finally {
            fetchSites();
          }
        }}
      />
    </motion.div>
  );
}

export default SitesView;
