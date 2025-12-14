# nginx-dynamic-sni-proxy

Dynamic Nginx SNI (Server Name Indication) proxy with database-driven configuration using Prisma and PostgreSQL. Automatically generates and updates Nginx stream configurations based on database changes, enabling dynamic routing of TLS connections to backend servers.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Docker Deployment](#docker-deployment)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Overview

This project provides a database-driven Nginx SNI proxy that automatically routes incoming TLS connections to backend servers based on the SNI hostname. The configuration is dynamically generated from a PostgreSQL database, and changes are detected in real-time using either polling or PostgreSQL's LISTEN/NOTIFY mechanism.

### Use Cases

- Multi-tenant hosting with automatic routing
- Dynamic service discovery for containerized applications
- Proxmox VE integration for VM-based services
- Zero-downtime configuration updates
- Centralized proxy management via database

## Architecture

```
┌─────────────┐
│   Clients   │
│  (TLS/SSL)  │
└──────┬──────┘
       │ SNI Hostname
       ▼
┌─────────────────────────────────────┐
│  Nginx SNI Proxy (Port 443)         │
│  ┌───────────────────────────────┐  │
│  │  SSL Preread (No Termination) │  │
│  │  - Reads SNI hostname          │  │
│  │  - Routes to backend           │  │
│  └───────────────────────────────┘  │
└──────┬──────────────────────────────┘
       │
       ├──► Backend 1 (192.168.1.100:443)
       ├──► Backend 2 (192.168.1.101:443)
       └──► Backend N (192.168.1.102:8443)

┌─────────────────────────────────────┐
│  Configuration Management           │
│  ┌───────────────────────────────┐  │
│  │  PostgreSQL Database          │  │
│  │  - reverse_proxy              │  │
│  │  - instance                   │  │
│  │  - pve_vm                     │  │
│  │  - ip_address                 │  │
│  └──────┬────────────────────────┘  │
│         │ Triggers (NOTIFY)         │
│         ▼                            │
│  ┌───────────────────────────────┐  │
│  │  Change Watcher               │  │
│  │  - Polling / LISTEN/NOTIFY    │  │
│  └──────┬────────────────────────┘  │
│         │                            │
│         ▼                            │
│  ┌───────────────────────────────┐  │
│  │  Config Generator             │  │
│  │  - Fetch from DB              │  │
│  │  - Generate nginx.conf        │  │
│  │  - Test & Reload              │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Features

- ✅ **Database-Driven Configuration**: All proxy rules stored in PostgreSQL
- ✅ **Real-Time Updates**: Automatic config regeneration on database changes
- ✅ **Two Watch Modes**: 
  - Polling-based (watch-database-changes)
  - PostgreSQL LISTEN/NOTIFY (watch-database-notify)
- ✅ **SNI-Based Routing**: Routes TLS traffic based on hostname without SSL termination
- ✅ **Safe Updates**: 
  - Automatic configuration backup
  - nginx -t validation before applying
  - Automatic rollback on failure
- ✅ **Proxmox VE Integration**: Built-in support for Proxmox VM instances
- ✅ **Docker Support**: Complete Docker and docker-compose setup
- ✅ **Systemd Service**: Production-ready systemd unit file
- ✅ **Health Checks**: Built-in health monitoring
- ✅ **Logging**: Comprehensive logging with configurable levels
- ✅ **Bun Compatible**: Works with both Node.js and Bun runtimes

## Prerequisites

### For Local Development

- **Node.js**: v18.0.0 or higher (or **Bun**: v1.0.0 or higher)
- **PostgreSQL**: v14.0 or higher
- **Nginx**: v1.23.0 or higher (with stream module)
- **npm**: v9.0.0 or higher (or **bun** if using Bun runtime)

### For Docker Deployment

- **Docker**: v20.10.0 or higher
- **Docker Compose**: v2.0.0 or higher

## Installation

### Local Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/akikungz/nginx-dynamic-sni-proxy.git
   cd nginx-dynamic-sni-proxy
   ```

2. **Install dependencies**:
   
   Using npm:
   ```bash
   npm install
   ```
   
   Using Bun:
   ```bash
   bun install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials and settings
   ```

4. **Setup database**:
   ```bash
   # Create database
   createdb nginx_sni_proxy

   # Run Prisma migrations
   npx prisma migrate dev
   # Or with Bun: bunx prisma migrate dev

   # Generate Prisma client
   npx prisma generate
   # Or with Bun: bunx prisma generate

   # Setup triggers (optional, for LISTEN/NOTIFY)
   psql $DATABASE_URL -f sql/setup-db-triggers.sql
   ```

5. **Build TypeScript**:
   
   Using npm:
   ```bash
   npm run build
   ```
   
   Using Bun:
   ```bash
   bun run build
   ```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/nginx_sni_proxy

# Application Environment
NODE_ENV=production

# Nginx Configuration
NGINX_CONFIG_PATH=/etc/nginx/nginx.conf
DOMAIN_SUFFIX=example.com

# Logging
LOG_LEVEL=info

# Optional: For polling watcher
POLL_INTERVAL=30000

# Optional: For LISTEN/NOTIFY watcher
DEBOUNCE_DELAY=5000
```

### Database Schema

The system uses four main tables:

1. **instance**: Service instances
2. **pve_vm**: Proxmox VE virtual machines
3. **ip_address**: IP addresses for VMs
4. **reverse_proxy**: Proxy rules linking instances to subdomains

Example data:

```sql
-- Insert IP address
INSERT INTO ip_address (id, address, type) 
VALUES ('uuid1', '192.168.1.100', 'ipv4');

-- Insert Proxmox VM
INSERT INTO pve_vm (id, "vmId", name, node, status, "ipAddressId")
VALUES ('uuid2', 100, 'web-server', 'pve-node1', 'RUNNING', 'uuid1');

-- Insert instance
INSERT INTO instance (id, name, status, "pveVmId")
VALUES ('uuid3', 'web-app', 'ACTIVE', 'uuid2');

-- Insert reverse proxy rule
INSERT INTO reverse_proxy (id, "instanceId", subdomain, "targetPort", protocol, enabled)
VALUES ('uuid4', 'uuid3', 'web', 443, 'HTTPS', true);
```

This creates a proxy rule: `web.example.com:443` → `192.168.1.100:443`

## Usage

### Generate Configuration Manually

Using npm:
```bash
npm run generate-config
```

Using Bun:
```bash
bun run generate-config
```

This will:
1. Fetch active proxy rules from the database
2. Generate Nginx configuration
3. Backup existing config
4. Test new config with `nginx -t`
5. Reload Nginx if test passes

### Start Database Watcher (Polling)

Using npm:
```bash
npm run watch-polling
```

Using Bun:
```bash
bun run watch-polling
```

Polls the database every 30 seconds (configurable) for changes.

### Start Database Watcher (LISTEN/NOTIFY)

Using npm:
```bash
npm run watch-notify
```

Using Bun:
```bash
bun run watch-notify
```

Uses PostgreSQL triggers for real-time notifications. Requires triggers to be installed.

### Using Built Application

Using npm/Node.js:
```bash
npm run build
npm start  # Runs generate-config
node dist/watch-database-changes.js  # Polling watcher
node dist/watch-database-notify.js   # NOTIFY watcher
```

Using Bun:
```bash
bun run build
bun run start  # Runs generate-config
bun dist/watch-database-changes.js  # Polling watcher
bun dist/watch-database-notify.js   # NOTIFY watcher
```

## Docker Deployment

### Quick Start

1. **Clone and configure**:
   ```bash
   git clone https://github.com/akikungz/nginx-dynamic-sni-proxy.git
   cd nginx-dynamic-sni-proxy
   ```

2. **Update docker-compose.yml** with your settings (database credentials, domain suffix, etc.)

3. **Start services**:
   ```bash
   docker-compose up -d
   ```

4. **Check logs**:
   ```bash
   docker-compose logs -f nginx-dynamic-sni
   ```

### Docker Services

The docker-compose setup includes:

- **postgres**: PostgreSQL database
- **nginx-dynamic-sni**: Nginx proxy with config generator and watcher

### Accessing the Database

```bash
# Using docker-compose
docker-compose exec postgres psql -U nginx_user -d nginx_sni_proxy

# Direct connection
psql postgresql://nginx_user:nginx_password@localhost:5432/nginx_sni_proxy
```

### Viewing Nginx Configuration

```bash
docker-compose exec nginx-dynamic-sni cat /etc/nginx/nginx.conf
```

## Testing

### Test SNI Routing with OpenSSL

```bash
# Test specific hostname
openssl s_client -connect <proxy-ip>:443 -servername web.example.com

# Check SNI in verbose mode
openssl s_client -connect <proxy-ip>:443 -servername web.example.com -showcerts

# Test multiple hosts
for host in web api app; do
  echo "Testing $host.example.com"
  openssl s_client -connect localhost:443 -servername $host.example.com < /dev/null
done
```

### Test with curl (if backend supports HTTP)

```bash
curl -k --resolve web.example.com:443:<proxy-ip> https://web.example.com
```

### Verify Database Triggers

```bash
# Listen for notifications
psql $DATABASE_URL -c "LISTEN reverse_proxy_changes;"

# In another terminal, make a change
psql $DATABASE_URL -c "UPDATE reverse_proxy SET enabled = true WHERE id = 'some-id';"
```

### Health Check

```bash
# Check Nginx status
nginx -t

# Check service status (systemd)
systemctl status nginx-dynamic-sni

# Check Docker health
docker-compose ps
```

## Troubleshooting

### Configuration Not Updating

1. **Check watcher is running**:
   ```bash
   ps aux | grep watch-database
   # Or for Docker:
   docker-compose logs nginx-dynamic-sni
   ```

2. **Verify database connection**:
   ```bash
   psql $DATABASE_URL -c "SELECT 1;"
   ```

3. **Check triggers (for NOTIFY watcher)**:
   ```sql
   SELECT * FROM information_schema.triggers 
   WHERE trigger_name LIKE '%_changes_trigger';
   ```

4. **Review logs**:
   ```bash
   tail -f /var/log/nginx/error.log
   journalctl -u nginx-dynamic-sni -f
   ```

### Nginx Fails to Reload

1. **Test configuration manually**:
   ```bash
   nginx -t
   ```

2. **Check permissions**:
   ```bash
   ls -la /etc/nginx/nginx.conf
   ```

3. **Review backup configs**:
   ```bash
   ls -la /etc/nginx/nginx.conf.backup-*
   ```

4. **Restore from backup**:
   ```bash
   cp /etc/nginx/nginx.conf.backup-TIMESTAMP /etc/nginx/nginx.conf
   nginx -s reload
   ```

### Connection Refused to Backend

1. **Verify backend is accessible**:
   ```bash
   telnet <backend-ip> <backend-port>
   ```

2. **Check Nginx stream logs**:
   ```bash
   tail -f /var/log/nginx/stream-access.log
   ```

3. **Verify database entries**:
   ```sql
   SELECT rp.subdomain, rp."targetPort", ip.address
   FROM reverse_proxy rp
   JOIN instance i ON rp."instanceId" = i.id
   JOIN pve_vm vm ON i."pveVmId" = vm.id
   JOIN ip_address ip ON vm."ipAddressId" = ip.id
   WHERE rp.enabled = true;
   ```

### Database Connection Issues

1. **Test connection string**:
   ```bash
   psql $DATABASE_URL -c "SELECT version();"
   ```

2. **Check PostgreSQL is running**:
   ```bash
   systemctl status postgresql
   # Or for Docker:
   docker-compose ps postgres
   ```

3. **Verify network connectivity**:
   ```bash
   pg_isready -h <host> -p <port> -U <user>
   ```

### Systemd Service Issues

1. **Check service status**:
   ```bash
   systemctl status nginx-dynamic-sni
   ```

2. **View logs**:
   ```bash
   journalctl -u nginx-dynamic-sni -n 50 -f
   ```

3. **Restart service**:
   ```bash
   systemctl restart nginx-dynamic-sni
   ```

4. **Check environment file**:
   ```bash
   cat /etc/nginx-dynamic-sni-proxy/.env
   ```

## Production Deployment

### Systemd Setup

1. **Install the service**:
   ```bash
   sudo cp systemd/nginx-dynamic-sni.service /etc/systemd/system/
   sudo mkdir -p /opt/nginx-dynamic-sni-proxy
   sudo cp -r dist node_modules package.json /opt/nginx-dynamic-sni-proxy/
   sudo mkdir -p /etc/nginx-dynamic-sni-proxy
   sudo cp .env /etc/nginx-dynamic-sni-proxy/
   ```

2. **Enable and start**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable nginx-dynamic-sni
   sudo systemctl start nginx-dynamic-sni
   ```

3. **Monitor**:
   ```bash
   sudo systemctl status nginx-dynamic-sni
   sudo journalctl -u nginx-dynamic-sni -f
   ```

### Security Considerations

1. **Database Security**:
   - Use strong passwords
   - Restrict network access with firewall rules
   - Enable SSL/TLS for database connections
   - Use connection pooling

2. **File Permissions**:
   ```bash
   chmod 600 .env
   chown nginx:nginx /etc/nginx/nginx.conf
   ```

3. **Network Security**:
   - Use firewall rules to restrict port 443 access
   - Consider using fail2ban for brute force protection
   - Enable rate limiting in Nginx

4. **Monitoring**:
   - Set up log rotation for Nginx logs
   - Monitor disk space
   - Set up alerts for service failures

## License

MIT License - see [LICENSE](LICENSE) file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues, questions, or contributions, please open an issue on GitHub.
