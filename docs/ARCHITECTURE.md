# Architecture Documentation

This document provides a detailed explanation of the HAProxy Dynamic Multi-Protocol Proxy architecture.

## System Overview

The system consists of three main components:

1. **HAProxy** - The proxy server handling all incoming connections
2. **PostgreSQL Database** - Configuration storage with LISTEN/NOTIFY
3. **Node.js Application** - Configuration generator and database watcher

## Component Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                         Internet                                │
└────────────────────────────┬───────────────────────────────────┘
                             │
                             │ Multiple Protocols
                             │ (HTTPS, SSH, PostgreSQL, etc.)
                             │
┌────────────────────────────┴───────────────────────────────────┐
│                      HAProxy (Load Balancer)                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                  Frontend Bindings                       │  │
│  │  • Port 80   (HTTP)                                     │  │
│  │  • Port 443  (HTTPS with SNI)                           │  │
│  │  • Port 2201-2299 (SSH)                                 │  │
│  │  • Port 5433-5533 (PostgreSQL)                          │  │
│  │  • Port 3307-3407 (MySQL)                               │  │
│  │  • Port 6380-6480 (Redis)                               │  │
│  │  • Port 8404 (Stats Dashboard)                          │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    Routing Logic                         │  │
│  │                                                          │  │
│  │  HTTPS/HTTP:  SNI/Host Header → Backend Selection      │  │
│  │  SSH/DB/etc:  Port Number → Direct Backend Mapping     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                  Backend Pools                           │  │
│  │  • Health Checks                                        │  │
│  │  • Connection Limits                                     │  │
│  │  • Timeout Configuration                                 │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────┬───────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐    ┌──────────────┐
│  Backend 1   │     │  Backend 2   │    │  Backend N   │
│ 192.168.1.10 │     │ 192.168.1.11 │    │ 192.168.1.N  │
└──────────────┘     └──────────────┘    └──────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   Configuration Management                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              PostgreSQL Database                          │  │
│  │                                                           │  │
│  │  ┌────────────────────┐  ┌──────────────────────────┐   │  │
│  │  │   instance table   │  │  reverse_proxy table     │   │  │
│  │  │  - id              │  │  - id                    │   │  │
│  │  │  - name            │  │  - protocol              │   │  │
│  │  │  - ipAddress       │  │  - publicPort            │   │  │
│  │  │  - state           │  │  - targetPort            │   │  │
│  │  │  - vmStatus        │  │  - customDomain          │   │  │
│  │  │                    │  │  - targetInstanceId (FK) │   │  │
│  │  │                    │  │  - maxConnections        │   │  │
│  │  │                    │  │  - timeoutConnect        │   │  │
│  │  │                    │  │  - timeoutServer         │   │  │
│  │  │                    │  │  - enabled               │   │  │
│  │  └─────────┬──────────┘  └──────────┬───────────────┘   │  │
│  │            │                        │                    │  │
│  │            │  Foreign Key           │                    │  │
│  │            └────────────────────────┘                    │  │
│  │                                                           │  │
│  │  ┌────────────────────────────────────────────────────┐ │  │
│  │  │         Database Triggers                          │ │  │
│  │  │  • ON INSERT/UPDATE/DELETE → NOTIFY                │ │  │
│  │  │  • Channel: "config_changes"                       │ │  │
│  │  └────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────┬──────────────────────────────┘  │
│                               │ LISTEN/NOTIFY                   │
│                               │                                 │
│  ┌────────────────────────────┴─────────────────────────────┐  │
│  │           Node.js Database Watcher                       │  │
│  │         (watch-database-notify.ts)                       │  │
│  │                                                          │  │
│  │  • Listens to PostgreSQL notifications                  │  │
│  │  • Triggers config regeneration on changes              │  │
│  │  • Debounces multiple rapid changes                     │  │
│  └────────────────────────────┬─────────────────────────────┘  │
│                                │                                │
│                                ▼                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │        HAProxy Config Generator                          │   │
│  │       (generate-haproxy-config.ts)                       │   │
│  │                                                          │   │
│  │  1. Query database for active proxies                   │   │
│  │  2. Filter by instance state (ACTIVE/RUNNING)           │   │
│  │  3. Group by protocol                                   │   │
│  │  4. Generate HAProxy configuration                      │   │
│  │  5. Backup existing config                              │   │
│  │  6. Write new config to disk                            │   │
│  │  7. Test config with `haproxy -c`                       │   │
│  │  8. Reload HAProxy gracefully                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                │                                │
│                                ▼                                │
│                     /etc/haproxy/haproxy.cfg                    │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Configuration Update Flow

```
User Action (INSERT/UPDATE/DELETE)
    │
    ├─→ Database Table Modified
    │       │
    │       ├─→ Trigger Fires
    │       │
    │       └─→ NOTIFY 'config_changes'
    │
    ├─→ Database Watcher Receives Notification
    │       │
    │       ├─→ Debounce Timer (if needed)
    │       │
    │       └─→ Call Config Generator
    │
    ├─→ Config Generator
    │       │
    │       ├─→ Query Active Configurations
    │       ├─→ Generate HAProxy Config
    │       ├─→ Backup Old Config
    │       ├─→ Write New Config
    │       ├─→ Test Config (`haproxy -c`)
    │       └─→ Reload HAProxy
    │
    └─→ HAProxy Graceful Reload
            │
            ├─→ New connections use new config
            └─→ Old connections complete gracefully
```

