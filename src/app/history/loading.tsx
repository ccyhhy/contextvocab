import { SentenceRowSkeleton } from "../components/skeleton"

export default function HistoryLoading() {
  return (
    <div className="w-full max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
      <div className="space-y-2">
        <div className="animate-pulse h-8 w-32 rounded-lg bg-white/[0.06]" />
        <div className="animate-pulse h-4 w-48 rounded bg-white/[0.06]" />
      </div>
      <div className="flex gap-3">
        <div className="animate-pulse h-10 flex-1 rounded-xl bg-white/[0.06]" />
        <div className="animate-pulse h-10 w-40 rounded-xl bg-white/[0.06]" />
      </div>
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <SentenceRowSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
