export function Skeleton({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`}
      {...props}
    />
  )
}

export function StatCardSkeleton() {
  return (
    <div className="glass-panel rounded-2xl p-6 flex flex-col gap-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-20" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}

export function WordCardSkeleton() {
  return (
    <div className="glass-panel w-full rounded-3xl p-8 sm:p-10 space-y-6">
      <div className="flex justify-between">
        <div className="space-y-3">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-7 w-16 rounded-full" />
      </div>
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-4 w-40" />
    </div>
  )
}

export function SentenceRowSkeleton() {
  return (
    <div className="glass-panel rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}