### Request Routing Flow

#### HTTPS with SNI
```
Client Request (TLS Hello with SNI: app1.example.com)
    │
    ├─→ HAProxy Frontend (port 443)
    │       │
    │       ├─→ Inspect TLS Hello (tcp-request inspect-delay)
    │       │
    │       ├─→ Extract SNI (req_ssl_sni)
    │       │
    │       └─→ Match ACL (app1.example.com)
    │
    ├─→ Route to Backend (https_app1_example_com)
    │       │
    │       ├─→ Health Check
    │       │
    │       └─→ Select Server (192.168.1.10:443)
    │
    └─→ Forward to Backend (SSL Passthrough)
            │
            └─→ Backend handles TLS termination
```

#### SSH Port-Based Routing
```
Client Request (SSH to port 2201)
    │
    ├─→ HAProxy Frontend (port 2201)
    │       │
    │       └─→ Direct mapping to backend
    │
    ├─→ Route to Backend (ssh_2201_back)
    │       │
    │       ├─→ Health Check
    │       │
    │       └─→ Select Server (192.168.1.10:22)
    │
    └─→ Forward to Backend (TCP Passthrough)
            │
            └─→ Backend handles SSH protocol
```

## Protocol Handling

### HTTPS_SNI
- **Port**: 443 (fixed)
- **Routing**: SNI-based
- **Mode**: TCP (SSL passthrough)
- **Configuration**: Requires `customDomain`

### HTTP
- **Port**: 80 (fixed)
- **Routing**: Host header-based
- **Mode**: HTTP
- **Configuration**: Requires `customDomain`

### SSH
- **Port**: 2201-2299 (configurable range)
- **Routing**: Port-based
- **Mode**: TCP
- **Configuration**: Requires unique `publicPort`

### POSTGRESQL
- **Port**: 5433-5533 (configurable range)
- **Routing**: Port-based
- **Mode**: TCP
- **Configuration**: Requires unique `publicPort`

### MYSQL
- **Port**: 3307-3407 (configurable range)
- **Routing**: Port-based
- **Mode**: TCP
- **Configuration**: Requires unique `publicPort`

### REDIS
- **Port**: 6380-6480 (configurable range)
- **Routing**: Port-based
- **Mode**: TCP
- **Configuration**: Requires unique `publicPort`

### TCP_GENERIC
- **Port**: Custom (any available)
- **Routing**: Port-based
- **Mode**: TCP
- **Configuration**: Requires unique `publicPort`

## Database Schema

### Entity Relationship

```
┌──────────────────┐
│    instance      │
├──────────────────┤
│ id (PK)          │←──┐
│ name             │   │
│ ipAddress        │   │
│ state            │   │
│ vmStatus         │   │
│ createdAt        │   │
│ updatedAt        │   │
└──────────────────┘   │
                       │
                       │ 1:N
                       │
┌──────────────────────┴─┐
│   reverse_proxy        │
├────────────────────────┤
│ id (PK)                │
│ protocol               │
│ publicPort (UNIQUE)    │
│ targetPort             │
│ targetInstanceId (FK)  │
│ customDomain           │
│ maxConnections         │
│ timeoutConnect         │
│ timeoutServer          │
│ enabled                │
│ createdAt              │
│ updatedAt              │
└────────────────────────┘
```

### State Management

#### Instance States
- **ACTIVE**: Instance is operational and can receive traffic
- **ARCHIVED**: Instance is decommissioned, won't receive traffic

#### VM Status
- **RUNNING**: VM is running and healthy
- **STOPPED**: VM is stopped, won't receive traffic
- **PENDING**: VM is starting/stopping

Only instances with `state = ACTIVE` AND `vmStatus = RUNNING` are included in HAProxy configuration.

## Configuration Generation

### Algorithm

```
1. Fetch Data:
   - Query reverse_proxy table
   - JOIN with instance table
   - Filter: enabled = true, state = ACTIVE, vmStatus = RUNNING
   - Order by protocol, publicPort

2. Group by Protocol:
   - HTTPS_SNI proxies
   - HTTP proxies
   - SSH proxies
   - PostgreSQL proxies
   - MySQL proxies
   - Redis proxies
   - TCP_GENERIC proxies

3. Generate Sections:
   - Global section (maxconn, user, daemon)
   - Defaults section (timeouts, retries, mode)
   - HTTPS frontend + backends (SNI ACLs)
   - HTTP frontend + backends (Host ACLs)
   - Port-based frontends + backends (one per port)
   - Stats listener

4. Validate:
   - Check required fields (domain for SNI, port for others)
   - Ensure no port conflicts
   - Validate IP addresses

5. Write & Reload:
   - Backup existing config
   - Write new config
   - Test with `haproxy -c`
   - Graceful reload with `haproxy -sf`
```

