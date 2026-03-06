export default function StudyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center p-4 sm:p-8">
      <div className="flex-1 w-full max-w-2xl pt-4 sm:pt-8">
        {children}
      </div>
    </div>
  )
}
