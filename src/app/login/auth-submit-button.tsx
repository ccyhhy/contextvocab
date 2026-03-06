"use client"

import type { ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useFormStatus } from 'react-dom'
import { cn } from '@/lib/utils'

type AuthButtonTone = 'blue' | 'emerald' | 'amber'

const toneClasses: Record<AuthButtonTone, string> = {
  blue: 'border-blue-400/20 bg-blue-500 text-white shadow-[0_12px_30px_-12px_rgba(59,130,246,0.85)] hover:bg-blue-400 active:bg-blue-300',
  emerald:
    'border-emerald-400/20 bg-emerald-500/14 text-emerald-100 shadow-[0_12px_30px_-12px_rgba(16,185,129,0.75)] hover:bg-emerald-500/22 active:bg-emerald-500/28',
  amber:
    'border-amber-400/20 bg-amber-500/14 text-amber-100 shadow-[0_12px_30px_-12px_rgba(245,158,11,0.75)] hover:bg-amber-500/22 active:bg-amber-500/28',
}

interface AuthSubmitButtonProps {
  children: ReactNode
  pendingLabel: string
  tone: AuthButtonTone
  icon?: ReactNode
  className?: string
}

export default function AuthSubmitButton({
  children,
  pendingLabel,
  tone,
  icon,
  className,
}: AuthSubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-live="polite"
      className={cn(
        'group relative inline-flex w-full items-center justify-center overflow-hidden rounded-2xl border px-4 py-3 text-sm font-semibold transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-black/30',
        'disabled:cursor-not-allowed disabled:scale-[0.99] disabled:opacity-85',
        toneClasses[tone],
        className
      )}
    >
      <span
        className={cn(
          'pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_20%,rgba(255,255,255,0.22)_50%,transparent_80%)] transition-transform duration-700',
          pending ? 'translate-x-0 opacity-100' : '-translate-x-[180%] opacity-0 group-hover:translate-x-[180%] group-hover:opacity-100'
        )}
      />
      <span className="absolute inset-0 bg-black/0 transition-colors duration-200 group-active:bg-black/10" />
      <span className="relative flex items-center justify-center gap-2">
        {pending ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" />
            <span>{pendingLabel}</span>
          </>
        ) : (
          <>
            <span>{children}</span>
            {icon}
          </>
        )}
      </span>
    </button>
  )
}
