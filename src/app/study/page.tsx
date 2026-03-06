import { getNextWord } from "./actions"
import StudyClient from "./study-client"

export default async function StudyPage() {
  const initialWord = await getNextWord()

  return (
    <div className="w-full h-full flex items-center justify-center">
      <StudyClient initialWord={initialWord} />
    </div>
  )
}

