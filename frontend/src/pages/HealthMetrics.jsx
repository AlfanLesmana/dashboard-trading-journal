import { useEffect, useState, useCallback } from "react"
import { api } from "../api"

const fmtAbs = (n, dec = 2) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })
const fmt = (n, dec = 2) =>
  n == null ? "—" : (n >= 0 ? "+" : "") + Number(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })

const GRADE_COLOR = {
  "A+": { text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", ring: "#10b981" },
  "A":  { text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", ring: "#10b981" },
  "B+": { text: "text-sky-400",     bg: "bg-sky-500/10 border-sky-500/30",         ring: "#38bdf8" },
  "B":  { text: "text-sky-400",     bg: "bg-sky-500/10 border-sky-500/30",         ring: "#38bdf8" },
  "C+": { text: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30",     ring: "#f59e0b" },
  "C":  { text: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30",     ring: "#f59e0b" },
  "D":  { text: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/30",   ring: "#fb923c" },
  "F":  { text: "text-red-400",     bg: "bg-red-500/10 border-red-500/30",         ring: "#ef4444" },
}

const GRADE_LABEL = {
  "A+": "Elite Trader", "A": "Expert Trader", "B+": "Advanced", "B": "Solid Trader",
  "C+": "Developing", "C": "Intermediate", "D": "Needs Work", "F": "Critical"
}

function gradeFromScore(s) {
  if (s >= 90) return "A+"
  if (s >= 80) return "A"
  if (s >= 70) return "B+"
  if (s >= 60) return "B"
  if (s >= 50) return "C+"
  if (s >= 40) return "C"
  if (s >= 28) return "D"
  return "F"
}

function catGrade(pct) {
  if (pct >= 90) return { letter: "A+", color: "text-emerald-400" }
  if (pct >= 78) return { letter: "A",  color: "text-emerald-400" }
  if (pct >= 66) return { letter: "B+", color: "text-sky-400" }
  if (pct >= 54) return { letter: "B",  color: "text-sky-400" }
  if (pct >= 42) return { letter: "C",  color: "text-amber-400" }
  if (pct >= 30) return { letter: "D",  color: "text-orange-400" }
  return { letter: "F", color: "text-red-400" }
}

function computeHealth(metrics, insights) {
  const pf  = metrics?.profit_factor   ?? 0
  const wr  = metrics?.win_rate        ?? 0
  const dd  = Math.abs(metrics?.max_drawdown ?? 0)
  const exp = metrics?.expectancy      ?? 0
  const avgWin  = Math.abs(metrics?.avg_win  ?? 0)
  const avgLoss = Math.abs(metrics?.avg_loss ?? 0)
  const rr  = avgLoss > 0 ? avgWin / avgLoss : 0

  // Profit Factor (0-25)
  const pfScore = pf >= 2.0 ? 25 : pf >= 1.5 ? 19 : pf >= 1.2 ? 13 : pf >= 1.0 ? 6 : 0
  // Win Rate (0-20)
  const wrScore = wr >= 60 ? 20 : wr >= 52 ? 16 : wr >= 45 ? 10 : wr >= 40 ? 5 : 0
  // Risk/Reward (0-20)
  const rrScore = rr >= 2.0 ? 20 : rr >= 1.5 ? 16 : rr >= 1.0 ? 10 : rr >= 0.8 ? 4 : 0
  // Drawdown (0-20)
  const ddScore = dd <= 5 ? 20 : dd <= 10 ? 16 : dd <= 20 ? 8 : dd <= 30 ? 3 : 0
  // Expectancy (0-15)
  const expScore = exp > 100 ? 15 : exp > 30 ? 12 : exp > 0 ? 6 : 0

  const total = pfScore + wrScore + rrScore + ddScore + expScore
  const grade = gradeFromScore(total)

  const maxWinStreak  = insights?.streaks?.max_win_streak  ?? 0
  const maxLossStreak = insights?.streaks?.max_loss_streak ?? 0
  const curStreak     = insights?.streaks?.current_streak_count ?? 0
  const curType       = insights?.streaks?.current_streak_type ?? "loss"

  // Suggestions
  const suggestions = []

  if (pf < 1.0) {
    suggestions.push({ priority: "critical", title: "You're Losing Money Overall", body: `Your profit factor is ${fmtAbs(pf)} — every dollar risked returns less than $1. Focus on cutting losses immediately and not over-trading. Consider reducing position size until your edge improves.` })
  } else if (pf < 1.5) {
    suggestions.push({ priority: "high", title: "Profit Factor Below Industry Standard", body: `A profit factor of ${fmtAbs(pf)} is marginal. Top traders target 1.5–2.5+. Let winners run longer or tighten your stop losses to widen the gap between wins and losses.` })
  }

  if (wr < 45) {
    suggestions.push({ priority: "high", title: "Win Rate is Below Sustainable Level", body: `At ${fmtAbs(wr, 1)}% win rate, you need at least a 2.5:1 R:R ratio to be profitable. Either tighten entry criteria to only take A+ setups, or refine exits to close losers faster.` })
  } else if (wr < 50) {
    suggestions.push({ priority: "medium", title: "Sub-50% Win Rate Requires Strong R:R", body: `${fmtAbs(wr, 1)}% win rate means you're losing more trades than you win. Your profitability depends entirely on your winners being significantly larger than losers.` })
  }

  if (rr < 1.0) {
    suggestions.push({ priority: "critical", title: "Losing More Per Loss Than Winning Per Win", body: `Your average loss ($${fmtAbs(avgLoss)}) exceeds your average win ($${fmtAbs(avgWin)}). This is a serious structural problem. Set hard stop-losses and trail your winners.` })
  } else if (rr < 1.5) {
    suggestions.push({ priority: "medium", title: "Risk/Reward Ratio Needs Improvement", body: `Your R:R is ${fmtAbs(rr)} — aim for at least 1.5:1. Review your exit strategy: are you closing winners too early or holding losers too long?` })
  }

  if (dd > 25) {
    suggestions.push({ priority: "critical", title: "Drawdown is at Dangerous Levels", body: `A ${fmtAbs(dd, 1)}% max drawdown means significant capital is at risk. Implement a daily loss limit (e.g. 2%) and a monthly circuit breaker. Protect capital above everything else.` })
  } else if (dd > 15) {
    suggestions.push({ priority: "high", title: "Drawdown Requires Attention", body: `${fmtAbs(dd, 1)}% drawdown is above the 10% risk threshold. Consider reducing position size during losing runs or adding a rule to stop trading after 3 consecutive losses.` })
  }

  if (maxLossStreak >= 5) {
    suggestions.push({ priority: "medium", title: `Max ${maxLossStreak}-Loss Streak Detected`, body: `Losing ${maxLossStreak} in a row suggests either a systematic flaw in your setup or that you continue trading when you're mentally off. A hard rule to pause after 3-4 consecutive losses can protect capital.` })
  }

  if (exp < 0) {
    suggestions.push({ priority: "critical", title: "Negative Expectancy — No Statistical Edge", body: `Your trading system has no positive edge in its current form. Paper trade or backtest a new strategy before continuing to risk real capital.` })
  } else if (exp < 20) {
    suggestions.push({ priority: "medium", title: "Expectancy is Thin", body: `At $${fmtAbs(exp)} per trade, your edge is narrow. Small improvements to entries/exits compound significantly over time. Focus on one pattern and master it.` })
  }

  // Strengths
  const strengths = []
  if (pf >= 1.5) strengths.push(`Strong profit factor (${fmtAbs(pf)}) — your winners consistently outweigh your losers.`)
  if (wr >= 55) strengths.push(`Excellent win rate of ${fmtAbs(wr, 1)}% shows consistent entry accuracy.`)
  if (rr >= 1.5) strengths.push(`Healthy R:R ratio of ${fmtAbs(rr)} — you protect capital well on losing trades.`)
  if (dd <= 10) strengths.push(`Max drawdown of ${fmtAbs(dd, 1)}% shows disciplined risk management.`)
  if (maxWinStreak >= 5) strengths.push(`Win streaks up to ${maxWinStreak} show the ability to compound gains when in form.`)
  if (exp >= 30) strengths.push(`Strong expectancy of $${fmtAbs(exp)} per trade — your system has a real edge.`)

  return {
    total,
    grade,
    categories: [
      { label: "Profit Factor", score: pfScore, max: 25, value: `${fmtAbs(pf)}`, detail: pf >= 2 ? "Elite level" : pf >= 1.5 ? "Above average" : pf >= 1.0 ? "Marginal — just profitable" : "Below break-even" },
      { label: "Win Rate",      score: wrScore, max: 20, value: `${fmtAbs(wr, 1)}%`, detail: wr >= 60 ? "Excellent accuracy" : wr >= 50 ? "Above 50%" : wr >= 45 ? "Below average" : "Needs significant improvement" },
      { label: "Risk / Reward", score: rrScore, max: 20, value: `${fmtAbs(rr)}:1`, detail: rr >= 2 ? "Elite ratio" : rr >= 1.5 ? "Strong" : rr >= 1.0 ? "Even — room to grow" : "Losers exceeding winners" },
      { label: "Drawdown Control", score: ddScore, max: 20, value: `${fmtAbs(dd, 1)}%`, detail: dd <= 5 ? "Exceptional capital preservation" : dd <= 10 ? "Well controlled" : dd <= 20 ? "Moderate risk" : "High — needs circuit breaker" },
      { label: "Expectancy",    score: expScore, max: 15, value: `$${fmtAbs(exp)}`, detail: exp > 100 ? "Outstanding edge per trade" : exp > 30 ? "Solid positive expectancy" : exp > 0 ? "Thin edge — improve entries/exits" : "No statistical edge" },
    ],
    suggestions,
    strengths,
    rr,
  }
}

function ScoreRing({ score, grade }) {
  const c = GRADE_COLOR[grade] ?? GRADE_COLOR["F"]
  const pct = score / 100
  const r = 52
  const circ = 2 * Math.PI * r
  const dash = pct * circ

  return (
    <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
      <svg width="140" height="140" className="rotate-[-90deg]">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1f2937" strokeWidth="10" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={c.ring} strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-4xl font-black leading-none ${c.text}`}>{grade}</span>
        <span className="text-sm text-gray-400 mt-1">{score}/100</span>
      </div>
    </div>
  )
}

function CategoryBar({ label, score, max, value, detail }) {
  const pct = max > 0 ? (score / max) * 100 : 0
  const g = catGrade(pct)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300">{label}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{value}</span>
          <span className={`text-xs font-bold w-6 text-right ${g.color}`}>{g.letter}</span>
        </div>
      </div>
      <div className="w-full h-2 bg-gray-700/60 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: pct >= 66 ? "#10b981" : pct >= 42 ? "#f59e0b" : "#ef4444" }} />
      </div>
      <p className="text-xs text-gray-400">{detail}</p>
    </div>
  )
}

const PRIORITY_STYLE = {
  critical: { badge: "bg-red-500/20 text-red-400 border border-red-500/30", icon: "🚨", label: "Critical" },
  high:     { badge: "bg-orange-500/20 text-orange-400 border border-orange-500/30", icon: "⚠️", label: "High Priority" },
  medium:   { badge: "bg-amber-500/20 text-amber-400 border border-amber-500/30", icon: "💡", label: "Suggestion" },
}

export default function HealthMetrics() {
  const [metrics, setMetrics]   = useState(null)
  const [insights, setInsights] = useState(null)
  const [filters, setFilters]   = useState({ date_from: "", date_to: "" })
  const [loading, setLoading]   = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const f = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    Promise.all([api.metrics(f), api.insights(f)])
      .then(([m, ins]) => { setMetrics(m); setInsights(ins) })
      .finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])

  const h = metrics?.total_trades ? computeHealth(metrics, insights) : null
  const c = h ? (GRADE_COLOR[h.grade] ?? GRADE_COLOR["F"]) : GRADE_COLOR["F"]

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Health Metrics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Professional-grade analysis of your trading performance</p>
        </div>
        {(filters.date_from || filters.date_to) && (
          <button onClick={() => setFilters({ date_from: "", date_to: "" })}
            className="text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-400/50 px-3 py-1.5 rounded-lg transition-colors flex-none mt-1">
            Clear filters
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="card p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">From</label>
            <input type="date" className="input text-sm" value={filters.date_from}
              onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">To</label>
            <input type="date" className="input text-sm" value={filters.date_to}
              onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
          </div>
          <div className="lg:col-span-2 flex items-end">
            <p className="text-xs text-gray-400 pb-2">Filter to analyse performance for a specific time window</p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-amber-500 border-t-transparent" />
        </div>
      )}

      {!loading && (!metrics || !metrics.total_trades) && (
        <p className="text-gray-500 text-center py-16">No trade data available for this period.</p>
      )}

      {!loading && h && <>

      {/* ── OVERALL SCORE HERO ── */}
      <div className={`card p-6 border ${c.bg}`}>
        <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
          <div className="flex-none flex flex-col items-center gap-3">
            <ScoreRing score={h.total} grade={h.grade} />
            <div className="text-center">
              <p className={`text-lg font-bold ${c.text}`}>{GRADE_LABEL[h.grade]}</p>
              <p className="text-xs text-gray-500 mt-0.5">Overall Trading Score</p>
            </div>
          </div>
          <div className="flex-1 space-y-4 w-full">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Total Trades", value: metrics.total_trades ?? "—" },
                { label: "Net P&L",      value: fmt(metrics.net_pnl),      color: (metrics.net_pnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400" },
                { label: "Profit Factor", value: fmtAbs(metrics.profit_factor), color: (metrics.profit_factor ?? 0) >= 1.5 ? "text-emerald-400" : "text-amber-400" },
                { label: "Win Rate",      value: `${fmtAbs(metrics.win_rate, 1)}%`, color: (metrics.win_rate ?? 0) >= 50 ? "text-emerald-400" : "text-red-400" },
              ].map(({ label, value, color = "text-gray-100" }) => (
                <div key={label} className="bg-gray-800/50 rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Category bars */}
            <div className="space-y-3 pt-1">
              {h.categories.map((cat) => (
                <CategoryBar key={cat.label} {...cat} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── SUGGESTIONS + STRENGTHS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* What to improve */}
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">Areas to Improve</h3>
          {h.suggestions.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <span className="text-3xl">🏆</span>
              <p className="text-emerald-400 font-semibold">No critical issues found</p>
              <p className="text-xs text-gray-500">Your trading metrics are healthy across all categories.</p>
            </div>
          ) : h.suggestions.map((s, i) => {
            const st = PRIORITY_STYLE[s.priority] ?? PRIORITY_STYLE.medium
            return (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{st.icon}</span>
                  <span className="text-sm font-semibold text-gray-200">{s.title}</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${st.badge}`}>{st.label}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed pl-6">{s.body}</p>
                {i < h.suggestions.length - 1 && <div className="border-t border-gray-800 mt-3" />}
              </div>
            )
          })}
        </div>

        {/* Strengths */}
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">Strengths</h3>
          {h.strengths.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">Work on the improvement areas first — strengths will emerge as metrics improve.</p>
          ) : (
            <div className="space-y-3">
              {h.strengths.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-emerald-400 mt-0.5 flex-none">✓</span>
                  <p className="text-sm text-gray-300 leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          )}

          {/* Key ratios */}
          <div className="border-t border-gray-800 pt-4 mt-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-3">Key Ratios at a Glance</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "R:R Ratio",     value: `${fmtAbs(h.rr)}:1`,               color: h.rr >= 1.5 ? "text-emerald-400" : h.rr >= 1 ? "text-amber-400" : "text-red-400" },
                { label: "Expectancy",    value: `$${fmtAbs(metrics.expectancy)}`,   color: (metrics.expectancy ?? 0) > 0 ? "text-emerald-400" : "text-red-400" },
                { label: "Avg Win",       value: `$${fmtAbs(Math.abs(metrics.avg_win ?? 0))}`,  color: "text-emerald-400" },
                { label: "Avg Loss",      value: `-$${fmtAbs(Math.abs(metrics.avg_loss ?? 0))}`, color: "text-red-400" },
                { label: "Best Trade",    value: `$${fmtAbs(Math.abs(metrics.best_trade ?? 0))}`,  color: "text-emerald-400" },
                { label: "Worst Trade",   value: `-$${fmtAbs(Math.abs(metrics.worst_trade ?? 0))}`, color: "text-red-400" },
                { label: "Max Drawdown",  value: `${fmtAbs(Math.abs(metrics.max_drawdown ?? 0), 1)}%`, color: Math.abs(metrics.max_drawdown ?? 0) <= 10 ? "text-emerald-400" : "text-red-400" },
                { label: "Win Streak",    value: `${insights?.streaks?.max_win_streak ?? "—"}W`,  color: "text-sky-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-gray-800/50 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className={`text-sm font-bold mt-0.5 ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      </>}
    </div>
  )
}
