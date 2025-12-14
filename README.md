# HAProxy Dynamic Multi-Protocol Proxy

Dynamic HAProxy-based multi-protocol reverse proxy with database-driven configuration using Prisma and PostgreSQL. Supports HTTPS with SNI routing, SSH, PostgreSQL, MySQL, Redis, and any TCP protocol.

## 🌟 Features

✅ **Multi-Protocol Support**: HTTPS, HTTP, SSH, PostgreSQL, MySQL, Redis, generic TCP  
✅ **SNI Routing**: Smart HTTPS routing based on Server Name Indication  
✅ **Port-Based Routing**: Direct port mapping for SSH, databases, and other TCP services  
✅ **Dynamic Configuration**: Database-driven with automatic reload on changes  
✅ **Health Checks**: Per-backend health monitoring  
✅ **Stats Dashboard**: Built-in HAProxy stats on port 8404  
✅ **Connection Limits**: Configurable per proxy with timeout controls  
✅ **Graceful Reloads**: Zero-downtime configuration updates  
✅ **SSL Passthrough**: End-to-end encryption maintained  
✅ **Database Triggers**: Automatic configuration regeneration via PostgreSQL LISTEN/NOTIFY

## 📋 Table of Contents

- [Architecture](#architecture)
- [Supported Protocols](#supported-protocols)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [Database Schema](#database-schema)
- [Port Allocation](#port-allocation)
- [Monitoring](#monitoring)
- [Development](#development)
- [Deployment](#deployment)
- [Testing](#testing)
- [Migration Guide](#migration-guide)
- [Troubleshooting](#troubleshooting)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         HAProxy Frontend                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Port 80 │  │ Port 443 │  │Port 2201 │  │Port 5433 │  ...  │
│  │  (HTTP)  │  │ (HTTPS)  │  │  (SSH)   │  │(Postgres)│       │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘       │
└────────┼─────────────┼─────────────┼─────────────┼─────────────┘
         │             │             │             │
         │   SNI/Host  │             │             │
         │   Routing   │             │   Direct    │
         │             │             │   Routing   │
         ▼             ▼             ▼             ▼
    ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
    │Backend │    │Backend │    │Backend │    │Backend │
    │ HTTP   │    │ HTTPS  │    │  SSH   │    │Postgres│
    │        │    │        │    │        │    │        │
    │VM:80   │    │VM:443  │    │VM:22   │    │VM:5432 │
    └────────┘    └────────┘    └────────┘    └────────┘

┌─────────────────────────────────────────────────────────────────┐
│              PostgreSQL Database (Configuration)                 │
│  ┌──────────────┐           ┌─────────────────┐                │
│  │   instance   │           │  reverse_proxy  │                │
│  │              │◄──────────│                 │                │
│  │ - name       │  1 to N   │ - protocol      │                │
│  │ - ipAddress  │           │ - publicPort    │                │
│  │ - state      │           │ - targetPort    │                │
│  │ - vmStatus   │           │ - customDomain  │                │
│  └──────┬───────┘           └────────┬────────┘                │
│         │                            │                          │
│         │         LISTEN/NOTIFY      │                          │
│         └────────────┬───────────────┘                          │
└──────────────────────┼──────────────────────────────────────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  Database Watcher    │
            │  (Node.js Process)   │
            └──────────┬───────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │ Config Generator     │
            │ (generate-haproxy-   │
            │  config.ts)          │
            └──────────┬───────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │ haproxy.cfg          │
            │ (HAProxy Config)     │
            └──────────┬───────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │ HAProxy Reload       │
            │ (Graceful)           │
            └──────────────────────┘
```

## 🔌 Supported Protocols

| Protocol | Port Type | Public Port | Example Use Case |
|----------|-----------|-------------|------------------|
| **HTTPS_SNI** | Fixed (443) | 443 | Web apps with SSL (app1.domain.com) |
| **HTTP** | Fixed (80) | 80 | Plain HTTP websites |
| **SSH** | Dynamic | 2201-2299 | Remote server access |
| **POSTGRESQL** | Dynamic | 5433-5533 | Database connections |
| **MYSQL** | Dynamic | 3307-3407 | MySQL databases |
| **REDIS** | Dynamic | 6380-6480 | Redis cache/queue |
| **TCP_GENERIC** | Dynamic | Custom | Any TCP protocol |

## 🚀 Installation

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- HAProxy 2.4+
- Docker & Docker Compose (for containerized deployment)

### Using Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone https://github.com/yourusername/haproxy-dynamic-proxy.git
cd haproxy-dynamic-proxy
```

2. Copy and configure environment:
```bash
cp .env.example .env
# Edit .env with your settings
```

3. Start services:
```bash
docker-compose up -d
```

4. Run database migrations:
```bash
docker-compose exec haproxy-dynamic-proxy npx prisma migrate deploy
```

5. Setup database triggers:
```bash
docker-compose exec postgres psql -U haproxy_user -d haproxy_db -f /docker-entrypoint-initdb.d/setup-triggers.sql
```

### Manual Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your database URL
```

3. Generate Prisma client:
```bash
npx prisma generate
```

4. Run migrations:
```bash
npx prisma migrate deploy
```

5. Setup database triggers:
```bash
psql $DATABASE_URL < sql/setup-db-triggers.sql
```

6. Build application:
```bash
npm run build
```

7. Start watcher:
```bash
npm start
```

## ⚙️ Configuration

### Environment Variables

See `.env.example` for all available options:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# HAProxy
HAPROXY_CONFIG_PATH=/etc/haproxy/haproxy.cfg
DOMAIN_SUFFIX=yourdomain.com

# Port Ranges
SSH_PORT_START=2201
SSH_PORT_END=2299
POSTGRES_PORT_START=5433
POSTGRES_PORT_END=5533

# Stats
STATS_PORT=8404
STATS_USERNAME=admin
STATS_PASSWORD=changeme
```

### Database Configuration

Add instances and reverse proxies via Prisma Studio or SQL:

```bash
# Open Prisma Studio
npx prisma studio
```

## 📖 Usage Examples

### Example 1: HTTPS Website with SNI

```sql
-- Add instance
INSERT INTO instance (name, "ipAddress", state, "vmStatus") 
VALUES ('web-server-1', '192.168.1.10', 'ACTIVE', 'RUNNING');

-- Add HTTPS proxy
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
  'app1.domain.com',
  true
);
```

Access: `https://app1.domain.com`

### Example 2: SSH Access

```sql
-- Add SSH proxy
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

Access: `ssh -p 2201 user@domain.com`

### Example 3: PostgreSQL Database

```sql
-- Add database instance
INSERT INTO instance (name, "ipAddress", state, "vmStatus")
VALUES ('postgres-1', '192.168.1.20', 'ACTIVE', 'RUNNING');

-- Add PostgreSQL proxy
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
  (SELECT id FROM instance WHERE name = 'postgres-1'),
  200,
  true
);
```

Access: `psql -h domain.com -p 5433 -U user dbname`

### Example 4: Redis Cache

```sql
-- Add Redis proxy
INSERT INTO reverse_proxy (
  protocol,
  "publicPort",
  "targetPort",
  "targetInstanceId",
  enabled
) VALUES (
  'REDIS',
  6380,
  6379,
  (SELECT id FROM instance WHERE name = 'redis-1'),
  true
);
```

Access: `redis-cli -h domain.com -p 6380`

## 🗄️ Database Schema

### Instance Table

```sql
CREATE TABLE instance (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  "ipAddress" TEXT NOT NULL,
  state "InstanceState" DEFAULT 'ACTIVE',
  "vmStatus" "VmStatus" DEFAULT 'RUNNING',
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);
```

### Reverse Proxy Table

```sql
CREATE TABLE reverse_proxy (
  id SERIAL PRIMARY KEY,
  protocol "ProxyProtocol" DEFAULT 'HTTPS_SNI',
  "publicPort" INTEGER UNIQUE,
  "targetPort" INTEGER NOT NULL,
  "targetInstanceId" INTEGER REFERENCES instance(id) ON DELETE CASCADE,
  "customDomain" TEXT,
  "maxConnections" INTEGER DEFAULT 1000,
  "timeoutConnect" INTEGER DEFAULT 5000,
  "timeoutServer" INTEGER DEFAULT 300000,
  enabled BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);
```

## 🔢 Port Allocation

### Default Port Ranges

| Protocol | Start Port | End Port | Capacity |
|----------|-----------|----------|----------|
| SSH | 2201 | 2299 | 99 instances |
| PostgreSQL | 5433 | 5533 | 101 instances |
| MySQL | 3307 | 3407 | 101 instances |
| Redis | 6380 | 6480 | 101 instances |

### Port Management

Use the port manager utility:

```typescript
import { suggestPort, isPortAvailable } from './port-manager';

// Get next available port for SSH
const suggestion = await suggestPort('SSH');
console.log(suggestion.message); // "Suggested port: 2201"

// Check if port is available
const available = await isPortAvailable(2201);
```

## 📊 Monitoring

### HAProxy Stats Dashboard

Access the built-in stats page:

```
http://your-domain.com:8404/stats
Username: admin (or as configured)
Password: changeme (or as configured)
```

Features:
- Real-time connection statistics
- Backend server health status
- Request/response metrics
- Error tracking
- Session information

### Logs

View logs:

```bash
# Docker
docker logs -f haproxy-dynamic-proxy

# Systemd
journalctl -u haproxy-dynamic-proxy -f

# HAProxy logs
tail -f /var/log/haproxy/haproxy.log
```

## 🛠️ Development

### Local Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run in development mode
npm run dev

# Generate HAProxy config manually
npm run generate-haproxy-config
```

### Building

```bash
# Build TypeScript
npm run build

# Build Docker image
docker build -t haproxy-dynamic-proxy .
```

### Testing

See [TESTING.md](docs/TESTING.md) for comprehensive testing guide.

Quick tests:

```bash
# Test HTTPS
curl -v https://app1.domain.com

# Test SSH
ssh -p 2201 user@domain.com

# Test PostgreSQL
psql -h localhost -p 5433 -U user dbname

# View stats
curl -u admin:changeme http://localhost:8404/stats
```

## 🚢 Deployment

### Docker Compose

Production deployment:

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Systemd Service

For bare-metal deployment:

```bash
# Copy service file
sudo cp systemd/haproxy-dynamic-proxy.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start
sudo systemctl enable haproxy-dynamic-proxy
sudo systemctl start haproxy-dynamic-proxy

# Check status
sudo systemctl status haproxy-dynamic-proxy
```

### Kubernetes

Example deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: haproxy-dynamic-proxy
spec:
  replicas: 1
  selector:
    matchLabels:
      app: haproxy-dynamic-proxy
  template:
    metadata:
      labels:
        app: haproxy-dynamic-proxy
    spec:
      containers:
      - name: haproxy
        image: haproxy-dynamic-proxy:latest
        ports:
        - containerPort: 80
        - containerPort: 443
        - containerPort: 8404
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
```

## 🧪 Testing

See comprehensive [Testing Guide](docs/TESTING.md).

Quick test script:

```bash
#!/bin/bash
echo "Testing HTTPS..." && curl -s -o /dev/null -w "%{http_code}\n" https://app1.domain.com
echo "Testing HTTP..." && curl -s -o /dev/null -w "%{http_code}\n" http://www.domain.com
echo "Testing SSH..." && nc -zv domain.com 2201
echo "Testing PostgreSQL..." && pg_isready -h domain.com -p 5433
echo "Testing Stats..." && curl -s -u admin:changeme http://domain.com:8404/stats | grep -q "Statistics"
```

## 📚 Migration Guide

Migrating from Nginx? See [MIGRATION.md](docs/MIGRATION.md) for a complete guide.

## 🐛 Troubleshooting

### HAProxy won't start

```bash
# Check configuration
haproxy -c -f /etc/haproxy/haproxy.cfg

# Check logs
docker logs haproxy-dynamic-proxy

# Check if ports are in use
netstat -tuln | grep -E ':(80|443)'
```

### Configuration not updating

```bash
# Check database watcher is running
docker logs haproxy-dynamic-proxy | grep "Listening for configuration"

# Manually trigger regeneration
docker exec haproxy-dynamic-proxy node dist/generate-haproxy-config.js --reload

# Check database triggers
psql $DATABASE_URL -c "SELECT * FROM pg_trigger WHERE tgname LIKE '%config%';"
```

### Connection refused

```bash
# Check backend is reachable
docker exec haproxy-dynamic-proxy nc -zv 192.168.1.10 443

# Check instance state
psql $DATABASE_URL -c "SELECT * FROM instance WHERE state = 'ACTIVE' AND \"vmStatus\" = 'RUNNING';"

# Check reverse proxy config
psql $DATABASE_URL -c "SELECT * FROM reverse_proxy WHERE enabled = true;"
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- [HAProxy](http://www.haproxy.org/) - High-performance TCP/HTTP load balancer
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [PostgreSQL](https://www.postgresql.org/) - Advanced open-source database

## 📞 Support

- Documentation: See `/docs` directory
- Issues: GitHub Issues
- Discussions: GitHub Discussions

## 🗺️ Roadmap

- [ ] Web UI for configuration management
- [ ] Metrics export (Prometheus/Grafana)
- [ ] Rate limiting support
- [ ] Geographic routing
- [ ] Auto-scaling based on load
- [ ] SSL certificate management (Let's Encrypt)
- [ ] WebSocket support
- [ ] gRPC support
