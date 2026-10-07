import { useMemo, useRef, useState, useEffect } from 'react'
import { toPng } from 'html-to-image'
import type { Activity, SportFilter } from '../types'
import { WORKOUT_TYPES } from '../types'
import { getAvailableYears, parseMovingTime, formatKm } from '../hooks/useActivities'
import { useLocale } from '../hooks/useLocale'
import { BrandingBar } from './BrandingBar'


interface HeatmapProps {
  activities: Activity[]
  year: number
  filter: SportFilter
  onSelectActivity?: (a: Activity | null) => void
}

// Map any activity type to the 4 display categories
function toDisplayType(type: string): 'Run' | 'Ride' | 'Hike' | 'Training' {
  if (type === 'Run') return 'Run'
  if (type === 'Ride') return 'Ride'
  if (type === 'Hike') return 'Hike'
  return 'Training'
}

const TYPE_PALETTES: Record<string, string[]> = {
  Run:      ['#fed7aa', '#fb923c', '#f97316', '#ea580c'],
  Ride:     ['#bfdbfe', '#60a5fa', '#3b82f6', '#2563eb'],
  Hike:     ['#bbf7d0', '#4ade80', '#22c55e', '#16a34a'],
  Training: ['#fce7f3', '#f9a8d4', '#ec4899', '#db2777'],
}

// Color for single-filter modes (intensity by global max)
function getColor(distance: number, max: number, filter: SportFilter): string {
  if (distance === 0) return 'var(--color-border)'
  const level = Math.ceil(Math.min(distance / max, 1) * 4)
  const colors: Record<string, string[]> = {
    all:  ['#e9d5ff', '#c084fc', '#a855f7', '#7c3aed'],
    Run:  TYPE_PALETTES.Run,
    Ride: TYPE_PALETTES.Ride,
    Hike: TYPE_PALETTES.Hike,
    Gym:  ['#f5d0fe', '#d946ef', '#c026d3', '#a21caf'],
  }
  const palette = colors[filter] ?? colors.all
  return palette[level - 1] ?? palette[0]
}

// Color for "all" mode: ratio is per-type (dayDist / typeMax)
function getColorAll(typeRatio: number, displayType: string): string {
  if (typeRatio === 0) return 'var(--color-border)'
  const level = Math.ceil(Math.min(typeRatio, 1) * 4)
  const palette = TYPE_PALETTES[displayType] ?? TYPE_PALETTES.Training
  return palette[level - 1] ?? palette[0]
}

function typeIcon(type: string): string {
  const icons: Record<string, string> = {
    Run: '🏃',
    Ride: '🚴',
    Hike: '🥾',
  }
  return icons[type] ?? '📌'
}

function typeLabel(type: string, locale: string): string {
  const map: Record<string, { zh: string; en: string }> = {
    Run:      { zh: '跑步', en: 'Run' },
    Ride:     { zh: '骑行', en: 'Ride' },
    Hike:     { zh: '徒步', en: 'Hike' },
    Training: { zh: '训练', en: 'Training' },
    WeightTraining: { zh: '力量训练', en: 'Weight Training' },
    Workout:        { zh: '综合训练', en: 'Workout' },
    StairStepper:   { zh: '楼梯机',   en: 'Stair Stepper' },
    WaterSport:     { zh: '水上运动', en: 'Water Sport' },
  }
  return map[type]?.[locale as 'zh' | 'en'] ?? type
}

// Dominant display type for a day (by distance; Training is fallback)
function dominantDisplayType(acts: Activity[]): 'Run' | 'Ride' | 'Hike' | 'Training' {
  if (acts.length === 0) return 'Training'
  const sorted = [...acts].sort((a, b) => b.distance - a.distance)
  return toDisplayType(sorted[0].type)
}

