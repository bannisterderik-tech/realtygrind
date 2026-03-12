// Returns YYYY-MM-DD for a given IANA timezone (or browser default)
export function getTodayStr(timezone) {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  return new Date().toLocaleDateString('en-CA', { timeZone: tz })
}
