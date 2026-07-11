# Trading Dashboard — Migration Guide

**Migrate from old VPS to new VPS with zero data loss.**

---

## Overview

This guide covers migrating your Trading Dashboard from an existing VPS to a new one while preserving all trade data, settings, and history.

---

## Pre-Migration Checklist

- [ ] Access to both old and new VPS via SSH
- [ ] Git push all changes to GitHub
- [ ] Backup database from old VPS
- [ ] Verify GitHub has latest code: `git log --oneline -5`
- [ ] New VPS is provisioned and accessible
- [ ] Downtime window scheduled (optional but recommended)

---

## Step 1: Backup Database from Old VPS

```bash
# SSH into old VPS
ssh -p 2222 root@<old-vps-ip>

# Backup database
mkdir -p /tmp/trading-backup
cp /srv/trading-dashboard-v2/api/data/trades.db /tmp/trading-backup/trades.db
cp /srv/trading-dashboard-v2/api/data/trades.db /tmp/trading-backup/trades.db.backup.$(date +%Y%m%d)

# Verify backup
ls -lh /tmp/trading-backup/
sqlite3 /tmp/trading-backup/trades.db "SELECT COUNT(*) FROM trades;" 
```

Note the trade count — you'll verify it on the new VPS.

---

## Step 2: Initial Setup on New VPS

Follow [SETUP.md](./SETUP.md) up to step 5 (clone repository).

```bash
# On new VPS
ssh -p 2222 root@<new-vps-ip>

# Install dependencies, clone repo, build Docker images
# ... (follow SETUP.md steps 1-5)
```

**Stop before starting services** — we'll restore the database first.

---

## Step 3: Transfer Database to New VPS

### Option A: SCP (if VPS allows)

```bash
# From old VPS, copy to local machine
scp -P 2222 root@<old-vps-ip>:/tmp/trading-backup/trades.db ~/trades.db

# From local machine, copy to new VPS
scp -P 2222 ~/trades.db root@<new-vps-ip>:/srv/trading-dashboard-v2/api/data/trades.db

# Verify
scp -P 2222 root@<new-vps-ip>:/srv/trading-dashboard-v2/api/data/trades.db ~/trades_verify.db
```

### Option B: Direct SSH Transfer (no local copy)

```bash
# From new VPS, pull from old VPS
ssh -p 2222 root@<new-vps-ip> "scp -P 2222 root@<old-vps-ip>:/tmp/trading-backup/trades.db /srv/trading-dashboard-v2/api/data/trades.db"
```

### Verify Database Transfer

```bash
# On new VPS
ssh -p 2222 root@<new-vps-ip>

cd /srv/trading-dashboard-v2/api
sqlite3 data/trades.db "SELECT COUNT(*) FROM trades;"
# Should match the count from old VPS
```

---

## Step 4: Complete New VPS Setup

Continue with SETUP.md from step 6 onward:

```bash
# On new VPS
cd /srv/trading-dashboard-v2

# Install backend dependencies
pip install -r api/requirements.txt

# Build and start Docker
docker compose build
docker compose up -d

# Verify services
docker ps  # Should show 2 containers
docker compose logs --tail 50  # Should show no errors
```

---

## Step 5: Verify Data Integrity

```bash
# SSH into new VPS
ssh -p 2222 root@<new-vps-ip>

# Check database
sqlite3 /srv/trading-dashboard-v2/api/data/trades.db "SELECT COUNT(*) FROM trades;"
# Should match the count from old VPS

# Check API response
curl http://localhost/api/metrics
# Should return JSON with your trade stats

# Check frontend
curl http://localhost/
# Should return HTML (dashboard)

# Verify in browser
# Visit http://<new-vps-ip>
# Login with your password
# Check Trade Log — verify all trades are there
```

---

## Step 6: DNS / IP Migration

### Option A: Update DNS (if using domain)

```bash
# Update DNS A record to point to new VPS IP
# In your DNS provider (Namecheap, Cloudflare, etc.):
#   trading.yourdomain.com  A  <new-vps-ip>
# 
# Allow 24-48 hours for DNS propagation
```

### Option B: Update Bookmarks (if using IP directly)

Update your bookmarks to `http://<new-vps-ip>`

### Option C: Keep Old VPS as Backup

Keep old VPS running for 24-48 hours in case of issues:

