# Migration Guide: Nginx to HAProxy

This guide helps you migrate from the Nginx-based SNI proxy to the HAProxy-based multi-protocol proxy.

## Overview of Changes

### What's New

✅ **Multi-Protocol Support**: Beyond HTTPS, now supports SSH, PostgreSQL, MySQL, Redis, and generic TCP  
✅ **Port-Based Routing**: Each service can have its own public port  
✅ **Enhanced Configuration**: More granular control over timeouts and connections  
✅ **Built-in Stats**: HAProxy stats dashboard on port 8404  
✅ **Better Health Checks**: Per-backend health monitoring  

### Breaking Changes

⚠️ **Database Schema**: New fields added to `reverse_proxy` table  
⚠️ **Configuration Format**: HAProxy uses different syntax than Nginx  
⚠️ **Port Exposure**: Need to expose additional port ranges for non-HTTP protocols  

## Migration Steps

### 1. Backup Current System

```bash
# Backup Nginx configuration
cp -r /etc/nginx /etc/nginx.backup.$(date +%Y%m%d)

# Backup database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Backup Docker volumes
docker run --rm -v nginx_data:/data -v $(pwd):/backup alpine tar czf /backup/nginx_data_backup.tar.gz /data
```

### 2. Update Database Schema

Run Prisma migration to update schema:

```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Create and apply migration
npx prisma migrate dev --name add_multi_protocol_support
```

Or manually run SQL:

```sql
-- Add protocol enum
CREATE TYPE "ProxyProtocol" AS ENUM (
  'HTTPS_SNI',
  'HTTP',
  'SSH',
  'POSTGRESQL',
  'MYSQL',
  'REDIS',
  'TCP_GENERIC'
);

-- Add new columns to reverse_proxy
ALTER TABLE reverse_proxy 
  ADD COLUMN protocol "ProxyProtocol" DEFAULT 'HTTPS_SNI',
  ADD COLUMN "publicPort" INTEGER,
  ADD COLUMN "maxConnections" INTEGER DEFAULT 1000,
  ADD COLUMN "timeoutConnect" INTEGER DEFAULT 5000,
  ADD COLUMN "timeoutServer" INTEGER DEFAULT 300000;

-- Add unique constraint on publicPort
ALTER TABLE reverse_proxy 
  ADD CONSTRAINT reverse_proxy_publicPort_key UNIQUE ("publicPort");

-- Add protocol index
CREATE INDEX reverse_proxy_protocol_idx ON reverse_proxy(protocol);
```

### 3. Migrate Existing Proxy Configurations

Update existing records to use new protocol field:

```sql
-- All existing HTTPS SNI proxies
UPDATE reverse_proxy 
SET protocol = 'HTTPS_SNI'
WHERE "customDomain" IS NOT NULL;

-- Set default connection settings if needed
UPDATE reverse_proxy
SET 
  "maxConnections" = 1000,
  "timeoutConnect" = 5000,
  "timeoutServer" = 300000
WHERE "maxConnections" IS NULL;
```

### 4. Add New Protocol Configurations

Add configurations for non-HTTP services:

```sql
-- Example: Add SSH proxy
INSERT INTO reverse_proxy (
  protocol,
  "publicPort",
  "targetPort",
  "targetInstanceId",
  enabled
) VALUES (
  'SSH',
  2201,
  22,
  (SELECT id FROM instance WHERE name = 'vm1'),
  true
);

-- Example: Add PostgreSQL proxy
INSERT INTO reverse_proxy (
  protocol,
  "publicPort",
  "targetPort",
  "targetInstanceId",
  enabled
) VALUES (
  'POSTGRESQL',
  5433,
  5432,
  (SELECT id FROM instance WHERE name = 'db1'),
  true
);
```

### 5. Update Environment Variables

Update `.env` file:

