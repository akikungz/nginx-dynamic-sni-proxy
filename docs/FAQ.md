# Frequently Asked Questions (FAQ)

## General Questions

### What is HAProxy Dynamic Multi-Protocol Proxy?

A database-driven reverse proxy system that uses HAProxy to route multiple protocols (HTTPS, SSH, PostgreSQL, MySQL, Redis, etc.) to backend servers. Configuration is stored in PostgreSQL and automatically reloaded when changed.

### Why use this instead of manual HAProxy configuration?

- **Dynamic**: Add/remove services without editing config files
- **Database-Driven**: Centralized configuration management
- **Automatic Updates**: Changes apply automatically via LISTEN/NOTIFY
- **Multi-Protocol**: One system for all TCP-based protocols
- **Version Control**: Database changes are auditable
- **API-Ready**: Easy to build management UIs

### How does it differ from Nginx?

- **Better TCP Performance**: HAProxy is optimized for TCP load balancing
- **Multi-Protocol Native**: Built for more than just HTTP/HTTPS
- **Health Checking**: More robust backend health monitoring
- **Stats Dashboard**: Built-in real-time statistics
- **Connection Handling**: Better persistent connection management

## Setup and Installation

### What are the system requirements?

- Node.js 20+
- PostgreSQL 14+
- HAProxy 2.4+
- Docker & Docker Compose (for containerized deployment)
- Linux (tested on Ubuntu 22.04, Alpine, Debian)

### Can I run this on Windows?

Yes, via Docker Desktop or WSL2. Native Windows installation is not recommended due to HAProxy limitations on Windows.

### Do I need Docker?

No, but it's recommended. You can install Node.js, PostgreSQL, and HAProxy directly and run as systemd services.

### How do I upgrade from an older version?

1. Backup database: `pg_dump > backup.sql`
2. Pull latest code
3. Run migrations: `npx prisma migrate deploy`
4. Restart services: `docker-compose restart`

## Configuration

### How do I add a new HTTPS domain?

```sql
-- Add instance (if not exists)
INSERT INTO instance (name, "ipAddress", state, "vmStatus")
VALUES ('web-server', '192.168.1.10', 'ACTIVE', 'RUNNING');

-- Add HTTPS proxy
INSERT INTO reverse_proxy (
  protocol, "targetPort", "targetInstanceId", "customDomain", enabled
) VALUES (
  'HTTPS_SNI', 443, 
  (SELECT id FROM instance WHERE name = 'web-server'),
  'newapp.domain.com', true
);
```

Configuration updates automatically within seconds.

### How do I add SSH access to a server?

```sql
INSERT INTO reverse_proxy (
  protocol, "publicPort", "targetPort", "targetInstanceId", enabled
) VALUES (
  'SSH', 2201, 22,
  (SELECT id FROM instance WHERE name = 'web-server'),
  true
);
```

Then connect: `ssh -p 2201 user@your-server.com`

### Can I use custom ports for protocols?

Yes! Set `publicPort` to any available port (respecting port ranges in `.env`).

### How do I disable a proxy temporarily?

```sql
UPDATE reverse_proxy SET enabled = false WHERE id = <proxy_id>;
```

Re-enable: `UPDATE reverse_proxy SET enabled = true WHERE id = <proxy_id>;`

### Can I route multiple domains to the same backend?

Yes, create multiple reverse_proxy entries with different `customDomain` values pointing to the same `targetInstanceId`.

### How do I change connection limits?

```sql
UPDATE reverse_proxy 
SET "maxConnections" = 2000 
WHERE id = <proxy_id>;
```

### How do I adjust timeouts?

```sql
UPDATE reverse_proxy 
SET 
  "timeoutConnect" = 10000,  -- 10 seconds
  "timeoutServer" = 600000   -- 10 minutes
WHERE id = <proxy_id>;
```

Timeouts are in milliseconds.

## Protocols

### What protocols are supported?

- **HTTPS_SNI**: HTTPS with SNI routing (port 443)
- **HTTP**: Plain HTTP with host routing (port 80)
- **SSH**: Secure Shell (ports 2201-2299)
- **POSTGRESQL**: PostgreSQL database (ports 5433-5533)
- **MYSQL**: MySQL database (ports 3307-3407)
- **REDIS**: Redis cache/queue (ports 6380-6480)
- **TCP_GENERIC**: Any TCP protocol (custom ports)

### Can I add support for new protocols?

Yes! Add a new value to the `ProxyProtocol` enum in `prisma/schema.prisma`, configure port ranges in `.env`, and update the config generator if needed.

### Does it support UDP?

No, HAProxy focuses on TCP/HTTP. UDP requires different tooling (e.g., nginx stream module, socat).

### Can I use WebSocket connections?

Yes! HTTPS_SNI and HTTP protocols support WebSocket. HAProxy passes through the upgrade headers.

### Does it support HTTP/2 or HTTP/3?