```bash
# On old VPS, stop services to save resources
docker compose down

# Keep database backup
# ... (keep for 1 week minimum)
```

---

## Step 7: Post-Migration Testing

### Functionality Tests

- [ ] Dashboard loads without errors
- [ ] Login works with your password
- [ ] Trade Log displays all trades
- [ ] Can add a new trade (test entry)
- [ ] Equity curve chart displays correctly
- [ ] Insights page shows correct stats
- [ ] Economic Calendar loads events
- [ ] Can view past event details
- [ ] Upload page works (CSV import)
- [ ] All pages load in reasonable time

### Performance Tests

```bash
# On new VPS
docker stats

# Should show:
# - API: <10% CPU, <200MB memory
# - Frontend: <5% CPU, <100MB memory
```

### API Tests

```bash
# Test key endpoints
curl http://<new-vps-ip>/api/metrics
curl http://<new-vps-ip>/api/trades
curl http://<new-vps-ip>/api/econ/events
```

---

## Step 8: Decommission Old VPS (After Validation)

Once you've confirmed everything works for 24+ hours:

```bash
# On old VPS
cd /srv/trading-dashboard-v2

# Final backup
tar czf /tmp/trading-backup-final-$(date +%Y%m%d_%H%M%S).tar.gz api/data/

# Stop services
docker compose down

# Remove containers
docker system prune -a --volumes

# Delete VPS (contact hosting provider to cancel)
```

Keep backups for at least 30 days before permanently deleting.

---

## Troubleshooting Migration

### Database Won't Restore

```bash
# Check file permissions
ls -lh /srv/trading-dashboard-v2/api/data/trades.db

# Should be readable:
chmod 644 /srv/trading-dashboard-v2/api/data/trades.db

# Verify database integrity
sqlite3 /srv/trading-dashboard-v2/api/data/trades.db "PRAGMA integrity_check;"
# Should return "ok"
```

### API Returns 500 Errors

```bash
# Check logs
docker compose logs trading-api

# Likely cause: database incompatibility
# Solution: Restart container
docker compose restart trading-api

# If still failing, restore backup database
docker compose down
cp /srv/trading-dashboard-v2/api/data/trades.db.backup /srv/trading-dashboard-v2/api/data/trades.db
docker compose up -d
```

### Some Trades Missing After Migration

```bash
# Verify database wasn't truncated during transfer
sqlite3 /srv/trading-dashboard-v2/api/data/trades.db "SELECT COUNT(*) FROM trades;" 

# If count is low, restore from old VPS backup
docker compose down
scp -P 2222 root@<old-vps-ip>:/tmp/trading-backup/trades.db /srv/trading-dashboard-v2/api/data/trades.db
docker compose up -d
```

### Frontend Loads but No Data Displays

```bash
# Check browser console (F12) for errors
# Check API connectivity
curl -v http://localhost/api/metrics

# If 401, re-enter password
# If 500, check backend logs
docker compose logs trading-api

# If database issue, restart
docker compose restart trading-api
```

---

## Rollback Procedure

If something goes wrong and you need to revert to the old VPS:

```bash
# Option 1: Point traffic back to old VPS (DNS/bookmarks)
# Update DNS A record or change bookmarks back to old IP
# Wait for DNS propagation if needed

# Option 2: From new VPS, restore from backup
ssh -p 2222 root@<new-vps-ip>
cd /srv/trading-dashboard-v2
docker compose down
cp api/data/trades.db.backup api/data/trades.db
docker compose up -d

# Option 3: Use git to rollback code
git revert <commit-hash>
docker compose build
docker compose up -d
```

---

## Summary

| Step | Action | Time |
|---|---|---|
| 1 | Backup old database | 5 min |
| 2 | Setup new VPS (prerequisites) | 10 min |
| 3 | Transfer database | 10 min |
| 4 | Complete new VPS setup | 15 min |
| 5 | Verify data & functionality | 10 min |
| 6 | Update DNS/bookmarks | 1 min |
| 7 | Monitor for 24 hours | — |
| 8 | Decommission old VPS | 5 min |

**Total time: ~56 minutes plus 24h monitoring**

---

**For initial setup, see [SETUP.md](./SETUP.md)**
**For deployment workflow, see [DEPLOYMENT.md](./DEPLOYMENT.md)**
**For architecture details, see [ARCHITECTURE.md](./ARCHITECTURE.md)**
