import 'server-only'

const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'Asia/Shanghai'

function getDateFormatter(timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function formatDateParts(date: Date, timeZone: string) {
  const parts = getDateFormatter(timeZone).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error('Failed to format date parts')
  }

  return { year, month, day }
}

export function formatDateInAppTimeZone(value: Date | string | number, timeZone = APP_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date value')
  }

  const { year, month, day } = formatDateParts(date, timeZone)
  return `${year}-${month}-${day}`
}

export function getTodayDateString(now: Date = new Date(), timeZone = APP_TIME_ZONE) {
  return formatDateInAppTimeZone(now, timeZone)
}

export function shiftDateString(dateString: string, days: number) {
  const [year, month, day] = dateString.split('-').map(Number)
  if (!year || !month || !day) {
    throw new Error(`Invalid date string: ${dateString}`)
  }

  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)

  const nextYear = String(date.getUTCFullYear())
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0')
  const nextDay = String(date.getUTCDate()).padStart(2, '0')

  return `${nextYear}-${nextMonth}-${nextDay}`
}