### Config Template Structure

```
global
  <global settings>

defaults
  <default settings>

# SNI-based protocols
frontend https_front
  <SNI ACLs>
  <use_backend rules>

backend https_<domain>
  <servers>

# Port-based protocols
frontend <protocol>_<port>_front
  <bind configuration>

backend <protocol>_<port>_back
  <servers>

# Stats
listen stats
  <stats configuration>
```

## Health Checking

HAProxy performs health checks on all backend servers:

- **Default**: TCP connection check
- **Interval**: Every few seconds
- **Timeout**: 5 seconds
- **Retries**: 3

Health check states:
- **UP**: Server is healthy
- **DOWN**: Server is unreachable
- **DRAIN**: Server is being removed

## Connection Management

### Limits
- **Global**: 4096 concurrent connections (configurable)
- **Per Backend**: Defined in `maxConnections` field
- **Queue**: Connections queued when limit reached

### Timeouts
- **Connect**: Time to establish connection to backend (default: 5s)
- **Client**: Time waiting for client (default: 300s)
- **Server**: Time waiting for server (default: 300s)

Configurable per proxy via `timeoutConnect` and `timeoutServer` fields.

## Graceful Reload

HAProxy supports zero-downtime reloads:

1. Parse new configuration
2. Start new process with new config
3. New connections → new process
4. Existing connections → old process
5. Old process exits when connections complete

Command: `haproxy -f config.cfg -p pidfile -sf $(cat pidfile)`

## Security Considerations

### SSL/TLS
- **Passthrough Mode**: End-to-end encryption maintained
- **No Certificate Storage**: Certificates stored on backend servers
- **SNI Required**: For HTTPS routing

### Port Allocation
- **Segregated Ranges**: Each protocol has dedicated port range
- **Conflict Prevention**: Unique constraint on publicPort
- **Validation**: Port manager validates allocations

### Database Security
- **Parameterized Queries**: Prisma ORM prevents SQL injection
- **Connection Pooling**: Limited connections to database
- **NOTIFY Channel**: Isolated communication channel

### Access Control
- **Stats Authentication**: Basic auth for stats page
- **Environment Variables**: Secrets stored in env vars
- **No Hardcoded Credentials**: All config from environment

## Monitoring

### HAProxy Stats
- **URL**: http://host:8404/stats
- **Metrics**: Connections, errors, response times
- **Real-time**: Updates every 30 seconds

### Logs
- **HAProxy Logs**: `/var/log/haproxy/haproxy.log`
- **Application Logs**: stdout/stderr
- **Database Logs**: PostgreSQL logs

### Metrics Available
- Frontend/Backend status
- Session counts
- Error rates (4xx, 5xx)
- Backend server health
- Queue depths
- Connection times

## Scalability

### Horizontal Scaling
- **Multiple HAProxy Instances**: Load balance with DNS/L4 LB
- **Database Replication**: Read replicas for config queries
- **Shared Config**: Multiple watchers can share database

### Vertical Scaling
- **Connection Limits**: Increase based on server capacity
- **Worker Processes**: HAProxy can use multiple cores
- **Database Tuning**: Connection pooling, indexing

### Performance Characteristics
- **Config Generation**: O(n) where n = number of proxies
- **HAProxy Performance**: 40,000+ connections per second
- **Database Queries**: Indexed by protocol, single query
- **Reload Time**: <1 second for typical configs

## Failure Modes

### Database Unavailable
- **Impact**: Config updates stopped
- **Existing Traffic**: Continues with last config
- **Recovery**: Automatic reconnection

### HAProxy Crash
- **Impact**: All traffic interrupted
- **Recovery**: Systemd/Docker restarts process
- **Mitigation**: Run multiple instances

### Backend Server Down
- **Impact**: Traffic to that server fails
- **Recovery**: Health checks detect, route around
- **Mitigation**: Multiple backends per service

### Config Generation Error
- **Impact**: Config not updated
- **Existing Traffic**: Continues with last valid config
- **Recovery**: Fix data, trigger regeneration

## Development Workflow

```
Developer
    │
    ├─→ Update Database (via Prisma Studio or SQL)
    │
    ├─→ Database Trigger Fires
    │
    ├─→ Watcher Detects Change
    │
    ├─→ Config Regenerated
    │
    ├─→ HAProxy Reloaded
    │
    └─→ Test New Configuration
```

## Deployment Patterns

### Docker Compose
- Single host deployment
- Development/testing
- All-in-one setup

### Kubernetes
- Multi-host deployment
- Production scale
- Service mesh integration

### Bare Metal
- Systemd services
- Direct hardware access
- Maximum performance

## Future Enhancements

- [ ] Web UI for configuration
- [ ] Metrics export (Prometheus)
- [ ] Rate limiting
- [ ] Geographic routing
- [ ] Auto-scaling
- [ ] Certificate automation
- [ ] WebSocket support
- [ ] gRPC support
- [ ] Custom health checks
- [ ] Advanced load balancing algorithms
