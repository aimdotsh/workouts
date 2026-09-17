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

  // 1. 纯日期 (YYYY-MM-DD)
  const dateOnly = (act.start_date_local || '').slice(0, 10)
  const fullDt = (act.start_date_local || '').slice(0, 16)

  // 2. 运动用时：格式化为紧凑的 mm:ss 或 h:mm:ss
  let durStr = ''
  if (act.moving_time) {
    const rawTime = String(act.moving_time)
    if (rawTime.includes(':')) {
      const parts = rawTime.split(' ').pop()?.split(':').map(Number) || []
      const h = parts[0] || 0
      const m = parts[1] || 0
      const s = Math.round(parts[2] || 0)
      if (h > 0) {
        durStr = `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
      } else {
        durStr = `${m}:${s < 10 ? '0' : ''}${s}`
      }
    } else {
      const sec = Number(rawTime)
      if (!isNaN(sec) && sec > 0) {
        const h = Math.floor(sec / 3600)
        const m = Math.floor((sec % 3600) / 60)
        const s = Math.floor(sec % 60)
        if (h > 0) {
          durStr = `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
        } else {
          durStr = `${m}:${s < 10 ? '0' : ''}${s}`
        }
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

  // 4. 平均心率 (去掉 bpm 节省字符空间)
  const hrStr = act.average_heartrate ? `心率 ${Math.round(act.average_heartrate)}` : ''

  // 5. 累计爬升
  const elevStr = act.elevation_gain && act.elevation_gain > 0 ? `爬升 ${Math.round(act.elevation_gain)}m` : ''

  // 6. 天气推断 (纯文本不带大 Emoji，保证单行完整呈现)
  let weather = ''
  const nameLower = (act.name || '').toLowerCase()
  if (nameLower.includes('雨')) weather = '雨天'
  else if (nameLower.includes('雪')) weather = '雪天'
  else if (nameLower.includes('晴')) weather = '晴'
  else if (nameLower.includes('阴')) weather = '阴'
  else if (nameLower.includes('云')) weather = '多云'
  else if (nameLower.includes('风')) weather = '微风'
  else if (nameLower.includes('凉')) weather = '凉爽'
  else if (nameLower.includes('热')) weather = '偏热'
  else if (fullDt.length >= 13) {
    const hour = parseInt(fullDt.slice(11, 13), 10)
    if (hour >= 5 && hour < 9) weather = '晨风'
    else if (hour >= 9 && hour < 12) weather = '上午晴好'
    else if (hour >= 12 && hour < 17) weather = '午后舒适'
    else if (hour >= 17 && hour < 19) weather = '傍晚微风'
    else if (hour >= 19 && hour <= 23) weather = '夜晚凉爽'
    else weather = '凌晨清爽'
  }

  const title = `${kmStr}km ${act.name || sportName} | ${siteTitle}`

  // 第一行：纯日期与运动类型及里程（紧凑无多余空格与Emoji，绝对不产生意外换行）
  // 示例：2026-09-17 · 跑步 5.16km
  const line1 = [
    dateOnly || null,
    `${sportName} ${kmStr}km`,
  ].filter(Boolean).join(' · ')

  // 第二行：用时、配速、心率、爬升与天气（紧凑高密度排版，微信气泡内完全不被截断）
  // 示例：用时 44:33 · 配速 8'38" · 心率 144 · 晨风
  const line2 = [
    durStr ? `用时 ${durStr}` : null,
    paceStr || null,
    hrStr || null,
    elevStr || null,
    weather || null,
  ].filter(Boolean).join(' · ')

  const description = `${line1}\n${line2}`

  return { title, description }
}

/**
 * 将活动轨迹离屏渲染为 300x300 高清运动轨迹缩略图 (PNG DataURL)，供微信/Safari分享卡片作为右下角缩略图显示
 * 采用浅白质感背景与鲜明饱满轨迹设计，完美契合微信浅色气泡
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

    // 1. 优雅浅白纯净底色，完美契合微信卡片浅灰底
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)

    // 2. 高级微浅灰内描边与圆角边框感
    ctx.strokeStyle = '#f1f5f9'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, size - 2, size - 2)

    // 3. 计算 1:1 直角等比居中投影 (保留边距)
    const pad = 36
    const scale = Math.min((size - pad * 2) / lngDiff, (size - pad * 2) / latDiff)
    const offX = (size - lngDiff * scale) / 2
    const offY = (size - latDiff * scale) / 2

    const project = ([lat, lng]: [number, number]): [number, number] => {
      const x = (lng - minLng) * scale + offX
      const y = size - ((lat - minLat) * scale + offY)
      return [x, y]
    }

    const trackColor = act.type === 'Run' ? '#f97316' : act.type === 'Ride' ? '#2563eb' : '#059669'
    const glowColor = act.type === 'Run' ? 'rgba(249, 115, 22, 0.18)' : act.type === 'Ride' ? 'rgba(37, 99, 235, 0.18)' : 'rgba(5, 150, 105, 0.18)'

    // 4. 底层柔和轨迹光晕
    ctx.beginPath()
    coords.forEach((pt, i) => {
      const [x, y] = project(pt)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = glowColor
    ctx.lineWidth = 11
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    // 5. 中层高饱满度主轨迹线
    ctx.beginPath()
    coords.forEach((pt, i) => {
      const [x, y] = project(pt)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = trackColor
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    // 6. 核心精细流光线，让轨迹立体灵动
    ctx.beginPath()
    coords.forEach((pt, i) => {
      const [x, y] = project(pt)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.6
    ctx.globalAlpha = 0.8
    ctx.stroke()
    ctx.globalAlpha = 1.0

    // 7. 起点【始】(翠绿) 与 终点【终】(鲜红)
    const startPt = project(coords[0])
    const endPt = project(coords[coords.length - 1])

    // 终点红色实心标点与光环
    ctx.beginPath()
    ctx.arc(endPt[0], endPt[1], 7, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.25)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(endPt[0], endPt[1], 4.5, 0, Math.PI * 2)
    ctx.fillStyle = '#ef4444'
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#ffffff'
    ctx.stroke()

    // 起点绿色实心标点与光环
    ctx.beginPath()
    ctx.arc(startPt[0], startPt[1], 7, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(16, 185, 129, 0.25)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(startPt[0], startPt[1], 4.5, 0, Math.PI * 2)
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
  image = 'https://workouts.liups.com/apple-touch-icon.png',
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

  // Open Graph 规范 (微信聊天、朋友圈、Safari 通用)
  setMeta('property', 'og:title', title)
  setMeta('property', 'og:description', description)
  setMeta('property', 'og:type', 'article')
  setMeta('property', 'og:image', image)

  // Twitter / X 卡片
  setMeta('name', 'twitter:card', 'summary')
  setMeta('name', 'twitter:title', title)
  setMeta('name', 'twitter:description', description)
  setMeta('name', 'twitter:image', image)

  // 微信与 Safari 嗅探优先：确保 DOM 最顶层存在一张标准尺寸（>=300x300）的真实 <img> 标签
  // 关键：不能使用负坐标（如 left: -9999px 会被微信朋友圈安全机制直接判定为作弊隐藏图抛弃），
  // 必须位于正常屏幕视口区域 (0, 0) 内，通过底层 z-index 确保不干扰交互与 UI。
  let thumbContainer = document.getElementById('wechat-share-thumb-wrap') as HTMLDivElement | null
  if (!thumbContainer) {
    thumbContainer = document.createElement('div')
    thumbContainer.id = 'wechat-share-thumb-wrap'
    thumbContainer.style.position = 'absolute'
    thumbContainer.style.top = '0'
    thumbContainer.style.left = '0'
    thumbContainer.style.width = '300px'
    thumbContainer.style.height = '300px'
    thumbContainer.style.overflow = 'hidden'
    thumbContainer.style.zIndex = '-9999'
    thumbContainer.style.pointerEvents = 'none'
    thumbContainer.style.opacity = '0.01'

    const thumbImg = document.createElement('img')
    thumbImg.id = 'wechat-share-thumb'
    thumbImg.width = 300
    thumbImg.height = 300
    thumbImg.style.display = 'block'
    thumbImg.style.width = '300px'
    thumbImg.style.height = '300px'
    thumbImg.style.objectFit = 'contain'
    thumbImg.alt = 'Share Thumbnail'
    thumbContainer.appendChild(thumbImg)

    if (document.body.firstChild) {
      document.body.insertBefore(thumbContainer, document.body.firstChild)
    } else {
      document.body.appendChild(thumbContainer)
    }
  }

  const thumbImg = document.getElementById('wechat-share-thumb') as HTMLImageElement | null
  if (thumbImg && image) {
    thumbImg.src = image
  }

  // 同步更新 link[rel="image_src"]（微信爬虫重要补充）
  let imageSrcLink = document.querySelector('link[rel="image_src"]') as HTMLLinkElement | null
  if (!imageSrcLink) {
    imageSrcLink = document.createElement('link')
    imageSrcLink.rel = 'image_src'
    document.head.appendChild(imageSrcLink)
  }
  if (image) {
    imageSrcLink.href = image
  }
}

