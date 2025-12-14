# Quick Start Guide

Get up and running with HAProxy Dynamic Multi-Protocol Proxy in 5 minutes.

## Prerequisites

- Docker & Docker Compose installed
- Domain name pointing to your server (or /etc/hosts configured)

## Step 1: Clone and Configure

```bash
# Clone repository
git clone https://github.com/yourusername/haproxy-dynamic-proxy.git
cd haproxy-dynamic-proxy

# Copy environment file
cp .env.example .env

# Edit .env (optional - defaults work for testing)
nano .env
```

## Step 2: Start Services

```bash
# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f
```

Wait for the message: `"✅ Connected to PostgreSQL database"`

## Step 3: Initialize Database

```bash
# Run migrations
docker-compose exec haproxy-dynamic-proxy npx prisma migrate deploy

# Verify tables exist
docker-compose exec postgres psql -U haproxy_user -d haproxy_db -c "\dt"
```

## Step 4: Add Your First Proxy

### Using Prisma Studio (Web UI)

```bash
# Open Prisma Studio
docker-compose exec haproxy-dynamic-proxy npx prisma studio
```

Then:
1. Navigate to `instance` table
2. Add a record:
   - name: `web-server-1`
   - ipAddress: `192.168.1.10` (your backend IP)
   - state: `ACTIVE`
   - vmStatus: `RUNNING`
3. Navigate to `reverse_proxy` table
4. Add a record:
   - protocol: `HTTPS_SNI`
   - targetPort: `443`
   - targetInstanceId: Select your instance
   - customDomain: `app1.yourdomain.com`
   - enabled: `true`

### Using SQL

```bash
docker-compose exec postgres psql -U haproxy_user -d haproxy_db

# In psql:
INSERT INTO instance (name, "ipAddress", state, "vmStatus")
VALUES ('web-server-1', '192.168.1.10', 'ACTIVE', 'RUNNING');

INSERT INTO reverse_proxy (
  protocol,
  "targetPort",
  "targetInstanceId",
  "customDomain",
  enabled
) VALUES (
  'HTTPS_SNI',
  443,
  (SELECT id FROM instance WHERE name = 'web-server-1'),
  'app1.yourdomain.com',
  true
);

\q
```

## Step 5: Verify Configuration

```bash
# Check HAProxy configuration was generated
docker-compose exec haproxy-dynamic-proxy cat /etc/haproxy/haproxy.cfg

# Should see your domain in the config
docker-compose exec haproxy-dynamic-proxy grep "app1.yourdomain.com" /etc/haproxy/haproxy.cfg
```

## Step 6: Test Your Proxy

### Test HTTPS (with SNI)

```bash
# If you have DNS configured
curl -v https://app1.yourdomain.com

# Without DNS (using /etc/hosts or direct IP)
curl -v --resolve app1.yourdomain.com:443:YOUR_SERVER_IP https://app1.yourdomain.com
```

### Access HAProxy Stats

Open in browser: `http://YOUR_SERVER_IP:8404/stats`

- Username: `admin`
- Password: `changeme`

## Additional Examples

### Add SSH Proxy

```sql
docker-compose exec postgres psql -U haproxy_user -d haproxy_db

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
  (SELECT id FROM instance WHERE name = 'web-server-1'),
  true
);
```

Test:
```bash
ssh -p 2201 user@YOUR_SERVER_IP
```

### Add PostgreSQL Proxy

```sql
-- Add database instance
INSERT INTO instance (name, "ipAddress", state, "vmStatus")
VALUES ('postgres-server', '192.168.1.20', 'ACTIVE', 'RUNNING');

-- Add proxy
INSERT INTO reverse_proxy (
  protocol,
  "publicPort",
  "targetPort",
  "targetInstanceId",
  "maxConnections",
  enabled
) VALUES (
  'POSTGRESQL',
  5433,
  5432,
  (SELECT id FROM instance WHERE name = 'postgres-server'),
  200,
  true
);
```

Test:
```bash
psql -h YOUR_SERVER_IP -p 5433 -U user dbname
```

## Troubleshooting

### Services won't start

```bash
# Check logs
docker-compose logs

# Check port conflicts
sudo netstat -tuln | grep -E ':(80|443|5432)'

# Restart services
docker-compose restart
```

### Configuration not updating

```bash
# Check database watcher is running
docker-compose logs haproxy-dynamic-proxy | grep "Listening"

# Manually regenerate configuration
docker-compose exec haproxy-dynamic-proxy node dist/generate-haproxy-config.js --reload
```

### Can't connect to backend

```bash
# From HAProxy container, test backend connectivity
docker-compose exec haproxy-dynamic-proxy nc -zv 192.168.1.10 443

# Check instance state in database
docker-compose exec postgres psql -U haproxy_user -d haproxy_db -c \
  "SELECT * FROM instance WHERE state = 'ACTIVE';"
```

## Next Steps

- Read the [full documentation](README.md)
- Check [testing guide](docs/TESTING.md) for more examples
- Review [migration guide](docs/MIGRATION.md) if migrating from Nginx
- Explore [configuration examples](examples/)

## Useful Commands

```bash
# View logs
docker-compose logs -f haproxy-dynamic-proxy

# Restart proxy
docker-compose restart haproxy-dynamic-proxy

# Access HAProxy container
docker-compose exec haproxy-dynamic-proxy sh

# Access database
docker-compose exec postgres psql -U haproxy_user -d haproxy_db

# Regenerate config
docker-compose exec haproxy-dynamic-proxy node dist/generate-haproxy-config.js --reload

# Check HAProxy status
docker-compose exec haproxy-dynamic-proxy ps aux | grep haproxy

# View HAProxy config
docker-compose exec haproxy-dynamic-proxy cat /etc/haproxy/haproxy.cfg
```

## Production Checklist

Before deploying to production:

- [ ] Change default passwords in `.env`
- [ ] Configure proper domain names
- [ ] Setup SSL certificates on backend servers
- [ ] Configure firewall rules
- [ ] Setup monitoring and alerting
- [ ] Configure backup strategy for database
- [ ] Review and adjust port ranges
- [ ] Review and adjust connection limits
- [ ] Enable HTTPS for stats page (if exposed)
- [ ] Configure log rotation
- [ ] Test failover scenarios
- [ ] Document your infrastructure

## Support

- [Full Documentation](README.md)
- [GitHub Issues](https://github.com/yourusername/haproxy-dynamic-proxy/issues)
- [Testing Guide](docs/TESTING.md)

Happy proxying! 🚀
