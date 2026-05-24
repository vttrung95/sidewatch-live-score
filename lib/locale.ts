/**
 * lib/locale.ts — Sidewatch
 *
 * Timezone-aware helpers cho mọi thao tác với date/time.
 * Nguồn ưu tiên: localStorage > browser auto-detect > UTC fallback
 *
 * Dùng cho:
 *  - MLB Stats API date param (?date=YYYY-MM-DD)
 *  - Hiển thị giờ bắt đầu trận UPCOMING
 *  - Yesterday fallback logic
 *  - Footer label "Timezone: ..."
 *  - Sync lên user_preferences khi đã login
 */

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const STORAGE_KEY_TZ = 'sidewatch_timezone'
const STORAGE_KEY_LANG = 'sidewatch_language'
const SUPPORTED_LANGUAGES = ['en', 'vi'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

// ─────────────────────────────────────────────
// Core: lấy timezone đang active
// ─────────────────────────────────────────────

/**
 * Trả về timezone string hiện tại theo thứ tự ưu tiên:
 *  1. localStorage (user đã set thủ công)
 *  2. Browser auto-detect qua Intl API
 *  3. 'UTC' fallback
 */
export function getActiveTimezone(): string {
  if (typeof window === 'undefined') return 'UTC' // SSR guard

  const saved = localStorage.getItem(STORAGE_KEY_TZ)
  if (saved) return saved

  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (detected) return detected
  } catch {
    // Intl không available — cực kỳ hiếm, chỉ trên browser cổ
  }

  return 'UTC'
}

/**
 * Save timezone vào localStorage (gọi khi user chọn thủ công từ F7 popup,
 * hoặc khi sync từ user_preferences sau login).
 */
export function setTimezone(tz: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY_TZ, tz)
}

// ─────────────────────────────────────────────
// Core: lấy language đang active
// ─────────────────────────────────────────────

export function getActiveLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'en'

  const saved = localStorage.getItem(STORAGE_KEY_LANG) as SupportedLanguage
  if (saved && SUPPORTED_LANGUAGES.includes(saved)) return saved

  try {
    const browserLang = navigator.language?.split('-')[0]
    if (browserLang === 'vi') return 'vi'
  } catch {}

  return 'en'
}

export function setLanguage(lang: SupportedLanguage): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY_LANG, lang)
}

// ─────────────────────────────────────────────
// Date helpers — dùng cho MLB API
// ─────────────────────────────────────────────

/**
 * Trả về date string 'YYYY-MM-DD' theo local timezone của user.
 *
 * QUAN TRỌNG: MLB Stats API nhận ?date=YYYY-MM-DD theo local date,
 * KHÔNG phải UTC date. Dùng hàm này thay cho:
 *   new Date().toISOString().split('T')[0]  ← SAI với timezone UTC-N
 *
 * @param offset  0 = hôm nay, -1 = hôm qua, 1 = ngày mai
 * @param tz      timezone override (mặc định lấy từ getActiveTimezone())
 */
export function getLocalDateString(offset = 0, tz?: string): string {
  const timezone = tz ?? getActiveTimezone()

  // Tính ngày cần lấy bằng cách offset từ now
  const target = new Date()
  target.setDate(target.getDate() + offset)

  // 'en-CA' locale luôn trả về 'YYYY-MM-DD' — format chuẩn cho MLB API
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(target)
}

/**
 * Hôm nay theo local timezone → string 'YYYY-MM-DD'
 */
export function getTodayString(tz?: string): string {
  return getLocalDateString(0, tz)
}

/**
 * Hôm qua theo local timezone → string 'YYYY-MM-DD'
 *
 * Dùng cho yesterday fallback trong GameSelector:
 *   const yesterday = getYesterdayString()
 *   fetch(`/api/scores?date=${yesterday}`)
 */
export function getYesterdayString(tz?: string): string {
  return getLocalDateString(-1, tz)
}

// ─────────────────────────────────────────────
// Time display — dùng cho UPCOMING games
// ─────────────────────────────────────────────

/**
 * Format giờ bắt đầu trận sang local timezone của user.
 *
 * MLB API trả về startTime dạng ISO UTC, ví dụ: "2026-05-25T17:10:00Z"
 * → User VN thấy: "12:10 AM" (sáng sớm)
 * → User ET thấy:  "1:10 PM"
 * → User PT thấy: "10:10 AM"
 *
 * @param isoString  ISO 8601 UTC string từ MLB API
 * @param tz         timezone override
 */
export function formatGameTime(isoString: string, tz?: string): string {
  const timezone = tz ?? getActiveTimezone()

  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    }).format(new Date(isoString))
  } catch {
    // Parse fail — trả về raw string thay vì crash
    return isoString
  }
}

/**
 * Format giờ kèm timezone label ngắn, dùng trong tooltip hoặc widget header.
 * Ví dụ: "1:10 PM ET" hoặc "12:10 AM +7"
 */
export function formatGameTimeWithZone(isoString: string, tz?: string): string {
  const timezone = tz ?? getActiveTimezone()

  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
      timeZone: timezone,
    }).format(new Date(isoString))
  } catch {
    return isoString
  }
}

// ─────────────────────────────────────────────
// Footer label
// ─────────────────────────────────────────────

/**
 * Trả về label hiển thị ở footer, ví dụ:
 *  - "Ho Chi Minh GMT+7"
 *  - "New York GMT-4"
 *  - "Tokyo GMT+9"
 *
 * Thay thế hardcode "GMT+7" trong page.tsx
 */
export function getTimezoneLabel(tz?: string): string {
  const timezone = tz ?? getActiveTimezone()

  // Lấy offset string (e.g. "GMT+7")
  let offsetLabel = ''
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'shortOffset',
      timeZone: timezone,
    }).formatToParts(new Date())

    offsetLabel = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {}

  // Lấy tên city từ timezone string (e.g. "Asia/Ho_Chi_Minh" → "Ho Chi Minh")
  const cityRaw = timezone.split('/').pop() ?? timezone
  const cityName = cityRaw.replace(/_/g, ' ')

  return `${cityName} ${offsetLabel}`.trim()
  // → "Ho Chi Minh GMT+7" | "New_York GMT-4" | "Tokyo GMT+9"
}

// ─────────────────────────────────────────────
// Yesterday fallback — logic hoàn chỉnh
// ─────────────────────────────────────────────

/**
 * Kiểm tra xem một danh sách games có "worth showing" không.
 * Dùng để quyết định có fallback về yesterday hay không.
 *
 * Logic: fallback khi không có game nào LIVE hoặc FINAL
 * (tức là chỉ toàn UPCOMING hoặc danh sách trống)
 */
export function shouldFallbackToYesterday(games: Array<{ status: string }>): boolean {
  if (games.length === 0) return true

  const hasActiveGames = games.some(
    (g) => g.status === 'In Progress' || g.status === 'Final'
  )

  return !hasActiveGames
}

/**
 * Helper tổng hợp: trả về date string đúng để fetch MLB schedule,
 * với logic fallback tích hợp.
 *
 * Usage trong GameSelector:
 *
 *   const dateToFetch = await resolveScheduleDate()
 *   const games = await fetchGames(dateToFetch)
 *
 * Hoặc nếu đã fetch today rồi:
 *
 *   const todayGames = await fetchGames(getTodayString())
 *   const dateToFetch = shouldFallbackToYesterday(todayGames)
 *     ? getYesterdayString()
 *     : getTodayString()
 */
export function getScheduleDateLabel(isYesterdayFallback: boolean): string {
  return isYesterdayFallback ? "Yesterday's games" : "Today's games"
}
