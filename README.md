# TradeLedger

A self-hosted trading journal and analytics dashboard. Import your cTrader exports, analyse performance patterns, and get a professional-grade health score on your trading — all running on your own server with no third-party data sharing.

![Stack](https://img.shields.io/badge/stack-FastAPI%20%2B%20React%20%2B%20SQLite-f59e0b)
![Deploy](https://img.shields.io/badge/deploy-Docker%20Compose-2496ED)

---

## Features

| Page | What it shows |
|---|---|
| **Overview** | Net P&L hero, equity sparkline, KPI strip, cumulative chart, recent trades, win/loss breakdown, performance by day of week |
| **Equity Curve** | Filterable cumulative P&L, drawdown, and monthly bar charts |
| **Trade Log** | Searchable/filterable table with date range, symbol, direction, result |
| **Insights** | Trade duration (by direction), streaks, day-of-week, Long vs Short, win rate by 30-min time slot, result distribution |
| **Health Metrics** | Scored (0–100) and graded (A+ → F) across 5 categories with suggestions and strengths |
| **Upload** | Drag-and-drop Excel import, duplicate detection, per-import delete, full data reset |

**Filters** are available on Equity, Trades, Insights, and Health Metrics — all support date range, symbol, and direction.

---

## Tech Stack

```
frontend/   React 18 + Vite + Tailwind CSS 3 + Recharts
api/        FastAPI + SQLAlchemy + SQLite + pandas
deploy      Docker Compose (Nginx → FastAPI)
```

---

## Quick Start (Docker Compose)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Compose v2
- A free port (default: `8501`)

### 1. Clone

```bash
git clone https://github.com/YOUR_USERNAME/dashboard-trading-journal.git
cd dashboard-trading-journal
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and set your password:

```env
DASHBOARD_PASSWORD=your_secure_password_here
```

### 3. Create data directories

```bash
mkdir -p /srv/trading-dashboard/db /srv/trading-dashboard/data/uploads
```

> On Windows use WSL or change the volume paths in `docker-compose.yml` to a local path like `./data/db`.

### 4. Start

```bash
docker compose up -d --build
```

Open **http://localhost:8501** and log in with the password from your `.env`.

---

## Importing Trades

Go to **Upload** and drag in your Excel file. Two formats are supported:

### cTrader Export (auto-detected)

Export from cTrader → History → Export to Excel. The parser looks for these columns:

```
ID, Symbol, Opening direction, Opening time, Closing time,
Entry price, Closing price, Net $
```

Direction is normalised automatically (`Buy` → `Long`, `Sell` → `Short`). Duration in minutes is computed from open/close timestamps.

### Standard Template

Any Excel file with these column headers works:

```
trade_date, close_date, symbol, direction, entry_price, exit_price, net_pnl
```

Optional columns: `strategy`, `broker`, `account`, `asset_class`, `fees`, `gross_pnl`, `setup`, `notes`.

### Duplicate handling

- **Within a file**: rows that share the same `(trade_date, symbol, direction, entry_price, exit_price, net_pnl)` are deduplicated before insert.
- **Cross-file**: `trade_uid` (broker's trade ID for cTrader, or UUID for standard) is a `UNIQUE` constraint — re-importing the same file is blocked at the file-hash level.

---

## Managing Data

On the **Upload** page:

- **Remove** a specific import → deletes all trades from that batch and clears the file hash (so it can be re-imported)
- **Clear All Data** → wipes every trade and import record (requires confirmation)

---

## Health Score

The **Health Metrics** page grades your trading across five weighted categories:

| Category | Weight | What scores well |
|---|---|---|
| Profit Factor | 25 pts | ≥ 2.0 = 25, ≥ 1.5 = 19, ≥ 1.2 = 13 |
| Win Rate | 20 pts | ≥ 60% = 20, ≥ 52% = 16, ≥ 45% = 10 |
| Risk / Reward | 20 pts | Avg win / avg loss ≥ 2.0 = 20 |
| Drawdown Control | 20 pts | Max DD ≤ 5% = 20, ≤ 10% = 16 |
| Expectancy | 15 pts | > $100/trade = 15, > $30 = 12 |

Grade thresholds: **A+** ≥ 90 · **A** ≥ 80 · **B+** ≥ 70 · **B** ≥ 60 · **C+** ≥ 50 · **C** ≥ 40 · **D** ≥ 28 · **F** below.

Supports date-range filtering so you can grade any specific trading period.

---

## Configuration

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `DASHBOARD_PASSWORD` | `trading123` | Login password (HTTP Basic Auth) |

### Data persistence

Volumes in `docker-compose.yml`:

```yaml
volumes:
  - /srv/trading-dashboard/db:/srv/trading-dashboard/db       # SQLite database
  - /srv/trading-dashboard/data:/srv/trading-dashboard/data   # Uploaded files
```

Change these paths to wherever you want data stored on the host.

### Changing the port

Edit `docker-compose.yml`:

```yaml
ports:
  - "8501:80"   # change 8501 to any free port
```

---

## Development (Local, without Docker)

### API

```bash
cd api
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Override DB path for local dev
export DB_PATH=./trading.db    # or set in your shell
uvicorn main:app --reload --port 8000
```

> The DB and upload paths are hardcoded to `/srv/trading-dashboard/...` in `modules/database.py` and `modules/parser.py`. For local dev, either create those directories or edit the `DB_PATH` / `UPLOAD_DIR` constants at the top of each file.

### Frontend

```bash
cd frontend
npm install
npm run dev     # starts on http://localhost:5173
```

The Vite dev server proxies `/api` to `localhost:8000`. If you need to change the API URL, edit `frontend/src/api.js` — the `BASE` constant is `/api` which works for both dev proxy and production Nginx.

---

## Project Structure

```
.
├── api/
│   ├── Dockerfile
│   ├── main.py              # FastAPI routes
│   ├── requirements.txt
│   └── modules/
│       ├── database.py      # SQLite schema, queries, migrations
│       ├── metrics.py       # pandas analytics (PnL, equity curve, etc.)
│       └── parser.py        # Excel parsing (cTrader + standard formats)
│
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf           # Nginx reverse-proxy config
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx          # Router + auth gate
│       ├── api.js           # Axios client + credential helpers
│       ├── index.css        # Tailwind + component classes
│       ├── main.jsx
│       ├── components/
│       │   ├── Sidebar.jsx
│       │   └── PageHeader.jsx
│       └── pages/
│           ├── Overview.jsx
│           ├── Equity.jsx
│           ├── Trades.jsx
│           ├── Insights.jsx
│           ├── HealthMetrics.jsx
│           ├── Upload.jsx
│           └── Login.jsx
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API Reference

All endpoints require HTTP Basic Auth (`username: trader`, `password: <DASHBOARD_PASSWORD>`).

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/login` | Validate credentials |
| `GET` | `/api/metrics` | Aggregate P&L metrics (filterable) |
| `GET` | `/api/equity-curve` | Cumulative P&L + drawdown series |
| `GET` | `/api/monthly-pnl` | Monthly aggregated P&L |
| `GET` | `/api/trades` | Paginated trade list (filterable) |
| `GET` | `/api/insights` | Analytics: duration, streaks, day-of-week, time slots |
| `GET` | `/api/strategy-stats` | Per-strategy breakdown |
| `GET` | `/api/symbol-stats` | Per-symbol breakdown |
| `GET` | `/api/filters/options` | Distinct symbols, strategies, accounts, brokers |
| `GET` | `/api/import-history` | All import records |
| `POST` | `/api/upload` | Parse file, return preview (no DB write) |
| `POST` | `/api/upload/confirm` | Confirm import, write to DB |
| `DELETE` | `/api/import/{id}` | Delete trades from one import |
| `DELETE` | `/api/data/all` | Wipe all trades and import history |
| `GET` | `/health` | Health check |

**Common filter params** (supported on metrics, equity-curve, monthly-pnl, trades, insights):
`date_from`, `date_to`, `symbol`, `strategy`, `account`, `broker`, `direction`, `result`

---

## License

MIT
