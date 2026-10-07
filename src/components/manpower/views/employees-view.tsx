"use client";

/**
 * EmployeesView — searchable, filterable, paginated employee directory.
 * Desktop: sticky-header table. Mobile: card list. Rich profile dialog,
 * create/edit form, site assignment, PDF downloads and WhatsApp sharing.
 */

import { motion } from "framer-motion";
import {
  ArrowDownWideNarrow,
  ArrowRightLeft,
  ArrowUpNarrowWide,
  ChevronRight,
  FileDown,
  FileText,
  Loader2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EmployeeAvatar } from "@/components/manpower/shared/employee-avatar";
import { RatingStars } from "@/components/manpower/shared/rating-stars";
import { ConfirmDialog } from "@/components/manpower/shared/confirm-dialog";
import {
  EmptyState,
  ErrorState,
  DataPagination,
  PageHeader,
  TableSkeleton,
} from "@/components/manpower/shared/page-kit";
import {
  EmployeeStatusBadge,
  WorkStatusBadge,
} from "@/components/manpower/shared/status-badges";
import { EmployeeFormDialog } from "@/components/manpower/views/employee-form-dialog";
import {
  AssignSiteDialog,
  EmployeeProfileDialog,
  useEmployeeDownloads,
  whatsappSummaryText,
} from "@/components/manpower/views/employee-profile-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet } from "@/lib/api-client";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import type {
  EmployeeDetail,
  EmployeeListResponse,
  EmployeeRow,
  EmployeeStatus,
  SiteRecord,
} from "@/types/manpower";

const PAGE_SIZE = 10;

type StatusFilter = EmployeeStatus | "all";
type SortBy = "employeeCode" | "fullName" | "rating" | "joinDate";

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "employeeCode", label: "ID" },
  { value: "fullName", label: "Name" },
  { value: "rating", label: "Rating" },
  { value: "joinDate", label: "Join date" },
];

const SITE_BADGE_CLASS =
  "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-300";

