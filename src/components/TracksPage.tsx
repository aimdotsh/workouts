import { useMemo, useState, useEffect, useRef } from 'react'
import { toPng } from 'html-to-image'
import * as polyline from '@mapbox/polyline'
import type { Activity } from '../types'
import { getAvailableYears, formatDistance, parseMovingTime, formatPace, extractProvince, formatKm } from '../hooks/useActivities'
import { useLocale } from '../hooks/useLocale'
import { BrandingBar } from './BrandingBar'

function AnimatedSingleTrack({ item }: { item: any }) {
  const pathRef = useRef<SVGPathElement>(null)
  const [dashLength, setDashLength] = useState<number>(1200)

  useEffect(() => {
    if (pathRef.current) {
      try {
        const len = pathRef.current.getTotalLength()
        if (len && isFinite(len) && len > 0) {
          setDashLength(Math.ceil(len))
        }
      } catch (e) {
        console.error(e)
      }
    }
  }, [item.d])

  return (
    <g key={item.key}>
      {/* 1.【底层】：浅色完整的静态运动轨迹路线 (呈现轨迹全貌) */}
      <path
        d={item.d}
        fill="none"
        stroke={item.baseLightColor}
        strokeWidth="6"
        strokeOpacity="0.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 2.【中层】：深色轨迹线，从起点(0px)精准沿坐标几何路线平滑生长充填到终点(dashLength px) */}
      <path
        ref={pathRef}
        d={item.d}
        fill="none"
        stroke={item.flowDarkColor}
        strokeWidth="4.5"
        strokeOpacity="0.95"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: dashLength,
          animation: `strokeGrowFromStart 3.6s cubic-bezier(0.35, 0, 0.25, 1) infinite`,
        }}
        filter="url(#trackGlow)"
      />

      {/* 3.【顶层】：在生长前端领跑的高亮白炽流光粒子 */}
      <path
        d={item.d}
        fill="none"
        stroke="#ffffff"
        strokeWidth="5"
        strokeOpacity="0.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: `45 ${dashLength + 100}`,
          animation: `strokeCometHead 3.6s cubic-bezier(0.35, 0, 0.25, 1) infinite`,
        }}
      />

      {/* 4. 起点（绿色闪烁）与终点（红色闪烁）里程碑标志 */}
      <g transform={`translate(${item.startX}, ${item.startY})`}>
        <circle r="6" fill="#10b981" className="animate-ping opacity-75" />
        <circle r="4.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
      </g>
      <g transform={`translate(${item.endX}, ${item.endY})`}>
        <circle r="6" fill="#ef4444" className="animate-ping opacity-75" />
        <circle r="4.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
      </g>

      <style>{`
        @keyframes strokeGrowFromStart {
          0% {
            stroke-dashoffset: -${dashLength};
          }
          75% {
            stroke-dashoffset: 0;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        @keyframes strokeCometHead {
          0% {
            stroke-dashoffset: 45;
          }
          75% {
            stroke-dashoffset: -${dashLength};
          }
          100% {
            stroke-dashoffset: -${dashLength};
          }
        }
      `}</style>
    </g>
  )
}

type SportType = 'Run' | 'Ride' | 'Hike'

interface TracksPageProps {
  activities: Activity[]
  filter: string
  onBack: () => void
  onSelectActivity?: (a: Activity | null) => void
  dark?: boolean
}

