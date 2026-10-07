"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  iconClass,
  hint,
  onClick,
  accent,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  iconClass?: string;
  hint?: string;
  onClick?: () => void;
  accent?: "emerald" | "amber" | "rose" | "teal" | "zinc" | "orange";
}) {
  const accents: Record<string, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    rose: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
    teal: "text-teal-600 dark:text-teal-400 bg-teal-500/10",
    zinc: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10",
    orange: "text-orange-600 dark:text-orange-400 bg-orange-500/10",
  };
  return (
    <Card
      className={cn(
        "transition-all",
        onClick &&
          "cursor-pointer hover:shadow-md hover:border-primary/40 active:scale-[0.99] focus-within:ring-2 focus-within:ring-ring"
      )}
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <CardContent className="flex items-center gap-4 p-4 sm:p-5">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            accents[accent ?? "zinc"],
            iconClass
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="line-clamp-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums leading-tight">{value}</p>
          {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4 sm:p-5">
        <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-14" />
        </div>
      </CardContent>
    </Card>
  );
}
