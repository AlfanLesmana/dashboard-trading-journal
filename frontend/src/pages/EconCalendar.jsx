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

// ── USD Forecast Engine ──
// Rules: does a HIGHER reading push USD up or down?
// Format: { bullishIfHigher: bool, reason: string, caveat?: string }
const USD_RULES = [
  // ── Employment ──
  { match: ["non-farm payroll", "nfp", "non-farm employment"],
    bullishIfHigher: true,
    reason: "More jobs = strong economy → Fed keeps rates higher → USD strengthens" },
  { match: ["adp non-farm", "adp employment"],
    bullishIfHigher: true,
    reason: "ADP is the private payrolls preview — strong print = positive jobs expectations" },
  { match: ["unemployment rate"],
    bullishIfHigher: false,
    reason: "Rising unemployment signals labor market weakness → Fed may cut rates → USD weakens" },
  { match: ["unemployment claim", "initial claim", "jobless claim", "continuing claim"],
    bullishIfHigher: false,
    reason: "More claims = workers losing jobs → economic slowdown fear → bearish for USD" },
  { match: ["average hourly earnings"],
    bullishIfHigher: true,
    reason: "Higher wages = inflation pressure → Fed stays hawkish → USD bullish" },

  // ── Inflation ──
  { match: ["cpi", "consumer price index"],
    bullishIfHigher: true,
    reason: "Hotter inflation keeps the Fed hawkish (slower to cut), supporting USD short-term",
    caveat: "If CPI runs too hot it may signal stagflation risk — watch Fed reaction" },
  { match: ["ppi", "producer price index"],
    bullishIfHigher: true,
    reason: "PPI leads CPI — rising producer prices signal inflation pipeline, Fed stays tight" },
  { match: ["pce price", "core pce", "personal consumption expenditure"],
    bullishIfHigher: true,
    reason: "PCE is the Fed's preferred inflation gauge — above target = hawkish bias = USD up" },

  // ── Growth ──
  { match: ["gdp"],
    bullishIfHigher: true,
    reason: "Stronger growth = healthy economy → higher rate expectations → USD bullish" },
  { match: ["retail sales"],
    bullishIfHigher: true,
    reason: "Consumer spending drives 70% of US GDP — strong sales = economic strength" },
  { match: ["industrial production"],
    bullishIfHigher: true,
    reason: "Higher output = manufacturing expansion → GDP growth signal → USD positive" },
  { match: ["durable goods"],
    bullishIfHigher: true,
    reason: "Big-ticket orders reflect business confidence and future production growth" },

  // ── Sentiment / PMI ──
  { match: ["ism manufacturing", "manufacturing pmi"],
    bullishIfHigher: true,
    reason: "Above 50 = expansion. Higher print signals factory activity, USD-positive" },
  { match: ["ism services", "services pmi", "ism non-manufacturing"],
    bullishIfHigher: true,
    reason: "Services is 80% of US economy — strong PMI = robust activity → USD up" },
  { match: ["consumer confidence", "consumer sentiment", "michigan"],
    bullishIfHigher: true,
    reason: "Confident consumers spend more → growth → supports USD" },

  // ── Housing ──
  { match: ["building permit", "housing start"],
    bullishIfHigher: true,
    reason: "Construction activity = economic expansion → mild USD positive" },
  { match: ["existing home sales", "new home sales"],
    bullishIfHigher: true,
    reason: "Strong housing demand signals consumer health and credit availability" },

  // ── Trade ──
  { match: ["trade balance"],
    bullishIfHigher: true,   // less negative = more bullish
    reason: "A narrowing trade deficit (less negative) reduces USD outflows → mild bullish" },

  // ── Fed / Policy ──
  { match: ["fomc", "federal funds rate", "interest rate decision", "fed rate"],
    bullishIfHigher: true,
    reason: "Higher rates = better yield on USD assets → capital inflows → strong USD",
    caveat: "If rate is held when a cut was expected, that is also USD-bullish surprise" },
  { match: ["fomc meeting minutes", "fed minutes"],
    bullishIfHigher: null,  // tone-dependent
    reason: "Hawkish tone (concerns about inflation, reluctance to cut) → USD bullish. Dovish tone (growth worry, open to cuts) → USD bearish",
    caveat: null },
  { match: ["fed chair", "powell", "fed speak", "fomc press"],
    bullishIfHigher: null,
    reason: "Hawkish language (inflation fight, no rush to cut) → USD up. Dovish signals (soft landing, rate cuts coming) → USD down",
    caveat: null },
]

function matchRule(title) {
  const t = title.toLowerCase()
  return USD_RULES.find(r => r.match.some(kw => t.includes(kw))) || null
}