function renderTrackSVG(summaryPolyline: string, size = 80): string {
  try {
    const coords = polyline.decode(summaryPolyline)
    if (coords.length < 2) return ''
    const lats = coords.map(c => c[0])
    const lngs = coords.map(c => c[1])
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const latRange = maxLat - minLat || 0.001
    const lngRange = maxLng - minLng || 0.001
    const scale = Math.min((size - 8) / lngRange, (size - 8) / latRange)
    const offsetX = (size - lngRange * scale) / 2
    const offsetY = (size - latRange * scale) / 2
    return coords.map(([lat, lng]) => {
      const x = (lng - minLng) * scale + offsetX
      const y = size - ((lat - minLat) * scale + offsetY)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  } catch { return '' }
}

function TrackThumb({ activity, color, selected, onClick }: {
  activity: Activity; color: string; selected: boolean; onClick: () => void
}) {
  const size = 80
  const points = activity.summary_polyline ? renderTrackSVG(activity.summary_polyline, size) : ''
  if (!points) return null
  return (
    <div
      className={`cursor-pointer group relative rounded transition-all ${selected ? 'ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-bg)]' : ''}`}
      onClick={onClick}
      title={`${activity.name} — ${formatKm(activity.distance, 2)} km`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        className={`transition-opacity ${selected ? 'opacity-100' : 'group-hover:opacity-100 opacity-60'}`}>
        <polyline points={points} fill="none" stroke={color}
          strokeWidth={selected ? '2' : '1.5'} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function TrackMap({ activity, activities = [], allActivities = [], selectedYear, selectedSport = 'all' }: {
  activity: Activity | null; activities: Activity[]; allActivities?: Activity[]; selectedYear?: string | number | null; selectedSport?: string | null; dark?: boolean
}) {
  const summaryStats = useMemo(() => {
    const rawAll = (allActivities && allActivities.length > 0) ? allActivities : activities
    if (rawAll.length === 0) return null

    const allYears = rawAll.map((a) => new Date(a.start_date_local).getFullYear()).filter(Boolean)
    const minYear = allYears.length > 0 ? Math.min(...allYears) : 2018
    const maxYear = allYears.length > 0 ? Math.max(...allYears) : 2026
    const yearsSpan = Math.max(1, maxYear - minYear + 1)

    const sportName = selectedSport === 'Run' ? '跑步'
      : selectedSport === 'Ride' ? '骑行'
      : selectedSport === 'Hike' ? '徒步' : '运动'

    const title = selectedYear
      ? `${selectedYear}年度${sportName}汇总`
      : `${yearsSpan}年生涯${sportName}汇总`

    const targetSet = rawAll.filter((a) => {
      if (!a) return false
      if (selectedYear) {
        const y = new Date(a.start_date_local).getFullYear()
        if (y !== Number(selectedYear)) return false
      }
      if (selectedSport && selectedSport !== 'all') {
        if (a.type !== selectedSport) return false
      }
      return true
    })

    let totalDist = 0
    let runCount = 0, runDist = 0
    let rideCount = 0, rideDist = 0
    let hikeCount = 0, hikeDist = 0

    const countries = new Set<string>()
    const provinces = new Set<string>()
    const cities = new Set<string>()

    targetSet.forEach((a) => {
      const dist = a.distance || 0
      totalDist += dist

      if (a.type === 'Run') { runCount++; runDist += dist }
      else if (a.type === 'Ride') { rideCount++; rideDist += dist }
      else if (a.type === 'Hike') { hikeCount++; hikeDist += dist }

      if (a.location_country) {
        const p = extractProvince(a.location_country)
        if (p) provinces.add(p)
        if (a.location_country.includes('中国')) {
          countries.add('中国')
        }
        const parts = a.location_country.split(',').map((s) => s.trim())
        parts.forEach((pt) => {
          if (pt.endsWith('市') || pt.endsWith('州') || pt.endsWith('盟')) {
            cities.add(pt)
          }
        })
      }
    })

    const count = targetSet.length
    const avgDistKm = count > 0 ? formatKm(totalDist / count, 2) : '0.00'

    return {
      title,
      sportName,
      count,
      yearsSpan,
      countryCount: countries.size,
      provinceCount: provinces.size,
      cityCount: cities.size,
      totalDistKm: formatKm(totalDist, 2),
      avgDistKm,
      runCount,
      runDistKm: formatKm(runDist, 2),
      rideCount,
      rideDistKm: formatKm(rideDist, 2),
      hikeCount,
      hikeDistKm: formatKm(hikeDist, 2),
    }
  }, [activities, allActivities, selectedYear, selectedSport])

  const routeData = useMemo(() => {
    const viewW = 800, viewH = 520

    try {
      let targetActs = activity
        ? [activity]
        : (activities || []).filter(a => a && a.summary_polyline && a.summary_polyline.length > 5)

      if (!activity && targetActs.length === 0 && allActivities && allActivities.length > 0) {
        targetActs = allActivities.filter(a => a && a.summary_polyline && a.summary_polyline.length > 5)
      }

      const parsed = targetActs.map(a => {
        try {
          const rawCoords = polyline.decode(a.summary_polyline!)
          if (!rawCoords || rawCoords.length < 2) return null
          return {
            id: a.run_id,
            type: a.type,
            name: a.name,
            coords: rawCoords,
          }
        } catch { return null }
      }).filter(Boolean)

      if (parsed.length === 0) {
        return { viewW, viewH, renderPaths: [] }
      }

      const allPts = parsed.flatMap(p => p!.coords)
      const lats = allPts.map(p => p[0]).filter(v => typeof v === 'number' && !isNaN(v))
      const lngs = allPts.map(p => p[1]).filter(v => typeof v === 'number' && !isNaN(v))
      if (lats.length === 0 || lngs.length === 0) {
        return { viewW, viewH, renderPaths: [] }
      }

      const sortedLats = [...lats].sort((a, b) => a - b)
      const sortedLngs = [...lngs].sort((a, b) => a - b)

      const trimCountLat = activity ? 0 : Math.floor(sortedLats.length * 0.025)
      const trimCountLng = activity ? 0 : Math.floor(sortedLngs.length * 0.025)

      const minLat = sortedLats[trimCountLat] ?? sortedLats[0]
      const maxLat = sortedLats[sortedLats.length - 1 - trimCountLat] ?? sortedLats[sortedLats.length - 1]
      const minLng = sortedLngs[trimCountLng] ?? sortedLngs[0]
      const maxLng = sortedLngs[sortedLngs.length - 1 - trimCountLng] ?? sortedLngs[sortedLngs.length - 1]

      const pad = 24
      const latDiff = maxLat - minLat || 0.001
      const lngDiff = maxLng - minLng || 0.001

      const scale = Math.min((viewW - pad * 2) / lngDiff, (viewH - pad * 2) / latDiff)
      if (!isFinite(scale) || scale <= 0) {
        return { viewW, viewH, renderPaths: [] }
      }

      const offX = (viewW - lngDiff * scale) / 2
      const offY = (viewH - latDiff * scale) / 2

      const renderPaths = parsed.map((p, index) => {
        const d = p!.coords.map(([lat, lng], i) => {
          const x = (lng - minLng) * scale + offX
          const y = viewH - ((lat - minLat) * scale + offY)
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1.5)} ${y.toFixed(1.5)}`
        }).join(' ')

        const mainColor = p!.type === 'Run' ? '#f97316' : p!.type === 'Ride' ? '#3b82f6' : '#10b981'
        const baseLightColor = p!.type === 'Run' ? '#fed7aa' : p!.type === 'Ride' ? '#bfdbfe' : '#a7f3d0'
        const flowDarkColor = p!.type === 'Run' ? '#ea580c' : p!.type === 'Ride' ? '#1d4ed8' : '#047857'

        const startPt = p!.coords[0]
        const endPt = p!.coords[p!.coords.length - 1]

        const startX = (startPt[1] - minLng) * scale + offX
        const startY = viewH - ((startPt[0] - minLat) * scale + offY)
        const endX = (endPt[1] - minLng) * scale + offX
        const endY = viewH - ((endPt[0] - minLat) * scale + offY)

        return { ...p!, d, mainColor, baseLightColor, flowDarkColor, startX, startY, endX, endY, key: `${p!.id}-${index}` }
      })

      return { viewW, viewH, renderPaths }
    } catch { return { viewW, viewH, renderPaths: [] } }
  }, [activities, allActivities, activity])

  return (
    <div className="w-full h-full relative overflow-hidden bg-[var(--color-card)] flex items-center justify-center">
      <style>{`
        @keyframes strokeFlowDrawFromStart {
          0% {
            stroke-dasharray: 0 1000;
          }
          100% {
            stroke-dasharray: 1000 0;
          }
        }
        .anim-trail-flow {
          animation: strokeFlowDrawFromStart 3.2s cubic-bezier(0.35, 0, 0.25, 1) infinite;
        }
      `}</style>
      <svg viewBox={`0 0 ${routeData.viewW} ${routeData.viewH}`} className="w-full h-full object-contain p-2 pb-16" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="trackGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 科技感维度坐标线条 */}
        <g className="opacity-15">
          <line x1="0" y1="260" x2="800" y2="260" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 6" />
          <line x1="400" y1="0" x2="400" y2="520" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 6" />
          <circle cx="400" cy="260" r="180" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="6 8" />
        </g>

        {routeData.renderPaths.map((item: any) => {
          const isSingle = Boolean(activity)
          if (isSingle) {
            return <AnimatedSingleTrack key={item.key} item={item} />
          }

          // 图 3 风格：全量/全年汇总静态轨迹堆叠画画 (多条路线自然堆叠)
          return (
            <g key={item.key}>
              <path d={item.d} fill="none" stroke={item.mainColor} strokeWidth="2.8" strokeOpacity="0.75" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )
        })}
      </svg>

      {/* 未选中单条记录时：呈现精美磨砂玻璃个人生涯/年度文本汇总标牌 */}
      {!activity && summaryStats && (
        <div className="absolute inset-x-3 bottom-2.5 z-10 bg-[var(--color-card)]/90 backdrop-blur-md border border-[var(--color-border)] rounded-xl p-2 shadow-lg pointer-events-none transition-all">
          <div className="flex items-center justify-between gap-2 mb-1 pb-1 border-b border-[var(--color-border)]/50">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
              <span className="font-semibold text-xs text-[var(--color-text)]">
                {summaryStats.title}
              </span>
            </div>
            <span className="font-mono text-xs font-bold text-[var(--color-accent)]">
              {summaryStats.totalDistKm} km
            </span>
          </div>

          <p className="text-[10px] text-[var(--color-text)] opacity-90 leading-tight mb-1.5 font-medium truncate">
            {summaryStats.count === 0 ? (
              <span className="text-[var(--color-muted)]">
                在 {selectedYear || `过去 ${summaryStats.yearsSpan} 年`} 里暂无{summaryStats.sportName}记录。
              </span>
            ) : selectedYear ? (
              `在 ${selectedYear} 年里：到达 ${summaryStats.provinceCount} 个省份、${summaryStats.cityCount} 座城市`
            ) : (
              `在过去的 ${summaryStats.yearsSpan} 年里：遍布 ${summaryStats.countryCount} 个国家、${summaryStats.provinceCount} 个省份、${summaryStats.cityCount} 座城市`
            )}
          </p>

          {selectedSport === 'all' ? (
            <div className="grid grid-cols-3 gap-1 text-[9px] font-mono">
              <div className="bg-[var(--color-bg)]/80 px-1.5 py-0.5 rounded border border-[var(--color-border)]/40 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">跑</span>
                <span className="font-bold text-[#f97316]">{summaryStats.runCount}次·{summaryStats.runDistKm}k</span>
              </div>
              <div className="bg-[var(--color-bg)]/80 px-1.5 py-0.5 rounded border border-[var(--color-border)]/40 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">骑</span>
                <span className="font-bold text-[#3b82f6]">{summaryStats.rideCount}次·{summaryStats.rideDistKm}k</span>
              </div>
              <div className="bg-[var(--color-bg)]/80 px-1.5 py-0.5 rounded border border-[var(--color-border)]/40 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">徒</span>
                <span className="font-bold text-[#10b981]">{summaryStats.hikeCount}次·{summaryStats.hikeDistKm}k</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1 text-[9px] font-mono">
              <div className="bg-[var(--color-bg)]/80 px-1.5 py-0.5 rounded border border-[var(--color-border)]/40 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">次数</span>
                <span className="font-bold text-[var(--color-accent)]">{summaryStats.count}次</span>
              </div>
              <div className="bg-[var(--color-bg)]/80 px-1.5 py-0.5 rounded border border-[var(--color-border)]/40 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">累计</span>
                <span className="font-bold text-[var(--color-accent)]">{summaryStats.totalDistKm}k</span>
              </div>
              <div className="bg-[var(--color-bg)]/80 px-1.5 py-0.5 rounded border border-[var(--color-border)]/40 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">均次</span>
                <span className="font-bold text-[var(--color-accent)]">{summaryStats.avgDistKm}k</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function getColor(a: Activity): string {
  if (a.type === 'Run') { const km = a.distance / 1000; return km >= 40 ? '#ef4444' : km >= 20 ? '#f97316' : '#f97316' }
  if (a.type === 'Ride') return '#3b82f6'
  if (a.type === 'Hike') return '#22c55e'
  return '#a855f7'
}

export function TracksPage({ activities, filter, onBack, onSelectActivity, dark }: TracksPageProps) {
  const { locale } = useLocale()
  const allYears = getAvailableYears(activities)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  
  // 刚切进入轨迹墙时：默认总是展示全部数据 (null)！
  const [sportFilter, setSportFilter] = useState<SportType | null>(null)
  const prevFilterRef = useRef(filter)

  // 只有当已经在轨迹墙内、且用户在页眉上主动点击切换了 filter 时才改变 sportFilter！
  useEffect(() => {
    if (prevFilterRef.current !== filter) {
      prevFilterRef.current = filter
      setSportFilter(filter === 'all' || !filter ? null : (filter as SportType))
    }
  }, [filter])
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [sortBy, setSortBy] = useState<'date' | 'distance'>('date')

  // Export
  const captureRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  // Determine which sport types exist
  const hasSport = (t: SportType) => activities.some(a => a.type === t)

  // Filtered base (year + sport)
  const base = activities.filter(a => {
    if (selectedYear !== null && new Date(a.start_date_local).getFullYear() !== selectedYear) return false
    if (sportFilter !== null && a.type !== sportFilter) return false
    return true
  })

  const withPolyline = base.filter(a => a.summary_polyline && a.summary_polyline.length > 20)

  // Stats for left panel
  const totalDist = base.reduce((s, a) => s + a.distance, 0)
  const totalTime = base.reduce((s, a) => s + parseMovingTime(a.moving_time), 0)
  const runs = base.filter(a => a.type === 'Run' && a.average_speed > 0)
  const avgPace = runs.length > 0 ? runs.reduce((s, a) => s + a.average_speed, 0) / runs.length : 0

  // Cluster tracks — defer heavy work
  type Cluster = { representative: Activity; count: number; color: string }
  const [clusteredTracks, setClusteredTracks] = useState<Cluster[]>([])
  const [clustering, setClustering] = useState(true)

  useEffect(() => {
    setClustering(true)
    const id = setTimeout(() => {
      const acts = [...withPolyline].sort((a, b) =>
        new Date(b.start_date_local).getTime() - new Date(a.start_date_local).getTime()
      )
      type Decoded = { start: [number, number]; end: [number, number]; distBucket: number }
      const decoded: (Decoded | null)[] = acts.map(a => {
        try {
          const coords = polyline.decode(a.summary_polyline!)
          if (coords.length < 2) return null
          return { start: coords[0] as [number, number], end: coords[coords.length - 1] as [number, number], distBucket: Math.round(a.distance / 2000) }
        } catch { return null }
      })
      const clusters: Cluster[] = []
      const used = new Set<number>()
      for (let i = 0; i < acts.length; i++) {
        if (used.has(i)) continue
        const di = decoded[i]
        if (!di) continue
        let count = 1
        for (let j = i + 1; j < acts.length; j++) {
          if (used.has(j)) continue
          const dj = decoded[j]
          if (!dj || di.distBucket !== dj.distBucket) continue
          const startClose = Math.abs(di.start[0] - dj.start[0]) < 0.005 && Math.abs(di.start[1] - dj.start[1]) < 0.005
          const endClose = Math.abs(di.end[0] - dj.end[0]) < 0.005 && Math.abs(di.end[1] - dj.end[1]) < 0.005
          if (startClose && endClose) { used.add(j); count++ }
        }
        used.add(i)
        clusters.push({ representative: acts[i], count, color: getColor(acts[i]) })
      }
      setClusteredTracks(clusters)
      setClustering(false)
    }, 0)
    return () => clearTimeout(id)
  }, [withPolyline.length, selectedYear, sportFilter])

  const handleSelectTrack = (a: Activity) => {
    setSelectedActivity(prev => prev?.run_id === a.run_id ? null : a)
    onSelectActivity?.(a)
  }

  const allSportTabs: { label: string; value: SportType; color: string }[] = [
    { label: locale === 'zh' ? '跑步' : 'Run', value: 'Run', color: '#f97316' },
    { label: locale === 'zh' ? '骑行' : 'Ride', value: 'Ride', color: '#3b82f6' },
    { label: locale === 'zh' ? '徒步' : 'Hike', value: 'Hike', color: '#22c55e' },
  ]

  return (
    <div className="w-full">
      {/* Top bar: back + title */}
      <div className="flex items-center gap-4 mb-5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {locale === 'zh' ? '返回' : 'Back'}
        </button>
        <h1 className="text-lg font-bold shrink-0">{locale === 'zh' ? '轨迹墙' : 'Track Wall'}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5 items-start">
        {/* Left: stats + map */}
        <div className="flex flex-col gap-4">
          {/* Stats card */}
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-4">
            <p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider mb-3">
              {selectedYear ?? (locale === 'zh' ? '全部' : 'Total')}
            </p>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">{locale === 'zh' ? '活动' : 'Activities'}</p>
                <p className="text-2xl font-bold font-mono text-[var(--color-accent)]">{base.length}</p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">{locale === 'zh' ? '距离' : 'Distance'}</p>
                <p className="text-2xl font-bold font-mono">{formatDistance(totalDist)} <span className="text-sm font-normal text-[var(--color-muted)]">km</span></p>
              </div>
              <div>
                <p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">{locale === 'zh' ? '时间' : 'Time'}</p>
                <p className="text-lg font-bold font-mono">{Math.floor(totalTime / 3600)}h {Math.floor((totalTime % 3600) / 60)}m</p>
              </div>
              {avgPace > 0 && (
                <div>
                  <p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">{locale === 'zh' ? '均配速' : 'Avg Pace'}</p>
                  <p className="text-lg font-bold font-mono">{formatPace(avgPace)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Activity detail — only when a single track is selected */}
          {selectedActivity && (
            <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl px-4 py-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider">{locale === 'zh' ? '已选记录' : 'Selected'}</p>
                <button onClick={() => setSelectedActivity(null)} className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-xs font-semibold truncate mb-0.5">{selectedActivity.name}</p>
              <p className="text-[10px] text-[var(--color-muted)] mb-2">
                {new Date(selectedActivity.start_date_local).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                {' '}
                {new Date(selectedActivity.start_date_local).toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[9px] text-[var(--color-muted)] uppercase tracking-wider">{locale === 'zh' ? '距离' : 'Distance'}</p>
                  <p className="text-base font-bold font-mono leading-tight">{formatKm(selectedActivity.distance, 2)} <span className="text-[10px] font-normal text-[var(--color-muted)]">km</span></p>
                </div>
                <div>
                  <p className="text-[9px] text-[var(--color-muted)] uppercase tracking-wider">{locale === 'zh' ? '时间' : 'Time'}</p>
                  <p className="text-base font-bold font-mono leading-tight">{(() => { const s = parseMovingTime(selectedActivity.moving_time); return `${Math.floor(s/3600) ? Math.floor(s/3600)+'h ' : ''}${Math.floor((s%3600)/60)}m` })()}</p>
                </div>
                {selectedActivity.average_speed > 0 && (
                  <div>
                    <p className="text-[9px] text-[var(--color-muted)] uppercase tracking-wider">{locale === 'zh' ? '配速' : 'Pace'}</p>
                    <p className="text-base font-bold font-mono leading-tight">{formatPace(selectedActivity.average_speed)} <span className="text-[10px] font-normal text-[var(--color-muted)]">/km</span></p>
                  </div>
                )}
                {selectedActivity.elevation_gain != null && selectedActivity.elevation_gain > 0 && (
                  <div>
                    <p className="text-[9px] text-[var(--color-muted)] uppercase tracking-wider">{locale === 'zh' ? '爬升' : 'Elev'}</p>
                    <p className="text-base font-bold font-mono leading-tight">{Math.round(selectedActivity.elevation_gain)} <span className="text-[10px] font-normal text-[var(--color-muted)]">m</span></p>
                  </div>
                )}
                {selectedActivity.average_heartrate != null && selectedActivity.average_heartrate > 0 && (
                  <div>
                    <p className="text-[9px] text-[var(--color-muted)] uppercase tracking-wider">{locale === 'zh' ? '心率' : 'HR'}</p>
                    <p className="text-base font-bold font-mono leading-tight">{Math.round(selectedActivity.average_heartrate)} <span className="text-[10px] font-normal text-[var(--color-muted)]">bpm</span></p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Map */}
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden" style={{ height: 260 }}>
            <TrackMap activity={selectedActivity} activities={withPolyline} allActivities={activities} selectedYear={selectedYear} selectedSport={sportFilter || 'all'} dark={dark} />
          </div>
        </div>

        {/* Right: track grid with year filter inside */}
        <div className="min-w-0">
          <div ref={captureRef} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-4">
          <style>{`
            .exporting,
            .exporting *,
            .exporting *::before,
            .exporting *::after {
              animation: none !important;
              transition: none !important;
            }
          `}</style>
          {/* Year pills + sport filter */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 mb-4 pb-3 border-b border-[var(--color-border)] overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => setSelectedYear(null)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${selectedYear === null ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}>
                {locale === 'zh' ? '全部' : 'All'}
              </button>
              {allYears.map(yr => (
                <button key={yr} onClick={() => setSelectedYear(selectedYear === yr ? null : yr)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${selectedYear === yr ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}>
                  {yr}
                </button>
              ))}
            </div>
            {/* Sport filter — right side */}
            <div className="flex items-center gap-1.5 ml-auto">
              <button onClick={() => setSportFilter(null)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${sportFilter === null ? 'bg-[var(--color-accent)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}>
                {locale === 'zh' ? '全部' : 'All'}
              </button>
              {allSportTabs.filter(t => hasSport(t.value)).map(({ label, value, color }) => (
                <button key={value} onClick={() => setSportFilter(sportFilter === value ? null : value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${sportFilter === value ? 'text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
                  style={sportFilter === value ? { backgroundColor: color } : {}}>
                  {label}
                </button>
              ))}
              <span className="w-px h-3 bg-[var(--color-border)] mx-1" />
              <button
                onClick={async () => {
                  if (!captureRef.current || exporting) return
                  setExporting(true)
                  try {
                    const el = captureRef.current
                    el.classList.add('exporting')
                    const prevOverflow = el.style.overflow
                    el.style.overflow = 'visible'
                    await new Promise(resolve => requestAnimationFrame(resolve))
                    const dataUrl = await toPng(el, { pixelRatio: 2, cacheBust: true })
                    el.classList.remove('exporting')
                    el.style.overflow = prevOverflow
                    const link = document.createElement('a')
                    const label = selectedYear ?? 'all'
                    link.download = `tracks-${label}.png`
                    link.href = dataUrl
                    link.click()
                  } catch (err) {
                    console.error('Export failed:', err)
                  } finally {
                    setExporting(false)
                  }
                }}
                disabled={exporting}
                className="w-6 h-6 flex items-center justify-center rounded text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-50 transition-all"
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

          {clustering ? (
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 40 }).map((_, i) => (
                <div key={i} className="w-[80px] h-[80px] rounded bg-[var(--color-border)] animate-pulse" style={{ animationDelay: `${i * 20}ms` }} />
              ))}
            </div>
          ) : clusteredTracks.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)] py-8 text-center">{locale === 'zh' ? '暂无轨迹数据' : 'No tracks found'}</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {[...clusteredTracks].sort((a, b) =>
                sortBy === 'distance'
                  ? b.representative.distance - a.representative.distance
                  : new Date(b.representative.start_date_local).getTime() - new Date(a.representative.start_date_local).getTime()
              ).map(({ representative: a, count, color }) => (
                <div key={a.run_id} className="relative">
                  <TrackThumb
                    activity={a}
                    color={color}
                    selected={selectedActivity?.run_id === a.run_id}
                    onClick={() => handleSelectTrack(a)}
                  />
                  {count > 1 && (
                    <span className="absolute bottom-1 right-1 bg-[var(--color-bg)]/80 text-[var(--color-muted)] text-[9px] font-bold px-1 py-0.5 rounded leading-none pointer-events-none">
                      ×{count}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Branding bar (export only) */}
          <BrandingBar />

          {/* Legend + sort */}
          {!clustering && clusteredTracks.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center gap-4 text-xs text-[var(--color-muted)] flex-wrap">
              {sportFilter === null || sportFilter === 'Run' ? <>
                <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-[#f97316] rounded" />{locale === 'zh' ? '跑步' : 'Run'}</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-[#ef4444] rounded" />{locale === 'zh' ? '跑步 >20km' : 'Run >20km'}</span>
              </> : null}
              {(sportFilter === null || sportFilter === 'Ride') && hasSport('Ride') && <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-[#3b82f6] rounded" />{locale === 'zh' ? '骑行' : 'Ride'}</span>}
              {(sportFilter === null || sportFilter === 'Hike') && hasSport('Hike') && <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-0.5 bg-[#22c55e] rounded" />{locale === 'zh' ? '徒步' : 'Hike'}</span>}
              <div className="ml-auto flex items-center gap-1">
                <span>{clusteredTracks.length} {locale === 'zh' ? '条路线' : 'routes'}</span>
                <span className="mx-1.5 text-[var(--color-border)]">·</span>
                <button onClick={() => setSortBy('date')}
                  className={`transition-colors ${sortBy === 'date' ? 'text-[var(--color-text)] font-medium' : 'hover:text-[var(--color-text)]'}`}>
                  {locale === 'zh' ? '时间' : 'Date'}
                </button>
                <span className="text-[var(--color-border)]">/</span>
                <button onClick={() => setSortBy('distance')}
                  className={`transition-colors ${sortBy === 'distance' ? 'text-[var(--color-text)] font-medium' : 'hover:text-[var(--color-text)]'}`}>
                  {locale === 'zh' ? '距离' : 'Dist'}
                </button>
              </div>
            </div>
          )}
        </div>{/* end track grid card */}
        </div>{/* end right column */}
      </div>
    </div>
  )
}
