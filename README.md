# Seagate Hookup Smart Search

Production traceability tool for the Seagate ACA Line. Search by Hookup SN, ACA Lot, DCM, or any tracked value, then pivot through related tables to trace a unit's journey: Scan1 → Dispensing → Soldering → Baking → Scan2.1 → WMS shipment.

---

## Project Structure

```
seagate_hookup_smart_search/
├── backend/          # Bun + Elysia + Drizzle API (port 9090)
├── frontend/         # Vue 3 + Vite + Element Plus SPA
└── CLAUDE.md         # Full architecture & codebase guide
```

---

## Backend Deployment (Docker)

### Prerequisites

- Docker installed
- Access to production MySQL servers:
  - `sghu-db02.th.belton.corp` (Seagate production data)
  - `bitintra-db02.th.belton.corp` (WMS, cross-DB queries)
  - `devth-db2.th.belton.corp` (app metadata: templates, endpoints, users)

### Environment Variables

Backend uses **hardcoded credentials** in `backend/src/db/client.ts`. No `.env` file required for standard deployment.

Optional overrides:
- `PORT` — API port (default: `9090`)
- `ENABLE_TLS` — set `true` to enable HTTPS (default: `false`)
- `SSL_CERT_PATH`, `SSL_KEY_PATH`, `SSL_CA_PATH` — paths to cert files (default: `/etc/httpd/conf/ssl.crt/beltontechnology_com.*`)

### Build & Run

```bash
cd backend

# Build Docker image
docker build -t seagate-hookup-backend .

# Run container (HTTP mode, port 9090)
docker run -d \
  --name seagate-hookup-api \
  -p 9090:9090 \
  seagate-hookup-backend

# Run with custom port
docker run -d \
  --name seagate-hookup-api \
  -p 8080:8080 \
  -e PORT=8080 \
  seagate-hookup-backend

# Run with HTTPS (mount cert directory)
docker run -d \
  --name seagate-hookup-api \
  -p 9090:9090 \
  -v /etc/httpd/conf/ssl.crt:/etc/httpd/conf/ssl.crt:ro \
  -e ENABLE_TLS=true \
  seagate-hookup-backend
```

### Health Check

```bash
# API health
curl http://localhost:9090/api/tables

# Swagger UI
open http://localhost:9090/swagger
```

### Production Paths

API serves on **two paths** (for reverse-proxy compatibility):
- `/api/*` — direct access
- `/prodline/seagate/hookup/hookup_smart_search/api/*` — production reverse-proxy path

Both paths work identically. Keep both mounted when deploying behind reverse proxy.

---

## Frontend Deployment

Frontend is a static SPA — build locally, then serve via Nginx/Apache/CDN.

```bash
cd frontend

# Install dependencies
npm install

# Build for production
npm run build

# Output: frontend/dist/
```

### Serve Built Frontend

**Nginx example:**
```nginx
server {
  listen 80;
  server_name your-domain.com;
  root /var/www/seagate-hookup/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  # Proxy API requests to backend container
  location /api/ {
    proxy_pass http://localhost:9090/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

**Apache example:**
```apache
<VirtualHost *:80>
  ServerName your-domain.com
  DocumentRoot /var/www/seagate-hookup/dist

  <Directory /var/www/seagate-hookup/dist>
    Options -Indexes +FollowSymLinks
    AllowOverride All
    Require all granted
    
    # SPA fallback
    RewriteEngine On
    RewriteBase /
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.html [L]
  </Directory>

  # Proxy API to backend
  ProxyPass /api/ http://localhost:9090/api/
  ProxyPassReverse /api/ http://localhost:9090/api/
</VirtualHost>
```

---

## Database Setup

Backend auto-creates metadata tables on startup:
- `query_templates` — saved search templates
- `saved_endpoints` — published API endpoints
- `registry_users` — user RBAC (seeded with default admin)
- `endpoint_permissions` — per-endpoint access grants

No manual migration needed. Tables are created via `CREATE TABLE IF NOT EXISTS` on first run.

---

## Key Features

- **Smart Pivot Search** — multi-step traceability queries (search → pivot → pivot → ...)
- **Query Templates** — save/replay complex pivot chains
- **Saved API Endpoints** — publish parameterized queries as stable REST URLs (`/api/v1/trace/:id`)
- **RBAC** — public/restricted endpoints with per-user access control
- **Excel Export** — multi-sheet workbook downloads
- **Combined View** — auto left-join all pivot steps client-side

---

## Tech Stack

**Backend:**
- [Bun](https://bun.sh) — JavaScript runtime (replaces Node.js)
- [Elysia](https://elysiajs.com) — fast web framework (similar to Express)
- [Drizzle ORM](https://orm.drizzle.team) — type-safe SQL
- MySQL 5.0 — legacy production database

**Frontend:**
- [Vue 3](https://vuejs.org) — composition API
- [Vite](https://vitejs.dev) — fast build tool
- [Element Plus](https://element-plus.org) — UI components
- [xlsx](https://sheetjs.com) — Excel export

---

## Documentation

- `CLAUDE.md` — full architecture, registry design, pivot logic, resolved bugs
- `USER_MANUAL.md` — end-user workflow guide
- `DEVELOPER_GUIDE.md` — codebase walkthrough
- `spec/` — original Excel/SQL samples used to reverse-engineer schema

---

## API Documentation

Interactive Swagger UI available at:
```
http://localhost:9090/swagger
```

Key endpoints:
- `GET  /api/tables` — table/column/link metadata
- `POST /api/search` — search with conditions
- `POST /api/pivot` — pivot to related table
- `GET  /api/v1/trace/:id` — run saved endpoint query
- `GET  /api/v1/endpoints` — list saved endpoints (RBAC-scoped)

---

## Development

**Backend:**
```bash
cd backend
bun install
bun run dev      # watch mode on port 9090
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev      # Vite dev server
```

---

## Support

- DB credentials hardcoded in `backend/src/db/client.ts` — change there if servers move
- MySQL 5.0 limitations: no CTEs, no window functions, batch `IN (...)` queries to 100-1000 values
- Case-sensitive table names: `SCAN1_DISPENSING` (uppercase), `scan1` (lowercase) — verify physically before adding to registry

---

## License

Internal tool for Belton Technology / Seagate production line.
