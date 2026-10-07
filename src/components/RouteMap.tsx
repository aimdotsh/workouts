import { useMemo, useState, useEffect, useRef } from 'react'
import * as polyline from '@mapbox/polyline'
import type { Activity } from '../types'
import { extractProvince, formatKm } from '../hooks/useActivities'
import { WORKOUT_TYPES } from '../types'
import { MuscleHeatmap, inferMusclesFromItems } from './MuscleHeatmap'

interface RouteMapProps {
  activities: Activity[]
  allActivities?: Activity[]
  selectedActivity?: Activity | null
  selectedYear?: string | number | null
  selectedSport?: string | null
  dark?: boolean
  onClearSelection?: () => void
}

// 单条运动记录动态生长与领跑流光组件 (调用 getTotalLength 保证绝对从起点生长向终点)
function AnimatedSingleTrack({ item }: { item: any }) {
  const pathRef = useRef<SVGPathElement>(null)
  const [dashLength, setDashLength] = useState<number>(2000)

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

  const trackColor = item.mainColor || 'var(--color-accent)'
  const glowColor = item.flowDarkColor || item.mainColor || 'var(--color-accent)'

  return (
    <g key={item.key}>
      {/* 1.【底层】：高对比度、清晰鲜艳的静态运动轨迹路线 (保证 100% 可见) */}
      <path
        d={item.d}
        fill="none"
        stroke={trackColor}
        strokeWidth="7"
        strokeOpacity="0.85"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#svgGlow)"
      />

      {/* 2.【中层】：高亮的生长动效流光线 */}
      <path
        ref={pathRef}
        d={item.d}
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.5"
        strokeOpacity="0.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: dashLength,
          strokeDashoffset: dashLength,
          animation: `strokeGrowStrict 3s cubic-bezier(0.4, 0, 0.2, 1) infinite`,
        }}
      />

      {/* 3.【顶层-核心运动体】：绝对从【始】点平滑沿着 SVG Path 奔跑运行到【终】点的真实运动光珠 */}
      <g>
        {/* 外围白色发光晕 */}
        <circle r="8" fill="#ffffff" opacity="0.95" filter="url(#svgGlow)">
          <animateMotion
            path={item.d}
            dur="3s"
            repeatCount="indefinite"
            keyTimes="0; 0.85; 1"
            keyPoints="0; 1; 1"
            calcMode="linear"
          />
        </circle>
        {/* 内部高彩运动小球 */}
        <circle r="5" fill={glowColor} stroke="#ffffff" strokeWidth="2">
          <animateMotion
            path={item.d}
            dur="3s"
            repeatCount="indefinite"
            keyTimes="0; 0.85; 1"
            keyPoints="0; 1; 1"
            calcMode="linear"
          />
        </circle>
      </g>

      {/* 4. 起点【始】（绿色徽章）与终点【终】（红色徽章）里程碑标志 */}
      {/* 起点 - 始 */}
      {typeof item.startX === 'number' && !isNaN(item.startX) && (
        <g transform={`translate(${item.startX}, ${item.startY})`} className="z-10">
          <circle r="10" fill="#10b981" opacity="0.35" className="animate-ping" />
          <circle r="8" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
          <text y="3" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="extrabold" fontFamily="system-ui">始</text>
        </g>
      )}

      {/* 终点 - 终 */}
      {typeof item.endX === 'number' && !isNaN(item.endX) && (
        <g transform={`translate(${item.endX}, ${item.endY})`} className="z-10">
          <circle r="10" fill="#ef4444" opacity="0.35" className="animate-ping" />
          <circle r="8" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
          <text y="3" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="extrabold" fontFamily="system-ui">终</text>
        </g>
      )}

      <style>{`
        @keyframes strokeGrowStrict {
          0% {
            stroke-dashoffset: ${dashLength};
          }
          85% {
            stroke-dashoffset: 0;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </g>
  )
}

export function RouteMap({
  activities = [],
  allActivities = [],
  selectedActivity,
  selectedYear,
  selectedSport = 'all',
  onClearSelection,
}: RouteMapProps) {
  // 1. 终极修正：精准多维（年份 + 运动类型）文本汇总统计数据
  const summaryStats = useMemo(() => {
    const rawAll = (allActivities && allActivities.length > 0) ? allActivities : activities
    if (rawAll.length === 0) return null

    // 计算生涯总年限
    const allYears = rawAll.map((a) => new Date(a.start_date_local).getFullYear()).filter(Boolean)
    const minYear = allYears.length > 0 ? Math.min(...allYears) : 2018
    const maxYear = allYears.length > 0 ? Math.max(...allYears) : 2026
    const yearsSpan = Math.max(1, maxYear - minYear + 1)

    // 确定选中的运动类型名称
    const sportName = selectedSport === 'Run' ? '跑步'
      : selectedSport === 'Ride' ? '骑行'
      : selectedSport === 'Hike' ? '徒步' : '运动'

    // 决定浮层卡片标题：如 "2018年度徒步汇总" 或 "9年生涯徒步汇总"
    const title = selectedYear
      ? `${selectedYear}年度${sportName}汇总`
      : `${yearsSpan}年生涯${sportName}汇总`

    // 严格按 selectedYear 与 selectedSport 交集筛选 targetSet！
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

  // 2. 过滤并计算轨迹几何映射路径
  const routeData = useMemo(() => {
    const viewW = 800, viewH = 520

    try {
      let targetActs = selectedActivity
        ? [selectedActivity]
        : (activities || []).filter(a => a && a.summary_polyline && a.summary_polyline.length > 5)

      if (!selectedActivity && targetActs.length === 0 && allActivities && allActivities.length > 0) {
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
            distance: a.distance,
            coords: rawCoords,
          }
        } catch {
          return null
        }
      }).filter(Boolean)

      if (parsed.length === 0) {
        return { viewW, viewH, renderPaths: [], totalCount: 0 }
      }

      const allPts = parsed.flatMap(p => p!.coords)
      const lats = allPts.map(p => p[0]).filter(v => typeof v === 'number' && !isNaN(v))
      const lngs = allPts.map(p => p[1]).filter(v => typeof v === 'number' && !isNaN(v))
      if (lats.length === 0 || lngs.length === 0) {
        return { viewW, viewH, renderPaths: [], totalCount: 0 }
      }

      const sortedLats = [...lats].sort((a, b) => a - b)
      const sortedLngs = [...lngs].sort((a, b) => a - b)

      const trimCountLat = selectedActivity ? 0 : Math.floor(sortedLats.length * 0.025)
      const trimCountLng = selectedActivity ? 0 : Math.floor(sortedLngs.length * 0.025)

      const minLat = sortedLats[trimCountLat] ?? sortedLats[0]
      const maxLat = sortedLats[sortedLats.length - 1 - trimCountLat] ?? sortedLats[sortedLats.length - 1]
      const minLng = sortedLngs[trimCountLng] ?? sortedLngs[0]
      const maxLng = sortedLngs[sortedLngs.length - 1 - trimCountLng] ?? sortedLngs[sortedLngs.length - 1]

      const pad = 24
      const latDiff = maxLat - minLat || 0.001
      const lngDiff = maxLng - minLng || 0.001

      const scale = Math.min((viewW - pad * 2) / lngDiff, (viewH - pad * 2) / latDiff)
      if (!isFinite(scale) || scale <= 0) {
        return { viewW, viewH, renderPaths: [], totalCount: 0 }
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

        return {
          ...p!,
          d,
          mainColor,
          baseLightColor,
          flowDarkColor,
          startX,
          startY,
          endX,
          endY,
          key: `${p!.id}-${index}`
        }
      })

      return {
        viewW,
        viewH,
        renderPaths,
        totalCount: parsed.length,
      }
    } catch {
      return { viewW, viewH, renderPaths: [], totalCount: 0 }
    }
  }, [activities, allActivities, selectedActivity])

  const hasNoRoute = Boolean(
    selectedActivity &&
    (!selectedActivity.summary_polyline || selectedActivity.summary_polyline.length < 5)
  )

  const isGymType = Boolean(
    selectedActivity &&
    (WORKOUT_TYPES.includes(selectedActivity.type) || selectedSport === 'Gym' || selectedActivity.extra_details)
  )

  // 1. 无轨迹的力量健身类项目：呈现肌肉热力解剖图
  if (hasNoRoute && isGymType && selectedActivity) {
    return (
      <div id="route-map-section" className="relative w-full rounded-xl overflow-hidden shadow-sm transition-all duration-300">
        <MuscleHeatmap
          activeMuscles={inferMusclesFromItems(selectedActivity.extra_details)}
          workoutName={selectedActivity.name || '力量健身'}
          setItemsJson={selectedActivity.extra_details}
        />
        {onClearSelection && (
          <button
            onClick={onClearSelection}
            className="absolute top-3 left-3 z-20 px-3 py-1.5 bg-[var(--color-card)]/90 backdrop-blur-md border border-[var(--color-border)] rounded-lg text-xs font-medium text-[var(--color-text)] shadow-md hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all flex items-center gap-1.5 cursor-pointer"
          >
            ← 返回地图
          </button>
        )}
      </div>
    )
  }

  // 2. 无轨迹的其他户外/健走/跑步记录（如 走日坛公园、北京站）：呈现精美的运动指标高光卡片
  if (hasNoRoute && selectedActivity) {
    const icon = selectedActivity.type === 'Run' ? '🏃' : selectedActivity.type === 'Ride' ? '🚴' : selectedActivity.type === 'Hike' ? '🥾' : '👟'
    const distKm = formatKm(selectedActivity.distance, 2)
    const sportName = selectedActivity.type === 'Run' ? '跑步' : selectedActivity.type === 'Ride' ? '骑行' : selectedActivity.type === 'Hike' ? '健走/徒步' : '运动'

    return (
      <div
        id="route-map-section"
        className="bg-[var(--color-card)] border border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20 rounded-2xl p-5 h-[280px] relative select-none shadow-md flex flex-col justify-between overflow-hidden animate-in fade-in duration-300"
      >
        {/* 顶部 Overview 返回按钮与徽章 */}
        <div className="flex items-center justify-between z-10">
          {onClearSelection && (
            <button
              onClick={onClearSelection}
              className="px-3 py-1.5 bg-[var(--color-bg)]/80 backdrop-blur-md border border-[var(--color-border)] rounded-lg text-xs font-medium text-[var(--color-text)] shadow-sm hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Overview
            </button>
          )}
          <span className="px-2.5 py-1 bg-[var(--color-accent)]/15 text-[var(--color-accent)] text-xs font-bold rounded-full border border-[var(--color-accent)]/30">
            {icon} {sportName}记录
          </span>
        </div>

        {/* 中部核心指标大牌 */}
        <div className="text-center my-auto z-10">
          <div className="text-xs text-[var(--color-muted)] font-medium mb-1">
            {selectedActivity.start_date_local} · {selectedActivity.name || sportName}
          </div>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-4xl font-extrabold text-[var(--color-text)] tracking-tight font-mono">
              {distKm}
            </span>
            <span className="text-sm font-bold text-[var(--color-accent)]">km</span>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto mt-3 pt-3 border-t border-[var(--color-border)]/50 text-xs font-mono">
            <div className="bg-[var(--color-bg)]/60 px-3 py-1.5 rounded-lg border border-[var(--color-border)]/40">
              <div className="text-[10px] text-[var(--color-muted)]">时长</div>
              <div className="font-bold text-[var(--color-text)]">{selectedActivity.moving_time?.split('.')[0] || '--'}</div>
            </div>
            <div className="bg-[var(--color-bg)]/60 px-3 py-1.5 rounded-lg border border-[var(--color-border)]/40">
              <div className="text-[10px] text-[var(--color-muted)]">平均心率</div>
              <div className="font-bold text-[var(--color-text)]">{selectedActivity.average_heartrate ? `${Math.round(selectedActivity.average_heartrate)} bpm` : '--'}</div>
            </div>
          </div>
        </div>

        {/* 底部备注提示 */}
        <div className="text-center text-[10px] text-[var(--color-muted)] opacity-75 z-10">
          💡 无 GPS 轨迹路线数据 · 基础步数或降级同步运动
        </div>

        {/* 背景气泡科技线条 */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-accent)]/5 to-transparent pointer-events-none" />
      </div>
    )
  }

  return (
    <div
      id="route-map-section"
      className={`bg-[var(--color-card)] border rounded-xl overflow-hidden h-[280px] relative select-none shadow-sm transition-all duration-300 ${
        selectedActivity ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/20' : 'border-[var(--color-border)]'
      }`}
    >
      {/* 顶部重置 Overview 按钮与选中动态指示 */}
      {selectedActivity ? (
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
          <button
            onClick={onClearSelection}
            className="pointer-events-auto px-3 py-1.5 bg-[var(--color-card)]/90 backdrop-blur-md border border-[var(--color-border)] rounded-lg text-xs font-medium text-[var(--color-text)] shadow-md hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-all flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Overview
          </button>
          <div className="px-2.5 py-1 bg-[var(--color-accent)] text-white text-[11px] font-medium rounded-full shadow-md animate-pulse">
            📍 {selectedActivity.name || selectedActivity.type} ({formatKm(selectedActivity.distance, 2)}km)
          </div>
        </div>
      ) : null}

      {/* 绝对从起点顺着轨迹延伸画向终点的标准 CSS 动画 */}
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

      {/* 纯原生 SVG 动态轨迹画布 */}
      <svg
        viewBox={`0 0 ${routeData.viewW} ${routeData.viewH}`}
        className="w-full h-full object-contain p-2 pb-16"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="svgGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 科技美感线条背景坐标轴 */}
        <g className="opacity-15">
          <line x1="0" y1="260" x2="800" y2="260" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 6" />
          <line x1="400" y1="0" x2="400" y2="520" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 6" />
          <circle cx="400" cy="260" r="180" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="6 8" />
        </g>

        {/* 轨迹渲染 */}
        {routeData.renderPaths.map((item) => {
          const isSingle = Boolean(selectedActivity)

          if (isSingle) {
            return <AnimatedSingleTrack key={item.key} item={item} />
          }

          // 图 3 风格：全量/全年汇总静态轨迹堆叠画画
          return (
            <g key={item.key}>
              <path
                d={item.d}
                fill="none"
                stroke={item.mainColor}
                strokeWidth="2.8"
                strokeOpacity="0.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="hover:stroke-opacity-100 hover:stroke-width-[4.2] transition-all cursor-pointer"
              />
            </g>
          )
        })}
      </svg>

      {/* 未选中单条记录时：呈现精美磨砂玻璃个人生涯/年度文本汇总标牌 (精准反映年份与运动类型) */}
      {!selectedActivity && summaryStats && (
        <div className="absolute inset-x-3 bottom-2.5 z-10 bg-[var(--color-card)]/90 backdrop-blur-md border border-[var(--color-border)] rounded-xl p-2.5 shadow-lg pointer-events-none transition-all">
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

          <p className="text-[11px] text-[var(--color-text)] opacity-90 leading-tight mb-2 font-medium">
            {summaryStats.count === 0 ? (
              <span className="text-[var(--color-muted)]">
                在 {selectedYear || `过去 ${summaryStats.yearsSpan} 年`} 里暂无{summaryStats.sportName}记录。
              </span>
            ) : selectedYear ? (
              `在 ${selectedYear} 年里：足迹到达 ${summaryStats.provinceCount} 个省份、${summaryStats.cityCount} 座城市。`
            ) : (
              `在过去的 ${summaryStats.yearsSpan} 年里：足迹遍布 ${summaryStats.countryCount} 个国家、${summaryStats.provinceCount} 个省份、${summaryStats.cityCount} 座城市。`
            )}
          </p>

          {/* 当选择“全部”时展示 3 种分类；当选择专项运动（如徒步）时展示专项的次数、距离、均次 */}
          {selectedSport === 'all' ? (
            <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
              <div className="bg-[var(--color-bg)]/80 px-2 py-1 rounded border border-[var(--color-border)]/40 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">跑步</span>
                <span className="font-bold text-[#f97316]">{summaryStats.runCount}次 · {summaryStats.runDistKm}km</span>
              </div>
              <div className="bg-[var(--color-bg)]/80 px-2 py-1 rounded border border-[var(--color-border)]/40 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">骑行</span>
                <span className="font-bold text-[#3b82f6]">{summaryStats.rideCount}次 · {summaryStats.rideDistKm}km</span>
              </div>
              <div className="bg-[var(--color-bg)]/80 px-2 py-1 rounded border border-[var(--color-border)]/40 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">徒步</span>
                <span className="font-bold text-[#10b981]">{summaryStats.hikeCount}次 · {summaryStats.hikeDistKm}km</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
              <div className="bg-[var(--color-bg)]/80 px-2 py-1 rounded border border-[var(--color-border)]/40 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">记录次数</span>
                <span className="font-bold text-[var(--color-accent)]">{summaryStats.count} 次</span>
              </div>
              <div className="bg-[var(--color-bg)]/80 px-2 py-1 rounded border border-[var(--color-border)]/40 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">累计距离</span>
                <span className="font-bold text-[var(--color-accent)]">{summaryStats.totalDistKm} km</span>
              </div>
              <div className="bg-[var(--color-bg)]/80 px-2 py-1 rounded border border-[var(--color-border)]/40 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">平均单次</span>
                <span className="font-bold text-[var(--color-accent)]">{summaryStats.avgDistKm} km</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 点击选择单条记录时的底部标牌 */}
      {selectedActivity && (
        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between pointer-events-none text-[10px] text-[var(--color-muted)] z-10">
          <span className="font-mono uppercase tracking-wider bg-[var(--color-card)]/80 backdrop-blur-sm px-2 py-0.5 rounded border border-[var(--color-border)]/50">
            {selectedActivity.name || selectedActivity.type}
          </span>
          <span className="font-mono bg-[var(--color-card)]/80 backdrop-blur-sm px-2 py-0.5 rounded border border-[var(--color-border)]/50">
            {formatKm(selectedActivity.distance, 2)} km
          </span>
        </div>
      )}
    </div>
  )
}