```bash
# Old
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
NGINX_CONFIG_PATH=/etc/nginx/sites-available/dynamic-proxy.conf

# New
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
HAPROXY_CONFIG_PATH=/etc/haproxy/haproxy.cfg
DOMAIN_SUFFIX=yourdomain.com

# Port ranges for different protocols
SSH_PORT_START=2201
SSH_PORT_END=2299
POSTGRES_PORT_START=5433
POSTGRES_PORT_END=5533
MYSQL_PORT_START=3307
MYSQL_PORT_END=3407
REDIS_PORT_START=6380
REDIS_PORT_END=6480

# HAProxy stats
STATS_PORT=8404
STATS_USERNAME=admin
STATS_PASSWORD=changeme
```

### 6. Update Docker Compose

Replace nginx service with haproxy:

```yaml
# Old
services:
  nginx-dynamic-proxy:
    build: .
    ports:
      - "80:80"
      - "443:443"

# New
services:
  haproxy-dynamic-proxy:
    build: .
    ports:
      - "80:80"                 # HTTP
      - "443:443"               # HTTPS
      - "8404:8404"             # HAProxy Stats
      - "2201-2250:2201-2250"   # SSH port range
      - "5433-5450:5433-5450"   # PostgreSQL port range
```

### 7. Stop Nginx and Start HAProxy

```bash
# Stop old Nginx container
docker-compose down

# Remove old images
docker rmi nginx-dynamic-proxy

# Build and start HAProxy
docker-compose build
docker-compose up -d

# Check logs
docker-compose logs -f haproxy-dynamic-proxy
```

### 8. Verify Migration

Check that services are working:

```bash
# Test HTTPS
curl -v https://app1.domain.com

# Test HAProxy stats
curl -u admin:changeme http://localhost:8404/stats

# Test new protocols (if configured)
ssh -p 2201 user@domain.com
psql -h localhost -p 5433 -U user dbname
```

### 9. Update Firewall Rules

Open additional ports for new protocols:

```bash
# UFW example
ufw allow 8404/tcp comment 'HAProxy Stats'
ufw allow 2201:2250/tcp comment 'SSH Range'
ufw allow 5433:5450/tcp comment 'PostgreSQL Range'
ufw allow 3307:3320/tcp comment 'MySQL Range'
ufw allow 6380:6390/tcp comment 'Redis Range'

# iptables example
iptables -A INPUT -p tcp --dport 8404 -j ACCEPT
iptables -A INPUT -p tcp --dport 2201:2250 -j ACCEPT
iptables -A INPUT -p tcp --dport 5433:5450 -j ACCEPT
```

### 10. Update DNS Records (if needed)

No changes needed for existing HTTPS/HTTP services. For new protocols:

```
# A records remain the same
app1.domain.com -> YOUR_SERVER_IP

# For documentation, you may want to add
ssh.domain.com -> YOUR_SERVER_IP
db.domain.com -> YOUR_SERVER_IP
```

## Systemd Migration

If using systemd services:

```bash
# Stop old service
systemctl stop nginx-dynamic-proxy

# Disable old service
systemctl disable nginx-dynamic-proxy

# Copy new service file
cp systemd/haproxy-dynamic-proxy.service /etc/systemd/system/

# Reload systemd
systemctl daemon-reload

# Enable new service
systemctl enable haproxy-dynamic-proxy

# Start new service
systemctl start haproxy-dynamic-proxy

# Check status
systemctl status haproxy-dynamic-proxy
```

## Rollback Procedure

If you need to rollback:

```bash
# Stop HAProxy
docker-compose down
# or
systemctl stop haproxy-dynamic-proxy

# Restore database backup
psql $DATABASE_URL < backup_YYYYMMDD.sql

# Restore Nginx configuration
cp -r /etc/nginx.backup.YYYYMMDD/* /etc/nginx/

# Start Nginx
docker-compose -f docker-compose.nginx.yml up -d
# or
systemctl start nginx-dynamic-proxy
```

## Configuration Mapping

### Nginx to HAProxy Equivalents

