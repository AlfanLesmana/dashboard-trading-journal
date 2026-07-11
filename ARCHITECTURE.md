# Trading Dashboard — Architecture & Design

**System overview, data flow, API endpoints, and component breakdown.**

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         BROWSER                             │
│  React (Vite) - Trading Dashboard Frontend                 │
│  ├─ Pages: Overview, Equity, Trades, Insights, Health      │
│  ├─ Pages: Econ Calendar (Economic events + volatility)    │
│  └─ Pages: Upload (trade import)                            │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/JSON
                         │ (via Nginx reverse proxy)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    NGINX REVERSE PROXY                      │
│  ├─ / → frontend:3000 (static assets)                      │
│  └─ /api/* → api_backend:8000 (FastAPI)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
    ┌─────────┐    ┌──────────┐    ┌──────────────┐
    │Frontend │    │ FastAPI  │    │  SQLite DB   │
    │Container│    │ Container│◄──►│ (trades.db)  │
    │(Node)   │    │(Python)  │    │              │
    └─────────┘    └──────────┘    └──────────────┘
                        │
                        ├─► Forex Factory API
                        │   (Economic calendar)
                        │
                        ├─► Yahoo Finance (yfinance)
                        │   (Historical OHLC, volatility)
                        │
                        └─► Internal Modules
                            ├─ Trade metrics
                            ├─ Equity curve
                            ├─ PnL analysis
                            └─ Health checks
```

---

## Frontend Architecture

### Tech Stack
- **Framework**: React 18 + Vite
- **Styling**: Tailwind CSS 3
- **Charts**: Recharts
- **HTTP Client**: Axios
- **State Management**: React hooks (useState, useEffect)
- **Build Output**: Static HTML/JS/CSS (served by Nginx)

### Directory Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── Login.jsx                   # Auth page
│   │   ├── Overview.jsx                # Dashboard summary
│   │   ├── Equity.jsx                  # Equity curve chart
│   │   ├── Trades.jsx                  # Trade log + edit
│   │   ├── Insights.jsx                # Stats + risk metrics
│   │   ├── HealthMetrics.jsx           # Trading discipline metrics
│   │   ├── EconCalendar.jsx            # ⭐ NEW: Economic events + forecast + volatility
│   │   └── Upload.jsx                  # CSV import
│   ├── components/
│   │   └── Sidebar.jsx                 # Navigation menu
│   ├── api.js                          # API client (axios wrapper)
│   ├── App.jsx                         # Router + layout
│   ├── index.css                       # Global + Tailwind
│   └── main.jsx                        # Entry point
├── dist/                               # Built static files (created by `npm run build`)
├── package.json
├── vite.config.js
├── tailwind.config.js
└── index.html
```

### API Client (`api.js`)

Centralized HTTP client with Basic Auth:

```javascript
const api = {
  login: (password) => axios.post("/api/login", {}, { headers: auth() }),
  metrics: (filters) => get("/metrics", filters),
  equityCurve: (filters) => get("/equity-curve", filters),
  trades: (filters) => get("/trades", filters),
  updateTrade: (id, data) => axios.patch(`/api/trades/${id}`, data, { headers: auth() }),
  insights: (filters) => get("/insights", filters),
  econEvents: (impact) => get("/econ/events", impact ? { impact } : {}),
  econVolatility: (symbol) => get("/econ/volatility", { symbol }),
  // ... more
}
```

### Caching Strategy (Frontend)

**localStorage** (browser storage) with manual refresh:

| Feature | Cache Key | TTL | Refresh Strategy |
|---|---|---|---|
| Economic Events | `econ_events_cache` | 4h (ignored on load) | Manual ↻ button |
| Volatility Data | `econ_vol_cache_*` | 24h (ignored on load) | Manual ↻ button |
| Trades, Metrics | None | — | Always fetch fresh |

**Why this design:**
- Forex Factory rate limits to 2 req/5 min → must cache
- User may trade only certain hours (e.g. 8:30 AM–4:00 PM ET) → cache is safe during off-hours
- Manual refresh prevents accidental rate limit hits
- localStorage survives browser close/reload

---

## Backend Architecture

### Tech Stack
- **Framework**: FastAPI (async Python)
- **Server**: Uvicorn (ASGI)
- **Database**: SQLite (single-file, no setup needed)
- **ORM**: SQLAlchemy
- **Auth**: HTTP Basic Auth (username:password in Base64)
- **Data Processing**: Pandas

### Directory Structure

```
api/
├── main.py                             # FastAPI app + route handlers
├── modules/
│   ├── econ.py                         # ⭐ Economic calendar (FF + yfinance)
│   ├── trades.py                       # Trade CRUD + validation
│   ├── metrics.py                      # PnL, equity curve, stats
│   ├── insights.py                     # Advanced analytics
│   └── health.py                       # Trading discipline metrics
├── requirements.txt                    # Python dependencies
├── data/
│   └── trades.db                       # SQLite database
└── venv/                               # Python virtual environment
```

### Core API Endpoints

#### Authentication
```
POST /api/login
  Input: Basic Auth header (username:password)
  Output: { "message": "Login successful" } or 401 error
```

#### Trades
```
GET /api/trades?symbol=BTC&status=closed
  Input: Query filters (symbol, status, date range)
  Output: List of trades with PnL, entry/exit, duration

GET /api/trades/{id}
  Output: Single trade details

PATCH /api/trades/{id}
  Input: { "notes": "...", "status": "..." }
  Output: Updated trade

DELETE /api/import/{import_id}
  Output: { "deleted": true }

POST /api/upload
  Input: Multipart form — CSV file
  Output: { "status": "parsed", "trades": [...] }

POST /api/upload/confirm
  Input: Multipart form — CSV file (finalized)
  Output: { "imported": N, "skipped": M }
```

#### Metrics & Analytics
```
GET /api/metrics?symbol=BTC&date_from=2025-01-01
  Output: Win rate, profit factor, avg win/loss, max drawdown, Sharpe ratio, etc.

GET /api/equity-curve?symbol=BTC
  Output: Daily cumulative PnL time series

GET /api/monthly-pnl
  Output: PnL aggregated by month

GET /api/insights
  Output: Advanced stats + risk metrics (avg R:R, expectancy, recovery factor, streaks)

GET /api/strategy-stats
  Output: Per-strategy breakdowns

GET /api/symbol-stats
  Output: Per-symbol performance
```

#### Economic Calendar & Volatility ⭐
```
GET /api/econ/events?impact=High,Medium
  Output: List of upcoming/past economic events
  Fields: title, country, impact, forecast, previous, actual, datetime_utc, timestamp
  Cached: 4 hours (backend in-memory)

GET /api/econ/volatility?symbol=NQ=F
  Output: Historical ATR stats + per-event-type breakdown
  Fields: avg_normal_atr, avg_event_atr, event_vs_normal_pct, per_type[]
  Cached: 24 hours (backend in-memory)
  Data source: 2 years of daily OHLC from Yahoo Finance
```

#### Upload & Configuration
```
GET /api/import-history
  Output: List of past CSV imports with timestamps

GET /api/filters/options
  Output: Distinct symbols, statuses, tags for dropdown filters

DELETE /api/data/all
  Output: { "deleted": true } (dangerous — wipes all trades)
```

### Authentication Model

HTTP Basic Auth:
- Username: `trader` (hardcoded)
- Password: user-defined, stored in browser localStorage
- Each request includes `Authorization: Basic base64(trader:password)` header
- Backend validates: if mismatch → 401 Unauthorized

```python
# In FastAPI
from fastapi import Depends, HTTPException, status

async def verify(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing auth")
    # Decode and verify...
```

---

## Database Schema

### SQLite Structure

```sql
-- Trades table
CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  entry_time TIMESTAMP,
  exit_time TIMESTAMP,
  symbol TEXT,
  side TEXT,           -- "long" or "short"
  entry_price REAL,
  exit_price REAL,
  qty REAL,
  pnl REAL,
  pnl_pct REAL,
  duration_minutes INT,
  status TEXT,         -- "open" or "closed"
  tags TEXT,           -- comma-separated or JSON
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

No migrations needed — schema auto-created on first run. For updates, manually modify schema via SQLAlchemy models in `modules/trades.py`.

---

## Economic Calendar Data Flow

### Architecture

```
┌──────────────────────────┐
│  Forex Factory API       │
│  (ff_calendar_thisweek   │
│   + ff_calendar_nextweek)│
└──────────────┬───────────┘
               │ JSON (2 req/5 min limit)
               ▼
┌──────────────────────────────────────┐
│ Backend Cache                        │
│ (4-hour in-memory TTL)              │
│ _events_cache = {data, ts}          │
└──────────┬───────────────────────────┘
           │ Parsed + sorted by timestamp
           ▼
┌──────────────────────────────────────┐
│ API Response                         │
│ /api/econ/events                    │
│ {                                    │
│   "events": [...],                   │
│   "from_cache": true/false,          │
│   "rate_limited": false,             │
│   "cached_at": <unix_ts>             │
│ }                                    │
└──────────┬───────────────────────────┘
           │ JSON
           ▼
┌──────────────────────────────────────┐
│ Frontend (React)                     │
│ localStorage: econ_events_cache      │
│ (manual refresh only)                │
│                                      │
│ Display:                             │
│ ├─ Upcoming events list              │
│ ├─ USD Outlook verdicts              │
│ ├─ Past events (if released)         │
│ └─ Beat/Miss badges                  │
└──────────────────────────────────────┘
```

### Event Data Structure

```python
{
  "id": "event_123",
  "title": "Non-Farm Payrolls",
  "country": "USD",                   # Currency code (major only)
  "impact": "High",                   # "High", "Medium", or "Low"
  "forecast": "200K",                 # Economist consensus
  "previous": "185K",                 # Last period's actual
  "actual": "",                       # Empty until event releases
  "datetime_utc": "2025-05-09T12:30:00+00:00",  # ISO 8601
  "timestamp": 1715338200,            # Unix timestamp (seconds)
}
```

### Volatility Data Structure

```python
{
  "symbol": "NQ=F",
  "avg_normal_atr": 156.2,           # Average daily range (quiet days)
  "avg_event_atr": 210.5,            # Average range on high-impact days
  "event_vs_normal_pct": 34.8,       # Percentage premium
  "per_type": [                       # Breakdown by event name
    {
      "event": "Non-Farm Payrolls",
      "occurrences": 24,              # # of events in 2-year window
      "avg_atr": 245.3,
      "max_atr": 512.8,
      "vs_normal_pct": 57.1
    },
    ...
  ],
  "cached_at": 1715338200,
  "cache_ttl": 86400,
  "from_cache": true
}
```

### Rate Limit Handling

```python
# In econ.py
for url in FF_URLS:
    r = requests.get(url, headers=HEADERS, timeout=10)
    if r.status_code == 429:         # Too Many Requests
        rate_limited = True
        continue  # Skip this request, use cache
    # ...

if rate_limited:
    if _events_cache["data"] is not None:  # Stale cache available
        return {
            "events": filtered,
            "from_cache": True,
            "rate_limited": True        # ⚠️ UI warning banner
        }
    else:                              # No cache, return empty
        return {"events": [], "rate_limited": True}
```

**Frontend shows warning:**
> ⚠️ Forex Factory rate limited — Serving cached data. FF allows 2 requests per 5 min. Avoid manual refresh for now.

---

## Deployment Options

### Option 1: Docker Compose (Recommended)

```yaml
# docker-compose.yml
services:
  trading-api:
    build:
      context: .
      dockerfile: Dockerfile.api
    container_name: trading-api
    expose: ["8000"]
    volumes:
      - ./api/data:/app/data   # Persist SQLite
    environment:
      - PYTHONUNBUFFERED=1
      - DATABASE_URL=sqlite:///data/trades.db
    restart: always

  trading-frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    container_name: trading-frontend
    expose: ["3000"]
    restart: always

  nginx:
    image: nginx:latest
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - trading-api
      - trading-frontend
    restart: always
```

**Pros:**
- Isolated containers, easy scaling
- Reproducible across VPS providers
- Automatic restart on failure

**Cons:**
- Requires Docker & Docker Compose
- Slightly higher resource usage

### Option 2: Bare Metal (No Docker)

Backend:
```bash
cd /srv/trading-dashboard-v2/api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 &
```

Frontend:
```bash
cd /srv/trading-dashboard-v2/frontend
npm run build
# Serve dist/ with Nginx or simple HTTP server
```

**Pros:**
- Lower resource overhead
- Simpler debugging (logs to stdout)

**Cons:**
- Manual dependency management
- Harder to reproduce on new VPS

---

## Security Notes

### Authentication
- Basic Auth only — use HTTPS in production
- Password stored in browser localStorage (clear on logout)
- No refresh tokens or JWT — simple but stateless

### Database
- No encryption at rest
- SQL injection risk mitigated by SQLAlchemy ORM
- Consider backups for data durability

### API Rate Limits
- No built-in rate limiting on our endpoints
- Forex Factory rate limits us (2 req/5 min)
- Add `slowapi` package if needed

### Secrets
- `.env` file contains sensitive variables — add to `.gitignore`
- Never commit `.env` to GitHub
- Rotate `SECRET_KEY` in production

---

## Performance Considerations

### Caching Layers

| Layer | TTL | Strategy | Why |
|---|---|---|---|
| Frontend localStorage | 4h / 24h | Ignored on load | Manual refresh only |
| Backend in-memory | 4h / 24h | Auto-expire | Reduce API calls |
| Browser HTTP cache | — | ETag/Last-Modified | Static assets |

### Database Optimization

- SQLite is single-file, no server overhead
- Index on `symbol`, `entry_time`, `status` for fast queries
- For 1000+ trades, consider PostgreSQL

### API Response Sizes

- `/api/trades` returns paginated, filters by default (not all trades)
- `/api/econ/events` returns ~100 events, compressed JSON
- `/api/econ/volatility` returns flat JSON, no nested arrays

---

## Monitoring & Logging

### Docker Logs
```bash
docker compose logs -f                # All services
docker compose logs -f trading-api    # Backend only
```

### Backend Errors
- 401: Authentication failed (check password)
- 404: Endpoint not found
- 500: Server error (check logs)

### Frontend Errors
- Open browser DevTools (F12)
- Network tab → inspect failed requests
- Console tab → JavaScript errors

### Health Checks
```bash
# Backend
curl http://localhost:8000/docs     # Swagger UI

# Database
sqlite3 api/data/trades.db ".tables"

# Frontend
curl http://localhost:80             # Should return HTML
```

---

**For deployment workflow, see [DEPLOYMENT.md](./DEPLOYMENT.md)**
