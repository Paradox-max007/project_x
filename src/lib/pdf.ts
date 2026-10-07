"use client";

/**
 * ASM Manpower System — client-side PDF generation (jspdf, dynamically imported).
 *
 * Two documents:
 *  - generateEmployeeCV(report, settings?)   → professional CV  → CV-{employeeCode}.pdf
 *  - generateEmployeeReport(report, settings?) → full report   → Report-{employeeCode}.pdf
 *
 * Design: A4, zinc header bands, emerald accents — mirrors the web design system.
 */

import { format, parseISO } from "date-fns";
import type { jsPDF as JsPdfDoc } from "jspdf";
import { apiGet } from "@/lib/api-client";
import type { EmployeeReport, SystemSettings } from "@/types/manpower";

export type PdfSettings = { companyName: string; currency: string };

// ---------------------------------------------------------------------------
// Palette (zinc neutrals + emerald accent)
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

const ZINC_900: RGB = [24, 24, 27];
const ZINC_700: RGB = [63, 63, 70];
const ZINC_500: RGB = [113, 113, 122];
const ZINC_400: RGB = [161, 161, 170];
const ZINC_300: RGB = [212, 212, 216];
const ZINC_200: RGB = [228, 228, 231];
const ZINC_100: RGB = [244, 244, 245];
const ZINC_50: RGB = [250, 250, 250];
const EMERALD_700: RGB = [4, 120, 87];
const EMERALD_600: RGB = [5, 150, 105];
const EMERALD_200: RGB = [167, 243, 208];
const EMERALD_50: RGB = [236, 253, 245];
const WHITE: RGB = [255, 255, 255];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_H - 20;

// ---------------------------------------------------------------------------
// Small shared helpers (also reused by the employee views)
// ---------------------------------------------------------------------------

/** Keep only characters the built-in PDF fonts can render. */
function san(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v).replace(
    /[^\t\n\r\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u00D7]/g,
    "?"
  );
}

/** "d MMM yyyy" for ISO date strings. */
export function formatDateLabel(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    return format(parseISO(v), "d MMM yyyy");
  } catch {
    return san(v);
  }
}

/** "X years Y months" since a join date. */
export function tenureLabel(joinDate: string | null | undefined): string {
  if (!joinDate) return "—";
  try {
    const start = parseISO(joinDate);
    const now = new Date();
    let months =
      (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) months -= 1;
    months = Math.max(0, months);
    const y = Math.floor(months / 12);
    const m = months % 12;
    if (y === 0 && m === 0) return "Less than a month";
    if (y === 0) return `${m} month${m === 1 ? "" : "s"}`;
    if (m === 0) return `${y} year${y === 1 ? "" : "s"}`;
    return `${y} year${y === 1 ? "" : "s"} ${m} month${m === 1 ? "" : "s"}`;
  } catch {
    return "—";
  }
}

function initialsOf(name: string): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusLabel(status: string): string {
  if (status === "active") return "Active";
  if (status === "pending_deletion") return "Pending Deletion";
  if (status === "deleted") return "Deleted";
  return status;
}

function docStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "valid":
      return "Valid";
    case "expiring":
      return "Expiring Soon";
    case "renewal_due":
      return "Renewal Due";
    case "expired":
      return "Expired";
    default:
      return "Not on file";
  }
}

