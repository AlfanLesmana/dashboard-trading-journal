# Trading Dashboard — Deployment & Updates

**Workflow for deploying code changes, updates, and maintenance.**

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Deployment Process](#deployment-process)
3. [Update Workflow](#update-workflow)
4. [Rollback Procedure](#rollback-procedure)
5. [CI/CD Pipeline (Optional)](#cicd-pipeline-optional)
6. [Monitoring During Deployment](#monitoring-during-deployment)
7. [Hotfixes](#hotfixes)

---

## Pre-Deployment Checklist

### Local Testing

```bash
# 1. Pull latest code
git pull origin main

# 2. Test backend
cd api
source venv/bin/activate
pip install -r requirements.txt
python -m pytest          # If tests exist
uvicorn main:app --reload

# 3. Test frontend
cd ../frontend
npm install
npm run dev

# 4. Lint & format (optional)
npm run lint              # If configured
black api/                # Python formatter
```

### Git Checklist

- [ ] All changes committed: `git status` shows clean working tree
- [ ] Latest code pulled: `git pull origin main`
- [ ] No uncommitted files: `git diff` is empty
- [ ] Tag release (optional): `git tag -a v1.0.0 -m "Release notes"`

### VPS Pre-Deployment

```bash
# Connect to VPS
ssh -p 2222 root@<vps-ip>

# Backup database
cp /srv/trading-dashboard-v2/api/data/trades.db \
   /srv/trading-dashboard-v2/api/data/trades.db.backup.$(date +%Y%m%d)

# Check disk space
df -h

# Check running services
docker ps

# View current logs
docker compose logs --tail 20
```

---

## Deployment Process

### Option A: Quick Deploy (Most Common)

For frontend-only or small backend changes:

```bash
# On VPS
cd /srv/trading-dashboard-v2

# 1. Pull latest code
git pull origin main

# 2. Rebuild images
docker compose build

# 3. Restart services (brief downtime ~5-10 seconds)
docker compose down
docker compose up -d

# 4. Verify
docker ps                          # Check containers running
docker compose logs --tail 50      # Check for errors
curl http://localhost/             # Test frontend loads
curl http://localhost/api/metrics  # Test API responds
```

**Downtime:** ~10 seconds

### Option B: Zero-Downtime Deploy (Advanced)

For critical production systems:

```bash
# 1. Build new images (don't start yet)
docker compose build

# 2. Start new containers alongside old ones on different ports
docker compose up -d --scale trading-api=2

# 3. Update Nginx to route to new container
# (requires health check + rolling update configuration)

# 4. Drain old container gracefully
docker stop <old-container-id>

# 5. Clean up
docker compose up -d
```

**Downtime:** ~0 seconds (requires Nginx config changes)

### Option C: Manual Update (Testing/Dev)

```bash
# 1. SSH into VPS
ssh -p 2222 root@<vps-ip>

# 2. Go to project directory
cd /srv/trading-dashboard-v2

# 3. Pull code
git pull origin main

# 4. Backend changes only
docker compose exec trading-api pip install -r requirements.txt
docker compose restart trading-api

# 5. Frontend changes only
cd frontend
npm install
npm run build
docker compose restart trading-frontend

# 6. Both changes
docker compose down
docker compose build
docker compose up -d

# 7. Verify
docker compose logs -f
# Ctrl+C to exit logs
```

---

## Update Workflow

### Step 1: Code Commit & Push

```bash
# On local machine
git add .
git commit -m "Feature: Add new dashboard widget"
git push origin main
```

### Step 2: Deploy Script (Automated)

Create a deployment script at `/srv/deploy.sh`:

```bash
#!/bin/bash
set -e

cd /srv/trading-dashboard-v2

# Backup
cp -r api/data/trades.db api/data/trades.db.backup.$(date +%Y%m%d_%H%M%S)

# Pull latest
git pull origin main

# Rebuild & deploy
docker compose down
docker compose build
docker compose up -d

# Verify
echo "Waiting for services to start..."
sleep 5
docker compose logs --tail 20

echo "✓ Deployment complete"
echo "View logs: docker compose logs -f"
```

Make executable:
```bash
chmod +x /srv/deploy.sh
```

### Step 3: Run Deployment

```bash
ssh -p 2222 root@<vps-ip> /srv/deploy.sh
```

Or manually:
```bash
ssh -p 2222 root@<vps-ip>
cd /srv/trading-dashboard-v2
git pull origin main
docker compose down && docker compose build && docker compose up -d
```

### Step 4: Verify

```bash
# Check containers
docker ps

# Check logs for errors
docker compose logs

# Test endpoints
curl http://<vps-ip>/                    # Should load HTML
curl http://<vps-ip>/api/metrics         # Should return JSON
```

### Step 5: Monitor

```bash
# Watch logs for 5 minutes
docker compose logs -f

# Check resource usage
docker stats

# If issues, see rollback below
```

---

## Rollback Procedure

### If Deployment Fails

```bash
# 1. Stop current deployment
docker compose down

# 2. Restore backup database (if needed)
cp api/data/trades.db.backup.<date> api/data/trades.db

# 3. Checkout previous version
git log --oneline | head -5          # Find previous commit hash
git checkout <commit-hash>            # Revert to working version

# 4. Rebuild & restart
docker compose build
docker compose up -d

# 5. Verify
docker compose logs --tail 50
curl http://localhost/
```

### If You Need to Revert Code

```bash
# See commit history
git log --oneline -10

# Revert one commit (creates new commit that undoes changes)
git revert <commit-hash>
git push origin main

# Then deploy
docker compose down
docker compose build
docker compose up -d
```

### If Database Is Corrupted

```bash
# Stop services
docker compose down

# Restore from backup
cp api/data/trades.db.backup.<date> api/data/trades.db

# Start services
docker compose up -d

# Verify
docker compose logs
```

---

## CI/CD Pipeline (Optional)

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to VPS

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run tests (backend)
        run: |
          cd api
          python -m venv venv
          source venv/bin/activate
          pip install -r requirements.txt
          # pytest or linting

      - name: Build frontend
        run: |
          cd frontend
          npm install
          npm run build

      - name: Deploy to VPS
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.VPS_IP }}
          port: 2222
          username: root
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /srv/trading-dashboard-v2
            git pull origin main
            docker compose down
            docker compose build
            docker compose up -d
            docker compose logs --tail 20
```

**Setup secrets in GitHub:**
- `VPS_IP` — your VPS IP address
- `VPS_SSH_KEY` — SSH private key for root user

**Benefits:**
- Automated deployment on every push to main
- Built-in linting & testing
- No manual SSH needed

### GitLab CI/CD Alternative

Create `.gitlab-ci.yml`:

```yaml
stages:
  - test
  - build
  - deploy

test_backend:
  stage: test
  script:
    - cd api && pip install -r requirements.txt && pytest

build_frontend:
  stage: build
  script:
    - cd frontend && npm install && npm run build

deploy_vps:
  stage: deploy
  script:
    - ssh -p 2222 root@$VPS_IP "/srv/deploy.sh"
  only:
    - main
```

---

## Monitoring During Deployment

### Real-Time Logs

```bash
# Follow logs during & after deployment
docker compose logs -f

# Watch specific service
docker compose logs -f trading-api
docker compose logs -f trading-frontend
```

### Health Checks

```bash
# Backend API is running
curl -s http://localhost:8000/docs | grep -q "Swagger" && echo "✓ Backend OK" || echo "✗ Backend failed"

# Frontend is serving
curl -s http://localhost/ | grep -q "html" && echo "✓ Frontend OK" || echo "✗ Frontend failed"

# Database is accessible
sqlite3 api/data/trades.db ".tables" && echo "✓ Database OK" || echo "✗ Database failed"
```

### Resource Monitoring

```bash
# CPU & memory usage
docker stats

# Disk usage
df -h /srv/trading-dashboard-v2

# Network I/O
iftop
```

### Error Patterns to Watch For

| Error | Cause | Fix |
|---|---|---|
| `Connection refused` | Backend not running | `docker compose restart trading-api` |
| `CORS error` | Nginx config issue | Check `/etc/nginx/sites-available/trading-dashboard` |
| `Cannot find module` | Frontend build failed | `cd frontend && npm run build` |
| `Database locked` | SQLite file in use | `docker compose restart` (wait 30 sec) |
| `Out of disk space` | Log files too large | `docker system prune` |

---

## Hotfixes

### Critical Bug in Production

**Scenario:** A bug is discovered in production (main branch deployed). You need to fix it without waiting for review.

```bash
# 1. Create hotfix branch from production
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug-name

# 2. Make fix
# (edit files)

# 3. Test locally
npm run dev  # Frontend
uvicorn api/main:app --reload  # Backend

# 4. Commit & push
git add .
git commit -m "Hotfix: Brief description of fix"
git push origin hotfix/critical-bug-name

# 5. Deploy immediately
ssh -p 2222 root@<vps-ip> "cd /srv/trading-dashboard-v2 && git pull origin hotfix/critical-bug-name && docker compose down && docker compose build && docker compose up -d"

# 6. Merge back to main
git checkout main
git merge hotfix/critical-bug-name
git push origin main

# 7. Delete hotfix branch
git branch -d hotfix/critical-bug-name
```

### Database Migration During Deployment

If schema changes are needed:

```bash
# 1. Stop containers
docker compose down

# 2. Backup database
cp api/data/trades.db api/data/trades.db.backup

# 3. Apply schema changes (update SQLAlchemy models in api/)
# ... edit api/modules/trades.py or relevant file ...

# 4. Commit & push
git add api/modules/trades.py
git commit -m "Schema: Add new column to trades table"
git push origin main

# 5. Rebuild & start
docker compose build
docker compose up -d

# 6. Verify new schema
sqlite3 api/data/trades.db ".schema trades"

# 7. If failed, restore
docker compose down
cp api/data/trades.db.backup api/data/trades.db
git checkout HEAD~1  # Revert code
docker compose build && docker compose up -d
```

---

## Maintenance Windows

### Scheduled Downtime

Post maintenance announcement:
```bash
# Create maintenance page (optional)
echo "Maintenance in progress..." > /srv/maintenance.html
```

Schedule deployment:
```bash
# At 2 AM UTC (low traffic time)
0 2 * * * /srv/deploy.sh >> /var/log/deploy.log 2>&1
```

Notify users (via email or banner).

### Post-Deployment Checklist

- [ ] All containers running: `docker ps`
- [ ] No errors in logs: `docker compose logs`
- [ ] Frontend loads: `curl http://<vps-ip>`
- [ ] API responds: `curl http://<vps-ip>/api/metrics`
- [ ] Database unchanged: `sqlite3 api/data/trades.db "SELECT COUNT(*) FROM trades;"`
- [ ] Nginx responding: `curl -I http://<vps-ip>` → HTTP 200
- [ ] Performance acceptable: `docker stats` (CPU <50%, Memory <1.5GB)

---

## Environment-Specific Deployments

### Staging (Pre-Production Testing)

```bash
# Deploy to staging VPS first
ssh -p 2222 root@<staging-vps-ip>
cd /srv/trading-dashboard-staging
git pull origin main
docker compose build
docker compose up -d

# Test thoroughly
# Then deploy to production
```

### Production

```bash
# After staging tests pass
ssh -p 2222 root@<production-vps-ip>
cd /srv/trading-dashboard-v2
git pull origin main
docker compose build
docker compose up -d
```

### Development

```bash
# Local development (no Docker)
npm run dev              # Frontend at localhost:5173
uvicorn main:app --reload  # Backend at localhost:8000
```

---

## Automated Backups

### Daily Backup Script

Create `/srv/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/srv/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_FILE="/srv/trading-dashboard-v2/api/data/trades.db"

mkdir -p $BACKUP_DIR

# Backup database
cp $DB_FILE $BACKUP_DIR/trades_$DATE.db

# Keep only last 7 days
find $BACKUP_DIR -name "trades_*.db" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/trades_$DATE.db"
```

Schedule in crontab:
```bash
# Daily at 3 AM
0 3 * * * /srv/backup.sh >> /var/log/backup.log 2>&1
```

---

## Troubleshooting Deployments

### Containers Won't Start

```bash
# Check build errors
docker compose build --no-cache 2>&1 | tail -20

# Check logs
docker compose logs trading-api
docker compose logs trading-frontend

# Rebuild from scratch
docker system prune -a
docker compose build
docker compose up -d
```

### Port Already in Use

```bash
# Find what's using port 8000
lsof -i :8000

# Kill it
kill -9 <PID>

# Or change port in docker-compose.yml
# ports:
#   - "8001:8000"
```

### Network Issues

```bash
# Test connectivity between containers
docker compose exec trading-frontend curl http://trading-api:8000/docs

# Check Nginx routing
curl -v http://localhost/api/metrics
# Look for X-Forwarded-* headers
```

### Slow Deployment

```bash
# Use build cache
docker compose build --cache-from trading-dashboard-v2-api:latest

# Or build in parallel
docker compose build --parallel

# Or pre-download base images
docker pull python:3.10-slim
docker pull node:18-alpine
```

---

**For full system architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md)**
**For initial setup, see [SETUP.md](./SETUP.md)**
