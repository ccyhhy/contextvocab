import ResetPasswordClient from './reset-password-client'

type SearchValue = string | string[] | undefined

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>
}) {
  const resolvedSearchParams = await searchParams

  return <ResetPasswordClient searchParams={resolvedSearchParams} />
}
