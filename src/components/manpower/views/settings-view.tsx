"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Building2,
  Globe,
  Hash,
  Info,
  Loader2,
  RotateCcw,
  Save,
  Settings,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPut } from "@/lib/api-client";
import { useAppStore } from "@/stores/app-store";
import { ErrorState, PageHeader } from "@/components/manpower/shared/page-kit";
import type { SystemSettings } from "@/types/manpower";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENCIES = [
  { value: "SAR", label: "SAR — Saudi Riyal" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "AED", label: "AED — UAE Dirham" },
  { value: "EGP", label: "EGP — Egyptian Pound" },
  { value: "INR", label: "INR — Indian Rupee" },
  { value: "NPR", label: "NPR — Nepalese Rupee" },
  { value: "PKR", label: "PKR — Pakistani Rupee" },
  { value: "PHP", label: "PHP — Philippine Peso" },
];

const TIMEZONES = [
  "Asia/Riyadh",
  "Asia/Dubai",
  "UTC",
  "Asia/Kolkata",
  "Africa/Cairo",
  "Europe/Istanbul",
];

/** Draft form state — numbers kept as raw strings so typing "0.5" feels natural. */
type SettingsDraft = {
  companyName: string;
  companyLogo: string;
  companyAddress: string;
  companyPhone: string;
  currency: string;
  timezone: string;
  employeeIdPrefix: string;
  warningRatingPenalty: string;
  fineRatingPenalty: string;
  uniformRenewalMonths: string;
  warningAbsenceThreshold: string;
};

