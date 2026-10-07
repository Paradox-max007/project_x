"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RatingStars({
  value,
  showValue = true,
  size = 14,
  className,
}: {
  value: number;
  showValue?: boolean;
  size?: number;
  className?: string;
}) {
  const safe = Math.max(0, Math.min(5, value));
  const color =
    safe >= 4 ? "text-amber-500" : safe >= 2.5 ? "text-amber-400" : "text-rose-500";
  return (
    <div className={cn("flex items-center gap-1", className)} title={`Rating: ${safe.toFixed(1)} / 5`}>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            size={size}
            className={cn(
              i <= Math.round(safe) ? `${color} fill-current` : "text-muted-foreground/30"
            )}
          />
        ))}
      </div>
      {showValue && (
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {safe.toFixed(1)}
        </span>
      )}
    </div>
  );
}