HTTP/2 works via SSL passthrough (backend handles it). HTTP/3 (QUIC) is not supported as it uses UDP.

## SSL/TLS

### Do I need SSL certificates on the proxy?

No! SSL passthrough mode is used. Certificates are managed on backend servers.

### Can I terminate SSL on HAProxy?

Not with the default configuration, but HAProxy supports SSL termination. You'd need to modify the config generator to add certificate paths.

### How does SNI routing work?

HAProxy inspects the TLS handshake (without decrypting) to read the SNI field, then routes to the appropriate backend based on the domain name.

### What if a client doesn't send SNI?

The connection will fail or route to a default backend (if configured). Modern browsers always send SNI.

### Can I force HTTPS redirect?

Yes, but you need to configure it on the backend server or add HTTP→HTTPS redirect rules in HAProxy config generator.

## Performance

### How many connections can it handle?

HAProxy can handle 40,000+ concurrent connections per instance. Limits depend on:
- Server hardware (CPU, RAM, network)
- Backend server capacity
- Configuration (`maxConnections`, `maxconn`)

### What's the latency overhead?

Typically <1ms for HAProxy processing. Total latency depends on:
- Network latency to backend
- Backend processing time
- Connection pooling settings

### Can I run multiple HAProxy instances?

Yes! Use DNS round-robin or an L4 load balancer to distribute traffic across multiple HAProxy instances sharing the same database.

### How often is configuration reloaded?

Immediately when database changes occur (via LISTEN/NOTIFY). Debouncing prevents rapid consecutive reloads.

### Does reload cause downtime?

No! HAProxy performs graceful reloads:
- New connections use new config
- Existing connections continue with old config
- Zero dropped connections

## Monitoring

### How do I access the stats page?

Navigate to: `http://your-server:8404/stats`

Default credentials: `admin` / `changeme` (configure in `.env`)

### What metrics are available?

- Connection counts (current, total)
- Error rates (4xx, 5xx)
- Backend server health
- Response times
- Queue depths
- Session information

### Can I export metrics to Prometheus?

Not built-in, but you can:
1. Use HAProxy Prometheus exporter
2. Parse stats page
3. Add custom metrics endpoint

### How do I monitor database watcher?

Check logs:
```bash
docker logs -f haproxy-dynamic-proxy
# or
journalctl -u haproxy-dynamic-proxy -f
```

Look for: `"✅ Connected to PostgreSQL database"` and `"👂 Listening for configuration changes"`

### What if config generation fails?

- Check logs for errors
- Verify database connectivity
- Check HAProxy syntax: `haproxy -c -f /etc/haproxy/haproxy.cfg`
- Existing config continues running

## Troubleshooting

### Configuration not updating

**Possible causes:**
- Database watcher not running
- Database triggers not installed
- PostgreSQL NOTIFY not working

**Solutions:**
```bash
# Check watcher is running
docker logs haproxy-dynamic-proxy | grep "Listening"

# Check triggers exist
psql $DATABASE_URL -c "SELECT * FROM pg_trigger WHERE tgname LIKE '%config%';"

# Reinstall triggers
psql $DATABASE_URL < sql/setup-db-triggers.sql

# Manually regenerate
docker exec haproxy-dynamic-proxy node dist/generate-haproxy-config.js --reload
```

### Connection refused errors

**Possible causes:**
- Backend server not reachable
- Instance not ACTIVE/RUNNING
- Proxy not enabled
- Port not exposed

**Solutions:**
```bash
# Test backend from HAProxy container
docker exec haproxy-dynamic-proxy nc -zv 192.168.1.10 443

# Check instance state
psql $DATABASE_URL -c "SELECT * FROM instance WHERE state = 'ACTIVE';"

# Check proxy state
psql $DATABASE_URL -c "SELECT * FROM reverse_proxy WHERE enabled = true;"

# Check ports
docker port haproxy-dynamic-proxy
```

### HAProxy won't start

**Possible causes:**
- Invalid configuration
- Port already in use
- Permission issues

**Solutions:**
```bash
# Test config
haproxy -c -f /etc/haproxy/haproxy.cfg

# Check port conflicts
netstat -tuln | grep -E ':(80|443)'

# Check permissions
ls -la /etc/haproxy/haproxy.cfg
```

### High memory usage

**Possible causes:**
- Too many concurrent connections
- Memory leak in application
- Large connection buffers

**Solutions:**
```bash
# Check HAProxy stats
curl -u admin:changeme http://localhost:8404/stats

# Reduce maxconn in HAProxy global section
# Reduce maxConnections per backend

# Restart services
docker-compose restart
```

### SSL certificate errors

**Possible causes:**
- Certificate not valid for SNI domain
- Certificate expired
- Backend not serving correct certificate

