# Production Deployment Guide

This guide covers best practices for deploying HAProxy Dynamic Multi-Protocol Proxy in production environments.

## Pre-Deployment Checklist

- [ ] Hardware requirements met
- [ ] Network architecture planned
- [ ] SSL certificates prepared
- [ ] DNS records configured
- [ ] Firewall rules defined
- [ ] Monitoring solution ready
- [ ] Backup strategy established
- [ ] Disaster recovery plan documented
- [ ] Security hardening completed
- [ ] Load testing performed

## Hardware Requirements

### Minimum Requirements (Small Scale)
- **CPU**: 2 cores
- **RAM**: 2 GB
- **Disk**: 20 GB SSD
- **Network**: 1 Gbps
- **Concurrent Connections**: ~5,000

### Recommended (Medium Scale)
- **CPU**: 4 cores
- **RAM**: 8 GB
- **Disk**: 50 GB SSD
- **Network**: 10 Gbps
- **Concurrent Connections**: ~20,000

### High Performance (Large Scale)
- **CPU**: 8+ cores
- **RAM**: 16+ GB
- **Disk**: 100+ GB NVMe SSD
- **Network**: 10+ Gbps
- **Concurrent Connections**: 50,000+

## Deployment Options

### Option 1: Docker Compose (Single Server)

Best for: Small to medium deployments, development, testing

```bash
# 1. Clone repository
git clone https://github.com/yourusername/haproxy-dynamic-proxy.git
cd haproxy-dynamic-proxy

# 2. Configure environment
cp .env.example .env
nano .env  # Edit with production values

# 3. Update docker-compose.yml for production
nano docker-compose.yml

# 4. Start services
docker-compose up -d

# 5. Initialize database
docker-compose exec haproxy-dynamic-proxy npx prisma migrate deploy

# 6. Setup triggers
docker-compose exec postgres psql -U haproxy_user -d haproxy_db < /docker-entrypoint-initdb.d/setup-triggers.sql

# 7. Verify deployment
docker-compose ps
docker-compose logs -f
```

### Option 2: Systemd Services (Bare Metal)

Best for: High performance, direct hardware access

```bash
# 1. Install dependencies
sudo apt update
sudo apt install -y nodejs npm postgresql haproxy

# 2. Clone and setup application
cd /opt
sudo git clone https://github.com/yourusername/haproxy-dynamic-proxy.git
cd haproxy-dynamic-proxy
sudo npm install
sudo npx prisma generate
sudo npm run build

# 3. Configure PostgreSQL
sudo -u postgres psql << EOF
CREATE DATABASE haproxy_db;
CREATE USER haproxy_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE haproxy_db TO haproxy_user;
\q
EOF

# 4. Run migrations
DATABASE_URL="postgresql://haproxy_user:secure_password@localhost:5432/haproxy_db" \
  npx prisma migrate deploy

# 5. Setup triggers
psql "postgresql://haproxy_user:secure_password@localhost:5432/haproxy_db" \
  < sql/setup-db-triggers.sql

# 6. Configure environment
sudo cp .env.example /opt/haproxy-dynamic-proxy/.env
sudo nano /opt/haproxy-dynamic-proxy/.env

# 7. Install systemd service
sudo cp systemd/haproxy-dynamic-proxy.service /etc/systemd/system/
sudo nano /etc/systemd/system/haproxy-dynamic-proxy.service  # Update paths

# 8. Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable haproxy-dynamic-proxy
sudo systemctl start haproxy-dynamic-proxy
sudo systemctl status haproxy-dynamic-proxy
```

### Option 3: Kubernetes

Best for: Large scale, multi-region, high availability

```yaml
# namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: haproxy-proxy

---
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: haproxy-config
  namespace: haproxy-proxy
data:
  DATABASE_URL: "postgresql://user:password@postgres-service:5432/haproxy_db"
  HAPROXY_CONFIG_PATH: "/etc/haproxy/haproxy.cfg"
  STATS_PORT: "8404"

---
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: haproxy-secrets
  namespace: haproxy-proxy
type: Opaque
stringData:
  STATS_USERNAME: "admin"
  STATS_PASSWORD: "your-secure-password"
  DATABASE_PASSWORD: "your-db-password"

---
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: haproxy-dynamic-proxy
  namespace: haproxy-proxy
spec:
  replicas: 2
  selector:
    matchLabels:
      app: haproxy-dynamic-proxy
  template:
    metadata:
      labels:
        app: haproxy-dynamic-proxy
    spec:
      containers:
      - name: haproxy-proxy
        image: your-registry/haproxy-dynamic-proxy:latest
        ports:
        - containerPort: 80
          name: http
        - containerPort: 443
          name: https
        - containerPort: 8404
          name: stats
        envFrom:
        - configMapRef:
            name: haproxy-config
        - secretRef:
            name: haproxy-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /stats
            port: 8404
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /stats
            port: 8404
          initialDelaySeconds: 10
          periodSeconds: 5

---
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: haproxy-service
  namespace: haproxy-proxy
spec:
  type: LoadBalancer
  selector:
    app: haproxy-dynamic-proxy
  ports:
  - port: 80
    targetPort: 80
    name: http
  - port: 443
    targetPort: 443
    name: https
  - port: 8404
    targetPort: 8404
    name: stats
```