| Nginx Directive | HAProxy Equivalent | Notes |
|----------------|-------------------|-------|
| `upstream` | `backend` | Server pool definition |
| `server` (in location) | `server` (in backend) | Backend server |
| `proxy_pass` | `use_backend` | Routing decision |
| `ssl_preread` | `tcp-request inspect-delay` | SNI inspection |
| `proxy_protocol` | `send-proxy` | PROXY protocol support |
| `proxy_timeout` | `timeout server` | Backend timeout |

### Protocol-Specific Migration

#### HTTPS SNI
```nginx
# Nginx
map $ssl_preread_server_name $backend {
    app1.domain.com app1_backend;
    app2.domain.com app2_backend;
}
```

```haproxy
# HAProxy
acl app1_sni req_ssl_sni -i app1.domain.com
acl app2_sni req_ssl_sni -i app2.domain.com
use_backend https_app1 if app1_sni
use_backend https_app2 if app2_sni
```

#### HTTP Host-Based
```nginx
# Nginx
server {
    server_name www.domain.com;
    location / {
        proxy_pass http://backend1;
    }
}
```

```haproxy
# HAProxy
acl www_host hdr(host) -i www.domain.com
use_backend http_www if www_host
```

## Testing After Migration

Run comprehensive tests:

```bash
# Test all HTTPS domains
for domain in app1.domain.com app2.domain.com api.domain.com; do
  echo "Testing $domain..."
  curl -s -o /dev/null -w "%{http_code}" https://$domain
done

# Test SSH ports
for port in 2201 2202 2203; do
  echo "Testing SSH port $port..."
  nc -zv localhost $port
done

# Test database ports
for port in 5433 5434; do
  echo "Testing PostgreSQL port $port..."
  pg_isready -h localhost -p $port
done
```

## Common Issues and Solutions

### Issue: "Address already in use"

**Cause**: Nginx still running or port conflict

**Solution**:
```bash
# Find process using port
lsof -i :443
netstat -tulpn | grep :443

# Kill process
kill <PID>

# Or stop all nginx processes
pkill nginx
```

### Issue: SNI routing not working

**Cause**: Missing `tcp-request inspect-delay`

**Solution**: Ensure HAProxy config includes:
```
tcp-request inspect-delay 5s
tcp-request content accept if { req_ssl_hello_type 1 }
```

### Issue: Database triggers not firing

**Cause**: Triggers not recreated after schema change

**Solution**:
```bash
psql $DATABASE_URL < sql/setup-db-triggers.sql
```

### Issue: Permission denied on HAProxy config

**Cause**: File permissions or directory doesn't exist

**Solution**:
```bash
mkdir -p /etc/haproxy
chown -R haproxy:haproxy /etc/haproxy
chmod 644 /etc/haproxy/haproxy.cfg
```

## Performance Comparison

### Expected Improvements

- **Better TCP Performance**: HAProxy is optimized for TCP load balancing
- **Lower Memory Usage**: HAProxy is more memory-efficient than Nginx for pure TCP proxying
- **Better Connection Handling**: HAProxy handles persistent connections more efficiently
- **Enhanced Monitoring**: Built-in stats provide better visibility

### Benchmarking

```bash
# Before (Nginx)
wrk -t4 -c100 -d30s https://app1.domain.com

# After (HAProxy)
wrk -t4 -c100 -d30s https://app1.domain.com

# Compare results
```

## Support

If you encounter issues during migration:

1. Check logs: `docker logs haproxy-dynamic-proxy` or `journalctl -u haproxy-dynamic-proxy`
2. Verify configuration: `haproxy -c -f /etc/haproxy/haproxy.cfg`
3. Check database connectivity: `psql $DATABASE_URL`
4. Review HAProxy stats: `http://localhost:8404/stats`

## Additional Resources

- [HAProxy Documentation](http://www.haproxy.org/documentation.html)
- [HAProxy Configuration Manual](http://cbonte.github.io/haproxy-dconv/)
- [Nginx to HAProxy Migration Guide](https://www.haproxy.com/blog/nginx-to-haproxy-migration-guide/)
