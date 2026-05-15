import { useEffect, useState } from "react"
import { api } from "../api"
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts"

const fmt = (n, dec = 2) =>
  n == null ? "—" : (n >= 0 ? "+" : "") + Number(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmtAbs = (n, dec = 2) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })
const pctColor = (v) => v >= 0 ? "text-emerald-400" : "text-red-400"
const TT = { background: "#0f172a", border: "1px solid #334155", borderRadius: 10, fontSize: 13, color: "#f1f5f9" }

function QuickStat({ label, value, valueClass = "text-gray-100", sub }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <span className={`text-xl font-bold leading-tight mono ${valueClass}`}>{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  )
}

export default function Overview() {
  const [metrics, setMetrics] = useState(null)
  const [equity, setEquity]   = useState([])
  const [recentTrades, setRecentTrades] = useState([])
  const [byDay, setByDay]     = useState([])
  const [streaks, setStreaks]  = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.metrics(),
      api.equityCurve(),
      api.trades({ page_size: 6, page: 1 }),
      api.insights(),
    ]).then(([m, eq, tr, ins]) => {
      setMetrics(m)
      setEquity((eq || []).slice(-60))
      setRecentTrades((tr?.data || []).slice(0, 6))
      setByDay(ins?.by_day || [])
      setStreaks(ins?.streaks || null)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-amber-500 border-t-transparent" />
    </div>
  )

  const netPnl      = metrics?.net_pnl        ?? 0
  const winRate     = metrics?.win_rate        ?? 0
  const pf          = metrics?.profit_factor   ?? 0
  const expectancy  = metrics?.expectancy      ?? 0
  const maxDD       = metrics?.max_drawdown    ?? 0
  const totalTrades = metrics?.total_trades    ?? 0
  const grossProfit = metrics?.gross_profit    ?? 0
  const grossLoss   = metrics?.gross_loss      ?? 0
  const winCount    = metrics?.win_count       ?? 0
  const lossCount   = metrics?.loss_count      ?? 0
  const bestTrade   = metrics?.best_trade      ?? 0
  const worstTrade  = metrics?.worst_trade     ?? 0
  const avgWin      = metrics?.avg_win         ?? 0
  const avgLoss     = metrics?.avg_loss        ?? 0

  const equityMin = equity.length ? Math.min(...equity.map(e => e.cumulative_pnl)) : 0
  const equityMax = equity.length ? Math.max(...equity.map(e => e.cumulative_pnl)) : 1

  const lossAlert = streaks?.current_streak_type === "loss" && streaks?.current_streak_count >= 3

  return (
    <div className="space-y-4 pb-8">

      {/* ── CONSECUTIVE LOSS ALERT ── */}
      {lossAlert && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3.5">
          <span className="text-xl flex-none mt-0.5">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-red-400">
              Consecutive Loss Alert — {streaks.current_streak_count} losses in a row
            </p>
            <p className="text-xs text-red-400/70 mt-0.5">
              Consider stepping back to review your setups before the next trade.
            </p>
          </div>
        </div>
      )}

      {/* ── HERO ── */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gray-900">
        <div className="absolute inset-0 opacity-15 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 70% 90% at 50% -10%, #f59e0b, transparent)" }} />
        <div className="relative p-5 lg:p-7">
          <div className="flex flex-col lg:flex-row lg:items-center gap-5">

            {/* Net PnL */}
            <div className="flex-none">
              <p className="label mb-1">Net Profit / Loss</p>
              <p className={`text-5xl lg:text-6xl font-black tracking-tight mono ${pctColor(netPnl)}`}>{fmt(netPnl)}</p>
              <p className="text-gray-400 text-xs mt-1.5">{totalTrades} trades recorded</p>
            </div>

            {/* Equity spark */}
            <div className="flex-1" style={{ minHeight: 90 }}>
              <ResponsiveContainer width="100%" height={90}>
                <AreaChart data={equity} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[equityMin * 0.999, equityMax * 1.001]} hide />
                  <Tooltip contentStyle={TT} formatter={(v) => ["$" + fmtAbs(v), "Equity"]} labelFormatter={() => ""} />
                  <Area type="monotone" dataKey="cumulative_pnl" stroke="#f59e0b" strokeWidth={2} fill="url(#heroGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-x-6 gap-y-3 lg:w-40 flex-none">
              <QuickStat label="Win Rate"      value={`${fmtAbs(winRate, 1)}%`}   valueClass={winRate >= 50 ? "text-emerald-400" : "text-red-400"} />
              <QuickStat label="Profit Factor" value={fmtAbs(pf)}                 valueClass={pf >= 1 ? "text-emerald-400" : "text-red-400"} />
              <QuickStat label="Expectancy"    value={fmt(expectancy)}             valueClass={pctColor(expectancy)} sub="per trade" />
              <QuickStat label="Max Drawdown"  value={`${fmtAbs(Math.abs(maxDD), 1)}%`} valueClass="text-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI STRIP ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Best Trade",  value: fmt(bestTrade),  color: "text-emerald-400", icon: "🏆" },
          { label: "Worst Trade", value: fmt(worstTrade), color: "text-red-400",     icon: "📉" },
          { label: "Avg Win",     value: fmt(avgWin),     color: "text-emerald-400", icon: "✅" },
          { label: "Avg Loss",    value: fmt(avgLoss),    color: "text-red-400",     icon: "❌" },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="card flex items-center gap-3 px-4 py-4">
            <span className="text-xl flex-none">{icon}</span>
            <div className="min-w-0">
              <p className="label mb-0.5 truncate">{label}</p>
              <p className={`text-lg font-bold mono ${color}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── CUMULATIVE PNL + RECENT TRADES ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ alignItems: "stretch" }}>

        {/* Chart */}
        <div className="card lg:col-span-3 flex flex-col">
          <div className="px-5 py-4 border-b border-gray-700/60 flex items-center justify-between">
            <h3 className="card-title">Cumulative P&amp;L</h3>
            <span className={`text-sm font-bold tabular-nums ${pctColor(netPnl)}`}>{fmt(netPnl)}</span>
          </div>
          <div className="flex-1 p-5" style={{ minHeight: 200 }}>
            {equity.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equity} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cumPnl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="trade_date" tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v?.slice(5, 10)} minTickGap={40} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false} width={52}
                    tickFormatter={(v) => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v} />
                  <Tooltip contentStyle={TT} formatter={(v) => [fmt(v), "Cumulative PnL"]} labelFormatter={(l) => l?.slice(0, 10)} />
                  <Area type="monotone" dataKey="cumulative_pnl" stroke="#f59e0b" strokeWidth={2} fill="url(#cumPnl)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent trades */}
        <div className="card lg:col-span-2 flex flex-col">
          <div className="px-5 py-4 border-b border-gray-700/60">
            <h3 className="card-title">Recent Trades</h3>
          </div>
          <div className="flex-1 px-5 divide-y divide-gray-800/80">
            {recentTrades.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No trades</p>
            ) : recentTrades.map((t, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-none ${t.net_pnl >= 0 ? "bg-emerald-400" : "bg-red-400"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-100 truncate">{t.symbol}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.direction} · {t.trade_date?.slice(0, 10)}</p>
                  </div>
                </div>
                <span className={`text-sm font-bold tabular-nums flex-none ml-3 ${pctColor(t.net_pnl)}`}>{fmt(t.net_pnl)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── WIN/LOSS BREAKDOWN + DAY OF WEEK ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Win/Loss */}
        <div className="card p-5 space-y-4">
          <h3 className="card-title">Win / Loss Breakdown</h3>
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-2">
              <span>{winCount} wins</span>
              <span>{lossCount} losses</span>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-800">
              <div className="bg-emerald-500" style={{ width: totalTrades ? `${(winCount / totalTrades) * 100}%` : "0%" }} />
              <div className="bg-red-500"     style={{ width: totalTrades ? `${(lossCount / totalTrades) * 100}%` : "0%" }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Gross Profit",  value: `$${fmtAbs(grossProfit)}`,         color: "text-emerald-400" },
              { label: "Gross Loss",    value: `-$${fmtAbs(Math.abs(grossLoss))}`, color: "text-red-400" },
              { label: "Profit Factor", value: fmtAbs(pf),                         color: pf >= 1 ? "text-emerald-400" : "text-red-400" },
              { label: "Expectancy",    value: fmt(expectancy),                     color: pctColor(expectancy) },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-800/50 rounded-xl p-4">
                <p className="label mb-1.5">{label}</p>
                <p className={`font-bold text-base ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Day of Week */}
        <div className="card p-5">
          <h3 className="card-title mb-4">Performance by Day</h3>
          {byDay.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">No data</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={byDay} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="day" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} axisLine={false} tickLine={false} width={44}
                    tickFormatter={(v) => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : v} />
                  <Tooltip contentStyle={TT} content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div style={TT} className="p-3 rounded-lg space-y-0.5">
                        <p className="text-gray-300 font-semibold">{d.day}</p>
                        <p className={`font-bold ${d.net_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(d.net_pnl)}</p>
                        <p className="text-gray-500 text-xs">{d.trades} trades · {fmtAbs(d.win_rate, 0)}% win</p>
                      </div>
                    )
                  }} />
                  <Bar dataKey="net_pnl" radius={[3, 3, 0, 0]}>
                    {byDay.map((d, i) => <Cell key={i} fill={d.net_pnl >= 0 ? "#10b981" : "#ef4444"} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-7 gap-1.5 mt-3">
                {byDay.map((d, i) => (
                  <div key={i} className="bg-gray-900/60 rounded-lg py-2 px-1 text-center">
                    <p className="text-xs text-gray-400 font-medium mb-0.5">{d.day}</p>
                    <p className={`text-xs font-bold mono ${pctColor(d.net_pnl)}`}>
                      {Math.abs(d.net_pnl) >= 1000 ? (d.net_pnl / 1000).toFixed(1) + "k" : fmt(d.net_pnl, 0)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{fmtAbs(d.win_rate, 0)}%</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  )
}
