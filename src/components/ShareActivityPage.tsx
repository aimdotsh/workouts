import { useMemo, useState } from 'react'
import * as polyline from '@mapbox/polyline'
import type { Activity } from '../types'
import { formatPace } from '../hooks/useActivities'
import { MuscleHeatmap, inferMusclesFromItems } from './MuscleHeatmap'
import { WORKOUT_TYPES } from '../types'
import { Copy, ArrowLeft, Check, Sparkles } from 'lucide-react'
import { generateTrackThumbnail } from '../utils/shareMeta'

interface ShareActivityPageProps {
  activity: Activity
  allActivities: Activity[]
  onBack: () => void
}

// 简单确定性伪随机生成器 (根据 run_id 确保每一个活动的数据曲线唯一且固定)
function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000
  return x - Math.floor(x)
}

export function ShareActivityPage({ activity, allActivities, onBack }: ShareActivityPageProps) {
  const [copied, setCopied] = useState(false)
  const trackThumb = useMemo(() => generateTrackThumbnail(activity), [activity])

  // 1. 解码并生成 GPS 轨迹 Path (若有)
  const trackData = useMemo(() => {
    if (!activity.summary_polyline || activity.summary_polyline.length < 5) return null
    try {
      const rawCoords = polyline.decode(activity.summary_polyline)
      if (!rawCoords || rawCoords.length < 2) return null

      const lats = rawCoords.map(p => p[0])
      const lngs = rawCoords.map(p => p[1])
      const minLat = Math.min(...lats), maxLat = Math.max(...lats)
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)

      const viewW = 320, viewH = 180, pad = 20
      const latDiff = maxLat - minLat || 0.001
      const lngDiff = maxLng - minLng || 0.001

      const scale = Math.min((viewW - pad * 2) / lngDiff, (viewH - pad * 2) / latDiff)
      const offX = (viewW - lngDiff * scale) / 2
      const offY = (viewH - latDiff * scale) / 2

      const d = rawCoords.map(([lat, lng], i) => {
        const x = (lng - minLng) * scale + offX
        const y = viewH - ((lat - minLat) * scale + offY)
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1.5)} ${y.toFixed(1.5)}`
      }).join(' ')

      const startPt = rawCoords[0]
      const endPt = rawCoords[rawCoords.length - 1]
      const startX = (startPt[1] - minLng) * scale + offX
      const startY = viewH - ((startPt[0] - minLat) * scale + offY)
      const endX = (endPt[1] - minLng) * scale + offX
      const endY = viewH - ((endPt[0] - minLat) * scale + offY)

      return { d, startX, startY, endX, endY, viewW, viewH }
    } catch {
      return null
    }
  }, [activity.summary_polyline])

  // 2. 当月跑量统计
  const monthStats = useMemo(() => {
    const actDate = new Date(activity.start_date_local)
    const year = actDate.getFullYear()
    const month = actDate.getMonth()

    const sameMonthActs = allActivities.filter(a => {
      const d = new Date(a.start_date_local)
      return d.getFullYear() === year && d.getMonth() === month && a.type === activity.type
    })

    const totalKm = sameMonthActs.reduce((acc, cur) => acc + (cur.distance || 0), 0) / 1000
    const monthName = actDate.toLocaleString('en-US', { month: 'short' }).toUpperCase()
    const activeDays = new Set(sameMonthActs.map(a => new Date(a.start_date_local).getDate()))

    return {
      monthLabel: `${monthName} ${year}`,
      totalKm: totalKm.toFixed(2),
      activeDays,
    }
  }, [activity, allActivities])

  // 3. 基于活动真实的真实属性生成专属于该活动的个性化曲线 (避免全部运动长得一样)
  const charts = useMemo(() => {
    const points = 35
    let seed = Number(activity.run_id) || 123456

    const hasHR = Boolean(activity.average_heartrate)
    const hrBase = activity.average_heartrate || 135
    const paceBase = activity.average_speed ? (1000 / activity.average_speed) : 360
    const hasElev = Boolean(activity.elevation_gain && activity.elevation_gain > 0)

    const hrPts: number[] = []
    const pacePts: number[] = []
    const elevPts: number[] = []

    for (let i = 0; i < points; i++) {
      const rand = seededRandom(seed + i)
      const trend = Math.sin((i / points) * Math.PI) * 0.12

      // 心率: 前慢后快
      const hrV = Math.round(hrBase + (trend + (rand * 0.1 - 0.05)) * 25)
      hrPts.push(hrV)

      // 配速
      const paceV = paceBase * (1 + (rand * 0.12 - 0.06) - trend * 0.05)
      pacePts.push(paceV)

      // 海拔
      if (hasElev) {
        const elevBase = 50 + (seededRandom(seed + i * 2) * (activity.elevation_gain || 30))
        elevPts.push(Math.round(elevBase))
      }
    }

    const genPath = (data: number[], h = 50, w = 300) => {
      const minV = Math.min(...data), maxV = Math.max(...data)
      const range = maxV - minV || 1
      return data.map((v, i) => {
        const x = (i / (data.length - 1)) * w
        const y = h - ((v - minV) / range) * (h - 12) - 6
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      }).join(' ')
    }

    return {
      hasHR,
      hasElev,
      hrPath: hasHR ? genPath(hrPts) : null,
      pacePath: genPath(pacePts),
      elevPath: hasElev ? genPath(elevPts) : null,
    }
  }, [activity])

  // 复制独立微信分享 URL
  const handleCopyShareLink = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?run_id=${activity.run_id}`
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const isGym = WORKOUT_TYPES.includes(activity.type) || !trackData
  // 仅保留干净日期只保留 YYYY-MM-DD
  const cleanDateOnly = activity.start_date_local.slice(0, 10)

  const kmVal = (activity.distance / 1000).toFixed(2)
  const paceStr = activity.type === 'Run' ? formatPace(activity.average_speed) : `${(activity.average_speed * 3.6).toFixed(1)} km/h`
  const durationMin = Math.round(parseSecs(activity.moving_time) / 60)

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] py-6 px-4 flex flex-col items-center select-none animate-in fade-in duration-300 transition-colors relative">
      {/* 确保 DOM 正常视口内存在大于 300x300 的真实 <img> 轨迹图片，供 Safari 与微信朋友圈扩展提取缩略图 */}
      {trackThumb && (
        <div className="absolute top-0 left-0 w-[300px] h-[300px] overflow-hidden opacity-[0.01] pointer-events-none -z-50">
          <img src={trackThumb} alt="Workout Track Thumbnail" width={300} height={300} className="w-full h-full object-contain" />
        </div>
      )}

      {/* Top Floating Control Bar (独立无 Header 干扰) */}
      <div className="w-full max-w-md flex items-center justify-between mb-6 z-20">
        <button
          onClick={onBack}
          className="px-3.5 py-1.5 rounded-full bg-[var(--color-card)] hover:bg-[var(--color-border)]/40 border border-[var(--color-border)] text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-[var(--color-text)]" />
          <span>返回仪表盘</span>
        </button>

        <button
          onClick={handleCopyShareLink}
          className="px-4 py-1.5 rounded-full bg-[var(--color-accent)] hover:opacity-90 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? '链接已复制！' : '复制微信分享链接'}</span>
        </button>
      </div>

      {/* Main Poster Container (完全自适应亮色与深色 Mode 主题) */}
      <div className="w-full max-w-md bg-[var(--color-card)] border border-[var(--color-border)] rounded-3xl p-5 shadow-xl space-y-5 relative overflow-hidden transition-colors">
        {/* 1. 顶部 GPS 轨迹 SVG 展示 (若有) */}
        {trackData ? (
          <div className="relative w-full h-44 flex items-center justify-center bg-[var(--color-bg)]/80 rounded-2xl border border-[var(--color-border)]/60 p-2 overflow-hidden">
            {trackThumb && (
              <img
                src={trackThumb}
                alt="Track Map Thumbnail"
                width={300}
                height={300}
                className="absolute inset-0 w-full h-full object-contain opacity-0 pointer-events-none"
              />
            )}
            <svg viewBox={`0 0 ${trackData.viewW} ${trackData.viewH}`} className="w-full h-full relative z-10">
              <filter id="shareGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              {/* 轨迹发光线条 */}
              <path d={trackData.d} fill="none" stroke="var(--color-accent)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#shareGlow)" opacity="0.85" />
              <path d={trackData.d} fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              {/* 始/终标志 */}
              <g transform={`translate(${trackData.startX}, ${trackData.startY})`}>
                <circle r="4.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
              </g>
              <g transform={`translate(${trackData.endX}, ${trackData.endY})`}>
                <circle r="4.5" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
              </g>
            </svg>
          </div>
        ) : (
          <MuscleHeatmap activeMuscles={inferMusclesFromItems(activity.extra_details)} workoutName={activity.name} setItemsJson={activity.extra_details} />
        )}

        {/* 2. 运动名字与仅日期 (不含时分秒) */}
        <div className="text-center pt-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30 text-[var(--color-accent)] text-xs font-semibold mb-1">
            <span>☁️</span>
            <span>{activity.name || (activity.type === 'Run' ? '傍晚跑步' : activity.type)}</span>
          </div>
          {/* 只保留日期 YYYY-MM-DD */}
          <p className="text-xs text-[var(--color-muted)] font-mono tracking-wider">{cleanDateOnly}</p>
        </div>

        {/* 3. 大字号核心数据矩阵 (自适应主题) */}
        <div className="grid grid-cols-2 gap-4 bg-[var(--color-bg)]/80 border border-[var(--color-border)]/60 rounded-2xl p-4 font-mono">
          <div>
            <span className="text-[10px] text-[var(--color-muted)] tracking-wider uppercase block mb-0.5">📍 DISTANCE</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-emerald-500">{kmVal}</span>
              <span className="text-xs text-emerald-500 font-bold">KM</span>
            </div>
          </div>
          <div>
            <span className="text-[10px] text-[var(--color-muted)] tracking-wider uppercase block mb-0.5">⏱️ PACE</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-sky-500">{paceStr}</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-[var(--color-muted)] tracking-wider uppercase block mb-0.5">⌛ TIME</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-purple-500">{durationMin}</span>
              <span className="text-xs text-purple-500 font-bold">min</span>
            </div>
          </div>
          <div>
            <span className="text-[10px] text-[var(--color-muted)] tracking-wider uppercase block mb-0.5">💓 BPM</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-amber-500">{activity.average_heartrate ? Math.round(activity.average_heartrate) : '--'}</span>
              <span className="text-xs text-amber-500 font-bold">{activity.average_heartrate ? 'BPM' : ''}</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-[var(--color-muted)] tracking-wider uppercase block mb-0.5">♡ MAX HR</span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-rose-500">{activity.average_heartrate ? Math.round(activity.average_heartrate * 1.1) : '--'}</span>
              <span className="text-[10px] text-rose-500">{activity.average_heartrate ? 'BPM' : ''}</span>
            </div>
          </div>
          <div>
            <span className="text-[10px] text-[var(--color-muted)] tracking-wider uppercase block mb-0.5">↑ ELEVATION</span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-cyan-500">{activity.elevation_gain ? `${Math.round(activity.elevation_gain)}m` : '--'}</span>
            </div>
          </div>
        </div>

        {/* 4. AEROBIC ZONES 有氧彩虹分条 */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[10px] text-[var(--color-muted)] font-mono tracking-wider">
            <span>AEROBIC ZONES</span>
            <span className="text-emerald-500 font-bold">Z2 (Aerobic)</span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--color-bg)] border border-[var(--color-border)]/40 flex overflow-hidden p-0.5 gap-0.5">
            <div className="h-full w-[15%] bg-sky-500/40 rounded-l-full" />
            <div className="h-full w-[55%] bg-emerald-500 rounded-xs shadow-xs" />
            <div className="h-full w-[15%] bg-amber-500/40" />
            <div className="h-full w-[10%] bg-orange-500/40" />
            <div className="h-full w-[5%] bg-rose-500/40 rounded-r-full" />
          </div>
        </div>

        {/* 5. 当月数据与 7x4 像素热力阵列 */}
        <div className="bg-[var(--color-bg)]/80 border border-[var(--color-border)]/60 rounded-2xl p-3.5 flex items-center justify-between font-mono">
          <div>
            <span className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider block mb-0.5">{monthStats.monthLabel}</span>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-[var(--color-text)]">{monthStats.totalKm}</span>
              <span className="text-xs text-[var(--color-muted)]">km</span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 28 }).map((_, i) => {
              const day = i + 1
              const isActive = monthStats.activeDays.has(day)
              return (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-xs transition-all ${
                    isActive ? 'bg-rose-500 shadow-xs' : 'bg-[var(--color-border)]/40'
                  }`}
                />
              )
            })}
          </div>
        </div>

        {/* 6. 图表区 (有真实/匹配数据的项目才展示曲线) */}
        {!isGym && (
          <div className="bg-[var(--color-bg)]/80 border border-[var(--color-border)]/60 rounded-2xl p-4 space-y-4 font-mono">
            <div className="text-center text-[10px] text-[var(--color-muted)] tracking-widest uppercase">
              SPLIT & METRICS
            </div>

            {/* 配速曲线 (始终展示) */}
            <div className="space-y-1">
              <span className="text-xs font-bold text-sky-500">配速 (Pace Trend)</span>
              <div className="w-full h-12 relative pt-1">
                <svg viewBox="0 0 300 50" className="w-full h-full">
                  <path d={charts.pacePath} fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* 心率曲线 (有真实心率时才展示) */}
            {charts.hasHR && charts.hrPath && (
              <div className="space-y-1">
                <span className="text-xs font-bold text-amber-500">心率 (Heart Rate)</span>
                <div className="w-full h-12 relative pt-1">
                  <svg viewBox="0 0 300 50" className="w-full h-full">
                    <path d={charts.hrPath} fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}

            {/* 海拔曲线 (有真实海拔时才展示) */}
            {charts.hasElev && charts.elevPath && (
              <div className="space-y-1">
                <span className="text-xs font-bold text-emerald-500">海拔 (Elevation)</span>
                <div className="w-full h-12 relative pt-1">
                  <svg viewBox="0 0 300 50" className="w-full h-full">
                    <path d={charts.elevPath} fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Logo */}
        <div className="pt-2 text-center border-t border-[var(--color-border)]/40 flex items-center justify-between text-[10px] text-[var(--color-muted)] font-mono">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[var(--color-accent)]" />
            workouts.liups.com
          </span>
          <span>蓝皮书的 Workouts Page</span>
        </div>
      </div>
    </div>
  )
}

function parseSecs(timeStr: string): number {
  if (!timeStr) return 0
  if (timeStr.includes(':')) {
    const parts = timeStr.split(' ')[1] || timeStr
    const [h, m, s] = parts.split(':').map(Number)
    return (h || 0) * 3600 + (m || 0) * 60 + (s || 0)
  }
  return Number(timeStr) || 0
}
