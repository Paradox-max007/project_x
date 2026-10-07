"use client";

import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  "bg-lime-100 text-lime-700 dark:bg-lime-950 dark:text-lime-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
];

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function EmployeeAvatar({
  name,
  photoUrl,
  className,
  title,
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
  title?: string;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        title={title ?? name}
        className={cn(
          "rounded-full object-cover border border-border bg-muted",
          className ?? "h-9 w-9"
        )}
      />
    );
  }
  const idx = hashCode(name || "?") % PALETTE.length;
  return (
    <div
      title={title ?? name}
      aria-hidden={false}
      role="img"
      aria-label={name}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold border border-border/50",
        PALETTE[idx],
        className ?? "h-9 w-9 text-xs"
      )}
    >
      {initialsOf(name || "?")}
    </div>
  );
}
