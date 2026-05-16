import { useEffect, useState, useCallback } from "react"
import { api } from "../api"
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend
} from "recharts"

const fmt = (n, dec = 2) =>
  n == null ? "—" : (n >= 0 ? "+" : "") + Number(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtAbs = (n, dec = 2) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })
const pctColor = (v) => v >= 0 ? "text-emerald-400" : "text-red-400"

function StatCard({ label, value, sub, valueClass = "text-gray-100" }) {
  return (
    <div className="bg-gray-900/60 rounded-xl p-4 border border-gray-700/40">
      <p className="label mb-2">{label}</p>
      <p className={`text-xl font-bold mono ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
    </div>
  )
}

const TT = { background: "#0f172a", border: "1px solid #334155", borderRadius: 10, fontSize: 13, color: "#f1f5f9" }

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

function PnLCalendar() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-indexed
  const [calData, setCalData] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const to   = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`
    api.calendar({ date_from: from, date_to: to })
      .then(raw => {
        // raw is array of { date, net_pnl, trades }
        const map = {}
        ;(raw || []).forEach(d => { map[d.trade_date] = d })
        setCalData(map)
      })
      .finally(() => setLoading(false))
  }, [year, month])

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  // Build calendar grid
  const firstDow = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = [] // null = empty padding, number = day
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  // Monthly totals
  const monthlyPnl   = Object.values(calData).reduce((s, d) => s + (d.net_pnl || 0), 0)
  const tradingDays  = Object.values(calData).filter(d => d.trades > 0).length
  const winDays      = Object.values(calData).filter(d => d.net_pnl > 0).length
  const lossDays     = Object.values(calData).filter(d => d.net_pnl < 0).length

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="card-title">P&amp;L Calendar</h3>
          <p className="text-xs text-gray-400 mt-0.5">Daily profit &amp; loss by date</p>
        </div>
        {/* Month navigator */}
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700/60 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors text-sm">‹</button>
          <div className="text-center min-w-[130px]">
            <span className="text-sm font-semibold text-gray-100">{MONTHS[month]} {year}</span>
          </div>
          <button onClick={nextMonth} disabled={year === now.getFullYear() && month === now.getMonth()}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-700/60 hover:bg-gray-700 text-gray-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm">›</button>
        </div>
      </div>

      {/* Monthly summary strip */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: "Monthly P&L",   value: (monthlyPnl >= 0 ? "+" : "") + "$" + Math.abs(monthlyPnl).toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2}), color: monthlyPnl >= 0 ? "text-emerald-400" : "text-red-400" },
          { label: "Trading Days",  value: tradingDays,  color: "text-gray-100" },
          { label: "Green Days",    value: winDays,      color: "text-emerald-400" },
          { label: "Red Days",      value: lossDays,     color: "text-red-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-gray-900/60 rounded-xl p-3 text-center border border-gray-700/40">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-base font-bold mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-500 uppercase py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-amber-500 border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} />
            const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
            const d   = calData[key]
            const pnl = d?.net_pnl ?? null
            const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear()

            let bg = "bg-gray-800/40 border-gray-700/30"
            let textColor = "text-gray-500"
            if (pnl !== null && pnl > 0) { bg = "bg-emerald-500/15 border-emerald-500/30"; textColor = "text-emerald-400" }
            if (pnl !== null && pnl < 0) { bg = "bg-red-500/15 border-red-500/30";         textColor = "text-red-400" }
            if (pnl !== null && pnl === 0) { bg = "bg-gray-700/30 border-gray-600/30";      textColor = "text-gray-400" }

            return (
              <div key={key} title={d ? `${key}: ${pnl >= 0 ? "+" : ""}$${Math.abs(pnl).toFixed(2)} (${d.trades} trade${d.trades !== 1 ? "s" : ""})` : ""}
                className={`relative rounded-lg border p-2 flex flex-col h-[76px] transition-all ${bg} ${isToday ? "ring-1 ring-amber-500/60" : ""}`}>
                {/* Day number — top left */}
                <span className={`text-xs font-bold leading-none ${isToday ? "text-amber-400" : "text-gray-400"}`}>{day}</span>
                {/* PnL + trades — centered stack */}
                {pnl !== null ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
                    <span className={`text-sm font-black mono leading-tight ${textColor}`}>
                      {Math.abs(pnl) >= 1000
                        ? (pnl >= 0 ? "+" : "-") + "$" + (Math.abs(pnl)/1000).toFixed(1) + "k"
                        : (pnl >= 0 ? "+" : "-") + "$" + Math.abs(pnl).toFixed(0)}
                    </span>
                    {d?.trades > 0 && (
                      <span className="text-xs text-gray-400 leading-tight">{d.trades} trade{d.trades !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                ) : <div className="flex-1" />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Insights() {
  const [data, setData]       = useState(null)
  const [opts, setOpts]       = useState({ symbols: [] })
  const [filters, setFilters] = useState({ date_from: "", date_to: "", symbol: "", direction: "" })
  const [loading, setLoading] = useState(true)

  useEffect(() => { api.filterOptions().then(setOpts) }, [])

  const load = useCallback(() => {
    setLoading(true)
    const f = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    api.insights(f).then(setData).finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const activeCount = Object.values(filters).filter(Boolean).length

  const { by_day, by_direction, streaks, period, duration, by_time_slot, duration_history } = data ?? {}

  // Duration breakdown by direction (computed from per-trade history)
  const longDur = duration_history?.filter(d => d.direction === "Long") ?? []
  const shortDur = duration_history?.filter(d => d.direction === "Short") ?? []
  const avgDirDur = (arr) => arr.length ? arr.reduce((s, d) => s + d.duration, 0) / arr.length : null

  // Time slot data with flat Long/Short win rate fields for grouped bars
  const slotChartData = (by_time_slot ?? []).map(s => ({
    ...s,
    long_win_rate: s.by_direction?.Long?.win_rate ?? null,
    short_win_rate: s.by_direction?.Short?.win_rate ?? null,
    long_trades: s.by_direction?.Long?.trades ?? 0,
    short_trades: s.by_direction?.Short?.trades ?? 0,
    long_net_pnl: s.by_direction?.Long?.net_pnl ?? 0,
    short_net_pnl: s.by_direction?.Short?.net_pnl ?? 0,
  }))

  const slotEnd = (slot) => {
    const [h, m] = slot.split(":").map(Number)
    const total = h * 60 + m + 30
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
  }

  const fmtDur = (mins) => {
    if (mins == null) return "—"
    if (mins < 60) return `${Math.round(mins)}m`
    const h = Math.floor(mins / 60), m = Math.round(mins % 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Insights</h1>
          <p className="page-sub">Deep dive into your trading patterns and habits</p>
        </div>
        {activeCount > 0 && (
          <button onClick={() => setFilters({ date_from: "", date_to: "", symbol: "", direction: "" })}
            className="text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/50 px-3 py-1.5 rounded-lg transition-colors flex-none mt-1">
            Clear filters
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="card p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label block mb-1.5">From</label>
            <input type="date" className="input text-sm" value={filters.date_from} onChange={e => set("date_from", e.target.value)} />
          </div>
          <div>
            <label className="label block mb-1.5">To</label>
            <input type="date" className="input text-sm" value={filters.date_to} onChange={e => set("date_to", e.target.value)} />
          </div>
          <div>
            <label className="label block mb-1.5">Symbol</label>
            <select className="select text-sm" value={filters.symbol} onChange={e => set("symbol", e.target.value)}>
              <option value="">All Symbols</option>
              {opts.symbols.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label block mb-1.5">Direction</label>
            <select className="select text-sm" value={filters.direction} onChange={e => set("direction", e.target.value)}>
              <option value="">All</option>
              <option>Long</option>
              <option>Short</option>
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
        </div>
      )}

      {!loading && !data && (
        <p className="text-gray-500 text-center py-16">No trade data available.</p>
      )}

      {!loading && data && <>

      {/* ── PERIOD OVERVIEW ── */}
      <div className="card p-5">
        <h3 className="card-title mb-4">Period Overview</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="First Trade" value={period?.first_trade ?? "—"} />
          <StatCard label="Last Trade" value={period?.last_trade ?? "—"} />
          <StatCard label="Active Days" value={period?.active_days ?? "—"} sub="days with trades" />
          <StatCard label="Avg Trades / Day" value={fmtAbs(period?.avg_trades_per_day, 1)} sub="on active days" />
        </div>
      </div>

      {/* ── P&L CALENDAR ── */}
      <PnLCalendar />

      {/* ── TRADE DURATION ── */}
      {duration && Object.keys(duration).length > 0 && (
        <div className="card p-5 space-y-5">
          <div>
            <h3 className="card-title">Trade Duration</h3>
            <p className="text-sm text-gray-400 mt-0.5">Hold time per trade — green = win, red = loss</p>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Avg Duration" value={fmtDur(duration.avg)} valueClass="text-amber-400" />
            <StatCard label="Median" value={fmtDur(duration.median)} />
            <StatCard label="Avg Winning" value={fmtDur(duration.avg_win)} valueClass="text-emerald-400" sub="hold time" />
            <StatCard label="Avg Losing" value={fmtDur(duration.avg_loss)} valueClass="text-red-400" sub="hold time" />
          </div>
          {/* By direction */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { dir: "Long", arr: longDur, color: "border-emerald-500/20 bg-emerald-500/5", textColor: "text-emerald-400" },
              { dir: "Short", arr: shortDur, color: "border-indigo-500/20 bg-indigo-500/5", textColor: "text-indigo-400" },
            ].map(({ dir, arr, color, textColor }) => {
              const wins = arr.filter(d => d.win)
              const losses = arr.filter(d => !d.win)
              const avg = avgDirDur(arr)
              const avgW = avgDirDur(wins)
              const avgL = avgDirDur(losses)
              return (
                <div key={dir} className={`rounded-xl p-4 border ${color}`}>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${textColor}`}>{dir}</p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-xs text-gray-400">Avg</p>
                      <p className="text-sm font-bold text-gray-200">{fmtDur(avg)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Avg Win</p>
                      <p className="text-sm font-bold text-emerald-400">{fmtDur(avgW)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Avg Loss</p>
                      <p className="text-sm font-bold text-red-400">{fmtDur(avgL)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Per-trade duration chart */}
          {duration_history && duration_history.length > 0 && (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={duration_history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false}
                  minTickGap={40} tickFormatter={(v) => v?.slice(5)} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false} width={44}
                  tickFormatter={(v) => v < 60 ? `${v}m` : `${Math.floor(v/60)}h`} />
                <Tooltip
                  contentStyle={TT}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <div style={TT} className="p-3 rounded-lg space-y-0.5">
                        <p className="text-gray-300 font-semibold">{d.date} {d.open_time}</p>
                        <p className="text-gray-400 text-xs">{d.symbol} · {d.direction}</p>
                        <p className="text-amber-400">{fmtDur(d.duration)}</p>
                        <p className={d.win ? "text-emerald-400" : "text-red-400"}>
                          {d.net_pnl >= 0 ? "+" : ""}{d.net_pnl?.toFixed(2)}
                        </p>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="duration" radius={[3, 3, 0, 0]}>
                  {duration_history.map((d, i) => (
                    <Cell key={i} fill={d.win ? "#10b981" : "#ef4444"} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* ── STREAKS ── */}
      <div className="card p-5">
        <h3 className="card-title mb-4">Streak Analysis</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Best Win Streak" value={streaks?.max_win_streak ?? "—"} sub="consecutive wins" valueClass="text-emerald-400" />
          <StatCard label="Worst Loss Streak" value={streaks?.max_loss_streak ?? "—"} sub="consecutive losses" valueClass="text-red-400" />
          <StatCard
            label="Current Streak"
            value={streaks?.current_streak_count != null
              ? `${streaks.current_streak_count} ${streaks.current_streak_type === "win" ? "W" : "L"}`
              : "—"}
            valueClass={streaks?.current_streak_type === "win" ? "text-emerald-400" : "text-red-400"}
            sub="in a row"
          />
          <StatCard label="Win / Loss Ratio" value={streaks?.win_loss_ratio ?? "—"} sub="wins per loss" valueClass="text-amber-400" />
        </div>
      </div>

      {/* ── DAY OF WEEK + DIRECTION ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Day of week */}
        <div className="card p-5">
          <h3 className="card-title mb-5">Performance by Day of Week</h3>
          {(!by_day || by_day.length === 0) ? (
            <p className="text-gray-400 text-sm text-center py-12">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={by_day} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false} width={48}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v)} />
                <Tooltip contentStyle={TT} formatter={(v) => [fmt(v), "Net PnL"]} />
                <Bar dataKey="net_pnl" radius={[4, 4, 0, 0]}>
                  {by_day.map((d, i) => (
                    <Cell key={i} fill={d.net_pnl >= 0 ? "#10b981" : "#ef4444"} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {by_day && by_day.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-4">
              {by_day.map((d, i) => (
                <div key={i} className="bg-gray-800/50 rounded-lg px-3 py-2 text-center">
                  <p className="text-xs text-gray-400">{d.day}</p>
                  <p className={`text-sm font-bold ${pctColor(d.net_pnl)}`}>{fmt(d.net_pnl, 0)}</p>
                  <p className="text-xs text-gray-400">{d.trades}t · {fmtAbs(d.win_rate, 0)}%</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Long vs Short */}
        <div className="card p-5">
          <h3 className="card-title mb-4">Long vs Short</h3>
          {(!by_direction || by_direction.length === 0) ? (
            <p className="text-gray-400 text-sm text-center py-12">No data</p>
          ) : (
            <div className="space-y-3">
              {by_direction.map((d, i) => {
                const isLong = d.direction === "Long"
                const total = by_direction.reduce((s, x) => s + Math.abs(x.net_pnl), 0)
                const pct = total ? Math.round((Math.abs(d.net_pnl) / total) * 100) : 0
                return (
                  <div key={i} className={`rounded-xl p-4 border ${isLong ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{d.direction}</span>
                      <span className={`text-xl font-bold ${isLong ? "text-emerald-400" : "text-red-400"}`}>{fmt(d.net_pnl)}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-700 rounded-full mb-3 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: isLong ? "#10b981" : "#ef4444" }} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xs text-gray-400">Trades</p>
                        <p className="text-sm font-semibold text-gray-200">{d.trades}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Win Rate</p>
                        <p className={`text-sm font-semibold ${d.win_rate >= 50 ? "text-emerald-400" : "text-red-400"}`}>{fmtAbs(d.win_rate, 0)}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Profit Factor</p>
                        <p className={`text-sm font-semibold ${d.profit_factor >= 1 ? "text-emerald-400" : "text-red-400"}`}>{fmtAbs(d.profit_factor)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── WIN RATE BY TIME SLOT ── */}
      {slotChartData.length > 0 && (
        <div className="card p-5">
          <h3 className="card-title mb-1">Win Rate by Time of Day</h3>
          <p className="text-xs text-gray-400 mb-4">30-minute slots · Long vs Short win %</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={slotChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%">
              <XAxis dataKey="slot" tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false}
                width={36} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={TT}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  const end = slotEnd(label)
                  return (
                    <div style={TT} className="p-3 rounded-lg space-y-1">
                      <p className="text-gray-300 font-semibold">{label} – {end}</p>
                      <p className="text-gray-500 text-xs">{d?.trades} total trades</p>
                      {d?.long_win_rate != null && (
                        <p className="text-emerald-400 text-xs">Long: {d.long_win_rate}% ({d.long_trades}t)</p>
                      )}
                      {d?.short_win_rate != null && (
                        <p className="text-indigo-400 text-xs">Short: {d.short_win_rate}% ({d.short_trades}t)</p>
                      )}
                    </div>
                  )
                }}
              />
              <Legend
                formatter={(v) => v === "long_win_rate" ? "Long" : "Short"}
                wrapperStyle={{ fontSize: 12, color: "#9ca3af" }}
              />
              <Bar dataKey="long_win_rate" name="long_win_rate" fill="#10b981" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
              <Bar dataKey="short_win_rate" name="short_win_rate" fill="#6366f1" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {/* Summary table */}
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {slotChartData.map((d, i) => (
              <div key={i} className="bg-gray-800/50 rounded-lg px-3 py-2.5 space-y-1.5">
                <p className="text-xs text-gray-400 font-medium">{d.slot} – {slotEnd(d.slot)}</p>
                {d.long_win_rate != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-emerald-500">Long</span>
                    <span className="text-xs font-bold text-emerald-400">{d.long_win_rate}% <span className="text-gray-400 font-normal">({d.long_trades}t)</span></span>
                  </div>
                )}
                {d.short_win_rate != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-indigo-400">Short</span>
                    <span className="text-xs font-bold text-indigo-400">{d.short_win_rate}% <span className="text-gray-400 font-normal">({d.short_trades}t)</span></span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── RESULT DISTRIBUTION ── */}
      <div className="card p-5">
        <h3 className="card-title mb-4">Trade Result Distribution</h3>
        {(!data.buckets || data.buckets.length === 0) ? (
          <p className="text-gray-400 text-sm text-center py-12">No data</p>
        ) : (
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={data.buckets} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <XAxis dataKey="range" tick={{ fill: "#4b5563", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#4b5563", fontSize: 12 }} axisLine={false} tickLine={false} width={28} />
              <Tooltip contentStyle={TT} formatter={(v) => [v, "Trades"]} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.buckets.map((b, i) => (
                  <Cell key={i} fill={b.positive ? "#10b981" : "#ef4444"} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      </>}
    </div>
  )
}
