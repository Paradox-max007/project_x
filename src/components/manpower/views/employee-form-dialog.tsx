"use client";

/**
 * Employee create / edit dialog — multi-section form (spec §70).
 * Personal → Contact → Employment → Documents.
 * Built with react-hook-form + zod; edit mode leaves document numbers
 * blank = "keep current" (server keeps encrypted values).
 */

import { zodResolver } from "@hookform/resolvers/zod";
import {
  BookUser,
  Briefcase,
  CalendarDays,
  Loader2,
  Phone,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { EmployeeInput, EmployeeProfile, SiteRecord } from "@/types/manpower";

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

const NATIONALITIES = [
  "Indian",
  "Nepali",
  "Filipino",
  "Egyptian",
  "Bangladeshi",
  "Pakistani",
  "Sri Lankan",
  "Kenyan",
  "Turkish",
  "Other",
];

const POSITIONS = [
  "Electrician",
  "Plumber",
  "Mason",
  "Steel Fixer",
  "Carpenter",
  "Painter",
  "Helper",
  "Driver",
  "Foreman",
  "Safety Officer",
  "Cleaner",
  "AC Technician",
  "Welder",
  "Scaffolder",
  "Glazier",
  "Tile Fixer",
  "Team Leader",
  "Site Foreman",
  "Maintenance Supervisor",
  "Other",
];

const DOC_STATUS_OPTIONS = [
  { value: "none", label: "Not specified" },
  { value: "valid", label: "Valid" },
  { value: "expiring", label: "Expiring soon" },
  { value: "renewal_due", label: "Renewal due" },
  { value: "expired", label: "Expired" },
];

const NONE = "none"; // Radix <SelectItem> cannot use ""

const EMPTY_VALUES = {
  fullName: "",
  nationality: "",
  dateOfBirth: "",
  phone: "",
  email: "",
  address: "",
  emergencyContact: "",
  position: "",
  companyName: "",
  joinDate: "",
  siteId: NONE,
  passportNumber: "",
  passportStatus: NONE,
  idNumber: "",
  idStatus: NONE,
  photoUrl: "",
};

const employeeFormSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required"),
  nationality: z.string().trim().min(2, "Nationality is required"),
  dateOfBirth: z.string(),
  phone: z.string().trim(),
  email: z
    .string()
    .trim()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "Enter a valid email address",
    }),
  address: z.string(),
  emergencyContact: z.string().trim(),
  position: z.string().trim().min(2, "Position is required"),
  companyName: z.string().trim(),
  joinDate: z.string(),
  siteId: z.string(),
  passportNumber: z.string().trim(),
  passportStatus: z.string(),
  idNumber: z.string().trim(),
  idStatus: z.string(),
  photoUrl: z
    .string()
    .trim()
    .refine((v) => !v || /^(https?:\/\/|data:image\/)/.test(v), {
      message: "Enter a valid image URL",
    }),
});

type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

// ---------------------------------------------------------------------------
// small building blocks
// ---------------------------------------------------------------------------

function FormSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-none">{title}</h3>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
      )}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// dialog
// ---------------------------------------------------------------------------

