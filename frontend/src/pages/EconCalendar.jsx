import { useEffect, useState } from "react"
import { api } from "../api"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from "recharts"

const TT = { background: "#0f172a", border: "1px solid #334155", borderRadius: 10, fontSize: 13, color: "#f1f5f9" }

const IMPACT_META = {
  High:   { color: "text-red-400",    bg: "bg-red-500/15 border-red-500/30",    dot: "bg-red-400",    label: "High" },
  Medium: { color: "text-amber-400",  bg: "bg-amber-500/15 border-amber-500/30", dot: "bg-amber-400",  label: "Medium" },
  Low:    { color: "text-gray-400",   bg: "bg-gray-700/40 border-gray-600/30",   dot: "bg-gray-500",   label: "Low" },
}

const SYMBOLS = ["NQ=F", "ES=F", "YM=F", "RTY=F"]
const SYMBOL_LABELS = { "NQ=F": "NQ (Nasdaq)", "ES=F": "ES (S&P 500)", "YM=F": "YM (Dow)", "RTY=F": "RTY (Russell)" }

// Currency code → flag emoji + label
const CURRENCY_FLAGS = {
  USD: { flag: "🇺🇸", label: "USD" },
  EUR: { flag: "🇪🇺", label: "EUR" },
  GBP: { flag: "🇬🇧", label: "GBP" },
  JPY: { flag: "🇯🇵", label: "JPY" },
  CAD: { flag: "🇨🇦", label: "CAD" },
  AUD: { flag: "🇦🇺", label: "AUD" },
  NZD: { flag: "🇳🇿", label: "NZD" },
  CHF: { flag: "🇨🇭", label: "CHF" },
  CNY: { flag: "🇨🇳", label: "CNY" },
  CNH: { flag: "🇨🇳", label: "CNH" },
}
function countryFlag(code) {
  return CURRENCY_FLAGS[code?.toUpperCase()] || { flag: "🌐", label: code || "?" }
}

// ── localStorage cache helpers ──
const LS_EVENTS_KEY = "econ_events_cache"
const LS_VOL_PREFIX = "econ_vol_cache_"
const CLIENT_EVENTS_TTL = 4 * 60 * 60 * 1000   // 4 hours — FF limit: 2 req/5 min, weekly data
const CLIENT_VOL_TTL    = 24 * 60 * 60 * 1000  // 24 hours — yfinance burst-sensitive, OHLC is daily

function lsGet(key, ttlMs) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, savedAt } = JSON.parse(raw)
    if (Date.now() - savedAt > ttlMs) return null
    return { data, savedAt }
  } catch { return null }
}

function lsSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() })) } catch {}
}

function fmtAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

// ── Cache status badge ──
function CacheBadge({ savedAt, onRefresh, loading }) {
  const now = useNow(10000)
  return (
    <div className="flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border bg-gray-800 border-gray-700/50 text-gray-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      <span>{savedAt ? `Cached · ${fmtAgo(savedAt)}` : "No cache"}</span>
      <button onClick={onRefresh} disabled={loading} title="Refresh from Forex Factory (manual only)"
        className="hover:text-gray-100 disabled:opacity-40 transition-colors ml-0.5 text-sm">
        {loading ? "…" : "↻"}
      </button>
    </div>
  )
}

// Live countdown hook — tick every second
function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(id)
  }, [interval])
  return now
}

function fmtCountdown(tsMs, nowMs) {
  const diff = tsMs - nowMs
  if (diff <= 0) return { text: "Live / Past", past: true }
  const s = Math.floor(diff / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0)  return { text: `${d}d ${h % 24}h ${m % 60}m`, past: false }
  if (h > 0)  return { text: `${h}h ${m % 60}m ${s % 60}s`, past: false }
  if (m > 0)  return { text: `${m}m ${s % 60}s`, past: false }
  return { text: `${s}s`, past: false, soon: s < 300 }
}

function fmtDateLocal(isoUtc) {
  if (!isoUtc || isoUtc === "TBA") return "—"
  const d = new Date(isoUtc)
  if (isNaN(d)) return "—"
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function fmtDayHeader(dateStr) {
  if (!dateStr || dateStr === "TBA") return "No Date"
  const d = new Date(dateStr + "T12:00:00Z")
  if (isNaN(d)) return dateStr
  const todayStr = new Date().toISOString().slice(0, 10)
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  if (dateStr === todayStr)     return "Today — " + d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
  if (dateStr === yesterdayStr) return "Yesterday — " + d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
  if (dateStr === tomorrowStr)  return "Tomorrow — " + d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })
}