Deploy:
```bash
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

## Security Hardening

### 1. Environment Variables

```bash
# Use strong passwords
STATS_PASSWORD=$(openssl rand -base64 32)
DATABASE_PASSWORD=$(openssl rand -base64 32)

# Store in secure secret management
# - Docker secrets
# - Kubernetes secrets
# - AWS Secrets Manager
# - HashiCorp Vault
```

### 2. Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw allow 8404/tcp from 10.0.0.0/8  # Stats (internal only)
sudo ufw enable

# iptables
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
iptables -A INPUT -p tcp --dport 8404 -s 10.0.0.0/8 -j ACCEPT
```

### 3. PostgreSQL Security

```sql
-- Create read-only user for reporting
CREATE USER readonly_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE haproxy_db TO readonly_user;
GRANT USAGE ON SCHEMA public TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;

-- Enable SSL connections
-- In postgresql.conf:
-- ssl = on
-- ssl_cert_file = '/path/to/server.crt'
-- ssl_key_file = '/path/to/server.key'

-- Restrict connections in pg_hba.conf:
-- hostssl all all 0.0.0.0/0 md5
```

### 4. HAProxy Security

```bash
# Run as non-root user
# In Dockerfile or systemd service:
User=haproxy
Group=haproxy

# Limit file descriptors
ulimit -n 65535

# Enable secure defaults in haproxy.cfg:
# - Disable SSLv3, TLSv1.0, TLSv1.1
# - Use strong ciphers
# - Enable HSTS
```

### 5. Network Segmentation

```
┌─────────────────────────────────────┐
│         Public Internet             │
└────────────┬────────────────────────┘
             │
    ┌────────┴────────┐
    │   Firewall      │
    │   (80, 443)     │
    └────────┬────────┘
             │
    ┌────────┴────────────────────────┐
    │  DMZ (HAProxy)                  │
    │  10.0.1.0/24                    │
    └────────┬────────────────────────┘
             │
    ┌────────┴────────┐
    │   Firewall      │
    │   (Backend)     │
    └────────┬────────┘
             │
    ┌────────┴────────────────────────┐
    │  Internal Network               │
    │  10.0.2.0/24                    │
    │  (Backend Servers, Database)    │
    └─────────────────────────────────┘
```

## High Availability

### Active-Passive Setup

```
                  ┌─────────┐
                  │   VIP   │
                  │ (VRRP)  │
                  └────┬────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
    ┌────┴─────┐              ┌─────┴────┐
    │ HAProxy1 │              │ HAProxy2 │
    │ (Master) │              │ (Backup) │
    └──────────┘              └──────────┘
         │                           │
         └──────────┬────────────────┘
                    │
            ┌───────┴────────┐
            │   PostgreSQL   │
            │   (Primary)    │
            └────────────────┘
```

Using Keepalived:

```bash
# Install keepalived
apt-get install keepalived

# /etc/keepalived/keepalived.conf (Master)
vrrp_instance VI_1 {
    state MASTER
    interface eth0
    virtual_router_id 51
    priority 101
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass secret123
    }
    virtual_ipaddress {
        192.168.1.100/24
    }
}

# /etc/keepalived/keepalived.conf (Backup)
vrrp_instance VI_1 {
    state BACKUP
    interface eth0
    virtual_router_id 51
    priority 100
    # ... rest same as master
}
```

### Active-Active Setup

```
            ┌──────────────┐
            │  DNS / L4 LB │
            │ Round Robin  │
            └──────┬───────┘
                   │
         ┌─────────┴─────────┐
         │                   │
    ┌────┴─────┐      ┌─────┴────┐
    │ HAProxy1 │      │ HAProxy2 │
    └──────────┘      └──────────┘
         │                   │
         └─────────┬─────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
    ┌────┴────────┐   ┌──────┴──────┐
    │ PostgreSQL  │   │ PostgreSQL  │
    │  (Primary)  │──→│  (Replica)  │
    └─────────────┘   └─────────────┘
```

## Monitoring Setup

### Prometheus + Grafana

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'haproxy'
    static_configs:
      - targets: ['haproxy-host:8404']
    metrics_path: '/stats;csv'
```

### ELK Stack

```bash
# filebeat.yml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /var/log/haproxy/*.log
  
output.elasticsearch:
  hosts: ["elasticsearch:9200"]
```

### CloudWatch (AWS)

```bash
# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
sudo rpm -U ./amazon-cloudwatch-agent.rpm

# Configure agent to collect HAProxy logs
```

## Backup Strategy

### Database Backups

```bash
# Daily automated backup script
#!/bin/bash
# /opt/scripts/backup-db.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/postgresql"
DB_NAME="haproxy_db"

mkdir -p $BACKUP_DIR

# Full backup
pg_dump $DATABASE_URL | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Rotate old backups (keep 30 days)
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete

