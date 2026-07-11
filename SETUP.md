# Trading Dashboard — Complete Setup Guide

**Deploy the entire system from scratch on a new VPS.**

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [VPS Initial Setup](#vps-initial-setup)
3. [Project Structure](#project-structure)
4. [Backend Setup](#backend-setup)
5. [Frontend Setup](#frontend-setup)
6. [Docker & Compose](#docker--compose)
7. [Nginx Reverse Proxy](#nginx-reverse-proxy)
8. [Environment Variables](#environment-variables)
9. [Deployment Checklist](#deployment-checklist)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### On Your Local Machine
- Git installed (`git --version`)
- SSH key pair for VPS authentication (generate with `ssh-keygen -t ed25519`)
- Code editor or IDE (VS Code, etc.)

### VPS Requirements
- **OS**: Ubuntu 22.04 LTS or similar (Debian-based)
- **RAM**: Minimum 2GB (4GB recommended)
- **Disk**: Minimum 20GB free
- **CPU**: 1+ cores
- **Root or sudo access**
- **Open ports**: 22 (SSH), 80 (HTTP), 443 (HTTPS), 8501 (optional direct API access)

### Third-party Accounts
- GitHub account (to clone repo)
- Forex Factory API access (free at forexfactory.com, rate limited 2 req/5min)

---

## VPS Initial Setup

### 1. Connect to VPS

```bash
ssh root@<your-vps-ip> -p 22
# Or with custom SSH port:
ssh -p 2222 root@<your-vps-ip>
```

### 2. Update System

```bash
apt-get update
apt-get upgrade -y
```

### 3. Install Core Dependencies

```bash
apt-get install -y \
  curl \
  wget \
  git \
  build-essential \
  python3 \
  python3-pip \
  python3-venv \
  nodejs \
  npm \
  sqlite3 \
  nginx \
  docker.io \
  docker-compose
```

### 4. Verify Installations

```bash
python3 --version      # Python 3.10+
node --version         # Node 18+
npm --version          # npm 9+
docker --version       # Docker 20+
docker-compose --version
git --version
```

### 5. Create Project Directory

```bash
mkdir -p /srv/trading-dashboard-v2
cd /srv/trading-dashboard-v2
```

### 6. Clone Repository

```bash
git clone https://github.com/YOUR-USERNAME/dashboard-trading-journal.git .
# If SSH key is configured:
git clone git@github.com:YOUR-USERNAME/dashboard-trading-journal.git .
```

---

## Project Structure

After cloning, your `/srv/trading-dashboard-v2` directory should look like:

```
trading-dashboard-v2/
├── api/
│   ├── main.py                 # FastAPI application
│   ├── modules/
│   │   ├── econ.py            # Economic calendar module
│   │   ├── trades.py
│   │   ├── metrics.py
│   │   └── ...
│   ├── requirements.txt         # Python dependencies
│   └── data/
│       └── trades.db           # SQLite database (created on first run)
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── api.js              # API client
│   │   ├── App.jsx
│   │   └── ...
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
├── docker-compose.yml          # Docker Compose configuration
├── Dockerfile.api              # Backend image definition
├── Dockerfile.frontend         # Frontend image definition
├── nginx/
│   ├── nginx.conf              # Nginx config
│   └── ssl/                    # SSL certificates (if HTTPS)
├── .env.example                # Environment variables template
├── SETUP.md                    # This file
├── ARCHITECTURE.md             # System architecture docs
└── DEPLOYMENT.md               # Deployment workflow
```

---

## Backend Setup

### 1. Install Python Dependencies

```bash
cd /srv/trading-dashboard-v2/api
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

**Expected packages** (from `requirements.txt`):
- FastAPI
- uvicorn
- sqlalchemy
- python-multipart
- pydantic
- yfinance
- requests
- pandas

### 2. Initialize Database

```bash
cd /srv/trading-dashboard-v2/api
python3 -c "from main import app; print('Database initialized')"
```

Check if `data/trades.db` was created:
```bash
ls -lh data/trades.db
```

### 3. Test Backend Locally

```bash
cd /srv/trading-dashboard-v2/api
source venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Visit `http://localhost:8000/docs` in your browser — you should see FastAPI Swagger UI.

Stop with `Ctrl+C`.

---

## Frontend Setup

### 1. Install Node Dependencies

```bash
cd /srv/trading-dashboard-v2/frontend
npm install
```

### 2. Build for Production

```bash
npm run build
```

This creates a `dist/` folder with optimized static files.

### 3. Test Locally (Optional)

```bash
npm run dev
```

Visit `http://localhost:5173` in your browser.

Stop with `Ctrl+C`.

---

## Docker & Compose

### 1. Build Images

```bash
cd /srv/trading-dashboard-v2
docker compose build
```

This builds:
- `trading-dashboard-v2-api:latest` (backend)
- `trading-dashboard-v2-frontend:latest` (frontend)

### 2. Start Services

```bash
docker compose up -d
```

Check running containers:
```bash
docker ps
```

Expected output:
```
CONTAINER ID   IMAGE                          NAMES
abc123...      trading-dashboard-v2-api       trading-api
def456...      trading-dashboard-v2-frontend  trading-frontend
```

### 3. View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f trading-api
docker compose logs -f trading-frontend
```

### 4. Stop Services

```bash
docker compose down
```

### 5. Rebuild and Restart

```bash
docker compose down
docker compose build
docker compose up -d
```

---

## Nginx Reverse Proxy

### 1. Create Nginx Config

Create `/etc/nginx/sites-available/trading-dashboard`:

```nginx
upstream api_backend {
    server trading-api:8000;
}

server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    # Static frontend
    location / {
        proxy_pass http://trading-frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API reverse proxy
    location /api/ {
        proxy_pass http://api_backend/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 2. Enable Site

```bash
ln -s /etc/nginx/sites-available/trading-dashboard /etc/nginx/sites-enabled/
```

### 3. Test Nginx Config

```bash
nginx -t
```

Expected: `nginx: configuration file test is successful`

### 4. Restart Nginx

```bash
systemctl restart nginx
```

### 5. Verify

Visit `http://<your-vps-ip>` — you should see the Trading Dashboard login page.

---

## Environment Variables

### 1. Create `.env` File

```bash
cp .env.example .env
nano .env
```

### 2. Set Variables

```env
# Backend
PYTHONUNBUFFERED=1
DATABASE_URL=sqlite:///data/trades.db
SECRET_KEY=your-secret-key-here-change-this
DEBUG=false

# Frontend (built into static files, no env at runtime)
VITE_API_BASE=/api

# Rate limiting / caching
FOREX_FACTORY_CACHE_TTL=14400  # 4 hours in seconds
YFINANCE_CACHE_TTL=86400       # 24 hours in seconds

# Optional: Analytics, monitoring
LOG_LEVEL=INFO
```

### 3. Load in Docker Compose

In `docker-compose.yml`:

```yaml
services:
  trading-api:
    env_file:
      - .env
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] VPS OS is Ubuntu 22.04+ LTS
- [ ] All dependencies installed (`python3`, `node`, `docker`, `nginx`)
- [ ] Project cloned to `/srv/trading-dashboard-v2`
- [ ] `.env` file created with all required variables
- [ ] Database initialized (`trades.db` exists)

### Deployment

- [ ] Backend requirements installed: `pip install -r api/requirements.txt`
- [ ] Frontend built: `npm run build` (creates `frontend/dist/`)
- [ ] Docker images built: `docker compose build`
- [ ] Containers started: `docker compose up -d`
- [ ] All containers running: `docker ps` shows 2 containers
- [ ] Nginx configured and reloaded: `systemctl restart nginx`
- [ ] Firewall allows ports 22, 80, 443 (if using SSH on custom port, allow that too)

### Post-Deployment

- [ ] Dashboard accessible at `http://<vps-ip>`
- [ ] Login works (default username: `trader`, set password in UI)
- [ ] API responds: `curl http://<vps-ip>/api/metrics`
- [ ] Economic Calendar loads (Forex Factory API accessible)
- [ ] Database operations work (upload trades, view metrics)
- [ ] Logs are clean: `docker compose logs --tail 50`

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs trading-api
docker compose logs trading-frontend

# Common issues:
# - Port already in use: change port in docker-compose.yml
# - Missing dependencies: rebuild images
# - Database locked: restart container
```

**Solution:**
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Frontend shows blank page

1. Check frontend container logs: `docker compose logs trading-frontend`
2. Verify Nginx config: `nginx -t`
3. Clear browser cache and hard reload (`Ctrl+Shift+R`)
4. Check browser console for errors (F12 → Console)

### API returning 500 errors

1. Check backend logs: `docker compose logs trading-api`
2. Verify database exists: `sqlite3 /srv/trading-dashboard-v2/api/data/trades.db ".tables"`
3. Check environment variables: `docker compose exec trading-api env | grep -E "DATABASE|SECRET"`
4. Restart backend: `docker compose restart trading-api`

### "Forex Factory rate limited" warning appears

This is expected — FF allows 2 requests per 5 minutes. 

**Solutions:**
1. Wait 5 minutes before refreshing again
2. Increase cache TTL in `.env`: `FOREX_FACTORY_CACHE_TTL=21600` (6 hours)
3. Check recent cache: browser DevTools → Application → Local Storage → `econ_events_cache`

### Database migration issues

If you update the schema, recreate the database:

```bash
cd /srv/trading-dashboard-v2/api
rm data/trades.db
python3 -c "from main import app; print('Database created')"
docker compose restart trading-api
```

### Nginx 502 Bad Gateway

Backend container is unreachable.

```bash
# Check if containers are running
docker ps

# Test connectivity from nginx container
docker compose exec trading-frontend curl http://trading-api:8000/docs

# If failed, restart both:
docker compose restart
```

### SSL/HTTPS Setup (Optional)

Use Let's Encrypt with Certbot:

```bash
apt-get install certbot python3-certbot-nginx
certbot certonly --standalone -d your-domain.com
```

Update Nginx config in `/etc/nginx/sites-available/trading-dashboard`:

```nginx
server {
    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    # ... rest of config
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    return 301 https://$server_name$request_uri;
}
```

Reload Nginx: `systemctl reload nginx`

---

## Daily Operations

### Backup Database

```bash
cp /srv/trading-dashboard-v2/api/data/trades.db /srv/trading-dashboard-v2/api/data/trades.db.backup
```

Or automated daily backup:

```bash
# Add to crontab
0 2 * * * cp /srv/trading-dashboard-v2/api/data/trades.db /srv/trading-dashboard-v2/api/data/trades.db.$(date +\%Y\%m\%d)
```

### View Recent Logs

```bash
docker compose logs --tail 100 -f
```

### Restart Services

```bash
docker compose restart
```

### Update Code from GitHub

```bash
cd /srv/trading-dashboard-v2
git pull origin main
docker compose build
docker compose up -d
```

### Monitor Resource Usage

```bash
docker stats
```

---

## Next Steps

- See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design details
- See [DEPLOYMENT.md](./DEPLOYMENT.md) for CI/CD and production workflow
- See [Economic Calendar](./frontend/src/pages/EconCalendar.jsx) for data source details
- Check GitHub Issues for known limitations or feature requests

---

**Questions?** Open an issue on GitHub or review logs: `docker compose logs -f`