function leaveTypeLabel(t: string, other: string | null): string {
  if (t === "other") return other ? san(other) : "Other";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------------------
// Settings (cached, best-effort — PDFs fall back to defaults)
// ---------------------------------------------------------------------------

let settingsPromise: Promise<PdfSettings> | null = null;

export function getPdfSettings(): Promise<PdfSettings> {
  if (!settingsPromise) {
    settingsPromise = apiGet<SystemSettings>("/api/settings")
      .then((s) => ({
        companyName: s?.companyName || "ASM Manpower Solutions",
        currency: s?.currency || "SAR",
      }))
      .catch(() => ({
        companyName: "ASM Manpower Solutions",
        currency: "SAR",
      }));
  }
  return settingsPromise;
}

// ---------------------------------------------------------------------------
// Layout engine
// ---------------------------------------------------------------------------

class Layout {
  doc: JsPdfDoc;
  y = 0;

  constructor(doc: JsPdfDoc) {
    this.doc = doc;
  }

  fill(c: RGB) {
    this.doc.setFillColor(c[0], c[1], c[2]);
  }
  draw(c: RGB) {
    this.doc.setDrawColor(c[0], c[1], c[2]);
  }
  ink(c: RGB) {
    this.doc.setTextColor(c[0], c[1], c[2]);
  }

  /** Add a page when the remaining space is insufficient. */
  need(h: number): boolean {
    if (this.y + h > BOTTOM_LIMIT) {
      this.doc.addPage();
      this.y = 20;
      return true;
    }
    return false;
  }

  /** Small caps section header with an emerald tick + hairline. */
  sectionHeader(label: string) {
    this.need(18);
    const y = this.y;
    this.fill(EMERALD_600);
    this.doc.rect(MARGIN, y + 0.3, 1.6, 4.6, "F");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10.5);
    this.ink(ZINC_900);
    this.doc.text(san(label).toUpperCase(), MARGIN + 4.2, y + 3.9, {
      charSpace: 0.45,
    });
    this.draw(ZINC_200);
    this.doc.setLineWidth(0.35);
    this.doc.line(MARGIN, y + 6.6, PAGE_W - MARGIN, y + 6.6);
    this.y = y + 11.5;
  }

  /** Two-column label/value grid with wrapping values. */
  infoGrid(items: Array<[string, string]>, cols = 2, rowH = 12.5) {
    const gapX = 10;
    const colW = (CONTENT_W - gapX * (cols - 1)) / cols;
    for (let i = 0; i < items.length; i += cols) {
      const row = items.slice(i, i + cols).map(([label, value]) => ({
        label,
        lines: this.doc.splitTextToSize(san(value), colW - 2) as string[],
      }));
      const h = Math.max(
        rowH,
        ...row.map((c) => 4 + c.lines.length * 4.5 + 3)
      );
      this.need(h);
      row.forEach((cell, ci) => {
        const x = MARGIN + ci * (colW + gapX);
        this.doc.setFont("helvetica", "normal");
        this.doc.setFontSize(7);
        this.ink(ZINC_500);
        this.doc.text(cell.label.toUpperCase(), x, this.y + 3.2, {
          charSpace: 0.3,
        });
        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(9.5);
        this.ink(ZINC_900);
        this.doc.text(cell.lines, x, this.y + 8, { lineHeightFactor: 1.35 });
      });
      this.y += h;
    }
    this.y += 2;
  }

  /** Simple table with dark header row, zebra stripes, wrapped cells. */
  table(opts: {
    headers: string[];
    widths: number[];
    rows: string[][];
    aligns?: Array<"left" | "center" | "right">;
  }) {
    const { headers, widths, rows } = opts;
    const aligns = opts.aligns ?? headers.map(() => "left" as const);
    const totalW = widths.reduce((a, b) => a + b, 0);

    const drawHeader = () => {
      const h = 7.6;
      this.need(h + 12);
      this.fill(ZINC_900);
      this.doc.rect(MARGIN, this.y, totalW, h, "F");
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(7.4);
      this.ink(WHITE);
      let x = MARGIN;
      headers.forEach((hd, i) => {
        const w = widths[i];
        const align =
          aligns[i] === "right" ? "right" : aligns[i] === "center" ? "center" : "left";
        const tx =
          align === "left" ? x + 2.6 : align === "right" ? x + w - 2.6 : x + w / 2;
        this.doc.text(san(hd).toUpperCase(), tx, this.y + 5, {
          align,
          charSpace: 0.25,
        });
        x += w;
      });
      this.y += h;
    };

    drawHeader();

    if (rows.length === 0) {
      this.need(10);
      this.doc.setFont("helvetica", "italic");
      this.doc.setFontSize(8.5);
      this.ink(ZINC_500);
      this.doc.text("No records on file.", MARGIN + 2.6, this.y + 5.6);
      this.y += 10;
      return;
    }

    rows.forEach((row, ri) => {
      const cellLines = row.map(
        (cell, ci) => this.doc.splitTextToSize(san(cell), widths[ci] - 5) as string[]
      );
      const lineCount = Math.max(...cellLines.map((l) => l.length));
      const h = Math.max(8.4, lineCount * 4.3 + 4.4);

      if (this.y + h > BOTTOM_LIMIT) {
        this.doc.addPage();
        this.y = 20;
        drawHeader();
      }

      if (ri % 2 === 1) {
        this.fill(ZINC_50);
        this.doc.rect(MARGIN, this.y, totalW, h, "F");
      }
      this.draw(ZINC_200);
      this.doc.setLineWidth(0.25);
      this.doc.rect(MARGIN, this.y, totalW, h);
      let x = MARGIN;
      for (let i = 0; i < widths.length - 1; i++) {
        x += widths[i];
        this.doc.line(x, this.y, x, this.y + h);
      }

      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8.4);
      this.ink(ZINC_900);
      let cx = MARGIN;
      cellLines.forEach((lines, ci) => {
        const w = widths[ci];
        const align =
          aligns[ci] === "right" ? "right" : aligns[ci] === "center" ? "center" : "left";
        const tx = align === "left" ? cx + 2.6 : align === "right" ? cx + w - 2.6 : cx + w / 2;
        this.doc.text(lines, tx, this.y + 5.2, { lineHeightFactor: 1.3 });
        cx += w;
      });
      this.y += h;
    });
    this.y += 6;
  }

  /** Five star circles starting at (x, y=center line). */
  stars(x: number, y: number, value: number, r = 1.7, gap = 1.8) {
    const filled = Math.round(Math.max(0, Math.min(5, value)));
    for (let i = 0; i < 5; i++) {
      this.fill(i < filled ? EMERALD_600 : ZINC_300);
      this.doc.circle(x + r + i * (r * 2 + gap), y, r, "F");
    }
  }
}