// Parse numeric value from strings like "2.3%", "-12K", "1.2M", "105.2"
function parseVal(str) {
  if (!str) return NaN
  const cleaned = str.replace(/[%KkMmBb,]/g, "").trim()
  const n = parseFloat(cleaned)
  if (isNaN(n)) return NaN
  // Normalise K/M/B scale so "120K" vs "0.12M" compare correctly
  if (/[Kk]/.test(str)) return n * 1000
  if (/[Mm]/.test(str)) return n * 1000000
  if (/[Bb]/.test(str)) return n * 1000000000
  return n
}

function getVerdict(event) {
  if (event.country !== "USD") return null
  if (event.impact !== "High")  return null
  const rule = matchRule(event.title)
  if (!rule) return null

  // Tone-only events (Fed speeches) — no numeric comparison possible
  if (rule.bullishIfHigher === null) {
    return {
      verdict: "watch",
      label: "Watch Tone",
      color: "text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/30",
      icon: "👀",
      why: "No numeric forecast — verdict depends entirely on hawkish vs dovish language during the event.",
      reason: rule.reason,
      caveat: rule.caveat,
      rule,
    }
  }

  const fc = parseVal(event.forecast)
  const pr = parseVal(event.previous)

  // No forecast available yet
  if (isNaN(fc) || isNaN(pr)) {
    const hasFc = event.forecast && event.forecast.trim()
    const haPr  = event.previous && event.previous.trim()
    return {
      verdict: "pending",
      label: "No Forecast Yet",
      color: "text-gray-400",
      bg: "bg-gray-700/30 border-gray-600/30",
      icon: "⏳",
      why: hasFc && !haPr
        ? `Forecast is ${event.forecast} but no previous reading to compare against.`
        : !hasFc && haPr
          ? `Previous was ${event.previous} but no consensus forecast published yet.`
          : "Forex Factory hasn't published a consensus forecast for this event yet.",
      reason: rule.reason,
      caveat: rule.caveat,
      rule,
    }
  }

  const higher = fc > pr
  const same   = Math.abs(fc - pr) < 0.001
  if (same) {
    return {
      verdict: "neutral",
      label: "Neutral",
      color: "text-gray-300",
      bg: "bg-gray-700/30 border-gray-600/30",
      icon: "➡️",
      why: `Forecast (${event.forecast}) matches previous (${event.previous}) — no change expected, unlikely to move markets significantly.`,
      reason: "Forecast matches previous — no directional surprise expected",
      caveat: rule.caveat,
      rule,
      fc, pr,
    }
  }

  const bullish = rule.bullishIfHigher ? higher : !higher
  const dirWord  = higher ? "higher" : "lower"
  const goodWord = bullish ? "positive" : "negative"

  // Build a specific why sentence based on the event type and direction
  const why = rule.bullishIfHigher
    ? bullish
      ? `Forecast (${event.forecast}) > Previous (${event.previous}) — a ${dirWord} reading signals strength, which is ${goodWord} for the dollar.`
      : `Forecast (${event.forecast}) < Previous (${event.previous}) — a ${dirWord} reading signals weakness, putting pressure on the dollar.`
    : bullish
      ? `Forecast (${event.forecast}) < Previous (${event.previous}) — for this indicator, a lower reading is actually ${goodWord} for USD (less ${event.title.toLowerCase().includes("claim") ? "joblessness" : "weakness"}).`
      : `Forecast (${event.forecast}) > Previous (${event.previous}) — for this indicator, a higher reading is ${goodWord} for USD (rising ${event.title.toLowerCase().includes("unemploy") ? "unemployment" : "pressure"} weighs on the dollar).`

  return {
    verdict: bullish ? "bullish" : "bearish",
    label: bullish ? "Bullish USD" : "Bearish USD",
    color: bullish ? "text-emerald-400" : "text-red-400",
    bg: bullish ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30",
    icon: bullish ? "📈" : "📉",
    why,
    reason: rule.reason,
    caveat: rule.caveat,
    rule,
    fc, pr,
    higher,
  }
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
  const [volInfoOpen, setVolInfoOpen]     = useState(false)
  const [outlookOpen, setOutlookOpen]     = useState(false)
  const [calInfoOpen, setCalInfoOpen]     = useState(false)
  const [glossaryOpen, setGlossaryOpen]   = useState(false)
  const [glossarySearch, setGlossarySearch] = useState("")
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

  // USD Outlook verdicts — read from full cache (unfiltered by impact toggle) so USD High always shows
  const allCachedEvents = (() => {
    try { const r = localStorage.getItem(LS_EVENTS_KEY); return r ? (JSON.parse(r).data || []) : [] } catch { return [] }
  })()
  // Fall back to current events state if cache is somehow empty
  const eventPool = allCachedEvents.length > 0 ? allCachedEvents : events
  const usdVerdicts = eventPool
    .filter(e => e.country === "USD" && e.impact === "High" && e.timestamp)
    .map(e => {
      const isPast = e.timestamp * 1000 < now
      const verdict = getVerdict(e)
      if (!verdict) return null
      // For past events with actual data: compute beat/miss vs forecast
      let actualResult = null
      if (isPast && e.actual && e.forecast && verdict.bullishIfHigher !== null) {
        const act = parseVal(e.actual)
        const fc  = parseVal(e.forecast)
        if (!isNaN(act) && !isNaN(fc)) {
          const beat = verdict.rule.bullishIfHigher ? act > fc : act < fc
          const miss = verdict.rule.bullishIfHigher ? act < fc : act > fc
          actualResult = beat ? "beat" : miss ? "miss" : "inline"
        }
      }
      return { ...e, verdict, isPast, actualResult }
    })
    .filter(Boolean)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))

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

      {/* ── USD Outlook ── */}
      {usdVerdicts.length > 0 && (
        <div className="card overflow-hidden">
          {/* Clickable header — always visible */}
          <button
            onClick={() => setOutlookOpen(o => !o)}
            className="w-full flex items-start justify-between gap-3 px-5 py-4 hover:bg-gray-800/30 transition-colors text-left">
            <div>
              <h3 className="card-title flex items-center gap-2">
                🇺🇸 USD Outlook
                <span className="text-xs font-normal text-gray-500">— High Impact · {usdVerdicts.filter(e => !e.isPast).length} upcoming, {usdVerdicts.filter(e => e.isPast).length} released</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Forecast-based directional bias — not a guarantee. Always manage risk.</p>
            </div>
            <div className="flex items-center gap-3 flex-none mt-0.5">
              <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border bg-gray-800/60 border-gray-700/50 text-gray-500">
                <span>⚠️</span><span>Educational only</span>
              </div>
              <span className="text-gray-500 text-xs">{outlookOpen ? "▲ hide" : "▼ show"}</span>
            </div>
          </button>

          {/* Collapsible body — hidden by default */}
          {outlookOpen && <div className="px-5 pb-5 space-y-4 border-t border-gray-700/50">

          {/* Past / Upcoming divider labels */}
          {(() => {
            const past     = usdVerdicts.filter(e => e.isPast)
            const upcoming = usdVerdicts.filter(e => !e.isPast)
            const ActualBadge = ({ result }) => {
              if (!result) return null
              const map = {
                beat:   { label: "Beat ✓",  cls: "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" },
                miss:   { label: "Miss ✗",  cls: "bg-red-500/20 border-red-500/40 text-red-400" },
                inline: { label: "In-line",  cls: "bg-gray-700/40 border-gray-600/30 text-gray-400" },
              }
              const { label, cls } = map[result]
              return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>
            }
            const Card = ({ e }) => {
              const v = e.verdict

              // For released events, override the 'why' with actual vs forecast explanation
              let whyText = v.why
              if (e.isPast && e.actual && e.forecast && e.actualResult) {
                const resultMap = {
                  beat:   `Actual (${e.actual}) beat the forecast (${e.forecast || "—"}) — the data came in stronger than expected.`,
                  miss:   `Actual (${e.actual}) missed the forecast (${e.forecast || "—"}) — the data came in weaker than expected.`,
                  inline: `Actual (${e.actual}) matched the forecast (${e.forecast || "—"}) — no surprise.`,
                }
                whyText = resultMap[e.actualResult] || v.why
              }

              const diffStr = e.isPast && e.actual
                ? `Actual ${e.actual} · Fcst ${e.forecast || "—"} · Prev ${e.previous || "—"}`
                : (!isNaN(v.fc) && !isNaN(v.pr))
                  ? `Fcst ${e.forecast} vs Prev ${e.previous}`
                  : e.forecast ? `Fcst ${e.forecast}` : ""
              return (
                <div key={e.id} className={`rounded-xl border p-4 space-y-2.5 ${e.isPast ? "opacity-60" : ""} ${v.bg}`}>
                  {/* Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base flex-none">🇺🇸</span>
                      <p className="text-sm font-bold text-gray-100 truncate">{e.title}</p>
                      {e.isPast && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-500 font-medium flex-none">Past</span>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-none">
                      {e.actualResult && <ActualBadge result={e.actualResult} />}
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border whitespace-nowrap flex items-center gap-1 ${v.bg} ${v.color}`}>
                        <span>{v.icon}</span><span>{v.label}</span>
                      </span>
                    </div>
                  </div>

                  {/* Date + time */}
                  <p className="text-xs text-gray-400 mono">{fmtDateLocal(e.datetime_utc)} · {fmtTimeLocal(e.datetime_utc)}</p>

                  {/* WHY — specific number-based explanation */}
                  <div className={`text-xs font-semibold px-3 py-2 rounded-lg border ${v.bg} ${v.color}`}>
                    {whyText}
                  </div>

                  {/* Data row — actual for past, forecast vs prev for upcoming */}
                  {diffStr && (
                    <p className={`text-xs font-mono ${e.isPast && e.actual ? (e.actualResult === "beat" ? "text-emerald-400" : e.actualResult === "miss" ? "text-red-400" : "text-gray-400") : "text-gray-400"}`}>
                      {diffStr}
                    </p>
                  )}

                  {/* General reason — why this event type matters */}
                  <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-700/30 pt-2">{v.reason}</p>

                  {/* Caveat */}
                  {v.caveat && (
                    <p className="text-[11px] text-gray-500 italic border-t border-gray-700/40 pt-2">⚠️ {v.caveat}</p>
                  )}
                </div>
              )
            }
            return (
              <div className="space-y-4">
                {upcoming.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">📅 Upcoming</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {upcoming.map((e, i) => <Card key={e.id || i} e={e} />)}
                    </div>
                  </div>
                )}
                {past.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">🕐 Released This Week</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[...past].reverse().map((e, i) => <Card key={e.id || i} e={e} />)}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Legend */}
          <div className="flex items-center gap-4 pt-1 flex-wrap text-xs text-gray-500 border-t border-gray-700/40">
            <span className="pt-2 flex items-center gap-1"><span className="text-emerald-400 font-bold">📈 Bullish USD</span> — forecast stronger than previous</span>
            <span className="pt-2 flex items-center gap-1"><span className="text-red-400 font-bold">📉 Bearish USD</span> — forecast weaker</span>
            <span className="pt-2 flex items-center gap-1"><span className="text-blue-400 font-bold">👀 Watch Tone</span> — Fed speech, direction = language</span>
            <span className="pt-2 flex items-center gap-1"><span className="text-emerald-400 font-bold">Beat ✓</span> / <span className="text-red-400 font-bold ml-1">Miss ✗</span> — actual vs forecast after release</span>
          </div>
          </div>}  {/* end collapsible body */}
        </div>
      )}

      {/* Events list */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="card-title">Upcoming Events</h3>
            <button onClick={() => setCalInfoOpen(o => !o)}
              className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
              <span>💡</span><span>{calInfoOpen ? "hide guide" : "how to read"}</span>
            </button>
          </div>
          <p className="text-xs text-gray-500">Times shown in your local timezone</p>
        </div>

        {/* ── How to read the calendar ── */}
        {calInfoOpen && (
          <div className="border-b border-gray-700/50 px-5 py-4 space-y-4 text-sm bg-gray-900/30">

            {/* Fields */}
            <div className="space-y-2">
              <p className="text-gray-200 font-semibold text-xs uppercase tracking-widest">📋 What each column means</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { field: "Forecast",  color: "text-gray-300", desc: "The consensus estimate from economists and analysts — what the market expects the number to be. Think of it as the 'priced in' number. If the actual matches this, little market reaction is expected." },
                  { field: "Previous",  color: "text-gray-300", desc: "The actual reading from the last time this event was released (prior period). Used as the baseline — a large gap between forecast and previous already tells you sentiment is shifting." },
                  { field: "Actual",    color: "text-amber-400", desc: "The real released number. Shown after the event is published. This is the number that moves markets — the bigger the gap vs forecast, the bigger the reaction tends to be." },
                  { field: "Countdown", color: "text-gray-300", desc: "Time remaining until the event releases. Events within 5 minutes pulse red. Events already released show 'Live / Past'." },
                ].map(({ field, color, desc }) => (
                  <div key={field} className="rounded-lg bg-gray-800/50 border border-gray-700/40 p-3 space-y-1">
                    <p className={`text-xs font-bold ${color}`}>{field}</p>
                    <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Impact levels */}
            <div className="space-y-2">
              <p className="text-gray-200 font-semibold text-xs uppercase tracking-widest">🔴 Impact levels</p>
              <div className="space-y-2">
                {[
                  { level: "High",   dot: "bg-red-400",   color: "text-red-400",   desc: "Major market-moving event. Expect sharp, fast price moves — sometimes 50–200+ points on NQ within seconds. NFP, CPI, Fed Rate Decisions fall here. Reduce size or stay out if you're not comfortable trading news." },
                  { level: "Medium", dot: "bg-amber-400", color: "text-amber-400", desc: "Notable event that can move markets, especially if it surprises. Usually causes a brief spike then stabilises. Good to be aware of, but less likely to completely reverse a trend." },
                  { level: "Low",    dot: "bg-gray-500",  color: "text-gray-400",  desc: "Routine data releases with minimal expected impact. Safe to mostly ignore unless combined with a high-impact day. Markets usually shrug these off." },
                ].map(({ level, dot, color, desc }) => (
                  <div key={level} className="flex items-start gap-3 rounded-lg bg-gray-800/50 border border-gray-700/40 p-3">
                    <span className={`w-2.5 h-2.5 rounded-full flex-none mt-1 ${dot}`} />
                    <div>
                      <p className={`text-xs font-bold ${color}`}>{level} Impact</p>
                      <p className="text-xs text-gray-400 leading-relaxed mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Beat / miss */}
            <div className="space-y-2">
              <p className="text-gray-200 font-semibold text-xs uppercase tracking-widest">📊 Reading the numbers — beat vs miss</p>
              <div className="rounded-lg bg-gray-800/50 border border-gray-700/40 p-3 space-y-2 text-xs text-gray-400 leading-relaxed">
                <p>The market reacts to the <span className="text-gray-200 font-semibold">gap between Actual and Forecast</span>, not the number itself. A "good" reading that was already expected will barely move price. A "bad" reading nobody saw coming can crash or spike the market.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                  <div className="rounded bg-emerald-500/10 border border-emerald-500/20 p-2">
                    <p className="text-emerald-400 font-bold">Actual &gt; Forecast</p>
                    <p className="mt-0.5">Beat — stronger than expected. For USD-positive events (NFP, GDP), this pushes USD up. For USD-negative events (Jobless Claims), a beat means fewer claims → also USD-positive.</p>
                  </div>
                  <div className="rounded bg-red-500/10 border border-red-500/20 p-2">
                    <p className="text-red-400 font-bold">Actual &lt; Forecast</p>
                    <p className="mt-0.5">Miss — weaker than expected. Generally USD-negative for growth/jobs data. The bigger the miss, the sharper the move.</p>
                  </div>
                  <div className="rounded bg-gray-700/40 border border-gray-600/30 p-2">
                    <p className="text-gray-300 font-bold">Actual = Forecast</p>
                    <p className="mt-0.5">In-line — no surprise. Price often drifts or reverses a pre-news move. Focus shifts back to technicals.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Practical tips */}
            <div className="space-y-2">
              <p className="text-gray-200 font-semibold text-xs uppercase tracking-widest">🎯 Practical trading tips</p>
              <ul className="space-y-1.5 text-xs text-gray-400 pl-3 list-disc list-outside marker:text-gray-600 leading-relaxed">
                <li><span className="text-gray-200">The first candle after release is noise.</span> The initial spike is often reversed within 1–5 minutes as algos hunt stop losses. Wait for a retest or a clean directional close before entering.</li>
                <li><span className="text-gray-200">Avoid holding positions into High Impact events</span> unless you've sized down significantly. Slippage and spreads widen dramatically at release time.</li>
                <li><span className="text-gray-200">Check Forecast vs Previous before market open.</span> A large gap (e.g. NFP forecasted at 200K vs previous 150K) signals the bar is high — a miss is more punishing.</li>
                <li><span className="text-gray-200">Multiple events on the same day stack volatility.</span> A day with CPI + Retail Sales + Fed speech is a high-risk session — treat it like a different market.</li>
                <li>Data source: <span className="text-gray-300">Forex Factory</span> (forexfactory.com) — refreshed manually via the ↻ button. Cached to avoid rate limits.</li>
              </ul>
            </div>

          </div>
        )}

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

      {/* ── Event Glossary ── */}
      {(() => {
        const GLOSSARY = [
          {
            abbr: "NFP", full: "Non-Farm Payrolls", category: "Employment",
            release: "Monthly — 1st Friday, 8:30 AM ET",
            impact: "bullish",
            what: "Measures the number of new jobs added in the US economy (excluding farm workers, government, and non-profits). The single most-watched economic indicator in the world.",
            why: "Jobs = spending = growth. A strong NFP tells the Fed the economy can handle higher rates → USD rallies. A weak NFP raises recession fears and rate-cut bets → USD falls.",
            tip: "Revisions to prior months matter too. A beat on headline NFP with a big downward revision to last month can still hurt USD.",
          },
          {
            abbr: "ADP", full: "ADP Non-Farm Employment", category: "Employment",
            release: "Monthly — Wednesday before NFP, 8:15 AM ET",
            impact: "bullish",
            what: "Private payroll estimate from payroll processing giant ADP. Covers private-sector jobs only (no government). Released ~2 days before the official NFP.",
            why: "Used as an early preview of NFP. A big ADP beat raises NFP expectations, pre-moving USD. However, ADP and NFP correlation is inconsistent — don't over-rely on it.",
            tip: "When ADP and NFP diverge significantly, the market focuses on NFP as the authoritative number.",
          },
          {
            abbr: "CPI", full: "Consumer Price Index", category: "Inflation",
            release: "Monthly — ~2nd week, 8:30 AM ET",
            impact: "bullish",
            what: "Measures the average change in prices paid by consumers for a basket of goods and services (food, housing, transport, medical, etc.). Two variants: headline CPI (all items) and Core CPI (excludes volatile food & energy).",
            why: "Inflation is the Fed's primary mandate. High CPI → Fed keeps rates high or hikes → USD bullish. Falling CPI → rate cuts expected → USD bearish. Core CPI is more important to the Fed because it strips out noise.",
            tip: "Month-over-month (m/m) is more market-moving than year-over-year (y/y). A surprise 0.1% deviation from forecast can move NQ 100+ points.",
          },
          {
            abbr: "PPI", full: "Producer Price Index", category: "Inflation",
            release: "Monthly — ~2nd week (day before or after CPI), 8:30 AM ET",
            impact: "bullish",
            what: "Measures price changes from the perspective of the seller/producer — what factories and businesses charge before goods reach consumers. Think of it as upstream inflation.",
            why: "PPI leads CPI by ~2–3 months. Rising PPI means businesses will eventually pass costs to consumers → future CPI will rise → Fed stays hawkish → USD positive. Traders use PPI to predict where CPI is heading.",
            tip: "Core PPI (ex food & energy) is the version the Fed tracks most closely.",
          },
          {
            abbr: "PCE", full: "Personal Consumption Expenditures Price Index", category: "Inflation",
            release: "Monthly — last Friday of month, 8:30 AM ET",
            impact: "bullish",
            what: "The Fed's officially preferred inflation gauge. Broader than CPI — covers more categories and adjusts for substitution (e.g. if beef gets expensive, people buy chicken). Core PCE excludes food & energy.",
            why: "The Fed literally targets 2% Core PCE. Any deviation moves rate-cut/hike expectations directly. A hot PCE print delays rate cuts → USD bullish. A cool print accelerates cuts → USD bearish.",
            tip: "Often overshadowed by CPI in media, but more important to the actual Fed decision. Pay close attention.",
          },
          {
            abbr: "GDP", full: "Gross Domestic Product", category: "Growth",
            release: "Quarterly — Advance (1st estimate) ~1 month after quarter end, 8:30 AM ET",
            impact: "bullish",
            what: "Total monetary value of all goods and services produced in the US. Three releases per quarter: Advance (estimate), Preliminary (revised), Final. Advance release moves markets most.",
            why: "GDP above expectations = strong economy = Fed can keep rates higher = USD up. GDP miss or negative print (recession territory) = rate cut expectations surge = USD down.",
            tip: "GDP above 2.5% is considered strong. Two consecutive negative quarters = technical recession — major market event.",
          },
          {
            abbr: "ISM Mfg", full: "ISM Manufacturing PMI", category: "Sentiment / PMI",
            release: "Monthly — 1st business day, 10:00 AM ET",
            impact: "bullish",
            what: "Survey of purchasing managers at US manufacturing companies. Asks about new orders, production, employment, and prices. Scale: above 50 = expansion, below 50 = contraction.",
            why: "Manufacturing is a leading indicator of economic activity. A rising ISM signals businesses are ordering more → growth ahead → USD positive. A reading below 50 signals factory slowdown.",
            tip: "The 'Prices Paid' sub-index within ISM is an inflation signal the Fed watches for early warning.",
          },
          {
            abbr: "ISM Svcs", full: "ISM Services PMI", category: "Sentiment / PMI",
            release: "Monthly — 3rd business day, 10:00 AM ET",
            impact: "bullish",
            what: "Same survey methodology as ISM Manufacturing but for the services sector (retail, healthcare, finance, hospitality). Services = ~80% of US GDP so this matters more than manufacturing PMI.",
            why: "A strong services sector sustains consumer spending and growth. Above 50 = expanding = USD positive. A surprise drop below 50 in services is a major recession warning.",
            tip: "Employment and Business Activity sub-indices within ISM Services are the most watched components.",
          },
          {
            abbr: "Retail Sales", full: "Retail Sales", category: "Growth",
            release: "Monthly — ~2nd week, 8:30 AM ET",
            impact: "bullish",
            what: "Measures total receipts of retail stores — everything from grocery stores to car dealerships. Covers about 30% of total consumer spending but is one of the most timely spending indicators.",
            why: "Consumer spending = 70% of US GDP. Strong retail sales → GDP growth → Fed hawkish → USD up. Weak retail sales → slowdown fears → USD down.",
            tip: "Control group (ex auto, gas, food service) is what feeds directly into GDP calculations — pay attention to that sub-figure.",
          },
          {
            abbr: "Unemployment Rate", full: "Unemployment Rate", category: "Employment",
            release: "Monthly — 1st Friday with NFP, 8:30 AM ET",
            impact: "bearish",
            what: "Percentage of the labor force that is jobless and actively looking for work. Released simultaneously with NFP. Different from NFP — measures the stock of unemployed vs the flow of new jobs.",
            why: "Rising unemployment → economic weakness → Fed cuts rates → USD bearish. Falling unemployment → tight labor market → inflation risk → Fed stays hawkish → USD bullish. Below 4% is considered healthy in the US.",
            tip: "Unemployment can fall for a bad reason (people leaving the workforce). Always check Labor Force Participation Rate alongside it.",
          },
          {
            abbr: "Jobless Claims", full: "Initial Jobless Claims", category: "Employment",
            release: "Weekly — every Thursday, 8:30 AM ET",
            impact: "bearish",
            what: "Number of people filing for unemployment insurance for the first time in the past week. The most frequently released labor market indicator — weekly data gives a real-time pulse.",
            why: "Higher claims = more people losing jobs = economy weakening = rate cut expectations rise = USD bearish. Lower claims = healthy job market = Fed can stay tight = USD positive.",
            tip: "Weekly data is noisy. Watch the 4-week moving average, not a single print. Spikes above 300K tend to cause significant USD moves.",
          },
          {
            abbr: "FOMC Rate", full: "Federal Funds Rate Decision", category: "Fed / Policy",
            release: "8x per year — Wednesday, 2:00 PM ET (followed by press conference at 2:30 PM)",
            impact: "bullish",
            what: "The Federal Open Market Committee votes on the target interest rate. Decision is either: hike (raise rates), cut (lower rates), or hold (unchanged). The press conference that follows often moves markets more than the decision itself.",
            why: "Higher rates = better return on USD-denominated assets = demand for USD rises. Rate cuts = USD weakens. Even a 'hold' can be bullish if market expected a cut.",
            tip: "Read the statement carefully for 'forward guidance' — words like 'restrictive', 'data dependent', or 'patient' tell you more about the next move than the decision itself.",
          },
          {
            abbr: "FOMC Minutes", full: "FOMC Meeting Minutes", category: "Fed / Policy",
            release: "3 weeks after each FOMC meeting, 2:00 PM ET",
            impact: "watch",
            what: "Detailed record of what FOMC members discussed during their meeting — their views on inflation, growth, labor market, and rate path. More granular than the post-meeting statement.",
            why: "Hawkish minutes (members worried about inflation, reluctant to cut) → USD bullish. Dovish minutes (members see risks to growth, open to cutting) → USD bearish. The language used matters enormously.",
            tip: "Markets often 'buy the rumor' (react at the meeting) then have a muted reaction to Minutes unless there's a surprise. Look for dissents and specific rate-path language.",
          },
          {
            abbr: "Durable Goods", full: "Durable Goods Orders", category: "Growth",
            release: "Monthly — ~4th week, 8:30 AM ET",
            impact: "bullish",
            what: "New orders placed with US manufacturers for goods expected to last 3+ years (aircraft, machinery, vehicles, electronics). Measures business investment in the economy.",
            why: "Rising orders = companies investing in expansion = economic confidence = USD positive. Weak orders = businesses pulling back = slowdown fear. Core Durable Goods (ex defense, ex aircraft) is the 'clean' reading.",
            tip: "Headline can be wildly distorted by a single aircraft order (Boeing). Always check 'core' ex-transportation figure for the real signal.",
          },
          {
            abbr: "Trade Balance", full: "Trade Balance", category: "Growth",
            release: "Monthly — ~5 weeks after month end, 8:30 AM ET",
            impact: "bullish",
            what: "Difference between US exports and imports. A deficit means the US buys more from the world than it sells. The US runs a persistent trade deficit — the number fluctuates around -$60B to -$100B monthly.",
            why: "A narrowing deficit (less negative) = fewer USD outflows to pay for imports = mild USD positive. A widening deficit can signal strong domestic demand (complex). Generally a second-tier market mover.",
            tip: "The goods trade balance is released earlier as an advance estimate and is the more market-moving version.",
          },
          {
            abbr: "Consumer Confidence", full: "Consumer Confidence Index (CB)", category: "Sentiment / PMI",
            release: "Monthly — last Tuesday, 10:00 AM ET",
            impact: "bullish",
            what: "Survey by The Conference Board asking ~3,000 US households how they feel about current business conditions and their 6-month outlook. Scale indexed to 1985 = 100.",
            why: "Confident consumers spend more → retail sales and GDP grow → USD positive. Low confidence → spending pullback → recession fears → USD negative. Especially useful as a leading indicator of consumer spending.",
            tip: "The 'Jobs Hard to Get' sub-index within the survey is a shadow unemployment signal the Fed follows.",
          },
          {
            abbr: "Michigan Sentiment", full: "University of Michigan Consumer Sentiment", category: "Sentiment / PMI",
            release: "Monthly — Preliminary (2nd Friday), Final (4th Friday), 10:00 AM ET",
            impact: "bullish",
            what: "Survey of ~500 US consumers rating personal finances, business conditions, and buying conditions. Also includes 1-year and 5-year inflation expectations.",
            why: "The 5-year inflation expectations component directly influences Fed thinking — if consumers expect high long-term inflation, the Fed must respond aggressively → USD can spike. Headline sentiment reading affects risk appetite broadly.",
            tip: "The inflation expectations sub-reading can be more market-moving than the headline sentiment number.",
          },
          {
            abbr: "Building Permits", full: "Building Permits / Housing Starts", category: "Housing",
            release: "Monthly — ~3rd week, 8:30 AM ET",
            impact: "bullish",
            what: "Building Permits = government approvals for new construction. Housing Starts = actual ground broken on new homes. Released together. Both measure health of the housing sector.",
            why: "Strong housing = strong economy (construction jobs, materials demand, furnishings). Also signals consumer confidence (people buy homes when feeling secure). Weak housing can lead GDP down by several months.",
            tip: "Housing is very sensitive to mortgage rates (and therefore Fed rates). A housing slowdown can be an early warning of Fed overtightening.",
          },
        ]

        const filtered = GLOSSARY.filter(g =>
          !glossarySearch ||
          g.abbr.toLowerCase().includes(glossarySearch.toLowerCase()) ||
          g.full.toLowerCase().includes(glossarySearch.toLowerCase()) ||
          g.category.toLowerCase().includes(glossarySearch.toLowerCase())
        )

        const categoryColors = {
          "Employment":      "bg-blue-500/10 border-blue-500/30 text-blue-400",
          "Inflation":       "bg-red-500/10 border-red-500/30 text-red-400",
          "Growth":          "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
          "Sentiment / PMI": "bg-purple-500/10 border-purple-500/30 text-purple-400",
          "Fed / Policy":    "bg-amber-500/10 border-amber-500/30 text-amber-400",
          "Housing":         "bg-cyan-500/10 border-cyan-500/30 text-cyan-400",
        }

        const impactLabel = { bullish: "📈 Bullish if Higher", bearish: "📉 Bearish if Higher", watch: "👀 Watch Tone" }

        return (
          <div className="card overflow-hidden">
            <button onClick={() => setGlossaryOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/30 transition-colors text-left">
              <div>
                <h3 className="card-title flex items-center gap-2">📖 Economic Indicator Glossary</h3>
                <p className="text-xs text-gray-500 mt-0.5">What is NFP, CPI, PPI, PCE, FOMC...? — {GLOSSARY.length} indicators explained</p>
              </div>
              <span className="text-gray-500 text-xs flex-none">{glossaryOpen ? "▲ hide" : "▼ show"}</span>
            </button>

            {glossaryOpen && (
              <div className="border-t border-gray-700/50">
                {/* Search */}
                <div className="px-5 py-3 border-b border-gray-700/40">
                  <input
                    type="text"
                    placeholder="Search indicators… (e.g. NFP, inflation, employment)"
                    value={glossarySearch}
                    onChange={e => setGlossarySearch(e.target.value)}
                    className="input w-full text-sm"
                  />
                </div>

                {/* Cards grid */}
                <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filtered.map(g => (
                    <div key={g.abbr} className="rounded-xl border border-gray-700/50 bg-gray-900/40 overflow-hidden">
                      {/* Card header */}
                      <div className="px-4 py-3 border-b border-gray-700/40 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-black text-gray-100 mono">{g.abbr}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${categoryColors[g.category] || "bg-gray-700/40 border-gray-600/30 text-gray-400"}`}>
                            {g.category}
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          g.impact === "bullish" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
                          g.impact === "bearish" ? "bg-red-500/10 border-red-500/30 text-red-400" :
                          "bg-blue-500/10 border-blue-500/30 text-blue-400"
                        }`}>{impactLabel[g.impact]}</span>
                      </div>

                      <div className="px-4 py-3 space-y-2.5">
                        {/* Full name + release schedule */}
                        <div>
                          <p className="text-xs font-semibold text-gray-200">{g.full}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">🗓 {g.release}</p>
                        </div>

                        {/* What it is */}
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">What it measures</p>
                          <p className="text-xs text-gray-400 leading-relaxed">{g.what}</p>
                        </div>

                        {/* Why traders care */}
                        <div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Why it moves USD</p>
                          <p className="text-xs text-gray-300 leading-relaxed">{g.why}</p>
                        </div>

                        {/* Pro tip */}
                        <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-0.5">💡 Trader tip</p>
                          <p className="text-[11px] text-gray-400 leading-relaxed">{g.tip}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filtered.length === 0 && (
                    <p className="text-gray-500 text-sm col-span-2 text-center py-8">No indicators match "{glossarySearch}"</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })()}

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
