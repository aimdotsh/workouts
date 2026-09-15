import * as polyline from '@mapbox/polyline'
import type { Activity } from '../types'

/**
 * 将活动数据格式化为微信/Safari分享卡片所需的标题与详细摘要信息
 */
export function formatActivityShareMeta(act: Activity, siteTitle = '蓝皮书的 Workouts Page') {
  const kmStr = (act.distance / 1000).toFixed(2)
  const sportName = act.type === 'Run' ? '跑步'
    : act.type === 'Ride' ? '骑行'
    : act.type === 'Hike' ? '徒步' : '运动'
  const sportIcon = act.type === 'Run' ? '🏃'
    : act.type === 'Ride' ? '🚴'
    : act.type === 'Hike' ? '🥾' : '👟'

  const title = `${kmStr} km ${act.name || act.type} | ${siteTitle}`

  // 1. 仅显示纯日期 (YYYY-MM-DD)，不显示小时分钟
  const dateOnly = (act.start_date_local || '').slice(0, 10)
  const fullDt = (act.start_date_local || '').slice(0, 16)

  // 2. 运动用时
  let durStr = ''
  if (act.moving_time) {
    const rawTime = String(act.moving_time)
    if (rawTime.includes(':')) {
      const parts = rawTime.split(' ').pop()?.split(':').map(Number) || []
      const h = parts[0] || 0
      const m = parts[1] || 0
      const s = Math.round(parts[2] || 0)
      durStr = h > 0 ? `${h}小时${m}分` : `${m}分${s}秒`
    } else {
      const sec = Number(rawTime)
      if (!isNaN(sec) && sec > 0) {
        const m = Math.floor(sec / 60)
        const s = sec % 60
        durStr = `${m}分${s}秒`
      }
    }
  }

  // 3. 配速 / 均速
  let paceStr = ''
  if (act.average_speed && act.average_speed > 0) {
    if (act.type === 'Ride') {
      paceStr = `均速 ${(act.average_speed * 3.6).toFixed(1)}km/h`
    } else {
      const spk = 1000 / act.average_speed
      const pm = Math.floor(spk / 60)
      const ps = Math.floor(spk % 60)
      paceStr = `配速 ${pm}'${ps < 10 ? '0' : ''}${ps}"`
    }
  }

  // 4. 平均心率
  const hrStr = act.average_heartrate ? `心率 ${Math.round(act.average_heartrate)} bpm` : ''

  // 5. 累计爬升
  const elevStr = act.elevation_gain && act.elevation_gain > 0 ? `爬升 ${Math.round(act.elevation_gain)}m` : ''

  // 6. 天气推断：先从活动名称识别，若无则根据时段推断自然天气情景
  let weather = ''
  const nameLower = (act.name || '').toLowerCase()
  if (nameLower.includes('雨')) weather = '🌧️ 雨天'
  else if (nameLower.includes('雪')) weather = '❄️ 雪天'
  else if (nameLower.includes('晴')) weather = '☀️ 晴朗'
  else if (nameLower.includes('阴')) weather = '☁️ 阴天'
  else if (nameLower.includes('云')) weather = '⛅ 多云'
  else if (nameLower.includes('风')) weather = '💨 微风'
  else if (nameLower.includes('凉')) weather = '🍃 凉爽'
  else if (nameLower.includes('热')) weather = '🔥 偏热'
  else if (fullDt.length >= 13) {
    const hour = parseInt(fullDt.slice(11, 13), 10)
    if (hour >= 5 && hour < 9) weather = '🌅 清晨微风'
    else if (hour >= 9 && hour < 12) weather = '☀️ 上午晴好'
    else if (hour >= 12 && hour < 17) weather = '🌤️ 午后舒适'
    else if (hour >= 17 && hour < 19) weather = '🌇 傍晚微风'
    else if (hour >= 19 && hour <= 23) weather = '🌙 夜晚凉爽'
    else weather = '🌌 凌晨清爽'
  }

  // 第一行：纯日期与运动类型及里程 (时间只显示日期)
  const line1 = [
    dateOnly ? `📅 ${dateOnly}` : null,
    `${sportIcon} ${sportName} ${kmStr} km`,
  ].filter(Boolean).join(' · ')

  // 第二行：用时、配速、心率、爬升与天气
  const line2 = [
    durStr ? `⏱️ 用时 ${durStr}` : null,
    paceStr ? `⚡ ${paceStr}` : null,
    hrStr ? `❤️ ${hrStr}` : null,
    elevStr ? `⛰️ ${elevStr}` : null,
    weather || null,
  ].filter(Boolean).join(' · ')

  const description = `${line1}\n${line2}`

  return { title, description }
}

/**
 * 将活动轨迹离屏渲染为 300x300 高清运动轨迹缩略图 (PNG DataURL)，供微信/Safari分享卡片作为右下角缩略图显示
 */