export function EmployeesView() {
  // ---- employeesPreset (e.g. dashboard site card deep-link), consumed once ----
  const setEmployeesPreset = useAppStore((s) => s.setEmployeesPreset);
  const [query, setQuery] = useState(
    () => useAppStore.getState().employeesPreset?.query ?? ""
  );
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [siteFilter, setSiteFilter] = useState(
    () => useAppStore.getState().employeesPreset?.siteId ?? "all"
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () =>
      (useAppStore.getState().employeesPreset?.status as StatusFilter | undefined) ??
      "active"
  );
  const [sortBy, setSortBy] = useState<SortBy>("employeeCode");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setEmployeesPreset(null);
  }, [setEmployeesPreset]);

  // ---- data ----
  const [data, setData] = useState<EmployeeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const reqRef = useRef(0);

  const fetchEmployees = useCallback(async () => {
    const id = ++reqRef.current;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("query", debouncedQuery.trim());
    if (siteFilter !== "all") params.set("siteId", siteFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    try {
      const res = await apiGet<EmployeeListResponse>(
        `/api/employees?${params.toString()}`
      );
      if (reqRef.current !== id) return;
      setData(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (err) {
      if (reqRef.current !== id) return;
      const message =
        err instanceof Error ? err.message : "Failed to load employees";
      setError(message);
      toast.error(message);
    } finally {
      if (reqRef.current === id) setLoading(false);
    }
  }, [debouncedQuery, siteFilter, statusFilter, sortBy, sortDir, page]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    apiGet<SiteRecord[]>("/api/sites?includeInactive=true")
      .then((all) => setSites(all.filter((s) => s.isActive)))
      .catch(() => setSites([]));
  }, []);

  // debounce the search box (350ms) + reset page while typing
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  // clamp page when the result set shrinks
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [total, page]);

  const filtersActive =
    debouncedQuery.trim() !== "" || siteFilter !== "all" || statusFilter !== "active";

  const resetFilters = () => {
    setQuery("");
    setDebouncedQuery("");
    setSiteFilter("all");
    setStatusFilter("active");
    setPage(1);
  };

  // ---- dialogs ----
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<EmployeeDetail | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignRow, setAssignRow] = useState<EmployeeRow | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareRow, setShareRow] = useState<EmployeeRow | null>(null);

  const { busy: downloading, downloadCV, downloadReport } = useEmployeeDownloads();

  const openProfile = (id: string) => {
    setProfileId(id);
    setProfileOpen(true);
  };

  const openCreate = () => {
    setEditEmployee(null);
    setFormOpen(true);
  };

  const openEdit = async (row: EmployeeRow) => {
    setEditLoading(true);
    try {
      const detail = await apiGet<EmployeeDetail>(`/api/employees/${row.id}`);
      setEditEmployee(detail);
      setFormOpen(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load employee details"
      );
    } finally {
      setEditLoading(false);
    }
  };

  const openAssign = (row: EmployeeRow) => {
    setAssignRow(row);
    setAssignOpen(true);
  };

  const openShare = (row: EmployeeRow) => {
    setShareRow(row);
    setShareOpen(true);
  };

  // ---- render helpers ----
  const showSkeleton = loading && data.length === 0;
  const showError = error !== null && data.length === 0 && !loading;
  const showEmpty = !loading && !error && data.length === 0;

  const siteCell = (row: EmployeeRow) =>
    row.siteName ? (
      <Badge variant="outline" className={cn("max-w-[170px]", SITE_BADGE_CLASS)}>
        <MapPin className="shrink-0" />
        <span className="truncate">{row.siteName}</span>
      </Badge>
    ) : (
      <span className="text-xs italic text-muted-foreground">Idle</span>
    );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-4 p-4 sm:p-6"
    >
      <PageHeader
        icon={Users}
        title="Employees"
        description={
          loading && data.length === 0
            ? "Loading employees…"
            : `${total} ${total === 1 ? "employee" : "employees"}${
                filtersActive ? " matching filters" : ""
              }`
        }
        actions={
          <Button onClick={openCreate}>
            <Plus />
            Add employee
          </Button>
        }
      />

      {/* ---- filter bar ---- */}
      <Card className="gap-0 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, ID, phone, nationality, position, company…"
              className="pl-8"
              autoComplete="off"
            />
          </div>

          <Select
            value={siteFilter}
            onValueChange={(v) => {
              setSiteFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Site" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              <SelectItem value="idle">Idle (no site)</SelectItem>
              {sites.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as StatusFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending_deletion">Pending deletion</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sortBy}
            onValueChange={(v) => {
              setSortBy(v as SortBy);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            title={sortDir === "asc" ? "Ascending — switch to descending" : "Descending — switch to ascending"}
            onClick={() => {
              setSortDir((d) => (d === "asc" ? "desc" : "asc"));
              setPage(1);
            }}
          >
            {sortDir === "asc" ? (
              <ArrowUpNarrowWide className="h-4 w-4" />
            ) : (
              <ArrowDownWideNarrow className="h-4 w-4" />
            )}
          </Button>

          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X />
              Reset
            </Button>
          )}
        </div>
      </Card>

      {/* ---- content ---- */}
      {showSkeleton ? (
        <>
          <div className="hidden md:block rounded-xl border bg-card p-3">
            <TableSkeleton rows={6} cols={7} />
          </div>
          <div className="space-y-2 md:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
            ))}
          </div>
        </>
      ) : showError ? (
        <ErrorState message={error ?? "Failed to load employees"} retry={fetchEmployees} />
      ) : showEmpty ? (
        <EmptyState
          icon={filtersActive ? Search : Users}
          title="No employees found"
          description={
            filtersActive
              ? "No employees match the current filters. Try adjusting or clearing them."
              : "Get started by registering your first employee."
          }
          action={
            filtersActive ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                <X />
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={openCreate}>
                <UserPlus />
                Add employee
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden md:block rounded-xl border bg-card [&_[data-slot=table-container]]:max-h-[62vh] [&_[data-slot=table-container]]:overflow-y-auto">
            <div className={cn(loading && "pointer-events-none opacity-60")}>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky top-0 z-10 border-b bg-card">Employee</TableHead>
                    <TableHead className="sticky top-0 z-10 hidden border-b bg-card lg:table-cell">
                      Nationality
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 border-b bg-card">Position</TableHead>
                    <TableHead className="sticky top-0 z-10 hidden border-b bg-card xl:table-cell">
                      Company
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 border-b bg-card">Site</TableHead>
                    <TableHead className="sticky top-0 z-10 hidden border-b bg-card xl:table-cell">
                      Team Leader
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 border-b bg-card">Rating</TableHead>
                    <TableHead className="sticky top-0 z-10 border-b bg-card">Status</TableHead>
                    <TableHead className="sticky top-0 z-10 w-12 border-b bg-card" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => (
                    <TableRow key={row.id} className="group">
                      <TableCell className="py-2.5">
                        <button
                          type="button"
                          className="flex items-center gap-2.5 text-left"
                          onClick={() => openProfile(row.id)}
                          title="View profile"
                        >
                          <EmployeeAvatar
                            name={row.fullName}
                            photoUrl={row.photoUrl}
                            className="h-9 w-9"
                          />
                          <span className="min-w-0">
                            <span className="block max-w-[180px] truncate text-sm font-medium transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                              {row.fullName}
                            </span>
                            <span className="block font-mono text-[11px] text-muted-foreground">
                              {row.employeeCode}
                            </span>
                          </span>
                        </button>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {row.nationality}
                      </TableCell>
                      <TableCell className="text-sm">{row.position}</TableCell>
                      <TableCell className="hidden max-w-[150px] truncate text-sm text-muted-foreground xl:table-cell">
                        {row.companyName ?? "—"}
                      </TableCell>
                      <TableCell>{siteCell(row)}</TableCell>
                      <TableCell className="hidden max-w-[130px] truncate text-sm text-muted-foreground xl:table-cell">
                        {row.teamLeaderName ?? "—"}
                      </TableCell>
                      <TableCell>
                        <RatingStars value={row.rating} size={13} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <EmployeeStatusBadge status={row.status} />
                          {row.status !== "deleted" && (
                            <WorkStatusBadge working={!!row.siteId} />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem onClick={() => openProfile(row.id)}>
                              <User />
                              View profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(row)}>
                              {editLoading ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <Pencil />
                              )}
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openAssign(row)}>
                              <ArrowRightLeft />
                              Assign to site…
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={downloading !== null}
                              onClick={() => downloadCV(row.id)}
                            >
                              {downloading === "cv" ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <FileDown />
                              )}
                              Download CV (PDF)
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={downloading !== null}
                              onClick={() => downloadReport(row.id)}
                            >
                              {downloading === "report" ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <FileText />
                              )}
                              Download report (PDF)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openShare(row)}>
                              <MessageCircle />
                              Share via WhatsApp
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* mobile card list */}
          <div className="space-y-2 md:hidden">
            <div className={cn(loading && "pointer-events-none opacity-60")}>
              {data.map((row, i) => (
                <motion.button
                  key={row.id}
                  type="button"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.2) }}
                  onClick={() => openProfile(row.id)}
                  className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted"
                >
                  <EmployeeAvatar
                    name={row.fullName}
                    photoUrl={row.photoUrl}
                    className="h-11 w-11"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{row.fullName}</p>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.employeeCode} • {row.position}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {siteCell(row)}
                      <EmployeeStatusBadge status={row.status} />
                    </div>
                    <div className="mt-1">
                      <RatingStars value={row.rating} size={12} />
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          <DataPagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}

      {/* ---- dialogs ---- */}
      <EmployeeProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        employeeId={profileId}
        onEdited={fetchEmployees}
      />

      <EmployeeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        employee={editEmployee}
        onSaved={fetchEmployees}
      />

      <AssignSiteDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        employee={
          assignRow
            ? {
                id: assignRow.id,
                fullName: assignRow.fullName,
                employeeCode: assignRow.employeeCode,
                currentSiteId: assignRow.siteId,
              }
            : null
        }
        onAssigned={fetchEmployees}
      />

      <ConfirmDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Share via WhatsApp?"
        description="This will open WhatsApp with the employee's basic details (name, ID, position, nationality, site, rating). Private documents are NOT included. Continue?"
        confirmLabel="Continue"
        destructive={false}
        onConfirm={async () => {
          const row = shareRow;
          if (!row) return;
          window.open(
            `https://wa.me/?text=${encodeURIComponent(
              whatsappSummaryText({
                fullName: row.fullName,
                employeeCode: row.employeeCode,
                position: row.position,
                nationality: row.nationality,
                siteName: row.siteName,
                rating: row.rating,
                companyName: row.companyName,
              })
            )}`,
            "_blank"
          );
        }}
      />
    </motion.div>
  );
}

export default EmployeesView;
