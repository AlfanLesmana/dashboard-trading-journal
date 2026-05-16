import requests
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import time

FF_URLS = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.forexfactory.com/",
}

# Cache events for 15 minutes
_events_cache = {"data": None, "ts": 0}
_CACHE_TTL = 900

def fetch_events(impact_filter=None):
    now = time.time()
    if _events_cache["data"] is not None and now - _events_cache["ts"] < _CACHE_TTL:
        events = _events_cache["data"]
    else:
        events = []
        for url in FF_URLS:
            try:
                r = requests.get(url, headers=HEADERS, timeout=10)
                r.raise_for_status()
                events.extend(r.json())
            except Exception:
                pass
        _events_cache["data"] = events
        _events_cache["ts"] = now

    # Filter to USD events only + parse datetime
    result = []
    for e in events:
        if e.get("country", "").upper() != "USD":
            continue
        impact = e.get("impact", "").lower()
        if impact_filter and impact not in [i.lower() for i in impact_filter]:
            continue

        # Parse datetime — FF format: "01-13-2025T14:30:00-0500"
        raw_dt = e.get("date", "")
        try:
            # Try with timezone offset
            dt = datetime.strptime(raw_dt, "%m-%d-%YT%H:%M:%S%z")
            dt_utc = dt.astimezone(timezone.utc)
        except Exception:
            try:
                dt = datetime.strptime(raw_dt[:19], "%m-%d-%YT%H:%M:%S")
                # FF times are US Eastern — approximate as UTC-5
                dt_utc = dt.replace(tzinfo=timezone.utc) + timedelta(hours=5)
            except Exception:
                dt_utc = None

        result.append({
            "id": e.get("id", ""),
            "title": e.get("title", ""),
            "country": e.get("country", ""),
            "impact": e.get("impact", ""),
            "forecast": e.get("forecast", ""),
            "previous": e.get("previous", ""),
            "actual": e.get("actual", ""),
            "datetime_utc": dt_utc.isoformat() if dt_utc else None,
            "timestamp": int(dt_utc.timestamp()) if dt_utc else None,
        })

    result.sort(key=lambda x: x["timestamp"] or 0)
    return result


# Historical volatility per event type using yfinance
# Cache per symbol for 1 hour
_vol_cache = {}
_VOL_TTL = 3600

def event_volatility(symbol="NQ=F"):
    now = time.time()
    if symbol in _vol_cache and now - _vol_cache[symbol]["ts"] < _VOL_TTL:
        return _vol_cache[symbol]["data"]

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
        events = fetch_events(impact_filter=["High"])
        event_dates = {}
        for e in events:
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
            if len(sub) < 2:
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
        return result

    except Exception as ex:
        return {"error": str(ex)}
