import requests
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import time

FF_URLS = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",   # includes past days of current week
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",   # next 7 days
]
# Note: ff_calendar_lastweek.json does not exist (404). Past events from this week
# still appear in thisweek JSON with actual values filled in.

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.forexfactory.com/",
}

# Cache events for 4 hours — FF limit is 2 req/5 min IP-wide, data is weekly
_events_cache = {"data": None, "ts": 0}
_CACHE_TTL = 4 * 3600  # 4 hours

MAJOR_CURRENCIES = {"USD", "EUR", "GBP", "JPY", "CAD", "AUD", "NZD", "CHF", "CNY", "CNH"}

def _apply_filter(events, impact_filter, country_filter=None):
    result = []
    for e in events:
        country = e.get("country", "").upper()
        # Default: show all major currencies
        allowed = country_filter if country_filter else MAJOR_CURRENCIES
        if country not in allowed:
            continue
        if impact_filter:
            if e.get("impact", "").lower() not in [i.lower() for i in impact_filter]:
                continue
        result.append(e)
    return result

def fetch_events(impact_filter=None):
    now = time.time()
    cache_hit = _events_cache["data"] is not None and now - _events_cache["ts"] < _CACHE_TTL
    if cache_hit:
        events = _events_cache["data"]
    else:
        events = []
        rate_limited = False
        for url in FF_URLS:
            try:
                r = requests.get(url, headers=HEADERS, timeout=10)
                if r.status_code == 429:
                    rate_limited = True
                    continue
                r.raise_for_status()
                events.extend(r.json())
            except Exception:
                pass
        # If rate limited and we have stale cache, serve it rather than empty
        if rate_limited and _events_cache["data"] is not None:
            return {
                "events": _apply_filter(_events_cache["data"], impact_filter),
                "cached_at": int(_events_cache["ts"]),
                "cache_ttl": _CACHE_TTL,
                "from_cache": True,
                "rate_limited": True,
            }
        # Parse all events and store parsed form in cache
        parsed = []
        for e in events:
            raw_dt = e.get("date", "")
            dt_utc = None
            if raw_dt:
                try:
                    dt = datetime.fromisoformat(raw_dt)
                    dt_utc = dt.astimezone(timezone.utc)
                except Exception:
                    pass
            parsed.append({
                "id": e.get("id", ""),
                "title": e.get("title", ""),
                "country": e.get("country", "").upper(),
                "impact": e.get("impact", ""),
                "forecast": e.get("forecast", ""),
                "previous": e.get("previous", ""),
                "actual": e.get("actual", ""),
                "datetime_utc": dt_utc.isoformat() if dt_utc else None,
                "timestamp": int(dt_utc.timestamp()) if dt_utc else None,
            })
        parsed.sort(key=lambda x: x["timestamp"] or 0)
        _events_cache["data"] = parsed
        _events_cache["ts"] = now

    # Filter from parsed cache
    filtered = _apply_filter(_events_cache["data"], impact_filter)
    return {
        "events": filtered,
        "cached_at": int(_events_cache["ts"]),
        "cache_ttl": _CACHE_TTL,
        "from_cache": cache_hit,
        "rate_limited": False,
    }


# Historical volatility per event type using yfinance
# Cache for 24 hours — yfinance is burst-sensitive, OHLC data doesn't change intraday
_vol_cache = {}
_VOL_TTL = 24 * 3600  # 24 hours

def event_volatility(symbol="NQ=F"):
    now = time.time()
    cache_hit = symbol in _vol_cache and now - _vol_cache[symbol]["ts"] < _VOL_TTL
    if cache_hit:
        data = _vol_cache[symbol]["data"]
        return {**data, "cached_at": int(_vol_cache[symbol]["ts"]), "cache_ttl": _VOL_TTL, "from_cache": True}

    try:
        # Get 2 years of daily OHLC
        ticker = yf.Ticker(symbol)
        df = ticker.history(period="2y", interval="1d")
        if df.empty:
            return []

        df = df.reset_index()
        df["Date"] = pd.to_datetime(df["Date"]).dt.date
        df["atr"] = df["High"] - df["Low"]
        df["date_str"] = df["Date"].astype(str)

        # Fetch historical events for the same period
        ev_resp = fetch_events(impact_filter=["High"])
        event_dates = {}
        for e in ev_resp["events"]:
            if e["timestamp"]:
                d = datetime.fromtimestamp(e["timestamp"], tz=timezone.utc).date().isoformat()
                title = e["title"]
                if d not in event_dates:
                    event_dates[d] = []
                event_dates[d].append(title)

        # Tag each trading day
        df["events"] = df["date_str"].map(lambda d: event_dates.get(d, []))
        df["is_event_day"] = df["events"].map(lambda x: len(x) > 0)

        # Avg ATR on event days vs normal days
        avg_normal = float(df[~df["is_event_day"]]["atr"].mean())
        avg_event  = float(df[df["is_event_day"]]["atr"].mean()) if df["is_event_day"].any() else avg_normal

        # Per-event-type stats
        all_titles = set()
        for titles in event_dates.values():
            all_titles.update(titles)

        per_type = []
        for title in sorted(all_titles):
            event_day_strs = [d for d, titles in event_dates.items() if title in titles]
            mask = df["date_str"].isin(event_day_strs)
            sub = df[mask]
            if len(sub) < 1:
                continue
            per_type.append({
                "event": title,
                "occurrences": int(len(sub)),
                "avg_atr": round(float(sub["atr"].mean()), 2),
                "max_atr": round(float(sub["atr"].max()), 2),
                "vs_normal_pct": round((float(sub["atr"].mean()) / avg_normal - 1) * 100, 1) if avg_normal else 0,
            })

        per_type.sort(key=lambda x: x["avg_atr"], reverse=True)

        result = {
            "symbol": symbol,
            "avg_normal_atr": round(avg_normal, 2),
            "avg_event_atr":  round(avg_event, 2),
            "event_vs_normal_pct": round((avg_event / avg_normal - 1) * 100, 1) if avg_normal else 0,
            "per_type": per_type,
        }

        _vol_cache[symbol] = {"data": result, "ts": now}
        return {**result, "cached_at": int(now), "cache_ttl": _VOL_TTL, "from_cache": False}

    except Exception as ex:
        return {"error": str(ex)}
