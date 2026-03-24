import type { StudyLibrary, StudyView } from "./actions"

export function normalizeStudyViewForContentType(
  contentType: StudyLibrary["contentType"] | null | undefined,
  studyView: StudyView
) {
  if (contentType === "grammar" && studyView === "favorites") {
    return "all"
  }

  return studyView
}
