import { useEffect, useMemo, useState } from 'react'
import './index.css'
import type { Activity, SportFilter } from './types'
import { useFilteredActivities, getAvailableYears, extractProvince } from './hooks/useActivities'
import { useTheme } from './hooks/useTheme'
import { LocaleProvider } from './hooks/useLocale'
import { GitHubAuthProvider } from './hooks/useGitHubAuthContext'
import { Header } from './components/Header'
import { TracksPage } from './components/TracksPage'
import { ShareActivityPage } from './components/ShareActivityPage'
import { AnalyticsPage } from './components/Analytics/AnalyticsPage'
import { DashboardTheme } from './themes/DashboardTheme'
import rawActivities from './static/activities.json'
import siteMetadata from './static/site-metadata'
import { formatActivityShareMeta, updatePageShareMeta } from './utils/shareMeta'

const activities = rawActivities as Activity[]

type Page = 'home' | 'tracks' | 'analytics'

export default function App() {
  const { dark, toggle, preset, setPreset } = useTheme()
  const [filter, setFilter] = useState<SportFilter>('all')
  const [year, setYear] = useState<number | null>(null)
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null)
  const [page, setPage] = useState<Page>('home')
  const [shareActivity, setShareActivity] = useState<Activity | null>(null)

  const filtered = useFilteredActivities(activities, filter, year)
  const sportFiltered = useFilteredActivities(activities, filter, null)
  const years = useMemo(() => getAvailableYears(activities), [])

  const heatmapYear = year ?? (years[0] ?? new Date().getFullYear())

  // Activities filtered to the selected province (for RouteMap)
  const provinceFiltered = useMemo(() => {
    if (!selectedProvince) return filtered
    return filtered.filter(a => extractProvince(a.location_country) === selectedProvince)
  }, [filtered, selectedProvince])

  // Listen to URL query params on load (e.g. ?run_id=xxx)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const runId = params.get('run_id')
    const defaultSiteTitle = siteMetadata.siteTitle || '蓝皮书的 Workouts Page'
    const defaultDesc = '蓝皮书的户外运动与体能数据看板，记录跑步、骑行、徒步等运动轨迹、配速与心率详情。'

    if (runId && activities.length > 0) {
      const act = activities.find((a: Activity) => String(a.run_id) === runId)
      if (act) {
        setShareActivity(act)
        const { title, description } = formatActivityShareMeta(act, defaultSiteTitle)
        updatePageShareMeta({
          title,
          description,
        })
        return
      }
    }

    updatePageShareMeta({
      title: defaultSiteTitle,
      description: defaultDesc,
    })
  }, [activities])

  return (
    <LocaleProvider>
      <GitHubAuthProvider>
        <div className="min-h-screen bg-[var(--color-bg)]" data-filter={filter}>
      {!shareActivity && (
        <Header
          filter={filter}
          setFilter={setFilter}
          dark={dark}
          toggleTheme={toggle}
          preset={preset}
          setPreset={setPreset}
          activities={activities}
          page={page}
          onNavigate={setPage}
        />
      )}

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 sm:py-6 w-full min-w-0">
        {shareActivity ? (
          <ShareActivityPage
            activity={shareActivity}
            allActivities={activities}
            onBack={() => {
              setShareActivity(null)
              window.history.pushState({}, '', window.location.pathname)
              updatePageShareMeta({
                title: siteMetadata.siteTitle || '蓝皮书的 Workouts Page',
                description: '蓝皮书的户外运动与体能数据看板，记录跑步、骑行、徒步等运动轨迹、配速与心率详情。',
              })
            }}
          />
        ) : page === 'analytics' ? (
          <AnalyticsPage />
        ) : page === 'tracks' ? (
          <TracksPage
            activities={activities}
            filter={filter}
            onSelectActivity={setSelectedActivity}
            onBack={() => setPage('home')}
            dark={dark}
          />
        ) : (
          <DashboardTheme
            activities={activities}
            filteredActivities={filtered}
            sportFilteredActivities={sportFiltered}
            provinceFilteredActivities={provinceFiltered}
            years={years}
            year={year}
            setYear={setYear}
            filter={filter}
            selectedActivity={selectedActivity}
            setSelectedActivity={setSelectedActivity}
            selectedProvince={selectedProvince}
            setSelectedProvince={setSelectedProvince}
            heatmapYear={heatmapYear}
            dark={dark}
            onShareActivity={(act: Activity) => {
              setShareActivity(act)
              window.history.pushState({}, '', `?run_id=${act.run_id}`)
            }}
          />
        )}
      </main>

      <footer className="text-center py-6 text-sm text-[var(--color-muted)] border-t border-[var(--color-border)]">
        <div className="flex items-center justify-center">
          <span>&copy; {new Date().getFullYear()} {siteMetadata.siteTitle || '蓝皮书的 Workouts Page'}.</span>
        </div>
      </footer>
        </div>
      </GitHubAuthProvider>
    </LocaleProvider>
  )
}