**Solutions:**
```bash
# Check certificate
openssl s_client -connect domain.com:443 -servername app1.domain.com

# Verify SNI routing
curl -v --resolve app1.domain.com:443:YOUR_IP https://app1.domain.com

# Check backend certificate
openssl s_client -connect 192.168.1.10:443 -servername app1.domain.com
```

## Database

### Can I use an external PostgreSQL server?

Yes! Set `DATABASE_URL` to point to your PostgreSQL server. Ensure network connectivity and firewall rules allow access.

### How do I backup the database?

```bash
# Full backup
pg_dump $DATABASE_URL > backup.sql

# Schema only
pg_dump -s $DATABASE_URL > schema.sql

# Data only
pg_dump -a $DATABASE_URL > data.sql
```

### Can I use PostgreSQL read replicas?

The watcher must connect to the primary (for LISTEN/NOTIFY). Config generation can use read replicas if modified.

### How do I migrate to a different database?

```bash
# Export from old database
pg_dump $OLD_DATABASE_URL > migration.sql

# Import to new database
psql $NEW_DATABASE_URL < migration.sql

# Update DATABASE_URL
# Restart services
```

### What happens if database goes down?

- Config updates stop
- Existing HAProxy config continues working
- Database watcher reconnects automatically when database returns

## Security

### How secure is this system?

- **SQL Injection**: Protected by Prisma ORM
- **SSL/TLS**: End-to-end encryption via passthrough
- **Secrets**: Stored in environment variables
- **Stats Page**: Basic authentication required
- **Database**: Standard PostgreSQL security applies

### Should I expose the stats page publicly?

No! Use firewall rules or VPN to restrict access. If exposed, use strong passwords and consider HTTPS.

### How do I secure the database?

- Use strong passwords
- Enable SSL connections
- Restrict network access
- Regular backups
- Monitor access logs

### Can I integrate with OAuth/SSO?

Not directly, but you can:
1. Build a management UI with OAuth
2. UI updates database
3. Changes apply automatically

### Is it safe to run as root?

No! HAProxy runs as `haproxy:haproxy` user. Only initial bind to ports <1024 requires elevated privileges.

## Development

### How do I contribute?

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

### How do I add a new protocol?

1. Add to `ProxyProtocol` enum in `prisma/schema.prisma`
2. Add port range to `.env.example`
3. Update `src/generate-haproxy-config.ts` to handle new protocol
4. Update documentation
5. Submit pull request

### Can I use this in production?

Yes! It's designed for production use. Ensure:
- Proper monitoring
- Regular backups
- Security hardening
- Load testing
- Disaster recovery plan

### How do I run tests?

```bash
# Build
npm run build

# Manual testing
npm run generate-haproxy-config

# Integration testing
See docs/TESTING.md
```

### Is there a management UI?

Not yet, but it's on the roadmap. Currently use:
- Prisma Studio: `npx prisma studio`
- SQL clients
- psql command line

## Deployment

### Can I deploy on Kubernetes?

Yes! Create Deployment and Service manifests. See [Architecture docs](ARCHITECTURE.md) for patterns.

### What about AWS/GCP/Azure?

Works on all cloud providers. Use managed PostgreSQL services (RDS, Cloud SQL, Azure Database).

### Can I use Docker Swarm?

Yes! Use `docker stack deploy` with docker-compose.yml.

### How do I handle updates?

1. Pull latest code
2. Run migrations
3. Rebuild Docker image
4. Rolling restart services

### What's the recommended backup strategy?

- **Database**: Automated daily backups
- **Config Files**: Version control (Git)
- **HAProxy Config**: Automatic backups before regeneration
- **Logs**: Centralized logging (ELK, Splunk)

## Limitations

### What are the current limitations?

- No built-in web UI
- No certificate automation (Let's Encrypt)
- No UDP support
- No rate limiting (yet)
- No geographic routing
- Stats page is basic (no Prometheus yet)

### What's on the roadmap?

- [ ] Web UI for management
- [ ] Prometheus metrics export
- [ ] Rate limiting
- [ ] Geographic routing
- [ ] Auto-scaling
- [ ] Certificate automation
- [ ] WebSocket enhancements
- [ ] gRPC support

## Support

### Where can I get help?

- **Documentation**: Read docs in `/docs` directory
- **GitHub Issues**: Report bugs or request features
- **GitHub Discussions**: Ask questions
- **Stack Overflow**: Tag `haproxy` + `prisma`

### How do I report a bug?

Open a GitHub issue with:
- Description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Environment details
- Relevant logs
- Configuration (sanitized)

### How do I request a feature?

Open a GitHub issue with:
- Clear description
- Use case
- Proposed solution
- Alternative solutions
- Impact on existing functionality

## Licensing

### What's the license?

MIT License - see [LICENSE](../LICENSE) file.

### Can I use this commercially?

Yes! MIT license allows commercial use.

### Do I need to credit the project?

Appreciated but not required by the license.

### Can I modify the code?

Yes! Fork and modify as needed. Consider contributing improvements back to the community.
