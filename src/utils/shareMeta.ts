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

  // 1. 日期与具体时间 (YYYY-MM-DD HH:mm)
  const dtStr = (act.start_date_local || '').slice(0, 16)

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
  else if (dtStr.length >= 13) {
    const hour = parseInt(dtStr.slice(11, 13), 10)
    if (hour >= 5 && hour < 9) weather = '🌅 清晨微风'
    else if (hour >= 9 && hour < 12) weather = '☀️ 上午晴好'
    else if (hour >= 12 && hour < 17) weather = '🌤️ 午后舒适'
    else if (hour >= 17 && hour < 19) weather = '🌇 傍晚微风'
    else if (hour >= 19 && hour <= 23) weather = '🌙 夜晚凉爽'
    else weather = '🌌 凌晨清爽'
  }

  // 第一行：日期时间与运动类型及里程
  const line1 = [
    dtStr ? `📅 ${dtStr}` : null,
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
 * 动态更新当前页面 DOM 的 Meta 标签，使 Safari 与微信分享扩展能准确抓取到标题与详细摘要
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
}
