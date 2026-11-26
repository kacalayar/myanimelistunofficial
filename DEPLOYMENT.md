# Deployment Guide

Panduan deploy **MAL Unofficial API** ke berbagai platform: **EasyPanel**, **Coolify / Dokploy**, **VPS Biasa (PM2 + Nginx)**, **Docker Compose**, serta **PaaS (Railway / Render)**.

---

## Persiapan Umum

1. **Port**: Aplikasi berjalan di port `3000` (bisa diubah lewat env `PORT`).
2. **Persistent Storage**: Cache SQLite disimpan di `CACHE_DB_PATH` (default `./data/cache.db`, atau `/app/data/cache.db` di Docker). Pastikan folder `/app/data` di-*mount* sebagai volume agar cache tidak hilang saat container restart.
3. **Environment Variables**:
   - `PORT=3000`
   - `HOST=0.0.0.0`
   - `MAL_CLIENT_ID=` *(opsional — isi untuk mode Hybrid MAL API v2; kosongkan untuk mode Scraper)*
   - `CACHE_DB_PATH=/app/data/cache.db`

---

## 1. EasyPanel

1. Buka dashboard **EasyPanel** → pilih Project → klik **+ Service** → pilih **App**.
2. Pada tab **Source**:
   - Pilih **GitHub** (atau **Git**) dan arahkan ke repository Anda (`main` branch).
   - **Build Method**: pilih **Dockerfile** (otomatis mendeteksi [Dockerfile](Dockerfile)).
3. Pada tab **Environment**:
   - Tambahkan environment variable (minimal `MAL_CLIENT_ID` jika ingin mode Hybrid).
4. Pada tab **Storage / Mounts**:
   - Tambahkan **Volume Mount**:
     - **Name**: `mal-cache`
     - **Mount Path**: `/app/data`
5. Pada tab **Domains**:
   - Tambahkan domain Anda, arahkan port ke **`3000`**.
6. Klik **Deploy**. Setelah aktif, cek `https://domain-anda.com/health`.

---

## 2. Coolify / Dokploy / Portainer

### Via Dockerfile (Coolify / Dokploy)
1. Buat resource **Application** baru dari repository GitHub.
2. Pilih Build Pack **Dockerfile**.
3. Set **Port Exposes**: `3000`.
4. Tambahkan **Persistent Storage / Volume**: destination `/app/data`.
5. Set **Healthcheck Path**: `/health`.
6. Isi Environment Variables lalu **Deploy**.

### Via Docker Compose (Portainer / Coolify / Dokploy)
Gunakan file [docker-compose.yml](docker-compose.yml) yang sudah tersedia:
```bash
docker compose up -d --build
```

---

## 3. VPS Biasa (Ubuntu / Debian + PM2 + Nginx)

Cocok untuk VPS tanpa panel Docker.

### A. Install Node.js (>= 22.5 / 24) & PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx
sudo npm install -g pm2
```

### B. Clone, Build & Jalankan dengan PM2
```bash
git clone https://github.com/USERNAME/mal-unofficial-api.git
cd mal-unofficial-api

npm ci
cp .env.example .env
# Edit .env jika ingin mengisi MAL_CLIENT_ID
nano .env

npm run build
pm2 start dist/index.js --name mal-api
pm2 save
pm2 startup
```

### C. Reverse Proxy Nginx + SSL (Certbot)
Buat konfigurasi `/etc/nginx/sites-available/mal-api`:
```nginx
server {
    listen 80;
    server_name api.domainanda.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Aktifkan konfigurasi & pasang SSL gratis:
```bash
sudo ln -s /etc/nginx/sites-available/mal-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.domainanda.com
```

---

## 4. aaPanel / CyberPanel / Plesk

- **aaPanel**: Gunakan fitur **Website → Node Project** → pilih folder proyek, Node version `v24+`, Startup file `dist/index.js` (jalankan `npm run build` terlebih dahulu), port `3000`, lalu aktifkan **Mapping** ke domain + SSL.
- **Docker di aaPanel**: Bisa juga memakai tab **Docker → Compose** dengan file [docker-compose.yml](docker-compose.yml).

---

## 5. PaaS (Railway / Render / Fly.io)

- **Railway / Render**:
  - Connect repo GitHub → pilih **Dockerfile**.
  - Set `PORT` sesuai kebutuhan platform (Railway otomatis inject `PORT`, aplikasi sudah membaca `process.env.PORT`).
  - Tambahkan **Volume / Persistent Disk** di `/app/data` jika ingin cache SQLite bertahan antar deploy.
- **Fly.io**:
  - Jalankan `fly launch`, tambahkan volume `fly volumes create mal_cache --size 1`, lalu mount ke `/app/data` di `fly.toml`.
