# Deployment Guide

## Production Server Path
```
/var/www/html/prodline/seagate/hookup/hookup_smart_search/
```

---

## Step 1: Pull Latest Code

```bash
cd /var/www/html/prodline/seagate/hookup/hookup_smart_search
git pull origin main
```

---

## Step 2: Build & Deploy Frontend

```bash
cd frontend

# Install dependencies (if package.json changed)
npm install

# Build production bundle
npm run build

# Frontend static files will be in frontend/dist/
# Apache/Nginx should already be configured to serve from this path
```

**Verify Apache/Nginx config points to:**
- DocumentRoot: `/var/www/html/prodline/seagate/hookup/hookup_smart_search/frontend/dist`

---

## Step 3: Deploy Backend (Docker Compose)

```bash
cd /var/www/html/prodline/seagate/hookup/hookup_smart_search/backend

# Stop current container
docker compose down

# Rebuild image with latest code
docker compose build

# Start container in detached mode
docker compose up -d

# Check container status
docker compose ps

# View logs (optional)
docker compose logs -f --tail=50
```

---

## Step 4: Verify Deployment

```bash
# Check API health (HTTPS on production)
curl -k https://localhost:9090/api/tables

# Check container logs
docker compose logs seagate-hookup-search-api --tail=20

# Check container health
docker compose ps
# Should show "healthy" status after ~40s
```

---

## Troubleshooting

### Container won't start
```bash
# Check logs
docker compose logs

# Check if port 9090 already in use
sudo netstat -tlnp | grep 9090

# Force recreate container
docker compose up -d --force-recreate
```

### SSL certificate errors
```bash
# Verify cert files exist
ls -la /etc/httpd/conf/ssl.crt/beltontechnology_com.*

# Check container mounts
docker compose exec seagate-hookup-search-api ls -la /etc/httpd/conf/ssl.crt/
```

### Database connection errors
```bash
# Test DB connection from container
docker compose exec seagate-hookup-search-api bun run -e "
  import mysql from 'mysql2/promise';
  const conn = await mysql.createConnection({
    host: 'sghu-db02.th.belton.corp',
    user: 'your_user',
    password: 'your_pass'
  });
  console.log('Connected!');
  await conn.end();
"
```

### Rollback to previous version
```bash
cd /var/www/html/prodline/seagate/hookup/hookup_smart_search

# Find previous commit
git log --oneline -5

# Rollback
git reset --hard <commit-hash>

# Redeploy
cd backend
docker compose down
docker compose build
docker compose up -d

cd ../frontend
npm run build
```

---

## Quick Deploy (One-liner)

For quick updates after `git pull`:

```bash
# Backend only
cd /var/www/html/prodline/seagate/hookup/hookup_smart_search/backend && docker compose down && docker compose build && docker compose up -d && docker compose logs -f --tail=20

# Frontend only
cd /var/www/html/prodline/seagate/hookup/hookup_smart_search/frontend && npm run build

# Full stack
cd /var/www/html/prodline/seagate/hookup/hookup_smart_search && \
  git pull origin main && \
  (cd frontend && npm run build) && \
  (cd backend && docker compose down && docker compose build && docker compose up -d) && \
  (cd backend && docker compose logs -f --tail=30)
```

---

## Post-Deployment Checklist

- [ ] Backend container running (`docker compose ps`)
- [ ] Health check passing (wait 40s, check logs)
- [ ] API responds (`curl -k https://localhost:9090/api/tables`)
- [ ] Frontend loads (open in browser)
- [ ] Can search + pivot
- [ ] Saved templates work
- [ ] API endpoints return data (`/api/v1/trace/:id`)

---

## Notes

- **No downtime during frontend deploy** — static files replace in-place
- **Backend downtime: ~10-30s** — time to stop old container + start new one
- **Docker volumes preserve logs** — container recreate won't lose recent logs (json-file driver, 3×10MB rotation)
- **SSL certs mounted read-only** — if certs renew, restart container: `docker compose restart`
