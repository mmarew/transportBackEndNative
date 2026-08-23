# VPS & Traefik Hardening Guide — Hostinger Dokploy

Run these on your VPS via SSH. Server: `dynamicsroute.tech`

---

## Layer 1: UFW Firewall

```bash
# Install
sudo apt install ufw -y

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow only SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable
sudo ufw enable
sudo ufw status verbose
```

---

## Layer 2: Fix Docker UFW Bypass

Docker bypasses UFW by modifying iptables directly. This utility fixes that.

```bash
# Install ufw-docker
sudo wget -O /usr/local/bin/ufw-docker \
  https://github.com/chaifeng/ufw-docker/raw/master/ufw-docker.sh
sudo chmod +x /usr/local/bin/ufw-docker

# Block public access to all Docker-exposed ports except 80/443
# (Replace 3000 with any other port your containers expose)
sudo ufw-docker deny 3000/tcp
```

Verify from another machine:
```bash
curl -v http://YOUR_SERVER_IP:3000 --connect-timeout 5
# Should timeout
```

---

## Layer 3: fail2ban

```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

Default config auto-bans IPs after 5 failed SSH attempts for 10 minutes.

---

## Layer 4: Auto Security Updates

```bash
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## Layer 5: Traefik Middleware (in Dokploy)

In Dokploy dashboard, edit your Traefik docker-compose or application config to add these middlewares:

### 5a. Security Headers

```yaml
http:
  middlewares:
    security-headers:
      headers:
        stsSeconds: 31536000
        stsIncludeSubdomains: true
        stsPreload: true
        forceSTSHeader: true
        frameDeny: true
        contentTypeNosniff: true
        browserXssFilter: true
        customResponseHeaders:
          server: ""
          x-powered-by: ""
```

### 5b. Rate Limiting

```yaml
http:
  middlewares:
    api-rate-limit:
      rateLimit:
        average: 60
        period: 1m
        burst: 120
        sourceCriterion:
          ipStrategy:
            depth: 1
```

### 5c. Attach to Your Backend Service

Add labels to your backend container:

```yaml
labels:
  - "traefik.http.routers.backend.middlewares=security-headers@file,api-rate-limit@file"
```

---

## Layer 6: Block Dokploy Dashboard Direct Access

Once you have a domain for the dashboard (e.g. `deploy.dynamicsroute.tech`):

```bash
sudo ufw deny 3000/tcp
```

---

## Checklist

| # | Layer | Status |
|---|-------|--------|
| 1 | UFW enabled (22/80/443 only) | [ ] |
| 2 | ufw-docker installed (Docker bypass fixed) | [ ] |
| 3 | fail2ban running | [ ] |
| 4 | Auto security updates enabled | [ ] |
| 5 | Traefik security headers middleware | [ ] |
| 6 | Traefik rate limiting middleware | [ ] |
| 7 | Port 3000 blocked externally | [ ] |

---

## What This Protects Against

- **Scanner probes** (`/wp-admin`, `.env`, `phpinfo`) — blocked at Traefik level
- **Brute force SSH** — fail2ban auto-bans after 5 failures
- **DDoS / volumetric attacks** — UFW + rate limiting reduce surface
- **Docker port exposure** — ufw-docker prevents bypass
- **Missing security headers** — HSTS, X-Frame-Options, XSS filter
- **OS vulnerabilities** — auto-updates patch automatically
