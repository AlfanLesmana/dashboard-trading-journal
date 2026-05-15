import { useMemo } from "react"

const fmt = (n, dec = 2) =>
  n == null ? "—" : (n >= 0 ? "+" : "") + Number(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec })

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DAYS   = ["Mon", "Tue", "Wed", "Thu", "Fri"]

function cellColor(pnl, maxAbs) {
  if (pnl == null) return "#1f2937"
  if (pnl === 0)   return "#111827"
  const intensity = Math.min(1, Math.abs(pnl) / (maxAbs * 0.6))
  if (pnl > 0) {
    const g = Math.round(100 + intensity * 110)
    return `rgb(16, ${g}, 81)`
  } else {
    const r = Math.round(100 + intensity * 139)
    return `rgb(${r}, 17, 17)`
  }
}

export default function CalendarHeatmap({ data }) {
  const { weeks, monthLabels, maxAbs } = useMemo(() => {
    if (!data || data.length === 0) return { weeks: [], monthLabels: [], maxAbs: 1 }

    // Build a map of date → day data
    const byDate = {}
    let maxAbs = 1
    data.forEach(d => {
      byDate[d.trade_date] = d
      if (Math.abs(d.net_pnl) > maxAbs) maxAbs = Math.abs(d.net_pnl)
    })

    // Determine range: last 52 weeks
    const today = new Date()
    // Start from the Monday 52 weeks ago
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - 364)
    // Move to nearest Monday
    const dayOfWeek = startDate.getDay()
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    startDate.setDate(startDate.getDate() + diffToMon)

    // Build weeks array — each week is [Mon..Fri] (skip Sat/Sun)
    const weeks = []
    const monthLabels = [] // { col, label }
    let cur = new Date(startDate)
    let lastMonth = -1

    while (cur <= today) {
      const week = []
      const weekStart = new Date(cur)

      for (let d = 0; d < 7; d++) {
        const dow = cur.getDay() // 0=Sun
        const iso = cur.toISOString().slice(0, 10)
        if (dow >= 1 && dow <= 5) { // Mon-Fri only
          week.push({ date: iso, ...byDate[iso] })
        }
        // Check month boundary (use Monday of week)
        if (d === 0 && cur.getMonth() !== lastMonth) {
          monthLabels.push({ col: weeks.length, label: MONTHS[cur.getMonth()] })
          lastMonth = cur.getMonth()
        }
        cur.setDate(cur.getDate() + 1)
      }
      if (week.length > 0) weeks.push(week)
    }

    return { weeks, monthLabels, maxAbs }
  }, [data])

  const [tooltip, setTooltip] = useMemo(() => {
    let _tip = null
    return [
      _tip,
      (v) => { _tip = v }
    ]
  }, [])

  if (!data || data.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-8">No data</p>
  }

  const CELL = 14
  const GAP  = 2
  const COL_W = CELL + GAP

  return (
    <div className="w-full overflow-x-auto">
      <div style={{ minWidth: weeks.length * COL_W + 32 }}>
        {/* Month labels */}
        <div className="flex mb-1 ml-8">
          {monthLabels.map((m, i) => (
            <div key={i} className="text-[10px] text-gray-500 absolute"
              style={{ marginLeft: m.col * COL_W }}>
              {m.label}
            </div>
          ))}
          <div style={{ height: 14 }} />
        </div>

        <div className="flex gap-0" style={{ gap: GAP }}>
          {/* Day labels */}
          <div className="flex flex-col justify-between mr-1" style={{ gap: GAP, paddingTop: 2 }}>
            {DAYS.map(d => (
              <div key={d} className="text-[9px] text-gray-600 leading-none" style={{ height: CELL, lineHeight: CELL + "px" }}>
                {d[0]}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
              {week.map((day, di) => {
                const hasTrade = day?.trades > 0
                const color = day?.net_pnl != null ? cellColor(day.net_pnl, maxAbs) : "#111827"
                return (
                  <div key={di} className="group relative"
                    style={{ width: CELL, height: CELL, borderRadius: 2, background: color, cursor: hasTrade ? "pointer" : "default" }}>
                    {/* Tooltip */}
                    {hasTrade && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none
                        opacity-0 group-hover:opacity-100 transition-opacity duration-100
                        bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-2 text-xs whitespace-nowrap shadow-xl">
                        <p className="text-gray-300 font-semibold mb-0.5">{day.date}</p>
                        <p className={`font-bold ${day.net_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {fmt(day.net_pnl)}
                        </p>
                        <p className="text-gray-500">{day.trades} trade{day.trades !== 1 ? "s" : ""} · {day.wins}W</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 ml-8">
          <span className="text-[10px] text-gray-600">Less</span>
          {[-1, -0.5, 0, 0.5, 1].map((v, i) => (
            <div key={i} style={{ width: CELL, height: CELL, borderRadius: 2, background: v === 0 ? "#111827" : cellColor(v, 1) }} />
          ))}
          <span className="text-[10px] text-gray-600">More</span>
          <span className="text-[10px] text-gray-600 ml-3">● No trade</span>
        </div>
      </div>
    </div>
  )
}
