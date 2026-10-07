"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  Ban,
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { useAppStore } from "@/stores/app-store";
import { EmployeeAvatar } from "@/components/manpower/shared/employee-avatar";
import { GenericBadge } from "@/components/manpower/shared/status-badges";
import { ConfirmDialog } from "@/components/manpower/shared/confirm-dialog";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
} from "@/components/manpower/shared/page-kit";
import type { AdministratorRecord, Role } from "@/types/manpower";

// ---------------------------------------------------------------------------
// Menu permissions model (client mirror of lib/permissions — server enforces)
// ---------------------------------------------------------------------------

const MENU_KEYS: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "employees", label: "Employees" },
  { key: "sites", label: "Sites" },
  { key: "attendance", label: "Attendance" },
  { key: "leave_requests", label: "Leave Requests" },
  { key: "cancellation_requests", label: "Cancellation Requests" },
  { key: "warnings", label: "Warnings" },
  { key: "fines", label: "Fines" },
  { key: "uniform_registry", label: "Uniform Registry" },
  { key: "notifications", label: "Notifications" },
  { key: "administrators", label: "Administrators" },
  { key: "audit_logs", label: "Audit Logs" },
  { key: "settings", label: "Settings" },
];

const ALWAYS_ON = ["dashboard", "uniform_registry"];
const SUPER_ONLY = ["administrators", "audit_logs", "settings"];

function defaultPermissions(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const m of MENU_KEYS) map[m.key] = ALWAYS_ON.includes(m.key);
  return map;
}

function countAllowed(permissions: Record<string, boolean> | undefined): number {
  return MENU_KEYS.filter((m) => permissions?.[m.key] === true).length;
}

// ---------------------------------------------------------------------------
// Permissions grid editor
// ---------------------------------------------------------------------------