// ---------------------------------------------------------------------------
// Shared page furniture
// ---------------------------------------------------------------------------

function drawHeaderBand(
  doc: JsPdfDoc,
  companyName: string,
  title: string,
  initials?: string
) {
  doc.setFillColor(...ZINC_900);
  doc.rect(0, 0, PAGE_W, 40, "F");
  doc.setFillColor(...EMERALD_600);
  doc.rect(0, 40, PAGE_W, 1.6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text(san(companyName).toUpperCase(), MARGIN, 15.5, { charSpace: 0.5 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...EMERALD_200);
  doc.text(title, MARGIN, 23.5, { charSpace: 1.2 });

  if (initials) {
    // photo placeholder: white ring + emerald disc + initials
    doc.setFillColor(...WHITE);
    doc.circle(174, 20, 14.6, "F");
    doc.setFillColor(...EMERALD_600);
    doc.circle(174, 20, 13.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...WHITE);
    doc.text(initials, 174, 21.8, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.6);
    doc.setTextColor(...ZINC_400);
    doc.text("PHOTO", 174, 36.5, { align: "center", charSpace: 0.6 });
  }
}

function paintFooters(doc: JsPdfDoc) {
  const pages = doc.getNumberOfPages();
  const now = format(new Date(), "d MMM yyyy, HH:mm");
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...ZINC_200);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...ZINC_500);
    doc.text(`Generated by ASM Manpower System — ${now}`, MARGIN, PAGE_H - 9.5);
    doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 9.5, {
      align: "right",
    });
  }
}

// ---------------------------------------------------------------------------
// CV
// ---------------------------------------------------------------------------

