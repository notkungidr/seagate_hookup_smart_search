# Bun on Debian (glibc) — Oracle Instant Client ไม่รองรับ alpine/musl
# 1.3.6 = เวอร์ชันเดียวกับที่ทดสอบ oracledb thick mode ต่อ EBS ผ่านแล้ว
FROM oven/bun:1.3.6-debian AS base

# Oracle Instant Client 21.14 (thick mode) — EBS ใช้ password verifier เก่า (0x939) thin mode ต่อไม่ได้ (NJS-116)
# ขั้นตอนเดียวกับ D:\pr_online_budget_report_new\budget-report-backend\Dockerfile
# libaio: trixie เปลี่ยนชื่อเป็น libaio1t64 (ไฟล์ libaio.so.1t64) → ลองทั้งสองชื่อ + symlink ให้ Instant Client หา libaio.so.1 เจอ
RUN apt-get update \
    && (apt-get install -y --no-install-recommends libaio1t64 || apt-get install -y --no-install-recommends libaio1) \
    && apt-get install -y --no-install-recommends wget unzip ca-certificates \
    && LIBAIO=$(find / -name 'libaio.so.1t64' -print -quit 2>/dev/null) \
    && if [ -n "$LIBAIO" ]; then ln -sf "$LIBAIO" "$(dirname "$LIBAIO")/libaio.so.1"; fi \
    && mkdir -p /opt/oracle && cd /opt/oracle \
    && wget -q https://download.oracle.com/otn_software/linux/instantclient/2114000/instantclient-basic-linux.x64-21.14.0.0.0dbru.zip \
    && unzip -q instantclient-basic-linux.x64-21.14.0.0.0dbru.zip \
    && rm instantclient-basic-linux.x64-21.14.0.0.0dbru.zip \
    && echo /opt/oracle/instantclient_21_14 > /etc/ld.so.conf.d/oracle-instantclient.conf && ldconfig \
    && apt-get purge -y wget unzip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# db/oracle.ts เปิด thick mode เมื่อมีตัวแปรนี้ (เรียกเฉพาะตอนสร้าง Oracle pool แรก — MySQL ไม่กระทบ)
ENV ORACLE_INSTANT_CLIENT_PATH=/opt/oracle/instantclient_21_14

WORKDIR /usr/src/app

# Install dependencies in a cache-friendly way (package.json + bun.lock ให้ตรงกับ host)
COPY package.json bun.lock ./
RUN bun install

# Copy all source files
COPY . .

# Expose the API port
EXPOSE 9090

# Command to run the application
CMD ["bun", "run", "src/index.ts"]