function PermissionsGrid({
  value,
  onChange,
}: {
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {MENU_KEYS.map((m) => {
        const lockedOn = ALWAYS_ON.includes(m.key);
        const superOnly = SUPER_ONLY.includes(m.key);
        const disabled = lockedOn || superOnly;
        return (
          <div
            key={m.key}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg border px-3 py-2",
              disabled && "bg-muted/40"
            )}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
              <span className="truncate">{m.label}</span>
              {lockedOn && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>Always enabled</TooltipContent>
                </Tooltip>
              )}
              {superOnly && (
                <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  Super admin only
                </span>
              )}
            </div>
            <Switch
              checked={lockedOn ? true : (value[m.key] ?? false)}
              disabled={disabled}
              onCheckedChange={(v) => onChange({ ...value, [m.key]: v })}
              aria-label={m.label}
            />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: Role }) {
  if (role === "super_admin")
    return (
      <GenericBadge variant="success">
        <span className="inline-flex items-center gap-1">
          <Crown className="h-3 w-3" />
          Super Admin
        </span>
      </GenericBadge>
    );
  return <GenericBadge variant="muted">Admin</GenericBadge>;
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete = "new-password",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-9"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function LockedState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-amber-300/60 bg-amber-50 py-16 text-center dark:border-amber-900/60 dark:bg-amber-950/30">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/60">
        <ShieldAlert className="h-6 w-6 text-amber-600 dark:text-amber-400" />
      </div>
      <p className="font-medium">Super admin only</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function safeDate(value: string): Date | null {
  try {
    const d = parseISO(value);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function AdministratorsView() {
  const user = useAppStore((s) => s.user);
  const isSuper = user?.role === "super_admin";

  const [admins, setAdmins] = useState<AdministratorRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  // create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cRole, setCRole] = useState<Role>("admin");
  const [cPermissions, setCPermissions] = useState<Record<string, boolean>>(
    defaultPermissions()
  );
  const [creating, setCreating] = useState(false);

  // edit dialog
  const [editTarget, setEditTarget] = useState<AdministratorRecord | null>(null);
  const [eName, setEName] = useState("");
  const [eRole, setERole] = useState<Role>("admin");
  const [editing, setEditing] = useState(false);

  // permissions dialog
  const [permTarget, setPermTarget] = useState<AdministratorRecord | null>(null);
  const [permDraft, setPermDraft] = useState<Record<string, boolean>>({});
  const [savingPerms, setSavingPerms] = useState(false);

  // reset password dialog
  const [resetTarget, setResetTarget] = useState<AdministratorRecord | null>(null);
  const [rPassword, setRPassword] = useState("");
  const [rConfirm, setRConfirm] = useState("");
  const [resetting, setResetting] = useState(false);

  // enable / disable confirm
  const [statusTarget, setStatusTarget] = useState<{
    admin: AdministratorRecord;
    next: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLocked(false);
    try {
      const res = await apiGet<AdministratorRecord[]>("/api/administrators");
      setAdmins(Array.isArray(res) ? res : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load administrators";
      if (!isSuper || /permission|forbidden|super/i.test(msg)) {
        setLocked(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [isSuper]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setCName("");
    setCEmail("");
    setCPassword("");
    setCRole("admin");
    setCPermissions(defaultPermissions());
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!cName.trim()) return toast.error("Full name is required");
    if (!/^\S+@\S+\.\S+$/.test(cEmail.trim()))
      return toast.error("Enter a valid email address");
    if (cPassword.length < 8)
      return toast.error("Password must be at least 8 characters");
    setCreating(true);
    try {
      await apiPost<AdministratorRecord>("/api/administrators", {
        fullName: cName.trim(),
        email: cEmail.trim().toLowerCase(),
        password: cPassword,
        role: cRole,
        permissions: cRole === "admin" ? cPermissions : {},
      });
      toast.success(`Administrator “${cName.trim()}” created`);
      setCreateOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create administrator");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (a: AdministratorRecord) => {
    setEditTarget(a);
    setEName(a.fullName);
    setERole(a.role);
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    if (!eName.trim()) return toast.error("Full name is required");
    setEditing(true);
    try {
      await apiPatch<AdministratorRecord>(`/api/administrators/${editTarget.id}`, {
        fullName: eName.trim(),
        role: eRole,
      });
      toast.success("Administrator updated");
      setEditTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update administrator");
    } finally {
      setEditing(false);
    }
  };

  const openPerms = (a: AdministratorRecord) => {
    setPermTarget(a);
    setPermDraft({ ...(a.permissions ?? {}) });
  };

  const submitPerms = async () => {
    if (!permTarget) return;
    setSavingPerms(true);
    try {
      await apiPatch<AdministratorRecord>(`/api/administrators/${permTarget.id}`, {
        permissions: permDraft,
      });
      toast.success(`Permissions updated for ${permTarget.fullName}`);
      setPermTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update permissions");
    } finally {
      setSavingPerms(false);
    }
  };

  const submitReset = async () => {
    if (!resetTarget) return;
    if (rPassword.length < 8)
      return toast.error("Password must be at least 8 characters");
    if (rPassword !== rConfirm) return toast.error("Passwords do not match");
    setResetting(true);
    try {
      await apiPost(`/api/administrators/${resetTarget.id}/reset-password`, {
        password: rPassword,
      });
      toast.success(`Password reset for ${resetTarget.fullName}`);
      setResetTarget(null);
      setRPassword("");
      setRConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setResetting(false);
    }
  };

  const rows = admins ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-4 p-4 sm:p-6"
    >
      <PageHeader
        icon={ShieldCheck}
        title="Administrators"
        description="Manage system users, their roles and menu permissions."
        actions={
          <Button onClick={openCreate}>
            <UserPlus className="h-4 w-4" />
            Add Administrator
          </Button>
        }
      />

      {locked ? (
        <LockedState message="Only the Super Admin can manage administrators. Ask a super admin if you need access." />
      ) : error ? (
        <ErrorState message={error} retry={load} />
      ) : loading ? (
        <TableSkeleton rows={4} cols={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No administrators"
          description="Create the first administrator to help manage the system."
          action={
            <Button size="sm" onClick={openCreate}>
              <UserPlus className="h-4 w-4" />
              Add Administrator
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="pl-4">Admin</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead className="hidden md:table-cell">Last login</TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => {
                const isSelf = a.id === user?.id;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-2.5">
                        <EmployeeAvatar name={a.fullName} className="h-9 w-9 text-xs" />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-medium leading-tight">
                            <span className="max-w-[180px] truncate">{a.fullName}</span>
                            {isSelf && (
                              <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                                you
                              </span>
                            )}
                          </p>
                          <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                            {a.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={a.role} />
                    </TableCell>
                    <TableCell>
                      {isSelf ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-default items-center gap-2">
                              <Switch checked={a.isActive} disabled />
                              <span className="text-xs text-muted-foreground">
                                {a.isActive ? "Active" : "Disabled"}
                              </span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>You cannot change your own status</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex cursor-pointer items-center gap-2">
                              <Switch
                                checked={a.isActive}
                                onCheckedChange={(v) =>
                                  setStatusTarget({ admin: a, next: v })
                                }
                              />
                              <span
                                className={cn(
                                  "text-xs",
                                  a.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                                )}
                              >
                                {a.isActive ? "Active" : "Disabled"}
                              </span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {a.isActive ? "Disable" : "Enable"} this administrator
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.role === "super_admin" ? (
                        <GenericBadge variant="success">Full access</GenericBadge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5 px-2 text-xs"
                          onClick={() => openPerms(a)}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {countAllowed(a.permissions)} menus
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {a.lastLoginAt
                        ? (() => {
                            const d = safeDate(a.lastLoginAt);
                            return d ? (
                              <span title={format(d, "d MMM yyyy, HH:mm")}>
                                {formatDistanceToNow(d, { addSuffix: true })}
                              </span>
                            ) : (
                              "—"
                            );
                          })()
                        : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {(() => {
                        const d = a.createdAt ? safeDate(a.createdAt) : null;
                        return d ? format(d, "d MMM yyyy") : "—";
                      })()}
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => openEdit(a)}>
                              <Pencil className="h-4 w-4" />
                              Edit details
                            </DropdownMenuItem>
                            {a.role === "admin" && (
                              <DropdownMenuItem onClick={() => openPerms(a)}>
                                <ShieldCheck className="h-4 w-4" />
                                Permissions
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setResetTarget(a)}>
                              <KeyRound className="h-4 w-4" />
                              Reset password
                            </DropdownMenuItem>
                            {!isSelf && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className={
                                    a.isActive
                                      ? "text-rose-600 focus:text-rose-700 dark:text-rose-400 dark:focus:text-rose-300"
                                      : "text-emerald-600 focus:text-emerald-700 dark:text-emerald-400 dark:focus:text-emerald-300"
                                  }
                                  onClick={() =>
                                    setStatusTarget({ admin: a, next: !a.isActive })
                                  }
                                >
                                  {a.isActive ? (
                                    <>
                                      <Ban className="h-4 w-4" />
                                      Disable
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="h-4 w-4" />
                                      Enable
                                    </>
                                  )}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Administrator</DialogTitle>
            <DialogDescription>
              Create a new system user with a role and menu permissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Full name *</Label>
                <Input
                  id="c-name"
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  placeholder="e.g. Sara Al-Harbi"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email *</Label>
                <Input
                  id="c-email"
                  type="email"
                  value={cEmail}
                  onChange={(e) => setCEmail(e.target.value)}
                  placeholder="name@company.com"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-password">Password *</Label>
                <PasswordInput
                  id="c-password"
                  value={cPassword}
                  onChange={setCPassword}
                  placeholder="Min. 8 characters"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role *</Label>
                <Select value={cRole} onValueChange={(v) => setCRole(v as Role)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {cRole === "admin" && (
              <div className="space-y-1.5">
                <Label>Menu permissions</Label>
                <PermissionsGrid value={cPermissions} onChange={setCPermissions} />
                <p className="text-xs text-muted-foreground">
                  {countAllowed(cPermissions)} of {MENU_KEYS.length} menus enabled.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {creating ? "Creating…" : "Create Administrator"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Administrator</DialogTitle>
            <DialogDescription>
              Update the name or role of this system user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="e-name">Full name *</Label>
              <Input
                id="e-name"
                value={eName}
                onChange={(e) => setEName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-email">Email</Label>
              <Input id="e-email" value={editTarget?.email ?? ""} disabled />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed after creation.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              {editTarget?.id === user?.id ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Select value={eRole} onValueChange={() => {}}>
                        <SelectTrigger className="w-full" disabled>
                          <SelectValue />
                        </SelectTrigger>
                      </Select>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>You cannot change your own role</TooltipContent>
                </Tooltip>
              ) : (
                <Select value={eRole} onValueChange={(v) => setERole(v as Role)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editing}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={editing}>
              {editing && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions dialog */}
      <Dialog
        open={!!permTarget}
        onOpenChange={(o) => {
          if (!o) setPermTarget(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Permissions — {permTarget?.fullName}</DialogTitle>
            <DialogDescription>
              Choose which menus this administrator can access. Some menus are always
              enabled or reserved for the Super Admin.
            </DialogDescription>
          </DialogHeader>
          <PermissionsGrid value={permDraft} onChange={setPermDraft} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermTarget(null)} disabled={savingPerms}>
              Cancel
            </Button>
            <Button onClick={submitPerms} disabled={savingPerms}>
              {savingPerms && <Loader2 className="h-4 w-4 animate-spin" />}
              {savingPerms ? "Saving…" : "Save Permissions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(o) => {
          if (!o) {
            setResetTarget(null);
            setRPassword("");
            setRConfirm("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for{" "}
              <span className="font-medium text-foreground">{resetTarget?.fullName}</span> (
              {resetTarget?.email}). They will use it on next sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="r-password">New password *</Label>
              <PasswordInput
                id="r-password"
                value={rPassword}
                onChange={setRPassword}
                placeholder="Min. 8 characters"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-confirm">Confirm password *</Label>
              <PasswordInput
                id="r-confirm"
                value={rConfirm}
                onChange={setRConfirm}
                placeholder="Repeat the new password"
              />
              {rConfirm.length > 0 && rPassword !== rConfirm && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  Passwords do not match
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResetTarget(null);
                setRPassword("");
                setRConfirm("");
              }}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button onClick={submitReset} disabled={resetting}>
              {resetting && <Loader2 className="h-4 w-4 animate-spin" />}
              {resetting ? "Resetting…" : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enable / disable confirm */}
      <ConfirmDialog
        open={!!statusTarget}
        onOpenChange={(o) => {
          if (!o) setStatusTarget(null);
        }}
        title={
          statusTarget
            ? statusTarget.next
              ? `Enable ${statusTarget.admin.fullName}?`
              : `Disable ${statusTarget.admin.fullName}?`
            : ""
        }
        description={
          statusTarget?.next
            ? `${statusTarget.admin.fullName} will regain access and be able to sign in again.`
            : `${statusTarget?.admin.fullName ?? "This administrator"} will no longer be able to sign in until re-enabled. Their history is preserved.`
        }
        confirmLabel={statusTarget?.next ? "Enable" : "Disable"}
        destructive={!statusTarget?.next}
        onConfirm={async () => {
          if (!statusTarget) return;
          try {
            await apiPatch<AdministratorRecord>(
              `/api/administrators/${statusTarget.admin.id}`,
              { isActive: statusTarget.next }
            );
            toast.success(
              `${statusTarget.admin.fullName} ${statusTarget.next ? "enabled" : "disabled"}`
            );
            setStatusTarget(null);
            load();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to update status");
          }
        }}
      />
    </motion.div>
  );
}

export default AdministratorsView;
