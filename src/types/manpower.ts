/**
 * ASM Manpower Management System — shared API types.
 * This file is the single source of truth for the API contract between
 * backend route handlers and frontend views.
 */

// ---------------------------------------------------------------------------
// Auth / users
// ---------------------------------------------------------------------------

export type Role = "super_admin" | "admin";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  permissions: Record<string, boolean>;
};

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export type EmployeeStatus = "active" | "pending_deletion" | "deleted";

export type EmployeeListFilters = {
  query?: string;
  siteId?: string; // site id or "idle"
  status?: EmployeeStatus | "all";
  sortBy?: "employeeCode" | "fullName" | "rating" | "joinDate";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type EmployeeRow = {
  id: string;
  employeeCode: string;
  fullName: string;
  nationality: string;
  position: string;
  companyName: string | null;
  rating: number;
  status: EmployeeStatus;
  siteId: string | null;
  siteName: string | null;
  teamLeaderName: string | null;
  phone: string | null;
  photoUrl: string | null;
};

export type EmployeeListResponse = {
  data: EmployeeRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type EmployeeSiteHistoryEntry = {
  id: string;
  siteId: string;
  siteName: string;
  startDate: string;
  endDate: string | null;
  reason: string | null;
  createdByName: string | null;
};

export type EmployeeProfile = {
  id: string;
  employeeCode: string;
  fullName: string;
  nationality: string;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergencyContact: string | null;
  position: string;
  joinDate: string | null;
  companyName: string | null;
  passportNumberMasked: string | null;
  passportStatus: string | null;
  idNumberMasked: string | null;
  idStatus: string | null;
  photoUrl: string | null;
  rating: number;
  status: EmployeeStatus;
  currentSiteId: string | null;
  currentSiteName: string | null;
  teamLeaderName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeDetail = EmployeeProfile & {
  siteHistory: EmployeeSiteHistoryEntry[];
  warningsCount: number;
  finesCount: number;
  leaveCount: number;
  uniformCount: number;
};

export type EmployeeInput = {
  fullName: string;
  nationality: string;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  position: string;
  joinDate?: string | null;
  companyName?: string | null;
  passportNumber?: string | null;
  passportStatus?: string | null;
  idNumber?: string | null;
  idStatus?: string | null;
  photoUrl?: string | null;
  siteId?: string | null;
};

export type AttendanceSummary = {
  present: number;
  absent: number;
  leave: number;
  overtime: number;
  overtimeHours: number;
  noSite: number;
  notMarked: number;
  totalMarked: number;
};

export type EmployeeReport = {
  employee: EmployeeProfile;
  attendanceSummary: AttendanceSummary;
  warnings: WarningRecord[];
  fines: FineRecord[];
  uniforms: UniformIssueRecord[];
  leaveHistory: LeaveRequestRecord[];
  siteHistory: EmployeeSiteHistoryEntry[];
};

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

export type SiteRecord = {
  id: string;
  name: string;
  clientName: string;
  projectName: string;
  isActive: boolean;
  teamLeaderId: string | null;
  teamLeaderName: string | null;
  employeeCount: number;
  createdAt: string;
};

export type SiteInput = {
  name: string;
  clientName: string;
  projectName: string;
  isActive?: boolean;
  teamLeaderId?: string | null;
};

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export type AttendanceStatus =
  | "present"
  | "absent"
  | "no_site"
  | "overtime"
  | "not_marked"
  | "leave"
  | "holiday";

export type DayStatus = {
  status: AttendanceStatus;
  overtimeHours: number | null;
  notes: string | null;
};

export type AttendanceRow = {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  position: string;
  nationality: string;
  siteId: string | null;
  siteName: string | null;
  /** key = day-of-month (1..31) */
  days: Record<string, DayStatus>;
};

export type AttendanceMonthResponse = {
  data: AttendanceRow[];
  total: number;
  page: number;
  pageSize: number;
  month: string; // YYYY-MM
  daysInMonth: number;
  summary: { status: AttendanceStatus; count: number }[];
};

export type AttendanceUpsertInput = {
  employeeId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  overtimeHours?: number | null;
  notes?: string | null;
};

export type AttendanceBulkInput = {
  siteId?: string | null;
  employeeIds?: string[];
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  overtimeHours?: number | null;
};

export type AttendanceTrendPoint = {
  date: string;
  present: number;
  absent: number;
  leave: number;
  overtime: number;
};

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

export type LeaveType = "casual" | "sick" | "annual" | "emergency" | "marriage" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LeaveRequestRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  leaveType: LeaveType;
  otherType: string | null;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  status: LeaveStatus;
  createdByName: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type LeaveRequestInput = {
  employeeId: string;
  leaveType: LeaveType;
  otherType?: string | null;
  startDate: string;
  endDate: string;
  reason?: string | null;
};

// ---------------------------------------------------------------------------
// Warnings / Fines
// ---------------------------------------------------------------------------

export type WarningRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  reason: string;
  isAutoGenerated: boolean;
  absentDates: string[];
  ratingPenalty: number;
  createdByName: string | null;
  createdAt: string;
};

export type FineRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  reason: string;
  amount: number;
  currency: string;
  ratingPenalty: number;
  createdByName: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Cancellation requests
// ---------------------------------------------------------------------------

export type CancellationStatus = "pending" | "approved" | "rejected";

export type CancellationRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeeSiteName: string | null;
  reason: string;
  status: CancellationStatus;
  requestedByName: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Uniforms
// ---------------------------------------------------------------------------

export type UniformItemRecord = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

export type UniformIssueRecord = {
  id: string;
  uniformCode: string;
  tokenNumber: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  documentType: string;
  documentNumber: string;
  siteId: string | null;
  siteName: string | null;
  teamLeaderName: string | null;
  isRenewal: boolean;
  previousIssueId: string | null;
  issuedAt: string;
  renewalDate: string;
  createdByName: string | null;
  items: { itemId: string; name: string; quantity: number }[];
};

export type UniformIssueInput = {
  employeeId: string;
  documentType: string;
  documentNumber: string;
  siteId?: string | null;
  items: { itemId: string; quantity: number }[];
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationRecord = {
  id: string;
  type: string;
  title: string;
  message: string;
  referenceType: string | null;
  referenceId: string | null;
  read: boolean;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Administrators / audit / settings
// ---------------------------------------------------------------------------

export type AdministratorRecord = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  permissions: Record<string, boolean>;
  lastLoginAt: string | null;
  createdAt: string;
};

export type AuditLogRecord = {
  id: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: string | null;
  after: string | null;
  createdAt: string;
};

export type SystemSettings = {
  companyName: string;
  companyLogo: string;
  companyAddress: string;
  companyPhone: string;
  currency: string;
  timezone: string;
  employeeIdPrefix: string;
  warningRatingPenalty: number;
  fineRatingPenalty: number;
  uniformRenewalMonths: number;
  warningAbsenceThreshold: number;
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type DashboardStats = {
  totalEmployees: number;
  working: number;
  idle: number;
  activeSites: number;
  inactiveSites: number;
  presentToday: number;
  absentToday: number;
  onLeaveToday: number;
  overtimeToday: number;
  pendingLeave: number;
  pendingCancellation: number;
  upcomingUniformRenewals: number;
  avgRating: number;
  siteBreakdown: { siteId: string; name: string; count: number }[];
  attendanceTrend: AttendanceTrendPoint[];
  todayDistribution: { status: AttendanceStatus; count: number }[];
  recentActivity: AuditLogRecord[];
};

// ---------------------------------------------------------------------------
// App view navigation (frontend store contract)
// ---------------------------------------------------------------------------

export type AppView =
  | "dashboard"
  | "employees"
  | "sites"
  | "attendance"
  | "leave_requests"
  | "cancellation_requests"
  | "warnings"
  | "fines"
  | "uniform_registry"
  | "notifications"
  | "administrators"
  | "audit_logs"
  | "settings";