export async function generateEmployeeCV(
  report: EmployeeReport,
  settings?: PdfSettings
): Promise<void> {
  const { jsPDF: JsPdfCtor } = await import("jspdf");
  const doc = new JsPdfCtor({ unit: "mm", format: "a4", compress: true });
  const e = report.employee;
  const companyName = settings?.companyName || "ASM Manpower Solutions";

  drawHeaderBand(doc, companyName, "EMPLOYEE CURRICULUM VITAE", initialsOf(e.fullName));

  // ---- name block ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(...ZINC_900);
  doc.text(san(e.fullName), MARGIN, 56);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...ZINC_500);
  doc.text(
    `${san(e.employeeCode)}    •    ${statusLabel(e.status)}`,
    MARGIN,
    62.5
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...ZINC_700);
  doc.text(san(e.position), MARGIN, 69.5);

  const L = new Layout(doc);

  // ---- contact block ----
  L.y = 77;
  L.sectionHeader("Contact");
  L.infoGrid([
    ["Phone", e.phone ?? ""],
    ["Email", e.email ?? ""],
    ["Address", e.address ?? ""],
    ["Emergency Contact", e.emergencyContact ?? ""],
  ]);

  // ---- personal information ----
  L.sectionHeader("Personal Information");
  L.infoGrid([
    ["Full Name", e.fullName],
    ["Date of Birth", formatDateLabel(e.dateOfBirth)],
    ["Nationality", e.nationality],
    ["Employee ID", e.employeeCode],
  ]);

  // ---- employment ----
  L.sectionHeader("Employment");
  L.infoGrid([
    ["Position", e.position],
    ["Company", e.companyName ?? ""],
    ["Join Date", formatDateLabel(e.joinDate)],
    ["Tenure", tenureLabel(e.joinDate)],
    ["Current Site", e.currentSiteName ?? ""],
    ["Team Leader", e.teamLeaderName ?? ""],
  ]);

  // ---- current assignment + rating boxes ----
  L.need(42);
  const boxY = L.y;
  const ratingW = 66;
  const assignW = CONTENT_W - ratingW - 6;

  doc.setFillColor(...ZINC_100);
  doc.roundedRect(MARGIN, boxY, assignW, 34, 2.5, 2.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(...ZINC_500);
  doc.text("CURRENT ASSIGNMENT", MARGIN + 5, boxY + 6.5, { charSpace: 0.5 });
  const current = report.siteHistory.find((h) => !h.endDate);
  if (e.currentSiteName) {
    doc.setFontSize(12);
    doc.setTextColor(...ZINC_900);
    doc.text(san(e.currentSiteName), MARGIN + 5, boxY + 14.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.setTextColor(...ZINC_700);
    doc.text(
      current ? `Assigned since ${formatDateLabel(current.startDate)}` : "",
      MARGIN + 5,
      boxY + 20.5
    );
    doc.text(
      e.teamLeaderName
        ? `Team leader: ${san(e.teamLeaderName)}`
        : "No team leader on site",
      MARGIN + 5,
      boxY + 25.5
    );
  } else {
    doc.setFontSize(12);
    doc.setTextColor(...ZINC_900);
    doc.text("Currently idle", MARGIN + 5, boxY + 14.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.setTextColor(...ZINC_700);
    doc.text("Not assigned to any site", MARGIN + 5, boxY + 20.5);
  }

  const rx = MARGIN + assignW + 6;
  doc.setFillColor(...EMERALD_50);
  doc.roundedRect(rx, boxY, ratingW, 34, 2.5, 2.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(...EMERALD_700);
  doc.text("PERFORMANCE RATING", rx + 5, boxY + 6.5, { charSpace: 0.5 });
  doc.setFontSize(15);
  doc.setTextColor(...ZINC_900);
  doc.text(`${e.rating.toFixed(1)} / 5.0`, rx + 5, boxY + 15);
  L.stars(rx + 5.5, boxY + 21.5, e.rating);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...ZINC_500);
  doc.text(
    `${report.warnings.length} warning(s) • ${report.fines.length} fine(s) on record`,
    rx + 5,
    boxY + 28.5
  );

  L.y = boxY + 42;

  // ---- document statuses (never the numbers — privacy by design) ----
  L.sectionHeader("Document Status");
  L.infoGrid([
    ["Passport", docStatusLabel(e.passportStatus)],
    ["National ID", docStatusLabel(e.idStatus)],
  ]);

  paintFooters(doc);
  doc.save(`CV-${san(e.employeeCode)}.pdf`);
}

// ---------------------------------------------------------------------------
// Full report
// ---------------------------------------------------------------------------

export async function generateEmployeeReport(
  report: EmployeeReport,
  settings?: PdfSettings
): Promise<void> {
  const { jsPDF: JsPdfCtor } = await import("jspdf");
  const doc = new JsPdfCtor({ unit: "mm", format: "a4", compress: true });
  const e = report.employee;
  const companyName = settings?.companyName || "ASM Manpower Solutions";
  const currency = settings?.currency || "SAR";

  drawHeaderBand(doc, companyName, "EMPLOYEE REPORT");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...ZINC_400);
  doc.text(`Generated ${format(new Date(), "d MMM yyyy")}`, PAGE_W - MARGIN, 15.5, {
    align: "right",
  });

  // ---- name block ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...ZINC_900);
  doc.text(san(e.fullName), MARGIN, 55);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...ZINC_500);
  doc.text(
    `${san(e.employeeCode)}  •  ${statusLabel(e.status)}  •  ${san(e.position)}`,
    MARGIN,
    61.5
  );

  const L = new Layout(doc);
  L.y = 70;

  // ---- personal + employment ----
  L.sectionHeader("Personal Information");
  L.infoGrid([
    ["Full Name", e.fullName],
    ["Date of Birth", formatDateLabel(e.dateOfBirth)],
    ["Nationality", e.nationality],
    ["Phone", e.phone ?? ""],
    ["Email", e.email ?? ""],
    ["Emergency Contact", e.emergencyContact ?? ""],
    ["Address", e.address ?? ""],
  ]);

  L.sectionHeader("Employment Information");
  L.infoGrid([
    ["Position", e.position],
    ["Company", e.companyName ?? ""],
    ["Join Date", formatDateLabel(e.joinDate)],
    ["Tenure", tenureLabel(e.joinDate)],
    ["Current Site", e.currentSiteName ?? ""],
    ["Team Leader", e.teamLeaderName ?? ""],
  ]);

  // ---- attendance summary ----
  const a = report.attendanceSummary;
  L.sectionHeader("Attendance Summary (All Time)");
  L.table({
    headers: [
      "Present",
      "Absent",
      "Leave",
      "Overtime",
      "OT Hours",
      "No Site",
      "Not Marked",
      "Total Marked",
    ],
    widths: [22, 22, 22, 24, 24, 22, 24, 24],
    aligns: ["center", "center", "center", "center", "center", "center", "center", "center"],
    rows: [
      [
        String(a?.present ?? 0),
        String(a?.absent ?? 0),
        String(a?.leave ?? 0),
        String(a?.overtime ?? 0),
        String(a?.overtimeHours ?? 0),
        String(a?.noSite ?? 0),
        String(a?.notMarked ?? 0),
        String(a?.totalMarked ?? 0),
      ],
    ],
  });

  // ---- warnings ----
  L.sectionHeader(`Warnings (${report.warnings.length})`);
  L.table({
    headers: ["Date", "Reason", "Source", "Penalty"],
    widths: [26, 98, 34, 20],
    aligns: ["left", "left", "left", "center"],
    rows: report.warnings.map((w) => [
      formatDateLabel(w.createdAt),
      w.reason,
      w.isAutoGenerated ? "Auto-generated" : san(w.createdByName ?? "—"),
      `−${w.ratingPenalty}`,
    ]),
  });

  // ---- fines ----
  L.sectionHeader(`Fines (${report.fines.length})`);
  L.table({
    headers: ["Date", "Reason", "Amount", "Penalty"],
    widths: [26, 106, 26, 20],
    aligns: ["left", "left", "right", "center"],
    rows: report.fines.map((f) => [
      formatDateLabel(f.createdAt),
      f.reason,
      `${f.amount} ${san(f.currency || currency)}`,
      `−${f.ratingPenalty}`,
    ]),
  });

  // ---- uniforms ----
  L.sectionHeader(`Uniform Records (${report.uniforms.length})`);
  L.table({
    headers: ["Token", "Items", "Issued", "Renewal Due"],
    widths: [26, 104, 20, 28],
    aligns: ["left", "left", "center", "center"],
    rows: report.uniforms.map((u) => [
      san(u.tokenNumber),
      u.items.map((i) => `${san(i.name)} ×${i.quantity}`).join(", "),
      formatDateLabel(u.issuedAt),
      formatDateLabel(u.renewalDate),
    ]),
  });

  // ---- leave history ----
  L.sectionHeader(`Leave History (${report.leaveHistory.length})`);
  L.table({
    headers: ["Type", "Start", "End", "Days", "Status"],
    widths: [30, 28, 28, 16, 74],
    aligns: ["left", "center", "center", "center", "left"],
    rows: report.leaveHistory.map((l) => [
      leaveTypeLabel(l.leaveType, l.otherType),
      formatDateLabel(l.startDate),
      formatDateLabel(l.endDate),
      String(l.totalDays),
      l.status.charAt(0).toUpperCase() + l.status.slice(1) +
        (l.reason ? ` — ${san(l.reason)}` : ""),
    ]),
  });

  // ---- site history ----
  L.sectionHeader(`Site History (${report.siteHistory.length})`);
  L.table({
    headers: ["Site", "From", "To", "Reason"],
    widths: [48, 26, 26, 76],
    aligns: ["left", "center", "center", "left"],
    rows: report.siteHistory.map((h) => [
      san(h.siteName),
      formatDateLabel(h.startDate),
      h.endDate ? formatDateLabel(h.endDate) : "Present",
      h.reason ? san(h.reason) : "—",
    ]),
  });

  // ---- rating summary ----
  L.sectionHeader("Rating Summary");
  L.need(34);
  const ry = L.y;
  doc.setFillColor(...EMERALD_50);
  doc.roundedRect(MARGIN, ry, CONTENT_W, 30, 2.5, 2.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(...EMERALD_700);
  doc.text("CURRENT RATING", MARGIN + 6, ry + 7, { charSpace: 0.5 });
  doc.setFontSize(15);
  doc.setTextColor(...ZINC_900);
  doc.text(`${e.rating.toFixed(1)} / 5.0`, MARGIN + 6, ry + 16);
  L.stars(MARGIN + 6.5, ry + 23, e.rating);
  const warnPenalty = report.warnings.reduce((s, w) => s + (w.ratingPenalty || 0), 0);
  const finePenalty = report.fines.reduce((s, f) => s + (f.ratingPenalty || 0), 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.6);
  doc.setTextColor(...ZINC_700);
  const rx2 = MARGIN + CONTENT_W / 2 + 6;
  doc.text(`Warnings on record: ${report.warnings.length} (−${warnPenalty.toFixed(1)})`, rx2, ry + 10);
  doc.text(`Fines on record: ${report.fines.length} (−${finePenalty.toFixed(1)})`, rx2, ry + 16);
  doc.text(`Rating floor: 0.0 — ceiling: 5.0`, rx2, ry + 22);
  L.y = ry + 38;

  paintFooters(doc);
  doc.save(`Report-${san(e.employeeCode)}.pdf`);
}
