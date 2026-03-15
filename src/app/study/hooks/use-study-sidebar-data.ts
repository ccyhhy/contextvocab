"use client"

import { startTransition, useEffect, useState } from "react"
import {
  getStudySidebarData,
  type StudyEnrichmentProgress,
  type StudyLibrary,
} from "../actions"

export type StudySidebarState = "loading" | "ready" | "error"

export function useStudySidebarData({
  initialLibraries,
  initialEnrichmentProgress,
}: {
  initialLibraries: StudyLibrary[]
  initialEnrichmentProgress: StudyEnrichmentProgress[]
}) {
  const [availableLibraries, setAvailableLibraries] = useState<StudyLibrary[]>(initialLibraries)
  const [availableEnrichmentProgress, setAvailableEnrichmentProgress] =
    useState<StudyEnrichmentProgress[]>(initialEnrichmentProgress)
  const [studySidebarState, setStudySidebarState] = useState<StudySidebarState>(
    initialEnrichmentProgress.length > 0 ? "ready" : "loading"
  )

  useEffect(() => {
    if (studySidebarState !== "loading") {
      return
    }

    let cancelled = false

    void getStudySidebarData()
      .then((sidebarData) => {
        if (cancelled) {
          return
        }

        startTransition(() => {
          setAvailableLibraries(sidebarData.libraries)
          setAvailableEnrichmentProgress(sidebarData.enrichmentProgress)
          setStudySidebarState("ready")
        })
      })
      .catch((error) => {
        console.error(error)
        if (cancelled) {
          return
        }

        setStudySidebarState("error")
      })

    return () => {
      cancelled = true
    }
  }, [studySidebarState])

  return {
    availableLibraries,
    availableEnrichmentProgress,
    studySidebarState,
  }
}
