"use client"

import { type ChangeEvent, useEffect, useRef, useState } from "react"
import {
  type HistoryReviewContext,
  toggleFavoriteWord,
  type StudyBatchItem,
  type StudyEnrichmentProgress,
  type StudyLibrary,
  type StudyView,
} from "./actions"
import { isStudyBatchGrammarItem, isStudyBatchWordItem } from "./study-batch-item"
import {
  StudyContextSummary,
  StudyEmptyState,
  StudyEnrichmentSummary,
  StudyEvaluationResult,
  StudyGrammarHelpPanel,
  StudyHistoryReviewPanel,
  StudyGrammarPanel,
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
  initialHistoryReview,
  initialSentenceDraft,
}: {
  initialBatch: StudyBatchItem[]
  initialFavoriteWordIds: string[]
  enrichmentProgress: StudyEnrichmentProgress[]
  libraries: StudyLibrary[]
  initialLibrarySlug: string
  initialHistoryReview?: HistoryReviewContext | null
  initialSentenceDraft?: string
}) {
  const [sentence, setSentence] = useState(initialSentenceDraft ?? "")
  const [submissionMode, setSubmissionMode] = useState<SubmissionMode>("scheduled")
  const [showSentenceHelp, setShowSentenceHelp] = useState(false)
  const [librarySlug, setLibrarySlug] = useState<string>(initialLibrarySlug)
  const [studyView, setStudyView] = useState<StudyView>("all")
  const [favoriteWordIds, setFavoriteWordIds] = useState<string[]>(initialFavoriteWordIds)
  const [favoritePending, setFavoritePending] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showGrammarHints, setShowGrammarHints] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [historyReviewContext, setHistoryReviewContext] =
    useState<HistoryReviewContext | null>(initialHistoryReview ?? null)

  const sentenceInputRef = useRef<HTMLTextAreaElement | null>(null)
  const { speechConfig, availableVoices, updateSpeechConfig, playAudio, saveSpeechConfig } =
    useSpeechSynthesis()
  const { availableLibraries, availableEnrichmentProgress, studySidebarState } =
    useStudySidebarData({
      initialLibraries: libraries,
      initialEnrichmentProgress: enrichmentProgress,
    })
  const {
    currentItem,
    queuedItems,
    loadingNext,
    refillingQueue,
    clearVisibleBatch,
    reloadStudyBatch,
    advanceToNextItem,
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

  const selectedLibrary = availableLibraries.find((item) => item.slug === librarySlug) ?? null
  const selectedLibraryContentType = selectedLibrary?.contentType ?? null
  const currentWord = isStudyBatchWordItem(currentItem) ? currentItem : null
  const currentGrammar = isStudyBatchGrammarItem(currentItem) ? currentItem : null

  const { sentenceHelpItems, sentenceHelpState, sentenceHelpSourceLabel } = useSentenceHelp({
    currentWord,
    enabled: showSentenceHelp && currentWord !== null,
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
    currentItem,
    sentence,
    librarySlug,
    onRequeueReviewedNewWord: requeueReviewedNewWord,
  })

  const selectedEnrichmentProgress =
    selectedLibraryContentType === "grammar"
      ? null
      : availableEnrichmentProgress.find((item) => item.slug === librarySlug) ??
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
      setShowGrammarHints(false)
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
    setHistoryReviewContext(null)
    resetComposerState()
    setSubmissionMode("scheduled")
    await advanceToNextItem({
      nextLibrarySlug,
      nextStudyView,
      isSkipping,
    })
  }

  const handleLibraryChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextLibrarySlug = event.target.value
    const nextLibrary = availableLibraries.find((item) => item.slug === nextLibrarySlug) ?? null
    const nextStudyView = nextLibrary?.contentType === "grammar" ? "all" : studyView

    setLibrarySlug(nextLibrarySlug)
    setStudyView(nextStudyView)
    setHistoryReviewContext(null)
    resetSessionScope()
    clearVisibleBatch()
    setSubmissionMode("scheduled")
    resetComposerState()
    await reloadStudyBatch(nextLibrarySlug, nextStudyView, [])
  }

  const handleStudyModeChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextStudyView = event.target.value as StudyView
    setStudyView(nextStudyView)
    setHistoryReviewContext(null)
    resetSessionScope()
    clearVisibleBatch()
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

  if (!currentItem) {
    return (
      <StudyEmptyState
        availableLibraries={availableLibraries}
        librarySlug={librarySlug}
        studyView={studyView}
        loading={loadingNext}
        selectedLibraryContentType={selectedLibraryContentType}
        onLibraryChange={handleLibraryChange}
        onStudyViewChange={handleStudyModeChange}
        onRefresh={async () => {
          resetSessionScope()
          clearVisibleBatch()
          await reloadStudyBatch(librarySlug, studyView, [])
        }}
      />
    )
  }

  const isFavorite = currentWord ? favoriteWordIds.includes(currentWord.word_id) : false

  return (
    <div className="mx-auto flex w-full flex-col gap-6 max-w-[1600px]">
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
        selectedLibraryContentType={selectedLibraryContentType}
        disabled={loadingNext || status === "submitting"}
        queuedCount={queuedItems.length}
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
        currentQueueCount={queuedItems.length + (currentItem ? 1 : 0)}
      />

      {selectedEnrichmentProgress ? (
        <StudyEnrichmentSummary
          selectedEnrichmentProgress={selectedEnrichmentProgress}
          studySidebarState={studySidebarState}
        />
      ) : null}

      {currentWord ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
          <div className="min-w-0">
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
          </div>

          <div className="min-w-0 space-y-4 lg:sticky lg:top-24">
            {historyReviewContext?.targetKind === "word" ? (
              <StudyHistoryReviewPanel
                review={historyReviewContext}
                onReuseSentence={applySentenceHelp}
              />
            ) : null}

            {status !== "result" && (
              <div className="glass-panel rounded-3xl p-5">
                <StudySentenceComposer
                  targetLabel={currentWord.words.word}
                  sentence={sentence}
                  inputRef={sentenceInputRef}
                  showSentenceHelp={showSentenceHelp}
                  isSubmitting={status === "submitting"}
                  isPracticeMode={submissionMode === "practice"}
                  onSentenceChange={setSentence}
                  onSubmit={() => void submitCurrentSentence(submissionMode)}
                  onToggleHelp={() => setShowSentenceHelp((current) => !current)}
                  onSkip={() => void handleNext(librarySlug, true)}
                />
              </div>
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
        </div>
      ) : currentGrammar ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
          <div className="min-w-0">
            <StudyGrammarPanel currentGrammar={currentGrammar} loadingNext={loadingNext} />
          </div>

          <div className="min-w-0 space-y-4 lg:sticky lg:top-24">
            {historyReviewContext?.targetKind === "grammar" ? (
              <StudyHistoryReviewPanel
                review={historyReviewContext}
                onReuseSentence={applySentenceHelp}
              />
            ) : null}

            {status !== "result" ? (
              <div className="glass-panel rounded-3xl p-5">
                <StudySentenceComposer
                  targetLabel={currentGrammar.grammar.title}
                  sentence={sentence}
                  inputRef={sentenceInputRef}
                  showSentenceHelp={showGrammarHints}
                  isSubmitting={status === "submitting"}
                  isPracticeMode={submissionMode === "practice"}
                  placeholderText={`请写一个明确使用 "${currentGrammar.grammar.pattern}" 的句子...`}
                  submitLabel={submissionMode === "practice" ? "提交重写" : "提交句法练习"}
                  skipLabel="下一张卡片"
                  onSentenceChange={setSentence}
                  onSubmit={() => void submitCurrentSentence(submissionMode)}
                  onToggleHelp={() => setShowGrammarHints((current) => !current)}
                  onSkip={() => void handleNext(librarySlug, true)}
                />
              </div>
            ) : null}

            <StudyGrammarHelpPanel
              visible={showGrammarHints && status !== "result"}
              templates={currentGrammar.grammar.templates}
              examples={currentGrammar.grammar.examples}
              onClose={() => setShowGrammarHints(false)}
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
        </div>
      ) : null}
    </div>
  )
}
