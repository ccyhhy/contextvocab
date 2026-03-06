import { WordCardSkeleton } from "../components/skeleton"

export default function StudyLoading() {
  return (
    <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between w-full mb-4">
        <div className="animate-pulse h-8 w-40 rounded-lg bg-white/[0.06]" />
      </div>
      <WordCardSkeleton />
      <div className="w-full space-y-4">
        <div className="animate-pulse h-36 w-full rounded-3xl bg-white/[0.06]" />
        <div className="flex justify-between">
          <div className="animate-pulse h-10 w-28 rounded-lg bg-white/[0.06]" />
          <div className="animate-pulse h-10 w-32 rounded-lg bg-white/[0.06]" />
        </div>
      </div>
    </div>
  )
}
