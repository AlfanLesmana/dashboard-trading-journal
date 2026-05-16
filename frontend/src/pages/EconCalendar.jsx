import { useEffect, useState, useRef } from "react"
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

// Live countdown hook
function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
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
  if (!isoUtc) return "—"
  const d = new Date(isoUtc)
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function fmtTimeLocal(isoUtc) {
  if (!isoUtc) return "TBA"
  const d = new Date(isoUtc)
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
}

export default function EconCalendar() {
  const [events, setEvents]   = useState([])
  const [vol, setVol]         = useState(null)
  const [loadingEv, setLoadingEv] = useState(true)
  const [loadingVol, setLoadingVol] = useState(true)
  const [impactFilter, setImpactFilter] = useState(["High", "Medium"])
  const [symbol, setSymbol]   = useState("NQ=F")
  const [volSymbol, setVolSymbol] = useState("NQ=F")
  const now = useNow()

  // Fetch events
  useEffect(() => {
    setLoadingEv(true)
    api.econEvents(impactFilter.join(","))
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoadingEv(false))
  }, [impactFilter.join(",")])

  // Fetch volatility (debounced on symbol change)
  useEffect(() => {
    setLoadingVol(true)
    setVol(null)
    api.econVolatility(volSymbol)
      .then(setVol)
      .catch(() => setVol(null))
      .finally(() => setLoadingVol(false))
  }, [volSymbol])

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

  const sortedDays = Object.keys(grouped).sort()

  // Next upcoming high-impact event
  const nextEvent = events.find(e => e.impact === "High" && e.timestamp && e.timestamp * 1000 > now)

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Economic Calendar</h1>
          <p className="page-sub">High-impact news events &amp; historical volatility</p>
        </div>
        {/* Impact filter toggles */}
        <div className="flex items-center gap-2 mt-1">
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
        ) : events.length === 0 ? (
          <p className="text-gray-500 text-center py-16">No events found. Try adjusting filters.</p>
        ) : (
          <div className="divide-y divide-gray-700/40">
            {sortedDays.map(day => (
              <div key={day}>
                {/* Day header */}
                <div className="px-5 py-2 bg-gray-900/40">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {fmtDateLocal(day + "T12:00:00Z")}
                  </p>
                </div>
                {/* Events for this day */}
                {grouped[day].map((e, i) => {
                  const m = IMPACT_META[e.impact] || IMPACT_META.Low
                  const cd = e.timestamp ? fmtCountdown(e.timestamp * 1000, now) : null
                  const isPast = cd?.past
                  return (
                    <div key={e.id || i}
                      className={`px-5 py-3.5 flex items-center gap-4 hover:bg-gray-800/30 transition-colors ${isPast ? "opacity-50" : ""}`}>
                      {/* Impact dot */}
                      <span className={`w-2 h-2 rounded-full flex-none ${m.dot}`} />

                      {/* Time */}
                      <div className="w-20 flex-none">
                        <p className="text-xs font-mono text-gray-300">{fmtTimeLocal(e.datetime_utc)}</p>
                      </div>

                      {/* Event title */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-100 truncate">{e.title}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                          {e.forecast && <span>Forecast: <span className="text-gray-300">{e.forecast}</span></span>}
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
                        <div className="text-right flex-none w-28">
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
          <select
            className="select text-sm w-auto min-w-[160px]"
            value={volSymbol}
            onChange={e => setVolSymbol(e.target.value)}>
            {SYMBOLS.map(s => <option key={s} value={s}>{SYMBOL_LABELS[s]}</option>)}
          </select>
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
                  <p className="label mb-3">ATR by Event Type (avg points, high impact only)</p>
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