export function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** pass an employee to edit; omit/null for create mode */
  employee?: EmployeeProfile | null;
  onSaved?: (employee: EmployeeProfile) => void;
}) {
  const isEdit = !!employee;
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: EMPTY_VALUES,
  });

  const errors = form.formState.errors;

  // prefill + load active sites each time the dialog opens
  useEffect(() => {
    if (!open) return;
    form.reset(
      employee
        ? {
            fullName: employee.fullName ?? "",
            nationality: employee.nationality ?? "",
            dateOfBirth: employee.dateOfBirth ?? "",
            phone: employee.phone ?? "",
            email: employee.email ?? "",
            address: employee.address ?? "",
            emergencyContact: employee.emergencyContact ?? "",
            position: employee.position ?? "",
            companyName: employee.companyName ?? "",
            joinDate: employee.joinDate ?? "",
            siteId: employee.currentSiteId ?? NONE,
            passportNumber: "", // blank = keep existing
            passportStatus: employee.passportStatus ?? NONE,
            idNumber: "", // blank = keep existing
            idStatus: employee.idStatus ?? NONE,
            photoUrl: employee.photoUrl ?? "",
          }
        : EMPTY_VALUES
    );
    let cancelled = false;
    apiGet<SiteRecord[]>("/api/sites?includeInactive=true")
      .then((all) => {
        if (!cancelled) setSites(all.filter((s) => s.isActive));
      })
      .catch(() => {
        // backend may be transiently unavailable — form still works without site list
        if (!cancelled) setSites([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, employee, form]);

  const onSubmit = async (values: EmployeeFormValues) => {
    if (busy) return;
    setBusy(true);
    try {
      const payload: EmployeeInput = {
        fullName: values.fullName.trim(),
        nationality: values.nationality.trim(),
        position: values.position.trim(),
        dateOfBirth: values.dateOfBirth || null,
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        address: values.address.trim() || null,
        emergencyContact: values.emergencyContact.trim() || null,
        joinDate: values.joinDate || null,
        companyName: values.companyName.trim() || null,
        photoUrl: values.photoUrl.trim() || null,
        siteId: values.siteId === NONE ? null : values.siteId,
        // blank document number = keep existing (edit mode)
        passportNumber: values.passportNumber || undefined,
        passportStatus: values.passportStatus === NONE ? null : values.passportStatus,
        idNumber: values.idNumber || undefined,
        idStatus: values.idStatus === NONE ? null : values.idStatus,
      };
      const saved = isEdit && employee
        ? await apiPatch<EmployeeProfile>(`/api/employees/${employee.id}`, payload)
        : await apiPost<EmployeeProfile>("/api/employees", payload);
      toast.success(
        isEdit
          ? `${saved.fullName} updated`
          : `${saved.fullName} added — employee code ${saved.employeeCode}`
      );
      onOpenChange(false);
      onSaved?.(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save employee");
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
      <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <div className="overflow-y-auto">
          <DialogHeader className="border-b px-6 pb-4 pt-6 pr-10">
            <DialogTitle>
              {isEdit ? "Edit employee" : "Add employee"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? `${employee?.fullName} • ${employee?.employeeCode} — document numbers left blank keep the current values.`
                : "Register a new worker. Employee code (ASM-YYYY-NNN) is generated automatically."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div className="space-y-7 px-6 py-5">
              {/* 1 — Personal */}
              <FormSection
                icon={User}
                title="Personal"
                description="Identity details of the worker."
              >
                <Field
                  label="Full name"
                  htmlFor="emp-fullName"
                  required
                  error={errors.fullName?.message}
                >
                  <Input
                    id="emp-fullName"
                    placeholder="e.g. Rajesh Kumar"
                    autoComplete="off"
                    {...form.register("fullName")}
                  />
                </Field>
                <Field
                  label="Nationality"
                  htmlFor="emp-nationality"
                  required
                  error={errors.nationality?.message}
                >
                  <Input
                    id="emp-nationality"
                    list="emp-nationality-options"
                    placeholder="e.g. Indian"
                    autoComplete="off"
                    {...form.register("nationality")}
                  />
                  <datalist id="emp-nationality-options">
                    {NATIONALITIES.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Date of birth" htmlFor="emp-dob">
                  <Input
                    id="emp-dob"
                    type="date"
                    {...form.register("dateOfBirth")}
                  />
                </Field>
                <Field
                  label="Photo URL"
                  htmlFor="emp-photo"
                  error={errors.photoUrl?.message}
                  hint="Optional — used for avatars."
                >
                  <Input
                    id="emp-photo"
                    placeholder="https://…"
                    autoComplete="off"
                    {...form.register("photoUrl")}
                  />
                </Field>
              </FormSection>

              {/* 2 — Contact */}
              <FormSection
                icon={Phone}
                title="Contact"
                description="How to reach the worker."
              >
                <Field label="Phone" htmlFor="emp-phone">
                  <Input
                    id="emp-phone"
                    placeholder="+966 5x xxx xxxx"
                    autoComplete="off"
                    {...form.register("phone")}
                  />
                </Field>
                <Field
                  label="Email"
                  htmlFor="emp-email"
                  error={errors.email?.message}
                >
                  <Input
                    id="emp-email"
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="off"
                    {...form.register("email")}
                  />
                </Field>
                <Field
                  label="Address"
                  htmlFor="emp-address"
                  className="sm:col-span-2"
                >
                  <Textarea
                    id="emp-address"
                    rows={2}
                    placeholder="Current residence address…"
                    {...form.register("address")}
                  />
                </Field>
                <Field
                  label="Emergency contact"
                  htmlFor="emp-emergency"
                  className="sm:col-span-2"
                  hint="Name and phone number of a relative or friend."
                >
                  <Input
                    id="emp-emergency"
                    placeholder="e.g. Suresh Kumar (brother) +91 …"
                    autoComplete="off"
                    {...form.register("emergencyContact")}
                  />
                </Field>
              </FormSection>

              {/* 3 — Employment */}
              <FormSection
                icon={Briefcase}
                title="Employment"
                description="Role, company and site assignment."
              >
                <Field
                  label="Position"
                  htmlFor="emp-position"
                  required
                  error={errors.position?.message}
                >
                  <Input
                    id="emp-position"
                    list="emp-position-options"
                    placeholder="e.g. Electrician"
                    autoComplete="off"
                    {...form.register("position")}
                  />
                  <datalist id="emp-position-options">
                    {POSITIONS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Company name" htmlFor="emp-company">
                  <Input
                    id="emp-company"
                    placeholder="e.g. ASM Manpower Solutions"
                    autoComplete="off"
                    {...form.register("companyName")}
                  />
                </Field>
                <Field label="Join date" htmlFor="emp-joinDate">
                  <Input
                    id="emp-joinDate"
                    type="date"
                    {...form.register("joinDate")}
                  />
                </Field>
                <Field
                  label="Site"
                  htmlFor="emp-site"
                  hint={
                    sites.length === 0
                      ? "No active sites available."
                      : "New hires can also start idle."
                  }
                >
                  <Controller
                    control={form.control}
                    name="siteId"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id="emp-site"
                          className="w-full"
                        >
                          <SelectValue placeholder="Select site" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>
                            No site (idle)
                          </SelectItem>
                          {sites.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </FormSection>

              {/* 4 — Documents */}
              <FormSection
                icon={BookUser}
                title="Documents"
                description="Passport and ID are encrypted at rest; only masked values are ever listed."
              >
                <Field
                  label="Passport number"
                  htmlFor="emp-passport"
                  hint={
                    isEdit && employee?.passportNumberMasked
                      ? `Current: ${employee.passportNumberMasked} — leave blank to keep.`
                      : "Encrypted at rest. Optional."
                  }
                >
                  <Input
                    id="emp-passport"
                    className="font-mono"
                    placeholder={isEdit ? "Leave blank to keep current" : "e.g. Z1234567"}
                    autoComplete="off"
                    {...form.register("passportNumber")}
                  />
                </Field>
                <Field label="Passport status" htmlFor="emp-passportStatus">
                  <Controller
                    control={form.control}
                    name="passportStatus"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="emp-passportStatus" className="w-full">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          {DOC_STATUS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field
                  label="ID number"
                  htmlFor="emp-id"
                  hint={
                    isEdit && employee?.idNumberMasked
                      ? `Current: ${employee.idNumberMasked} — leave blank to keep.`
                      : "National ID / Iqama. Optional."
                  }
                >
                  <Input
                    id="emp-id"
                    className="font-mono"
                    placeholder={isEdit ? "Leave blank to keep current" : "e.g. 2xxxxxxxxx"}
                    autoComplete="off"
                    {...form.register("idNumber")}
                  />
                </Field>
                <Field label="ID status" htmlFor="emp-idStatus">
                  <Controller
                    control={form.control}
                    name="idStatus"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="emp-idStatus" className="w-full">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          {DOC_STATUS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </FormSection>
            </div>

            <DialogFooter className="border-t px-6 py-4">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEdit ? "Save changes" : "Add employee"}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