export function generateTrackThumbnail(act: Activity): string | null {
  if (typeof document === 'undefined') return null
  if (!act.summary_polyline || act.summary_polyline.length < 5) return null

  try {
    const coords = polyline.decode(act.summary_polyline)
    if (!coords || coords.length < 2) return null

    const lats = coords.map((c) => c[0])
    const lngs = coords.map((c) => c[1])
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const latDiff = maxLat - minLat || 0.0001
    const lngDiff = maxLng - minLng || 0.0001

    const size = 300
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // 1. 高级暗夜蓝黑卡片底色
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, size, size)

    // 2. 柔和居中径向渐变
    const grad = ctx.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size * 0.7)
    grad.addColorStop(0, '#1e293b')
    grad.addColorStop(1, '#0f172a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)

    // 3. 计算 1:1 直角等比居中投影
    const pad = 36
    const scale = Math.min((size - pad * 2) / lngDiff, (size - pad * 2) / latDiff)
    const offX = (size - lngDiff * scale) / 2
    const offY = (size - latDiff * scale) / 2

    const project = ([lat, lng]: [number, number]): [number, number] => {
      const x = (lng - minLng) * scale + offX
      const y = size - ((lat - minLat) * scale + offY)
      return [x, y]
    }

    const trackColor = act.type === 'Run' ? '#f97316' : act.type === 'Ride' ? '#3b82f6' : '#10b981'

    // 4. 底层高宽容度轨迹光晕
    ctx.beginPath()
    coords.forEach((pt, i) => {
      const [x, y] = project(pt)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = trackColor
    ctx.lineWidth = 9
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalAlpha = 0.35
    ctx.stroke()

    // 5. 中层高亮轨迹主色线
    ctx.beginPath()
    coords.forEach((pt, i) => {
      const [x, y] = project(pt)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = trackColor
    ctx.lineWidth = 4.5
    ctx.globalAlpha = 0.9
    ctx.stroke()

    // 6. 核心高光流光细线
    ctx.beginPath()
    coords.forEach((pt, i) => {
      const [x, y] = project(pt)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.8
    ctx.globalAlpha = 0.95
    ctx.stroke()

    // 7. 起点【始】(绿色) 与 终点【终】(红色)
    const startPt = project(coords[0])
    const endPt = project(coords[coords.length - 1])

    ctx.globalAlpha = 1.0

    // 终点外圈光圈与实心点
    ctx.beginPath()
    ctx.arc(endPt[0], endPt[1], 6, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.3)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(endPt[0], endPt[1], 4, 0, Math.PI * 2)
    ctx.fillStyle = '#ef4444'
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()

    // 起点外圈光圈与实心点
    ctx.beginPath()
    ctx.arc(startPt[0], startPt[1], 6, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(16, 185, 129, 0.3)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(startPt[0], startPt[1], 4, 0, Math.PI * 2)
    ctx.fillStyle = '#10b981'
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()

    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/**
 * 动态更新当前页面 DOM 的 Meta 与 Icon 标签，使 Safari 与微信分享扩展能准确抓取到运动轨迹缩略图与详细摘要
 */
export function updatePageShareMeta({
  title,
  description,
  image = '/favicon.png',
}: {
  title: string
  description: string
  image?: string
}) {
  if (typeof document === 'undefined') return

  document.title = title

  const setMeta = (attrName: 'name' | 'property', attrValue: string, content: string) => {
    let el = document.querySelector(`meta[${attrName}="${attrValue}"]`) as HTMLMetaElement | null
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute(attrName, attrValue)
      document.head.appendChild(el)
    }
    el.setAttribute('content', content)
  }

  // 标准搜索引擎与微信描述
  setMeta('name', 'description', description)

  // Open Graph 规范 (微信、Safari、社交媒体通用)
  setMeta('property', 'og:title', title)
  setMeta('property', 'og:description', description)
  setMeta('property', 'og:type', 'article')
  setMeta('property', 'og:image', image)

  // Twitter / X 卡片
  setMeta('name', 'twitter:card', 'summary')
  setMeta('name', 'twitter:title', title)
  setMeta('name', 'twitter:description', description)
  setMeta('name', 'twitter:image', image)

  // 同步更新 Apple Touch Icon (Safari 提取分享缩略图的核心优先源)
  const touchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null
  if (touchIcon && image) {
    touchIcon.setAttribute('href', image)
  }

  // 在 body 中维护一个隐藏的专属嗅探 img 标签，确保 Safari 与微信分析器 100% 提取到轨迹缩略图
  let thumbImg = document.getElementById('wechat-share-thumb') as HTMLImageElement | null
  if (!thumbImg) {
    thumbImg = document.createElement('img')
    thumbImg.id = 'wechat-share-thumb'
    thumbImg.style.position = 'fixed'
    thumbImg.style.left = '-9999px'
    thumbImg.style.top = '-9999px'
    thumbImg.style.width = '300px'
    thumbImg.style.height = '300px'
    thumbImg.style.opacity = '0.01'
    thumbImg.style.pointerEvents = 'none'
    thumbImg.alt = 'share thumbnail'
    document.body.appendChild(thumbImg)
  }
  if (image) {
    thumbImg.src = image
  }
}

