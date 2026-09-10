# Seagate Hookup Smart Search — Backend Deployment Package (intn6)

โฟลเดอร์นี้ผ่านการคัดแยกเฉพาะไฟล์ที่จำเป็นสำหรับ **Production Deployment** ของระบบ Backend บนเครื่องเซิร์ฟเวอร์ `intn6` (หรือ Production Linux Server) โดยตัดไฟล์ทดสอบ (test/check scripts) และ ad-hoc probes ออกทั้งหมดแล้ว

---

## 📁 โครงสร้างไฟล์ในโฟลเดอร์นี้

```text
deploy_to_intn6/
├── Dockerfile                  # Base Bun Docker container
├── docker-compose.yml          # Production Docker compose (TLS, healthcheck, network host)
├── .dockerignore               # ข้ามไฟล์ที่ไม่จำเป็นตอน build image
├── package.json                # Elysia, Drizzle ORM, MySQL2, Swagger, CORS
├── bun.lock                    # Bun dependency lockfile
├── tsconfig.json               # TypeScript configuration
├── reset.d.ts                  # Type-safe reset definitions
├── .env                        # Production DB & TLS Configuration (Active)
├── .env.example                # Template ตัวอย่างตัวแปร Environment
└── src/
    ├── index.ts                # Application Entry Point & API Routing
    ├── config/
    │   ├── appConfig.ts        # Global Config (Batch Size)
    │   └── tableRegistry.ts    # Static Table Registry, Links & Query Builders
    ├── db/
    │   ├── client.ts           # MySQL connection pools (Seagate, ACA, Bitintra, SeagateDev ฯลฯ)
    │   └── schema.ts           # Drizzle schema definitions
    └── services/
        ├── searchService.ts            # Search API Service
        ├── pivotService.ts             # Pivot Chain Service
        ├── templateService.ts          # Query Templates Service
        ├── endpointService.ts          # BFS Trace API Service
        ├── registryService.ts          # Dynamic Table & User Registry Service
        └── connectionRegistryService.ts # Dynamic Database Connection Registry Service
```

---

## 🚀 วิธีการ Deploy บนเซิร์ฟเวอร์ intn6

### วิธีที่ 1: Deploy ด้วย Docker Compose (แนะนำสำหรับ Production)

```bash
# 1. คัดลอกโฟลเดอร์นี้ไปยังเซิร์ฟเวอร์ปลายทาง เช่น /var/www/html/prodline/seagate/hookup/hookup_smart_search/backend
# 2. เข้าสู่โฟลเดอร์
cd /var/www/html/prodline/seagate/hookup/hookup_smart_search/backend

# 3. สั่งหยุดและ build container ใหม่
docker compose down
docker compose build
docker compose up -d

# 4. ตรวจสอบสถานะและ log
docker compose ps
docker compose logs -f --tail=50
```

### วิธีที่ 2: Run ผ่าน Bun โดยตรง (กรณีรันแบบ Standalone Process / Systemd)

```bash
# 1. ติดตั้ง dependencies
bun install

# 2. รันแอปพลิเคชัน
bun run start
# หรือรันในโหมด dev (watch)
bun run dev
```

---

## 🔍 ตรวจสอบความถูกต้องหลัง Deploy

```bash
# ตรวจสอบ Health Check / API
curl -k https://localhost:9090/api/tables

# หรือ HTTP (กรณีไม่ได้เปิด TLS)
curl http://localhost:9090/api/tables
```