export function ContributionHeatmap({ activities, year: defaultYear, filter, onSelectActivity }: HeatmapProps) {
  const { t, locale } = useLocale()
  const allYears = getAvailableYears(activities)
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(defaultYear)

  useEffect(() => {
    setSelectedYear(defaultYear)
  }, [defaultYear])

  // windowStart: index into allYears of the first visible year (0-based, 0 is the most recent year)
  const [windowStart, setWindowStart] = useState(0)
  const captureRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  const isGym = filter === 'Gym'
  const isAll = filter === 'all'

  function buildYearGrid(yr: number, acts: Activity[]) {
    const yearActivities = acts.filter((a) => new Date(a.start_date_local).getFullYear() === yr)

    const totalDist = yearActivities.reduce((s, a) => s + a.distance, 0)
    const totalTime = yearActivities.reduce((s, a) => s + parseMovingTime(a.moving_time), 0)
    const runs = yearActivities.filter((a) => a.type === 'Run')
    const avgPace = runs.length > 0 ? runs.reduce((s, a) => s + a.average_speed, 0) / runs.length : 0

    // Per-type stats
    const typeStats: Record<string, { distance: number; count: number }> = {}
    for (const a of yearActivities) {
      if (!typeStats[a.type]) typeStats[a.type] = { distance: 0, count: 0 }
      typeStats[a.type].distance += a.distance
      typeStats[a.type].count += 1
    }

    // Per-day totals
    const dayMap = new Map<string, number>()
    const dayTimeMap = new Map<string, number>() // date → total seconds (for Training)
    const dayActivitiesMap = new Map<string, Activity[]>()
    for (const a of yearActivities) {
      const day = a.start_date_local.slice(0, 10)
      dayMap.set(day, (dayMap.get(day) || 0) + (isGym ? 1 : (a.distance > 0 ? a.distance : 1)))
      dayTimeMap.set(day, (dayTimeMap.get(day) || 0) + parseMovingTime(a.moving_time))
      const arr = dayActivitiesMap.get(day) || []
      arr.push(a)
      dayActivitiesMap.set(day, arr)
    }

    // Per-type max (for "all" mode per-type intensity)
    // Training uses time (seconds), others use distance
    const typeMaxMap: Record<string, number> = { Run: 1, Ride: 1, Hike: 1, Training: 1 }
    if (isAll) {
      dayActivitiesMap.forEach((dayActs, day) => {
        const domType = dominantDisplayType(dayActs)
        const value = domType === 'Training'
          ? (dayTimeMap.get(day) || 0)
          : dayActs.reduce((s, a) => s + (a.distance > 0 ? a.distance : 0), 0)
        if (value > typeMaxMap[domType]) typeMaxMap[domType] = value
      })
    }

    const maxVal = Math.max(...dayMap.values(), 1)

    const startDate = new Date(yr, 0, 1)
    const startDay = startDate.getDay()
    const grid: { date: string; distance: number; timeSecs: number; activities: Activity[]; domType: string; typeRatio: number; isDummy?: boolean }[][] = []
    const monthPositions: { label: string; weekIdx: number }[] = []
    let currentMonth = -1
    const totalDays = Math.round((new Date(yr, 11, 31).getTime() - startDate.getTime()) / 86400000) + 1

    // 第一周前面填充 startDay 个 dummy 占位块
    if (startDay > 0) {
      grid.push([])
      for (let i = 0; i < startDay; i++) {
        grid[0].push({ date: '', distance: 0, timeSecs: 0, activities: [], domType: 'Training', typeRatio: 0, isDummy: true })
      }
    }

    for (let d = 0; d < totalDays; d++) {
      const date = new Date(yr, 0, 1 + d)
      const weekIdx = Math.floor((d + startDay) / 7)
      while (grid.length <= weekIdx) grid.push([])
      const key = `${yr}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const dayActs = dayActivitiesMap.get(key) || []
      const dist = dayMap.get(key) || 0
      const domType = dominantDisplayType(dayActs)
      const typeValue = domType === 'Training'
        ? (dayTimeMap.get(key) || 0)
        : dayActs.reduce((s, a) => s + (a.distance > 0 ? a.distance : 0), 0)
      const typeRatio = typeValue / (typeMaxMap[domType] ?? 1)
      grid[weekIdx].push({ date: key, distance: dist, timeSecs: dayTimeMap.get(key) || 0, activities: dayActs, domType, typeRatio })
      if (date.getMonth() !== currentMonth) {
        currentMonth = date.getMonth()
        monthPositions.push({ label: `${currentMonth + 1}`, weekIdx })
      }
    }

    // 最后一周补齐 7 天
    const lastWeek = grid[grid.length - 1]
    if (lastWeek && lastWeek.length < 7) {
      const needed = 7 - lastWeek.length
      for (let i = 0; i < needed; i++) {
        lastWeek.push({ date: '', distance: 0, timeSecs: 0, activities: [], domType: 'Training', typeRatio: 0, isDummy: true })
      }
    }

    return { grid, max: maxVal, monthPositions, stats: { count: yearActivities.length, distance: totalDist, time: totalTime, pace: avgPace, typeStats } }
  }

  const yearData = useMemo(() => {
    if (selectedYear === 'all') {
      return allYears.map(yr => ({ year: yr, ...buildYearGrid(yr, activities) }))
    }
    return [{ year: selectedYear, ...buildYearGrid(selectedYear, activities) }]
  }, [activities, selectedYear, filter])

  const dayLabels = locale === 'zh' ? ['', '一', '', '三', '', '五', ''] : ['', 'M', '', 'W', '', 'F', '']

  // Which display types are present this year
  const presentDisplayTypes = useMemo(() => {
    if (!isAll) return []
    const yearToCheck = selectedYear === 'all' ? null : selectedYear
    const types = new Set(
      activities
        .filter(a => yearToCheck === null || new Date(a.start_date_local).getFullYear() === yearToCheck)
        .map(a => toDisplayType(a.type))
    )
    return (['Run', 'Ride', 'Hike', 'Training'] as const).filter(t => types.has(t))
  }, [activities, selectedYear, isAll])

  // Gym: monthly session breakdown
  const gymMonthlyData = useMemo(() => {
    if (!isGym || selectedYear === 'all') return []
    return Array.from({ length: 12 }, (_, m) => {
      const monthActs = activities.filter(a => {
        const d = new Date(a.start_date_local)
        return d.getFullYear() === selectedYear && d.getMonth() === m
      })
      const byType = Object.fromEntries(
        WORKOUT_TYPES.map(t => [t, monthActs.filter(a => a.type === t).length])
      )
      return { month: m, total: monthActs.length, byType }
    })
  }, [activities, selectedYear, isGym])

  const gymTypeColors: Record<string, string> = {
    WeightTraining: '#f97316',
    Workout:        '#c026d3',
    StairStepper:   '#3b82f6',
    WaterSport:     '#06b6d4',
  }

  const heatmapTitle = filter === 'Run'  ? (locale === 'zh' ? '跑步热力图' : 'Run Heatmap')
    : filter === 'Ride' ? (locale === 'zh' ? '骑行热力图' : 'Ride Heatmap')
    : filter === 'Hike' ? (locale === 'zh' ? '徒步热力图' : 'Hike Heatmap')
    : filter === 'Gym'  ? (locale === 'zh' ? '健身热力图' : 'Gym Heatmap')
    : t('heatmapTitle')

  const handleSelectYear = (yr: number | 'all') => {
    setSelectedYear(yr)
  }

  const [visibleCount, setVisibleCount] = useState(() => {
    if (typeof window !== 'undefined') {
      if (window.innerWidth >= 1280) return 12
      if (window.innerWidth >= 768) return 8
      if (window.innerWidth >= 640) return 6
    }
    return 8
  })

  useEffect(() => {
    const updateCount = () => {
      if (window.innerWidth >= 1280) {
        setVisibleCount(12)
      } else if (window.innerWidth >= 768) {
        setVisibleCount(8)
      } else if (window.innerWidth >= 640) {
        setVisibleCount(6)
      } else {
        setVisibleCount(4)
      }
    }
    updateCount()
    window.addEventListener('resize', updateCount)
    return () => window.removeEventListener('resize', updateCount)
  }, [])

  const needPagination = allYears.length > visibleCount
  const visibleYears = needPagination ? allYears.slice(windowStart, windowStart + visibleCount) : allYears
  const canScrollLeft = needPagination && windowStart > 0
  const canScrollRight = needPagination && windowStart + visibleCount < allYears.length

  const shiftWindow = (dir: -1 | 1) => {
    setWindowStart(prev => Math.min(Math.max(0, prev + dir), Math.max(0, allYears.length - visibleCount)))
  }

  // 原生 Canvas 降级导出机制
  const exportViaCanvas = () => {
    try {
      const dpr = 2
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const width = 860
      const rowHeight = 160
      const headerHeight = 70
      const footerHeight = 80
      const totalHeight = headerHeight + yearData.length * rowHeight + footerHeight

      canvas.width = width * dpr
      canvas.height = totalHeight * dpr
      ctx.scale(dpr, dpr)

      const isDark = document.documentElement.classList.contains('dark')
      ctx.fillStyle = isDark ? '#0f172a' : '#ffffff'
      ctx.fillRect(0, 0, width, totalHeight)

      ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a'
      ctx.font = 'bold 18px sans-serif'
      ctx.fillText(heatmapTitle, 24, 40)

      yearData.forEach((yData, yIdx) => {
        const startY = headerHeight + yIdx * rowHeight
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b'
        ctx.font = 'bold 14px sans-serif'
        ctx.fillText(`${yData.year}`, 24, startY + 20)

        ctx.font = '11px sans-serif'
        ctx.fillStyle = isDark ? '#64748b' : '#94a3b8'
        yData.monthPositions.forEach((m) => {
          const x = 50 + m.weekIdx * 15
          const monthText = locale === 'zh' ? `${m.label}月` : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m.label) - 1]
          ctx.fillText(monthText, x, startY + 20)
        })

        yData.grid.forEach((week, wIdx) => {
          week.forEach((day, dIdx) => {
            if ((day as any).isDummy) return
            const x = 50 + wIdx * 15
            const y = startY + 30 + dIdx * 15
            let color = day.distance === 0 ? (isDark ? '#1e293b' : '#e2e8f0') : (isAll ? getColorAll(day.typeRatio, day.domType) : getColor(day.distance, yData.max, filter))
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.roundRect(x, y, 12, 12, 2)
            ctx.fill()
          })
        })
      })

      const footerY = totalHeight - 40
      ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a'
      ctx.font = 'bold 14px sans-serif'
      ctx.fillText('蓝皮书的 Workouts Page', 24, footerY)
      ctx.fillStyle = isDark ? '#64748b' : '#94a3b8'
      ctx.font = '11px sans-serif'
      ctx.fillText('https://run.liups.com', 24, footerY + 18)

      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = `heatmap-${selectedYear === 'all' ? 'all' : selectedYear}.png`
      link.href = dataUrl
      link.click()
    } catch (e) {
      console.error('Canvas export failed:', e)
      alert(locale === 'zh' ? '导出图片失败，请稍后重试' : 'Failed to export image')
    }
  }

  const handleExport = async () => {
    if (!captureRef.current || exporting) return
    setExporting(true)
    try {
      const el = captureRef.current
      el.classList.add('exporting')
      const prevOverflow = el.style.overflow
      el.style.overflow = 'visible'

      await new Promise(resolve => requestAnimationFrame(resolve))

      const computedBg = getComputedStyle(el).backgroundColor
      const dataUrl = await toPng(el, {
        backgroundColor: computedBg === 'rgba(0, 0, 0, 0)' || computedBg === 'transparent'
          ? '#ffffff'
          : computedBg,
        pixelRatio: 2,
        cacheBust: false,
        filter: (node) => !(node instanceof HTMLElement && node.hasAttribute('data-export-hidden')),
      })

      el.classList.remove('exporting')
      el.style.overflow = prevOverflow

      const link = document.createElement('a')
      link.download = `heatmap-${selectedYear === 'all' ? 'all' : selectedYear}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.warn('html-to-image failed, falling back to Canvas renderer:', err)
      exportViaCanvas()
    } finally {
      setExporting(false)
    }
  }

  // Aggregate stats for "all" mode
  const allStats = useMemo(() => {
    if (selectedYear !== 'all') return null
    const count = yearData.reduce((s, d) => s + d.stats.count, 0)
    const distance = yearData.reduce((s, d) => s + d.stats.distance, 0)
    const time = yearData.reduce((s, d) => s + d.stats.time, 0)
    // Aggregate per-type stats across all years
    const typeStats: Record<string, { distance: number; count: number }> = {}
    for (const yd of yearData) {
      for (const [type, stat] of Object.entries(yd.stats.typeStats)) {
        if (!typeStats[type]) typeStats[type] = { distance: 0, count: 0 }
        typeStats[type].distance += stat.distance
        typeStats[type].count += stat.count
      }
    }
    return { count, distance, time, typeStats }
  }, [yearData, selectedYear])

  return (
    <div ref={captureRef} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-5 overflow-x-auto">
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes expandDown {
          from { opacity: 0; transform: scaleY(0.92) translateY(-8px); }
          to { opacity: 1; transform: scaleY(1) translateY(0); }
        }
        .heatmap-all-years {
          transform-origin: top center;
          animation: expandDown 0.38s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .heatmap-year-row {
          animation: fadeSlideIn 0.32s ease-out both;
        }
        .exporting,
        .exporting *,
        .exporting *::before,
        .exporting *::after {
          animation: none !important;
          transition: none !important;
        }
      `}</style>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        {/* Top: title + export button */}
        <div className="flex items-center justify-between sm:justify-start gap-3">
          <h2 className="text-base sm:text-lg font-semibold whitespace-nowrap">{heatmapTitle}</h2>
          
          {/* Mobile export button */}
          <button
            onClick={handleExport}
            disabled={exporting}
            data-export-hidden
            className="sm:hidden w-7 h-7 flex items-center justify-center rounded text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-50 transition-all bg-[var(--color-bg)] border border-[var(--color-border)]"
            title={locale === 'zh' ? '导出图片' : 'Export as image'}
          >
            {exporting ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
          </button>
        </div>

        {/* Year Pills + Desktop Export */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full">
          {/* ALL button */}
          <button
            onClick={() => handleSelectYear('all')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all shrink-0 ${
              selectedYear === 'all' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {locale === 'zh' ? '全部' : 'ALL'}
          </button>

          <span className="w-px h-3 bg-[var(--color-border)] shrink-0" />

          {/* Left arrow (仅在需要分页时显示) */}
          {needPagination && (
            <button
              onClick={() => shiftWindow(-1)}
              disabled={!canScrollLeft}
              className="w-5 h-5 flex items-center justify-center rounded transition-all disabled:opacity-20 text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:cursor-not-allowed shrink-0"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Visible year buttons */}
          {visibleYears.map((y) => (
            <button key={y} onClick={() => handleSelectYear(y)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all shrink-0 ${
                selectedYear === y ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
              }`}
            >{y}</button>
          ))}

          {/* Right arrow (仅在需要分页时显示) */}
          {needPagination && (
            <button
              onClick={() => shiftWindow(1)}
              disabled={!canScrollRight}
              className="w-5 h-5 flex items-center justify-center rounded transition-all disabled:opacity-20 text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:cursor-not-allowed shrink-0"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          <span className="w-px h-3 bg-[var(--color-border)] shrink-0 hidden sm:inline-block" />

          {/* Desktop Export button */}
          <button
            onClick={handleExport}
            disabled={exporting}
            data-export-hidden
            className="hidden sm:flex w-6 h-6 items-center justify-center rounded text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-50 transition-all shrink-0"
            title={locale === 'zh' ? '导出图片' : 'Export as image'}
          >
            {exporting ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Year grid(s) */}
      <div
        className={selectedYear === 'all' ? 'heatmap-all-years space-y-8' : 'space-y-6'}
        key={String(selectedYear)}
      >
        {yearData.map(({ year: yr, grid, max, monthPositions, stats }, idx) => {
          const squareSize = 16
          const gap = 4
          const step = squareSize + gap
          const leftMargin = 26
          const topMargin = 26
          const numWeeks = grid.length
          const svgWidth = leftMargin + numWeeks * step
          const svgHeight = topMargin + 7 * step

          return (
            <div
              key={yr}
              className="heatmap-year-row w-full max-w-full overflow-x-auto no-scrollbar touch-pan-x py-1"
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              {/* Year label when showing all */}
              {selectedYear === 'all' && (
                <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                  <span className="text-xs font-semibold text-[var(--color-accent)]">{yr}</span>
                  <span className="text-xs text-[var(--color-muted)]">
                    {stats.count} {locale === 'zh' ? '次' : 'sessions'}
                  </span>
                  {Object.entries(stats.typeStats)
                    .filter(([type, v]) => v.count > 0 && ['Run', 'Ride', 'Hike'].includes(type))
                    .sort(([a], [b]) => {
                      const order = ['Run', 'Ride', 'Hike']
                      return order.indexOf(a) - order.indexOf(b)
                    })
                    .map(([type, v]) => (
                      <span key={type} className="text-xs text-[var(--color-muted)]">
                        · {typeIcon(type)} {formatKm(v.distance, 2)} km
                      </span>
                    ))}
                </div>
              )}

              {/* Vector SVG Heatmap - 支持手机端高清流畅划动，保障大图标物理尺寸 */}
              <div className="w-full overflow-x-auto no-scrollbar touch-pan-x pb-1">
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-auto min-w-[680px] text-[var(--color-text)] select-none block overflow-visible"
                >
                  {/* Month Labels */}
                  {monthPositions.map((m, i) => {
                    const x = leftMargin + m.weekIdx * step
                    const text = locale === 'zh' ? `${m.label}月` : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m.label) - 1]
                    return (
                      <text
                        key={i}
                        x={x}
                        y={14}
                        fill="var(--color-muted)"
                        fontSize="11"
                        fontWeight="500"
                        fontFamily="sans-serif"
                      >
                        {text}
                      </text>
                    )
                  })}

                  {/* Day Labels */}
                  {dayLabels.map((d, i) => (
                    d ? (
                      <text
                        key={i}
                        x={17}
                        y={topMargin + i * step + 11}
                        fill="var(--color-muted)"
                        fontSize="10"
                        textAnchor="end"
                        fontFamily="sans-serif"
                      >
                        {d}
                      </text>
                    ) : null
                  ))}

                  {/* Heatmap Rects */}
                  {grid.map((week, wi) =>
                    week.map((day, di) => {
                      if ((day as any).isDummy) return null
                      const x = leftMargin + wi * step
                      const y = topMargin + di * step
                      const bgColor = day.distance === 0
                        ? 'var(--color-border)'
                        : isAll
                          ? getColorAll(day.typeRatio, day.domType)
                          : getColor(day.distance, max, filter)
                      const titleText = day.activities.length === 0 ? day.date
                        : isGym ? `${day.date}: ${day.distance} session(s)`
                        : day.domType === 'Training'
                          ? `${day.date}: ${Math.round(day.timeSecs / 60)}min`
                          : `${day.date}: ${formatKm(day.activities.reduce((s, a) => s + a.distance, 0), 2)} km`
                      return (
                        <rect
                          key={`${wi}-${di}`}
                          x={x}
                          y={y}
                          width={squareSize}
                          height={squareSize}
                          rx={3}
                          ry={3}
                          fill={bgColor}
                          className="transition-opacity hover:opacity-75 cursor-pointer"
                          onClick={() => { if (day.activities.length > 0) onSelectActivity?.(day.activities[0]) }}
                        >
                          <title>{titleText}</title>
                        </rect>
                      )
                    })
                  )}
                </svg>
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        {isAll ? (
          presentDisplayTypes.map(tp => (
            <span key={tp} className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
              <span className="flex gap-[2px]">
                {TYPE_PALETTES[tp].map((c, i) => (
                  <span key={i} className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: c }} />
                ))}
              </span>
              {typeLabel(tp, locale)}
            </span>
          ))
        ) : (
          <>
            <span className="text-xs text-[var(--color-muted)]">{t('less')}</span>
            {[0.1, 0.35, 0.6, 0.82, 1].map((ratio, i) => (
              <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: getColor(ratio * (yearData[0]?.max || 1), yearData[0]?.max || 1, filter) }} />
            ))}
            <span className="text-xs text-[var(--color-muted)]">{t('more')}</span>
          </>
        )}
      </div>

      {/* Stats row - Unified & Responsive */}
      {(() => {
        const currStats = selectedYear === 'all' ? allStats : yearData[0]?.stats
        if (!currStats) return null

        return (
          <div className="mt-4 pt-3.5 border-t border-[var(--color-border)]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[var(--color-muted)]">
            <div className="shrink-0">
              <BrandingBar />
            </div>

            <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-xs font-mono justify-start sm:justify-end">
              {/* Type breakdown badges (Run / Ride / Hike) */}
              {isAll && Object.entries(currStats.typeStats || {})
                .filter(([type, v]) => v.count > 0 && ['Run', 'Ride', 'Hike'].includes(type))
                .sort(([a], [b]) => {
                  const order = ['Run', 'Ride', 'Hike']
                  return order.indexOf(a) - order.indexOf(b)
                })
                .map(([type, v]) => (
                  <span key={type} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)]/60 whitespace-nowrap text-[11px]">
                    {typeIcon(type)} {formatKm(v.distance, 2)} km
                  </span>
                ))}

              {/* General badges */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-semibold whitespace-nowrap">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                {currStats.count} {locale === 'zh' ? '次' : 'sessions'}
              </span>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)]/60 whitespace-nowrap">
                <svg className="w-3.5 h-3.5 text-[var(--color-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {(currStats.time / 3600).toFixed(0)}h
              </span>

              {!isGym && currStats.distance > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)]/60 whitespace-nowrap font-bold text-[var(--color-text)]">
                  <svg className="w-3.5 h-3.5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                  {formatKm(currStats.distance, 2)} km
                </span>
              )}
            </div>
          </div>
        )
      })()}

      {/* Gym: monthly frequency bars */}
      {isGym && gymMonthlyData.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-muted)] mb-3">{locale === 'zh' ? '月度频次' : 'Monthly Frequency'}</p>
          <div className="flex items-end gap-1.5" style={{ height: '64px' }}>
            {gymMonthlyData.map((m) => {
              const maxMonthTotal = Math.max(...gymMonthlyData.map(x => x.total), 1)
              const barH = m.total > 0 ? Math.max(Math.round((m.total / maxMonthTotal) * 52), 6) : 0
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="w-full flex items-end justify-center" style={{ height: '52px' }}>
                    {m.total > 0 && (
                      <div className="w-full rounded-t-sm relative overflow-hidden" style={{ height: `${barH}px` }}>
                        {WORKOUT_TYPES.filter(t => m.byType[t] > 0).map((t) => {
                          const segPct = (m.byType[t] / m.total) * 100
                          return <div key={t} className="w-full" style={{ height: `${segPct}%`, backgroundColor: gymTypeColors[t] }} />
                        })}
                        <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] text-[var(--color-accent)] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {m.total}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] text-[var(--color-muted)]">
                    {['J','F','M','A','M','J','J','A','S','O','N','D'][m.month]}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {WORKOUT_TYPES.filter(t => activities.some(a => a.type === t)).map(t => (
              <span key={t} className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: gymTypeColors[t] }} />
                {typeLabel(t, locale)}
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

