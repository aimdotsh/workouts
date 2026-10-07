import { useState, useEffect } from 'react'
import type { Activity, SportFilter } from '../types'
import { WORKOUT_TYPES } from '../types'
import { formatDuration, formatPace, formatKm } from '../hooks/useActivities'
import { useLocale } from '../hooks/useLocale'
import { WorkoutDetailModal } from './WorkoutDetailModal'
import { Share2 } from 'lucide-react'

interface ActivityLogProps {
  activities: Activity[]
  years: number[]
  year: number | null
  setYear: (y: number | null) => void
  selectedActivity?: Activity | null
  onSelectActivity?: (a: Activity | null) => void
  onShareActivity?: (a: Activity) => void
  filter?: SportFilter
}

const PAGE_SIZE = 16

type DistanceFilter = 'all' | '10' | '20' | '40'

function typeIcon(type: string): string {
  const icons: Record<string, string> = {
    Run: '🏃',
    Ride: '🚴',
    Hike: '🥾',
    WeightTraining: '🏋️',
    Workout: '💪',
    Gym: '💪',
    Climb: '🧗',
    爬山: '🧗',
    StairStepper: '🪜',
    WaterSport: '🏊',
    Sail: '⛵',
  }
  return icons[type] ?? '📌'
}

function typeLabel(type: string, locale: string): string {
  const map: Record<string, { zh: string; en: string }> = {
    WeightTraining: { zh: '力量', en: 'Weights' },
    Workout:        { zh: '训练', en: 'Workout' },
    Gym:            { zh: '健身', en: 'Gym' },
    Climb:          { zh: '攀登', en: 'Climb' },
    爬山:           { zh: '爬山', en: 'Climb' },
    StairStepper:   { zh: '楼梯', en: 'Stairs' },
    WaterSport:     { zh: '水上', en: 'Water' },
    Sail:           { zh: '帆船', en: 'Sail' },
  }
  return map[type]?.[locale as 'zh' | 'en'] ?? type
}

function typeColor(type: string): string {
  const colors: Record<string, string> = {
    WeightTraining: '#f97316',
    Workout:        '#c026d3',
    Gym:            '#c026d3',
    Climb:          '#10b981',
    爬山:           '#10b981',
    StairStepper:   '#3b82f6',
    WaterSport:     '#06b6d4',
  }
  return colors[type] ?? 'var(--color-accent)'
}

function parseTimeSecs(t: string): number {
  if (!t) return 0
  const timePart = t.includes(' ') ? t.split(' ')[1] : t
  const parts = timePart.split('.')[0].split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0]
}

