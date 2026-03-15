"use client"

import { useEffect, useRef, useState } from "react"
import {
  toggleFavoriteWord,
  type StudyBatchItem,
  type StudyEnrichmentProgress,
  type StudyLibrary,
  type StudyView,
} from "./actions"
import {
  StudyContextSummary,
  StudyEmptyState,
  StudyEnrichmentSummary,
  StudyEvaluationResult,
  StudySentenceComposer,
  StudySentenceHelpPanel,
  StudySpeechSettingsDialog,
  StudyStreamingPreview,
  StudyToolbar,
  StudyWordPanel,
} from "./components"
import {
  DEFAULT_PREVIEW_SENTENCE,
  type SubmissionMode,
  useSentenceHelp,
  useSpeechSynthesis,
  useStudySession,
  useStudySidebarData,
  useStudySubmission,
} from "./hooks"

export default function StudyClient({
  initialBatch,
  initialFavoriteWordIds,
  enrichmentProgress,
  libraries,
  initialLibrarySlug,
}: {
  initialBatch: StudyBatchItem[]
  initialFavoriteWordIds: string[]
  enrichmentProgress: StudyEnrichmentProgress[]
  libraries: StudyLibrary[]
  initialLibrarySlug: string
}) {
  const [sentence, setSentence] = useState("")
  const [submissionMode, setSubmissionMode] = useState<SubmissionMode>("scheduled")
  const [showSentenceHelp, setShowSentenceHelp] = useState(false)
  const [librarySlug, setLibrarySlug] = useState<string>(initialLibrarySlug)
  const [studyView, setStudyView] = useState<StudyView>("all")
  const [favoriteWordIds, setFavoriteWordIds] = useState<string[]>(initialFavoriteWordIds)
  const [favoritePending, setFavoritePending] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [mounted, setMounted] = useState(false)

  const sentenceInputRef = useRef<HTMLTextAreaElement | null>(null)
  const { speechConfig, availableVoices, updateSpeechConfig, playAudio, saveSpeechConfig } =
    useSpeechSynthesis()
  const { availableLibraries, availableEnrichmentProgress, studySidebarState } = useStudySidebarData({
    initialLibraries: libraries,
    initialEnrichmentProgress: enrichmentProgress,
  })
  const {
    currentWord,
    queuedWords,
    loadingNext,
    refillingQueue,
    reloadStudyBatch,
    advanceToNextWord,
    resetSessionScope,
    requeueReviewedNewWord,
  } = useStudySession({
    initialBatch,
    librarySlug,
    studyView,
    onBatchError: () => {
      alert("获取学习批次失败。")
    },
  })
  const { sentenceHelpItems, sentenceHelpState, sentenceHelpSourceLabel } = useSentenceHelp({
    currentWord,
    enabled: showSentenceHelp,
  })
  const {
    status,
    result,
    streamPhase,
    streamProgressChars,
    streamSections,
    submitCurrentSentence,
    resetSubmissionState,
    beginRewrite,
  } = useStudySubmission({
    currentWord,
    sentence,
    librarySlug,
    onRequeueReviewedNewWord: requeueReviewedNewWord,
  })
  const selectedLibrary =
    availableLibraries.find((item) => item.slug === librarySlug) ?? null
  const selectedEnrichmentProgress =
    availableEnrichmentProgress.find((item) => item.slug === librarySlug) ??
    availableEnrichmentProgress.find((item) => item.slug === "all") ??
    null
  const hasLoadedSidebarSummary = studySidebarState === "ready"

  useEffect(() => {
    setMounted(true)
  }, [])

  const resetComposerState = (options?: { preserveSentence?: boolean; keepSentenceHelp?: boolean }) => {
    if (!options?.preserveSentence) {
      setSentence("")
    }
    resetSubmissionState()
    if (!options?.keepSentenceHelp) {
      setShowSentenceHelp(false)
    }
  }

  const applySentenceHelp = (text: string) => {
    setSentence(text)
    setShowSentenceHelp(false)

    requestAnimationFrame(() => {
      const input = sentenceInputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(text.length, text.length)
    })
  }

  const handleRewrite = () => {
    const nextSentence = beginRewrite(sentence)
    resetComposerState({ preserveSentence: true })
    setSubmissionMode("practice")
    setSentence(nextSentence)

    requestAnimationFrame(() => {
      const input = sentenceInputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(nextSentence.length, nextSentence.length)
    })
  }

  const handleNext = async (
    nextLibrarySlug = librarySlug,
    isSkipping = false,
    nextStudyView = studyView
  ) => {
    resetComposerState()
    setSubmissionMode("scheduled")
    await advanceToNextWord({
      nextLibrarySlug,
      nextStudyView,
      isSkipping,
    })
  }

  const handleLibraryChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLibrarySlug = event.target.value
    setLibrarySlug(nextLibrarySlug)
    resetSessionScope()
    setSubmissionMode("scheduled")
    resetComposerState()
    await reloadStudyBatch(nextLibrarySlug, studyView, [])
  }

  const handleStudyModeChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextStudyView = event.target.value as StudyView
    setStudyView(nextStudyView)
    resetSessionScope()
    setSubmissionMode("scheduled")
    resetComposerState()
    await reloadStudyBatch(librarySlug, nextStudyView, [])
  }

  const toggleFavorite = async () => {
    if (!currentWord) return
    setFavoritePending(true)
    try {
      const updatedFavorites = await toggleFavoriteWord(
        currentWord.word_id,
        !favoriteWordIds.includes(currentWord.word_id)
      )
      setFavoriteWordIds(updatedFavorites)
      if (studyView === "favorites" && !updatedFavorites.includes(currentWord.word_id)) {
        await handleNext(librarySlug, false, studyView)
      }
    } catch (error) {
      console.error(error)
      alert(error instanceof Error ? error.message : "收藏更新失败。")
    } finally {
      setFavoritePending(false)
    }
  }

  if (!currentWord) {
    return (
      <StudyEmptyState
        availableLibraries={availableLibraries}
        librarySlug={librarySlug}
        studyView={studyView}
        onLibraryChange={handleLibraryChange}
        onStudyViewChange={handleStudyModeChange}
        onRefresh={() => reloadStudyBatch()}
      />
    )
  }

  const isFavorite = favoriteWordIds.includes(currentWord.word_id)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <StudySpeechSettingsDialog
        open={showSettings}
        speechConfig={speechConfig}
        availableVoices={availableVoices}
        onClose={() => setShowSettings(false)}
        onChangeVoice={(voiceURI) =>
          updateSpeechConfig((current) => ({
            ...current,
            voiceURI,
          }))
        }
        onChangeRate={(ttsRate) =>
          updateSpeechConfig((current) => ({
            ...current,
            ttsRate,
          }))
        }
        onChangePitch={(ttsPitch) =>
          updateSpeechConfig((current) => ({
            ...current,
            ttsPitch,
          }))
        }
        onPreview={() => playAudio(DEFAULT_PREVIEW_SENTENCE)}
        onSave={() => {
          saveSpeechConfig()
          setShowSettings(false)
        }}
      />

      <StudyToolbar
        availableLibraries={availableLibraries}
        librarySlug={librarySlug}
        studyView={studyView}
        disabled={loadingNext || status === "submitting"}
        queuedCount={queuedWords.length}
        loadingNext={loadingNext}
        refillingQueue={refillingQueue}
        onLibraryChange={handleLibraryChange}
        onStudyViewChange={handleStudyModeChange}
        onOpenSettings={() => setShowSettings(true)}
      />

      <StudyContextSummary
        selectedLibrary={selectedLibrary}
        studyView={studyView}
        hasLoadedSidebarSummary={hasLoadedSidebarSummary}
        currentQueueCount={queuedWords.length + (currentWord ? 1 : 0)}
      />

      <StudyEnrichmentSummary
        selectedEnrichmentProgress={selectedEnrichmentProgress}
        studySidebarState={studySidebarState}
      />

      <StudyWordPanel
        currentWord={currentWord}
        isFavorite={isFavorite}
        favoritePending={favoritePending}
        isSubmitting={status === "submitting"}
        onToggleFavorite={() => void toggleFavorite()}
        onPlayAudio={playAudio}
        onApplySentenceHelp={applySentenceHelp}
        loadingNext={loadingNext}
      />

      {status !== "result" && (
        <StudySentenceComposer
          word={currentWord.words.word}
          sentence={sentence}
          inputRef={sentenceInputRef}
          showSentenceHelp={showSentenceHelp}
          isSubmitting={status === "submitting"}
          isPracticeMode={submissionMode === "practice"}
          onSentenceChange={setSentence}
          onSubmit={() => void submitCurrentSentence()}
          onToggleHelp={() => setShowSentenceHelp((current) => !current)}
          onSkip={() => void handleNext(librarySlug, true)}
        />
      )}

      <StudySentenceHelpPanel
        visible={showSentenceHelp}
        sourceLabel={sentenceHelpSourceLabel}
        state={sentenceHelpState}
        items={sentenceHelpItems}
        onClose={() => setShowSentenceHelp(false)}
        onApply={applySentenceHelp}
      />

      <StudyStreamingPreview
        visible={status === "submitting"}
        streamPhase={streamPhase}
        streamProgressChars={streamProgressChars}
        streamSections={streamSections}
      />

      <StudyEvaluationResult
        visible={status === "result"}
        result={result}
        sentence={sentence}
        mounted={mounted}
        onRewrite={handleRewrite}
        onNext={() => void handleNext(librarySlug)}
        onPlayAudio={playAudio}
      />
    </div>
  )
}