# Upload to S3 (optional)
aws s3 cp $BACKUP_DIR/backup_$DATE.sql.gz s3://my-backups/postgresql/

echo "Backup completed: backup_$DATE.sql.gz"
```

Add to crontab:
```bash
# Daily at 2 AM
0 2 * * * /opt/scripts/backup-db.sh
```

### Configuration Backups

HAProxy configs are automatically backed up before regeneration:
```
/etc/haproxy/haproxy.cfg.backup.1639234567890
```

## Performance Tuning

### System Limits

```bash
# /etc/security/limits.conf
* soft nofile 65535
* hard nofile 65535
haproxy soft nofile 200000
haproxy hard nofile 200000

# /etc/sysctl.conf
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 30
net.core.somaxconn = 4096
net.core.netdev_max_backlog = 4096
net.ipv4.tcp_max_syn_backlog = 4096

# Apply changes
sysctl -p
```

### HAProxy Tuning

```bash
# In generated config or modify generator
global
    maxconn 50000
    nbproc 4  # Number of CPU cores
    cpu-map auto:1/1-4 0-3
    tune.ssl.default-dh-param 2048
```

### PostgreSQL Tuning

```bash
# postgresql.conf
max_connections = 200
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
work_mem = 10MB
min_wal_size = 1GB
max_wal_size = 4GB
```

## Load Testing

### Using wrk

```bash
# Install wrk
git clone https://github.com/wg/wrk.git
cd wrk
make
sudo cp wrk /usr/local/bin/

# Test HTTPS
wrk -t12 -c400 -d30s https://app1.yourdomain.com

# Results show:
# - Requests/sec
# - Latency distribution
# - Error rate
```

### Using Apache Bench

```bash
# Install
apt-get install apache2-utils

# Test
ab -n 10000 -c 100 https://app1.yourdomain.com/

# Results show:
# - Requests per second
# - Time per request
# - Transfer rate
```

### Using k6

```javascript
// script.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 0 },
  ],
};

export default function () {
  let res = http.get('https://app1.yourdomain.com');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

Run: `k6 run script.js`

## Disaster Recovery

### Recovery Time Objective (RTO)

Target: < 15 minutes

### Recovery Point Objective (RPO)

Target: < 1 hour (with hourly database backups)

### Recovery Procedure

1. **Database Failure**
   ```bash
   # Restore from backup
   gunzip < backup_YYYYMMDD_HHMMSS.sql.gz | psql $DATABASE_URL
   
   # Restart services
   docker-compose restart
   ```

2. **HAProxy Failure**
   ```bash
   # Check logs
   docker logs haproxy-dynamic-proxy
   
   # Restart service
   docker-compose restart haproxy-dynamic-proxy
   
   # If container corrupt, rebuild
   docker-compose down
   docker-compose build
   docker-compose up -d
   ```

3. **Complete System Failure**
   ```bash
   # On new server:
   # 1. Install Docker
   # 2. Clone repository
   # 3. Restore database from backup
   # 4. Start services
   docker-compose up -d
   ```

## Maintenance

### Regular Tasks

**Daily:**
- Check logs for errors
- Monitor resource usage
- Verify backups completed

**Weekly:**
- Review HAProxy stats
- Check for security updates
- Analyze performance metrics

**Monthly:**
- Update dependencies
- Review and rotate passwords
- Test disaster recovery
- Capacity planning review

### Update Procedure

```bash
# 1. Backup current state
docker-compose exec postgres pg_dump -U haproxy_user haproxy_db > backup_pre_update.sql

# 2. Pull latest code
git pull origin main

# 3. Review changes
git log --oneline -10

# 4. Update dependencies
npm install

# 5. Run migrations
docker-compose exec haproxy-dynamic-proxy npx prisma migrate deploy

# 6. Rebuild and restart
docker-compose build
docker-compose up -d

# 7. Verify
docker-compose ps
docker-compose logs -f
curl -u admin:password http://localhost:8404/stats
```

## Cost Optimization

### Cloud Provider Recommendations

**AWS:**
- EC2: t3.medium or t3.large
- RDS: db.t3.small PostgreSQL
- ELB: Not needed (HAProxy handles it)
- Estimated: $100-200/month

**GCP:**
- Compute Engine: n1-standard-2
- Cloud SQL: db-f1-micro PostgreSQL
- Load Balancer: Not needed
- Estimated: $80-150/month

**Azure:**
- VM: Standard B2s
- Azure Database: Basic tier
- Load Balancer: Not needed
- Estimated: $90-180/month

### Optimization Tips

1. Use reserved instances (40-60% savings)
2. Auto-scaling for variable load
3. Managed database services
4. CDN for static content
5. Compression enabled

## Support Contacts

- **On-Call Engineer**: [Your contact info]
- **Database Admin**: [DBA contact]
- **Network Team**: [Network contact]
- **Security Team**: [Security contact]

## Additional Resources

- [Architecture Documentation](ARCHITECTURE.md)
- [Testing Guide](TESTING.md)
- [Migration Guide](MIGRATION.md)
- [FAQ](FAQ.md)
- [HAProxy Documentation](http://www.haproxy.org/documentation.html)