function toDraft(s: SystemSettings): SettingsDraft {
  return {
    companyName: s.companyName ?? "",
    companyLogo: s.companyLogo ?? "",
    companyAddress: s.companyAddress ?? "",
    companyPhone: s.companyPhone ?? "",
    currency: s.currency ?? "SAR",
    timezone: s.timezone ?? "Asia/Riyadh",
    employeeIdPrefix: s.employeeIdPrefix ?? "",
    warningRatingPenalty: String(s.warningRatingPenalty ?? 0),
    fineRatingPenalty: String(s.fineRatingPenalty ?? 0),
    uniformRenewalMonths: String(s.uniformRenewalMonths ?? 6),
    warningAbsenceThreshold: String(s.warningAbsenceThreshold ?? 3),
  };
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function SettingsView() {
  const user = useAppStore((s) => s.user);
  const isSuper = user?.role === "super_admin";

  const [initial, setInitial] = useState<SettingsDraft | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<SystemSettings>("/api/settings");
      const d = toDraft(res ?? ({} as SystemSettings));
      setInitial(d);
      setDraft(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setLogoError(false);
  }, [draft?.companyLogo]);

  const set = useCallback(
    <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => {
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    []
  );

  const dirty = useMemo(
    () => !!initial && !!draft && JSON.stringify(initial) !== JSON.stringify(draft),
    [initial, draft]
  );

  const previewPrefix = (draft?.employeeIdPrefix ?? "").trim().toUpperCase() || "ASM";

  const reset = () => {
    if (initial) setDraft({ ...initial });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.companyName.trim()) return toast.error("Company name is required");
    if (!draft.employeeIdPrefix.trim())
      return toast.error("Employee ID prefix is required");

    const wPen = Number(draft.warningRatingPenalty);
    const fPen = Number(draft.fineRatingPenalty);
    const months = Number(draft.uniformRenewalMonths);
    const threshold = Number(draft.warningAbsenceThreshold);

    if (!Number.isFinite(wPen) || wPen < 0 || wPen > 5)
      return toast.error("Warning rating penalty must be between 0 and 5");
    if (!Number.isFinite(fPen) || fPen < 0 || fPen > 5)
      return toast.error("Fine rating penalty must be between 0 and 5");
    if (!Number.isFinite(months) || months < 1)
      return toast.error("Uniform renewal months must be at least 1");
    if (!Number.isFinite(threshold) || threshold < 2)
      return toast.error("Warning absence threshold must be at least 2");

    const body: SystemSettings = {
      companyName: draft.companyName.trim(),
      companyLogo: draft.companyLogo.trim(),
      companyAddress: draft.companyAddress,
      companyPhone: draft.companyPhone.trim(),
      currency: draft.currency,
      timezone: draft.timezone,
      employeeIdPrefix: draft.employeeIdPrefix.trim().toUpperCase(),
      warningRatingPenalty: wPen,
      fineRatingPenalty: fPen,
      uniformRenewalMonths: Math.round(months),
      warningAbsenceThreshold: Math.round(threshold),
    };

    setSaving(true);
    try {
      const res = await apiPut<SystemSettings>("/api/settings", body);
      const d = toDraft(res ?? body);
      setInitial(d);
      setDraft(d);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-4 p-4 sm:p-6"
    >
      <PageHeader
        icon={Settings}
        title="Settings"
        description="Company profile, localization and system rules."
      />

      {!isSuper && !loading && !error && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-amber-900 dark:text-amber-200">
            Only the Super Admin can change settings. You are viewing the current
            configuration.
          </p>
        </div>
      )}

      {error ? (
        <ErrorState message={error} retry={load} />
      ) : loading || !draft ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border p-6">
              <Skeleton className="mb-4 h-6 w-48" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* 1. Company profile */}
          <SectionCard
            icon={Building2}
            title="Company Profile"
            description="Shown across the app, reports and exported documents."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name" htmlFor="s-company">
                <Input
                  id="s-company"
                  value={draft.companyName}
                  onChange={(e) => set("companyName", e.target.value)}
                  disabled={!isSuper}
                  placeholder="ASM Manpower Solutions"
                />
              </Field>
              <Field label="Company phone" htmlFor="s-phone">
                <Input
                  id="s-phone"
                  value={draft.companyPhone}
                  onChange={(e) => set("companyPhone", e.target.value)}
                  disabled={!isSuper}
                  placeholder="+966 50 000 0000"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field
                  label="Company logo URL"
                  htmlFor="s-logo"
                  hint={
                    draft.companyLogo
                      ? "Used in headers and printed reports."
                      : "Paste an image URL (optional)."
                  }
                >
                  <Input
                    id="s-logo"
                    value={draft.companyLogo}
                    onChange={(e) => set("companyLogo", e.target.value)}
                    disabled={!isSuper}
                    placeholder="https://example.com/logo.png"
                  />
                </Field>
                {draft.companyLogo && !logoError && (
                  <div className="mt-2 flex items-center gap-3 rounded-lg border p-2">
                    <img
                      src={draft.companyLogo}
                      alt="Company logo preview"
                      onError={() => setLogoError(true)}
                      className="h-12 w-12 rounded-md border object-contain p-1"
                    />
                    <p className="text-xs text-muted-foreground">Logo preview</p>
                  </div>
                )}
                {draft.companyLogo && logoError && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    The logo URL could not be loaded.
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <Field label="Company address" htmlFor="s-address">
                  <Textarea
                    id="s-address"
                    value={draft.companyAddress}
                    onChange={(e) => set("companyAddress", e.target.value)}
                    disabled={!isSuper}
                    rows={2}
                    placeholder="Street, city, country"
                  />
                </Field>
              </div>
            </div>
          </SectionCard>

          {/* 2. Localization */}
          <SectionCard
            icon={Globe}
            title="Localization"
            description="Currency and timezone used across the system."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <Select
                  value={draft.currency}
                  onValueChange={(v) => set("currency", v)}
                  disabled={!isSuper}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Timezone">
                <Select
                  value={draft.timezone}
                  onValueChange={(v) => set("timezone", v)}
                  disabled={!isSuper}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </SectionCard>

          {/* 3. Employee IDs */}
          <SectionCard
            icon={Hash}
            title="Employee IDs"
            description="New employee codes are generated as PREFIX-YEAR-NNN."
          >
            <Field
              label="Employee ID prefix"
              htmlFor="s-prefix"
              hint={`New IDs: ${previewPrefix}-${new Date().getFullYear()}-0XX`}
            >
              <Input
                id="s-prefix"
                value={draft.employeeIdPrefix}
                onChange={(e) => set("employeeIdPrefix", e.target.value.toUpperCase())}
                disabled={!isSuper}
                placeholder="ASM"
                className="w-full font-mono uppercase sm:max-w-[220px]"
                maxLength={10}
              />
            </Field>
          </SectionCard>

          {/* 4. Penalties & rules */}
          <SectionCard
            icon={Info}
            title="Penalties & Rules"
            description="Rating penalties and automatic thresholds applied by the system."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Warning rating penalty"
                htmlFor="s-warn"
                hint={`Warning = −${draft.warningRatingPenalty || 0} rating points`}
              >
                <Input
                  id="s-warn"
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={draft.warningRatingPenalty}
                  onChange={(e) => set("warningRatingPenalty", e.target.value)}
                  disabled={!isSuper}
                />
              </Field>
              <Field
                label="Fine rating penalty"
                htmlFor="s-fine"
                hint={`Fine = −${draft.fineRatingPenalty || 0} rating points`}
              >
                <Input
                  id="s-fine"
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={draft.fineRatingPenalty}
                  onChange={(e) => set("fineRatingPenalty", e.target.value)}
                  disabled={!isSuper}
                />
              </Field>
              <Field
                label="Absence auto-warning threshold"
                htmlFor="s-threshold"
                hint={`Auto-warning after ${draft.warningAbsenceThreshold || 0} consecutive absences`}
              >
                <Input
                  id="s-threshold"
                  type="number"
                  min={2}
                  step={1}
                  value={draft.warningAbsenceThreshold}
                  onChange={(e) => set("warningAbsenceThreshold", e.target.value)}
                  disabled={!isSuper}
                />
              </Field>
              <Field
                label="Uniform renewal months"
                htmlFor="s-uniform"
                hint={`Uniform renewal every ${draft.uniformRenewalMonths || 0} months`}
              >
                <Input
                  id="s-uniform"
                  type="number"
                  min={1}
                  step={1}
                  value={draft.uniformRenewalMonths}
                  onChange={(e) => set("uniformRenewalMonths", e.target.value)}
                  disabled={!isSuper}
                />
              </Field>
            </div>
          </SectionCard>

          {/* 5. System info (read-only) */}
          <SectionCard
            icon={Settings}
            title="System Information"
            description="Read-only platform details."
          >
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Platform</span>
                <span className="font-medium">ASM Manpower ERP</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono text-xs">v1.0.0</span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="shrink-0 text-muted-foreground">Storage</span>
                <span className="max-w-xs text-right text-xs">
                  SQLite database — sensitive fields (passport, ID and document
                  numbers) are encrypted at rest (AES-256-GCM).
                </span>
              </div>
            </div>
          </SectionCard>

          {/* Sticky save bar */}
          {isSuper && dirty && (
            <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 pl-1 text-sm text-muted-foreground">
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                Unsaved changes
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reset}
                  disabled={saving}
                >
                  <RotateCcw className="h-4 w-4" />
                  Discard changes
                </Button>
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default SettingsView;