function formatSecs(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function ActivityLog({ activities, years, year, setYear, selectedActivity, onSelectActivity, onShareActivity, filter = 'all' }: ActivityLogProps) {
  const { t, locale } = useLocale()
  const [page, setPage] = useState(0)
  const [distFilter, setDistFilter] = useState<DistanceFilter>('all')
  const [gymTypeFilter, setGymTypeFilter] = useState<string>('all')
  const [modalActivity, setModalActivity] = useState<Activity | null>(null)

  const isGym = filter === 'Gym'

  const distFiltered = activities.filter((a) => {
    if (isGym) return true
    const km = a.distance / 1000
    switch (distFilter) {
      case '10': return km >= 10 && km < 20
      case '20': return km >= 20 && km < 40
      case '40': return km >= 40
      default: return true
    }
  }).filter((a) => {
    if (!isGym || gymTypeFilter === 'all') return true
    return a.type === gymTypeFilter
  })

  const sorted = [...distFiltered].sort(
    (a, b) => new Date(b.start_date_local).getTime() - new Date(a.start_date_local).getTime()
  )

  const handleSelectActivity = (act: Activity) => {
    const isSame = selectedActivity?.run_id === act.run_id
    const nextSel = isSame ? null : act
    onSelectActivity?.(nextSel)

    if (nextSel) {
      // 平滑滚动到轨迹地图区域
      const mapEl = document.getElementById('route-map-section')
      if (mapEl) {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  useEffect(() => {
    if (selectedActivity) {
      const idx = sorted.findIndex(a => a.run_id === selectedActivity.run_id)
      if (idx >= 0) {
        setPage(Math.floor(idx / PAGE_SIZE))
      } else {
        setDistFilter('all')
      }
    }
  }, [selectedActivity?.run_id])

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const gymTypes = WORKOUT_TYPES.filter(t => activities.some(a => a.type === t))

  const logTitle = filter === 'Run'  ? (locale === 'zh' ? '跑步记录' : 'Run Log')
    : filter === 'Ride' ? (locale === 'zh' ? '骑行记录' : 'Ride Log')
    : filter === 'Gym'  ? (locale === 'zh' ? '健身记录' : 'Gym Log')
    : t('activityLog')

  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-4 sm:p-6 w-full max-w-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-base sm:text-lg font-bold">{logTitle}</h2>
        <span className="text-xs sm:text-sm text-[var(--color-muted)]">
          {t('showing')} {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, sorted.length)} {t('of')} {sorted.length}
        </span>
      </div>

      {/* Year tabs - 完整平铺展示所有年份，支持移动端自适应横向平滑滚动 */}
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar py-1 max-w-full">
        <button
          onClick={() => { setYear(null); setPage(0) }}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
            year === null ? 'bg-[var(--color-accent)] text-white shadow-sm' : 'bg-[var(--color-bg)] text-[var(--color-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]'
          }`}
        >
          {locale === 'zh' ? '全部' : 'ALL'}
        </button>

        <span className="w-px h-3.5 bg-[var(--color-border)] shrink-0 mx-0.5" />

        {/* 渲染所有真实年份，不作任何截断 */}
        {years.map((y) => (
          <button
            key={y}
            onClick={() => { setYear(y); setPage(0) }}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
              year === y ? 'bg-[var(--color-accent)] text-white shadow-sm' : 'bg-[var(--color-bg)] text-[var(--color-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Gym: type filter / Normal: distance filter - 同样支持单行横滑 */}
      {isGym ? (
        <div className="flex items-center gap-1.5 sm:gap-2 mb-4 overflow-x-auto no-scrollbar whitespace-nowrap py-0.5 max-w-full">
          <button onClick={() => { setGymTypeFilter('all'); setPage(0) }}
            className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all ${gymTypeFilter === 'all' ? 'bg-[var(--color-accent)] text-white shadow-sm' : 'bg-[var(--color-border)]/60 text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
          >
            {t('all')}
          </button>
          {gymTypes.map(gt => (
            <button key={gt} onClick={() => { setGymTypeFilter(gt === gymTypeFilter ? 'all' : gt); setPage(0) }}
              className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all ${gymTypeFilter === gt ? 'text-white shadow-sm' : 'bg-[var(--color-border)]/60 text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
              style={gymTypeFilter === gt ? { backgroundColor: typeColor(gt) } : {}}
            >
              {typeLabel(gt, locale)}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 sm:gap-2 mb-4 overflow-x-auto no-scrollbar whitespace-nowrap py-0.5 max-w-full">
          {([['all', t('all')], ['10', '10km+'], ['20', '20km+'], ['40', '40km+']] as [DistanceFilter, string][]).map(([val, label]) => (
            <button key={val} onClick={() => { setDistFilter(val); setPage(0) }}
              className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all ${distFilter === val ? 'bg-[var(--color-accent)] text-white shadow-sm' : 'bg-[var(--color-border)]/60 text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* 📱 移动手机端 Mobile 专属响应式精致 Card 列表 View */}
      <div className="block md:hidden space-y-2 mb-4">
        {pageData.map((a) => {
          const isSelected = selectedActivity?.run_id === a.run_id
          const dateStr = a.start_date_local.slice(0, 10) // 剔除时间只显示日期 YYYY-MM-DD
          return (
            <div
              key={a.run_id}
              onClick={() => handleSelectActivity(a)}
              className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)] shadow-sm'
                  : 'bg-[var(--color-bg)]/50 border-[var(--color-border)]/60 hover:bg-[var(--color-bg)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[var(--color-border)]/40 flex items-center justify-center text-sm shrink-0">
                    {typeIcon(a.type)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--color-text)] truncate flex items-center gap-1.5">
                      {a.name || (a.type === 'Run' ? t('run') : t('ride'))}
                      {a.extra_details && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setModalActivity(a)
                          }}
                          className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30 transition-all cursor-pointer shadow-sm active:scale-95"
                        >
                          🏋️ 明细
                        </button>
                      )}
                    </p>
                    <p className="text-[10px] text-[var(--color-muted)] mt-0.5 font-mono">
                      {dateStr} · {a.type}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {isGym ? (
                    <>
                      <p className="text-xs font-mono font-bold">{formatSecs(parseTimeSecs(a.moving_time))}</p>
                      <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
                        {a.average_heartrate ? `${Math.round(a.average_heartrate)} bpm` : '--'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-mono font-bold text-[var(--color-accent)]">
                        {formatKm(a.distance, 2)} <span className="text-[10px] font-normal text-[var(--color-muted)]">km</span>
                      </p>
                      <p className="text-[10px] text-[var(--color-muted)] font-mono mt-0.5">
                        {formatDuration(a.moving_time)} · {a.type === 'Run' ? formatPace(a.average_speed) : `${(a.average_speed * 3.6).toFixed(1)}km/h`}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 💻 PC 桌面端保留精美 7 列宽表 View */}
      <div className="hidden md:block overflow-x-auto no-scrollbar max-w-full">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-border)] whitespace-nowrap">
              <th className="pb-3 font-medium min-w-[95px]">{t('date')}</th>
              <th className="pb-3 font-medium min-w-[80px]">{t('type')}</th>
              <th className="pb-3 font-medium">{t('name')}</th>
              {isGym ? (
                <>
                  <th className="pb-3 font-medium min-w-[70px]">{t('duration')}</th>
                  <th className="pb-3 font-medium min-w-[65px]">{t('hr')}</th>
                </>
              ) : (
                <>
                  <th className="pb-3 font-medium min-w-[75px]">{t('distance')}</th>
                  <th className="pb-3 font-medium min-w-[75px]">{t('duration')}</th>
                  <th className="pb-3 font-medium min-w-[80px]">{t('pace')}</th>
                  <th className="pb-3 font-medium min-w-[65px]">{t('hr')}</th>
                </>
              )}
              <th className="pb-3 font-medium text-right pr-2 min-w-[60px]">操作</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((a) => {
              const dateStr = a.start_date_local.slice(0, 10) // 剔除时间只保留干净的 YYYY-MM-DD
              return (
                <tr
                  key={a.run_id}
                  onClick={() => handleSelectActivity(a)}
                  className={`border-b border-[var(--color-border)]/30 cursor-pointer transition-colors ${
                    selectedActivity?.run_id === a.run_id
                      ? 'bg-[var(--color-accent)]/10 border-l-2 border-l-[var(--color-accent)]'
                      : 'hover:bg-[var(--color-bg)]'
                  }`}
                >
                  <td className="py-3 text-[var(--color-muted)] font-mono whitespace-nowrap">{dateStr}</td>
                  <td className="py-3 whitespace-nowrap">
                    {isGym ? (
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: typeColor(a.type) + '22', color: typeColor(a.type) }}>
                        {typeIcon(a.type)} {typeLabel(a.type, locale)}
                      </span>
                    ) : (
                      <span className="text-[var(--color-muted)]">{typeIcon(a.type)} {a.type}</span>
                    )}
                  </td>
                  <td className="py-3 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {a.name || (a.type === 'Run' ? t('run') : t('ride'))}
                      {a.extra_details && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setModalActivity(a)
                          }}
                          className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30 transition-all cursor-pointer shadow-sm active:scale-95"
                        >
                          🏋️ 明细
                        </button>
                      )}
                    </span>
                  </td>
                  {isGym ? (
                    <>
                      <td className="py-3 font-mono font-medium whitespace-nowrap">{formatSecs(parseTimeSecs(a.moving_time))}</td>
                      <td className="py-3 text-[var(--color-muted)] font-mono whitespace-nowrap">{a.average_heartrate ? `${Math.round(a.average_heartrate)} bpm` : '--'}</td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 font-mono font-medium whitespace-nowrap">
                        {formatKm(a.distance, 2)}<span className="text-[var(--color-muted)] ml-1 font-normal text-xs">km</span>
                      </td>
                      <td className="py-3 text-[var(--color-muted)] font-mono whitespace-nowrap">{formatDuration(a.moving_time)}</td>
                      <td className="py-3 text-[var(--color-muted)] font-mono whitespace-nowrap">
                        {a.type === 'Run' ? formatPace(a.average_speed) : `${(a.average_speed * 3.6).toFixed(1)} km/h`}
                      </td>
                      <td className="py-3 text-[var(--color-muted)] font-mono whitespace-nowrap">{a.average_heartrate ? Math.round(a.average_heartrate) : '--'}</td>
                    </>
                  )}
                  <td className="py-3 text-right pr-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onShareActivity?.(a)
                      }}
                      className="p-1.5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/30 border border-[var(--color-accent)]/30 transition-all cursor-pointer shadow-2xs active:scale-95 inline-flex items-center justify-center"
                      title="分享运动独立海报"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 pt-3 sm:pt-4 border-t border-[var(--color-border)]">
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
          className="text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30 transition-colors px-2 py-1">←</button>
        <span className="text-xs sm:text-sm text-[var(--color-muted)] font-mono">{t('page')} {page + 1} {t('pageOf')} {totalPages} {t('pages')}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
          className="text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-30 transition-colors px-2 py-1">→</button>
      </div>

      <WorkoutDetailModal activity={modalActivity} onClose={() => setModalActivity(null)} />
    </div>
  )
}
