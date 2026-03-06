import { StatCardSkeleton } from "../components/skeleton"

export default function DashboardLoading() {
  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-8 space-y-8">
      <div className="space-y-2">
        <div className="animate-pulse h-8 w-40 rounded-lg bg-white/[0.06]" />
        <div className="animate-pulse h-4 w-56 rounded bg-white/[0.06]" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="animate-pulse h-20 w-full rounded-2xl bg-white/[0.06]" />
      <div className="space-y-2">
        <div className="animate-pulse h-5 w-36 rounded bg-white/[0.06]" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse h-14 w-full rounded-xl bg-white/[0.06]" />
        ))}
      </div>
    </div>
  )
}
