import type { Activity } from '../types'

/**
 * 将活动按本地时间倒序排列 (最新在前)
 */
export function sortActivitiesDesc(activities: Activity[]): Activity[] {
  return [...activities].sort((a, b) => {
    const tA = new Date(a.start_date_local || a.start_date).getTime()
    const tB = new Date(b.start_date_local || b.start_date).getTime()
    return tB - tA
  })
}

/**
 * 获取本地日期的 YYYY-MM-DD 字符串
 */
export function formatLocalDate(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export interface ActivityRouteResolution {
  activity: Activity | null
  isToday?: boolean
  isTodayFallback?: boolean
  targetDate?: string
  notFoundDate?: string
}

/**
 * 解析 URL 路径与参数中的运动轨迹目标:
 * 1. ?run_id=xxx -> 匹配 run_id
 * 2. /today 或 ?date=today -> 匹配当天最新运动 (当天无运动时平滑回退到最新的一场运动)
 * 3. /yyyymmdd (如 /20260927) 或 /yyyy-mm-dd (如 /2026-09-27) -> 匹配该日期的最新运动
 * 4. ?date=yyyymmdd -> 匹配该日期的最新运动
 * 5. /latest -> 匹配全库最新运动
 */
export function resolveActivityFromUrl(
  activities: Activity[],
  rawPathname = '',
  rawSearch = ''
): ActivityRouteResolution {
  if (!activities || activities.length === 0) {
    return { activity: null }
  }

  // 1. 检查是否存在 404.html 重定向缓存 (兼容 GitHub Pages 等静态托管环境)
  let pathname = rawPathname || (typeof window !== 'undefined' ? window.location.pathname : '')
  let search = rawSearch || (typeof window !== 'undefined' ? window.location.search : '')

  if (typeof window !== 'undefined') {
    const redirect = sessionStorage.getItem('redirect')
    if (redirect) {
      sessionStorage.removeItem('redirect')
      try {
        const u = new URL(redirect, window.location.origin)
        pathname = u.pathname
        search = u.search || search
      } catch {
        pathname = redirect
      }
    }
  }

  const sorted = sortActivitiesDesc(activities)
  const params = new URLSearchParams(search)

  // 2. 优先匹配明确指定的 run_id 参数 (如 ?run_id=1790465938000)
  const runId = params.get('run_id')
  if (runId) {
    const act = activities.find(a => String(a.run_id) === runId)
    if (act) {
      return { activity: act }
    }
  }

  // 3. 提取路径中的关键标识符
  const segments = pathname.split('/').filter(Boolean)
  const lastSegment = segments[segments.length - 1]?.trim().toLowerCase() || ''
  const dateParam = params.get('date')?.trim().toLowerCase() || ''

  const targetIdentifier = dateParam || lastSegment

  if (!targetIdentifier) {
    return { activity: null }
  }

  // 内置页面路由跳过活动匹配
  if (['analytics', 'tracks', 'home'].includes(targetIdentifier)) {
    return { activity: null }
  }

  // 4. 匹配 /today (当天最新运动)
  if (targetIdentifier === 'today') {
    const todayStr = formatLocalDate(new Date())
    const todayActs = sorted.filter(a => (a.start_date_local || '').startsWith(todayStr))
    if (todayActs.length > 0) {
      return { activity: todayActs[0], isToday: true, targetDate: todayStr }
    }
    // 当天尚无运动记录时，平滑回退到全库最新的一场运动，避免白屏或404
    return { activity: sorted[0], isToday: true, isTodayFallback: true, targetDate: todayStr }
  }

  // 5. 匹配 /latest (全库最新运动)
  if (targetIdentifier === 'latest') {
    return { activity: sorted[0] }
  }

  // 6. 匹配 /yyyymmdd (如 /20260927) 或 /yyyy-mm-dd (如 /2026-09-27)
  let targetDate = ''
  if (/^\d{8}$/.test(targetIdentifier)) {
    targetDate = `${targetIdentifier.slice(0, 4)}-${targetIdentifier.slice(4, 6)}-${targetIdentifier.slice(6, 8)}`
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(targetIdentifier)) {
    targetDate = targetIdentifier
  }

  if (targetDate) {
    const matchedActs = sorted.filter(a => (a.start_date_local || '').startsWith(targetDate))
    if (matchedActs.length > 0) {
      return { activity: matchedActs[0], targetDate }
    }
    // 该日期没有运动记录
    return { activity: null, notFoundDate: targetDate }
  }

  return { activity: null }
}
