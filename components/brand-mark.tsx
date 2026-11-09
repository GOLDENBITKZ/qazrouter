import Link from "next/link";

import { cn } from "@/lib/cn";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="group inline-flex items-center gap-3"
      aria-label="QazRouter — главная"
    >
      <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-xl border border-mint-400/30 bg-mint-400/10">
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(77,226,178,.5),transparent_55%)]" />
        <svg
          viewBox="0 0 32 32"
          className="relative h-5 w-5"
          aria-hidden="true"
        >
          <path
            d="M7 10.5 16 5l9 5.5v11L16 27l-9-5.5v-11Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            className="text-mint-400"
          />
          <path
            d="m11.5 16 3 3 6.5-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white"
          />
        </svg>
      </span>
      {!compact && (
        <span className="text-[15px] font-semibold tracking-tight text-white">
          Qaz<span className="text-mint-400">Router</span>
        </span>
      )}
    </Link>
  );
}

export function StatusDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-2 w-2 rounded-full bg-mint-400",
        className
      )}
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-mint-400/50" />
    </span>
  );
}