function fmtTimeLocal(isoUtc) {
  if (!isoUtc) return "TBA"
  const d = new Date(isoUtc)
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
}

export default function EconCalendar() {
  const [events, setEvents]         = useState([])
  const [evSavedAt, setEvSavedAt]   = useState(null)
  const [rateLimited, setRateLimited] = useState(false)
  const [vol, setVol]               = useState(null)
  const [volSavedAt, setVolSavedAt] = useState(null)
  const [loadingEv, setLoadingEv]   = useState(true)
  const [loadingVol, setLoadingVol] = useState(true)
  const [impactFilter, setImpactFilter] = useState(["High", "Medium"])
  const [weekFilter, setWeekFilter]     = useState("all")  // "this" | "next" | "all"
  const [volSymbol, setVolSymbol]       = useState("NQ=F")
  const [volInfoOpen, setVolInfoOpen]   = useState(false)
  const now = useNow()

  const applyFilter = (all) => all.filter(e =>
    impactFilter.map(i => i.toLowerCase()).includes((e.impact || "").toLowerCase())
  )

  const fetchEvents = () => {
    setLoadingEv(true)
    api.econEvents()
      .then(resp => {
        const all = resp?.events || []
        if (!resp?.rate_limited && all.length > 0) lsSet(LS_EVENTS_KEY, all)
        setEvSavedAt(all.length > 0 ? Date.now() : evSavedAt)
        setRateLimited(resp?.rate_limited || false)
        setEvents(applyFilter(all))
      })
      .catch(() => setEvents([]))
      .finally(() => setLoadingEv(false))
  }

  const loadVol = (sym, force = false) => {
    const cacheKey = LS_VOL_PREFIX + sym
    // Always use cache on page load — only bypass on manual refresh
    if (!force) {
      try {
        const raw = localStorage.getItem(cacheKey)
        if (raw) {
          const { data, savedAt } = JSON.parse(raw)
          if (data) {
            setVol(data)
            setVolSavedAt(savedAt)
            setLoadingVol(false)
            return
          }
        }
      } catch {}
    }
    setLoadingVol(true)
    setVol(null)
    api.econVolatility(sym)
      .then(resp => {
        if (resp && !resp.error) lsSet(cacheKey, resp)
        setVol(resp)
        setVolSavedAt(Date.now())
      })
      .catch(() => setVol(null))
      .finally(() => setLoadingVol(false))
  }

  // On mount and filter change: read from cache (re-apply filter), or auto-fetch if no valid cache
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_EVENTS_KEY)
      if (raw) {
        const { data, savedAt } = JSON.parse(raw)
        if (data && data.length > 0) {
          setEvents(applyFilter(data))
          setEvSavedAt(savedAt)
          setLoadingEv(false)
          return
        }
      }
    } catch {}
    // No valid cache — fetch from API automatically (first-time load only)
    fetchEvents()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impactFilter.join(",")])
  useEffect(() => { loadVol(volSymbol) }, [volSymbol])

  const toggleImpact = (level) => {
    setImpactFilter(prev =>
      prev.includes(level) ? prev.filter(i => i !== level) : [...prev, level]
    )
  }

  // Group events by date
  const grouped = events.reduce((acc, e) => {
    const day = e.datetime_utc ? e.datetime_utc.slice(0, 10) : "TBA"
    if (!acc[day]) acc[day] = []
    acc[day].push(e)
    return acc
  }, {})

  // Week boundaries (Mon–Sun)
  const getWeekBounds = (offsetWeeks = 0) => {
    const d = new Date()
    const day = d.getDay() || 7  // Mon=1 … Sun=7
    const mon = new Date(d); mon.setDate(d.getDate() - day + 1 + offsetWeeks * 7); mon.setHours(0,0,0,0)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999)
    return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) }
  }
  const thisWeek = getWeekBounds(0)
  const nextWeek = getWeekBounds(1)

  const sortedDays = Object.keys(grouped).sort().filter(day => {
    if (weekFilter === "this") return day >= thisWeek.from && day <= thisWeek.to
    if (weekFilter === "next") return day >= nextWeek.from && day <= nextWeek.to
    return true
  })

  // Next upcoming high-impact event (from unfiltered — check all High events)
  const nextEvent = events.find(e => e.impact === "High" && e.timestamp && e.timestamp * 1000 > now)

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Economic Calendar</h1>
          <p className="page-sub">High-impact news events &amp; historical volatility</p>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <CacheBadge savedAt={evSavedAt} loading={loadingEv} onRefresh={fetchEvents} />

          {/* Week filter */}
          <div className="flex items-center rounded-lg border border-gray-700 overflow-hidden text-xs font-semibold">
            {[
              { key: "this", label: "This Week" },
              { key: "next", label: "Next Week" },
              { key: "all",  label: "All" },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setWeekFilter(key)}
                className={`px-3 py-1.5 transition-colors ${
                  weekFilter === key
                    ? "bg-brand text-white"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-750"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Impact filter toggles */}
          {["High", "Medium", "Low"].map(level => {
            const m = IMPACT_META[level]
            const active = impactFilter.includes(level)
            return (
              <button key={level} onClick={() => toggleImpact(level)}
                className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-colors ${
                  active ? `${m.bg} ${m.color}` : "bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-400"
                }`}>
                {level}
              </button>
            )
          })}
        </div>
      </div>

      {/* Next high-impact countdown banner */}
      {nextEvent && (() => {
        const cd = fmtCountdown(nextEvent.timestamp * 1000, now)
        return (
          <div className={`card p-4 border-red-500/30 bg-red-500/5 flex items-center justify-between gap-4 flex-wrap`}>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse flex-none" />
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Next High Impact</p>
                <p className="text-sm font-bold text-gray-100 mt-0.5">{nextEvent.title}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Countdown</p>
              <p className={`text-lg font-black mono ${cd.soon ? "text-red-400 animate-pulse" : "text-amber-400"}`}>
                {cd.text}
              </p>
              <p className="text-xs text-gray-500">{fmtDateLocal(nextEvent.datetime_utc)} · {fmtTimeLocal(nextEvent.datetime_utc)}</p>
            </div>
          </div>
        )
      })()}

      {/* Rate limit warning */}
      {rateLimited && (
        <div className="card p-4 border-amber-500/30 bg-amber-500/5 flex items-center gap-3">
          <span className="text-amber-400 text-lg">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-amber-400">Forex Factory rate limited</p>
            <p className="text-xs text-gray-400 mt-0.5">Serving cached data. FF allows only 2 requests per 5 min — limit resets automatically. Avoid manual refresh for now.</p>
          </div>
        </div>
      )}

      {/* Events list */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-700/50 flex items-center justify-between">
          <h3 className="card-title">Upcoming Events</h3>
          <p className="text-xs text-gray-500">Times shown in your local timezone</p>
        </div>

        {loadingEv ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-500 border-t-transparent" />
          </div>
        ) : sortedDays.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-gray-400 font-medium">
              {rateLimited ? "⏳ Waiting for Forex Factory rate limit to clear"
                : sortedDays.length === 0 && events.length > 0 ? "No events in this period"
                : "No events found"}
            </p>
            <p className="text-gray-600 text-xs">
              {rateLimited ? "FF allows 2 requests per 5 min. Data will auto-refresh once the block lifts."
                : sortedDays.length === 0 && events.length > 0 ? "Try switching to All or a different week."
                : "Try adjusting the impact filters above."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700/40">
            {sortedDays.map(day => (
              <div key={day}>
                {/* Day header */}
                <div className="px-5 py-2.5 bg-gray-900/40 flex items-center gap-2">
                  <p className="text-xs font-semibold text-gray-300 tracking-wide">
                    {fmtDayHeader(day)}
                  </p>
                  {day < new Date().toISOString().slice(0, 10) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-500 font-medium">Past</span>
                  )}
                  {day === new Date().toISOString().slice(0, 10) && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">Today</span>
                  )}
                </div>
                {/* Events for this day */}
                {grouped[day].map((e, i) => {
                  const m = IMPACT_META[e.impact] || IMPACT_META.Low
                  const cd = e.timestamp ? fmtCountdown(e.timestamp * 1000, now) : null
                  const isPast = cd?.past
                  return (
                    <div key={e.id || i}
                      className={`px-5 py-3 flex items-center gap-3 hover:bg-gray-800/30 transition-colors ${isPast ? "opacity-40" : ""}`}>
                      {/* Impact dot */}
                      <span className={`w-2 h-2 rounded-full flex-none ${m.dot}`} />

                      {/* Flag + currency */}
                      <div className="flex-none w-10 text-center">
                        <span className="text-lg leading-none" title={countryFlag(e.country).label}>
                          {countryFlag(e.country).flag}
                        </span>
                      </div>

                      {/* Time */}
                      <div className="w-20 flex-none">
                        <p className="text-xs font-mono text-gray-300">{fmtTimeLocal(e.datetime_utc)}</p>
                      </div>

                      {/* Event title */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-100 truncate">{e.title}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                          {e.forecast && <span>Fcst: <span className="text-gray-300">{e.forecast}</span></span>}
                          {e.previous && <span>Prev: <span className="text-gray-300">{e.previous}</span></span>}
                          {e.actual   && <span>Actual: <span className={e.actual !== e.previous ? "text-amber-400" : "text-gray-300"}>{e.actual}</span></span>}
                        </div>
                      </div>

                      {/* Impact badge */}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-none ${m.bg} ${m.color}`}>
                        {m.label}
                      </span>

                      {/* Countdown */}
                      {cd && (
                        <div className="text-right flex-none w-24">
                          <p className={`text-xs font-bold mono ${
                            cd.past ? "text-gray-600" :
                            cd.soon ? "text-red-400" :
                            "text-amber-400"
                          }`}>{cd.text}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Volatility section */}
      <div className="card p-5 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="card-title">Historical Volatility Around News</h3>
            <p className="text-sm text-gray-400 mt-0.5">Daily range (ATR) on high-impact event days vs normal days — last 2 years</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <CacheBadge savedAt={volSavedAt} loading={loadingVol} onRefresh={() => loadVol(volSymbol, true)} />
            <select
              className="select text-sm w-auto min-w-[160px]"
              value={volSymbol}
              onChange={e => setVolSymbol(e.target.value)}>
              {SYMBOLS.map(s => <option key={s} value={s}>{SYMBOL_LABELS[s]}</option>)}
            </select>
          </div>
        </div>

        {/* What is this? — collapsible explainer */}
        <div className="rounded-xl border border-gray-700/50 bg-gray-900/40 overflow-hidden">
          <button
            onClick={() => setVolInfoOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/40 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-sm">💡</span>
              <span className="text-sm font-semibold text-gray-300">What is this? How do I read it?</span>
            </div>
            <span className="text-gray-500 text-xs">{volInfoOpen ? "▲ hide" : "▼ show"}</span>
          </button>
          {volInfoOpen && (
            <div className="px-4 pb-4 pt-1 space-y-4 text-sm text-gray-400 border-t border-gray-700/50">

              <div className="space-y-1.5">
                <p className="text-gray-200 font-semibold">📌 The core idea</p>
                <p>Markets tend to move more on days when important economic news is released — things like CPI, NFP, or Fed decisions. This section measures <span className="text-gray-200 font-medium">how much bigger</span> those moves are compared to an average quiet day, using 2 years of historical price data.</p>
              </div>

              <div className="space-y-1.5">
                <p className="text-gray-200 font-semibold">📐 What is ATR?</p>
                <p><span className="text-amber-400 font-semibold">ATR (Average True Range)</span> = the daily high minus the daily low, in points. It's the simplest measure of how much a market moved in a single day, ignoring direction. A day where NQ went from 18,800 to 19,200 has an ATR of 400 points.</p>
              </div>

              <div className="space-y-1.5">
                <p className="text-gray-200 font-semibold">🔢 The three headline numbers</p>
                <div className="space-y-1 pl-2 border-l-2 border-gray-700">
                  <p><span className="text-gray-200 font-medium">Avg Normal Day ATR</span> — the baseline. Average daily range on days with no major events.</p>
                  <p><span className="text-amber-400 font-medium">Avg Event Day ATR</span> — average daily range on days when at least one high-impact news event occurred.</p>
                  <p><span className="text-red-400 font-medium">Event Day Premium</span> — how much larger event days are versus normal days, as a percentage. e.g. +35% means event days are 35% wider on average.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-gray-200 font-semibold">📊 The bar chart</p>
                <p>Each bar is one type of event (e.g. "CPI m/m" or "NFP"). Bar length = average ATR on days that event occurred. The <span className="text-gray-300">dashed line</span> is the normal-day baseline — anything past it means that event historically makes the market move more than usual.</p>
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> &gt;30% above normal — highly volatile</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" /> above normal</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-500 inline-block" /> at or below normal</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-gray-200 font-semibold">🎯 How to use it as a trader</p>
                <ul className="space-y-1 pl-3 list-disc list-outside marker:text-gray-600">
                  <li>Before a news event, check this table. If CPI historically adds +40% range, <span className="text-gray-200">expect a bigger-than-normal day</span> — widen your stops or reduce size.</li>
                  <li>If the premium is low (event is near the dashed line), the news usually doesn't change much — you can trade it closer to your normal plan.</li>
                  <li>Red bars = highest-risk events. These are the ones most likely to stop you out or trigger large gaps.</li>
                  <li><span className="text-gray-200">This is historical context, not a prediction</span>. Any single day can be an outlier — use it to size risk, not to bet on direction.</li>
                </ul>
              </div>

              <p className="text-xs text-gray-600 italic">Data source: Yahoo Finance (yfinance), last 2 years of daily OHLC. Cached 24 hours.</p>
            </div>
          )}
        </div>

        {loadingVol ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-500 border-t-transparent" />
          </div>
        ) : vol?.error ? (
          <p className="text-red-400 text-sm text-center py-8">{vol.error}</p>
        ) : vol ? (
          <>
            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Avg Normal Day ATR", value: vol.avg_normal_atr?.toFixed(0), sub: "points", color: "text-gray-200" },
                { label: "Avg Event Day ATR",  value: vol.avg_event_atr?.toFixed(0),  sub: "points", color: "text-amber-400" },
                {
                  label: "Event Day Premium",
                  value: vol.event_vs_normal_pct != null
                    ? (vol.event_vs_normal_pct >= 0 ? "+" : "") + vol.event_vs_normal_pct + "%"
                    : "—",
                  sub: "more volatile",
                  color: vol.event_vs_normal_pct >= 0 ? "text-red-400" : "text-emerald-400"
                },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="bg-gray-900/60 rounded-xl p-4 border border-gray-700/40 text-center">
                  <p className="label mb-1">{label}</p>
                  <p className={`text-2xl font-black mono ${color}`}>{value ?? "—"}</p>
                  <p className="text-xs text-gray-500 mt-1">{sub}</p>
                </div>
              ))}
            </div>

            {/* Per-event-type bar chart */}
            {vol.per_type && vol.per_type.length > 0 && (
              <>
                <div>
                  <p className="label mb-1">ATR by Event Type (high impact, recent dates)</p>
                <p className="text-xs text-gray-500 mb-3">Daily range on each high-impact event day — sorted by average ATR (highest first)</p>
                  <ResponsiveContainer width="100%" height={Math.max(220, vol.per_type.length * 28)}>
                    <BarChart
                      data={vol.per_type}
                      layout="vertical"
                      margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
                      <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="event" width={160}
                        tick={{ fill: "#d1d5db", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={TT}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0]?.payload
                          return (
                            <div style={TT} className="p-3 rounded-lg space-y-1">
                              <p className="text-gray-100 font-semibold text-xs">{d.event}</p>
                              <p className="text-amber-400">Avg ATR: <span className="font-bold">{d.avg_atr} pts</span></p>
                              <p className="text-gray-400">Max ATR: {d.max_atr} pts</p>
                              <p className="text-gray-400">Occurrences: {d.occurrences}</p>
                              <p className={d.vs_normal_pct >= 0 ? "text-red-400" : "text-emerald-400"}>
                                vs normal: {d.vs_normal_pct >= 0 ? "+" : ""}{d.vs_normal_pct}%
                              </p>
                            </div>
                          )
                        }}
                      />
                      <ReferenceLine x={vol.avg_normal_atr} stroke="#6b7280" strokeDasharray="4 2"
                        label={{ value: "Avg normal", position: "right", fill: "#6b7280", fontSize: 10 }} />
                      <Bar dataKey="avg_atr" radius={[0, 4, 4, 0]}>
                        {vol.per_type.map((entry, i) => (
                          <Cell key={i}
                            fill={entry.avg_atr > vol.avg_normal_atr * 1.3 ? "#f87171" :
                                  entry.avg_atr > vol.avg_normal_atr ? "#f59e0b" : "#4b5563"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Table view */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700/50">
                        {["Event", "Occurrences", "Avg ATR", "Max ATR", "vs Normal"].map(h => (
                          <th key={h} className="label text-left pb-2 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/30">
                      {vol.per_type.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                          <td className="py-2.5 pr-4 text-gray-200 font-medium">{row.event}</td>
                          <td className="py-2.5 pr-4 text-gray-400">{row.occurrences}x</td>
                          <td className="py-2.5 pr-4 text-amber-400 font-bold mono">{row.avg_atr}</td>
                          <td className="py-2.5 pr-4 text-gray-400 mono">{row.max_atr}</td>
                          <td className={`py-2.5 font-bold mono ${row.vs_normal_pct >= 30 ? "text-red-400" : row.vs_normal_pct >= 0 ? "text-amber-400" : "text-emerald-400"}`}>
                            {row.vs_normal_pct >= 0 ? "+" : ""}{row.vs_normal_pct}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
