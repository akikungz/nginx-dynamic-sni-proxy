# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-12-14

### Added - Complete Migration from Nginx to HAProxy

#### Core Features
- Multi-protocol support: HTTPS (SNI), HTTP, SSH, PostgreSQL, MySQL, Redis, and generic TCP
- Database-driven configuration using Prisma and PostgreSQL
- Automatic configuration reload via PostgreSQL LISTEN/NOTIFY
- HAProxy configuration generator with validation and graceful reloads
- Port management utility with configurable ranges per protocol
- Health checking for all backend servers
- Connection limits and timeout configuration per proxy
- Built-in HAProxy stats dashboard on port 8404
- SSL/TLS passthrough for end-to-end encryption
- Zero-downtime configuration updates

#### Infrastructure
- Docker and Docker Compose support
- Multi-stage Docker builds for optimized images
- Systemd service file for bare-metal deployments
- Kubernetes deployment examples
- GitHub Actions CI/CD workflow
- Makefile for common operations

#### Database
- Prisma schema with ProxyProtocol enum
- Instance and reverse_proxy models with relationships
- Instance state management (ACTIVE/ARCHIVED)
- VM status tracking (RUNNING/STOPPED/PENDING)
- Database triggers for automatic NOTIFY
- Migration support for schema updates

#### Documentation
- Comprehensive README with architecture diagrams
- Quick start guide for 5-minute setup
- Testing guide for all supported protocols
- Migration guide from Nginx to HAProxy
- Architecture documentation with detailed diagrams
- FAQ with troubleshooting tips
- Production deployment guide with HA setup
- Contributing guidelines
- API documentation

#### Developer Experience
- TypeScript for type safety
- ESLint and Prettier configuration
- Seed script for example data
- Prisma Studio integration
- Environment variable management
- Example configurations

#### Security
- No hardcoded credentials
- Environment-based configuration
- Secure password generation guidance
- GitHub Actions permissions properly scoped
- SQL injection protection via Prisma ORM
- Stats page authentication

### Changed
- Replaced Nginx with HAProxy for better TCP performance
- Updated configuration format from Nginx to HAProxy syntax
- Changed from file-based to database-driven configuration
- Improved health checking capabilities
- Enhanced monitoring with built-in stats

### Technical Details

**Supported Protocols:**
- HTTPS_SNI: Port 443, SNI-based routing
- HTTP: Port 80, host header-based routing
- SSH: Ports 2201-2299, port-based routing
- POSTGRESQL: Ports 5433-5533, port-based routing
- MYSQL: Ports 3307-3407, port-based routing
- REDIS: Ports 6380-6480, port-based routing
- TCP_GENERIC: Custom ports, port-based routing

**Database Schema:**
- `instance` table: Backend server information
- `reverse_proxy` table: Proxy configuration with protocol support
- `ProxyProtocol` enum: All supported protocols
- Foreign key relationships with cascade delete

**Configuration Generator:**
- Fetches active configurations from database
- Generates HAProxy configuration file
- Validates configuration syntax
- Backs up existing configuration
- Performs graceful HAProxy reload
- Handles errors gracefully

**Port Management:**
- Configurable port ranges per protocol
- Automatic port allocation
- Conflict detection and prevention
- Next available port suggestions

**Monitoring:**
- HAProxy stats dashboard (port 8404)
- Real-time connection statistics
- Backend server health status
- Error rate tracking
- Response time metrics

**Deployment Options:**
- Docker Compose (single server)
- Systemd services (bare metal)
- Kubernetes (multi-server)
- Cloud providers (AWS, GCP, Azure)

### Dependencies

**Production:**
- @prisma/client ^5.7.1
- dotenv ^16.3.1
- pg ^8.11.3

**Development:**
- @types/node ^20.10.6
- @types/pg ^8.10.9
- prisma ^5.7.1
- ts-node ^10.9.2
- typescript ^5.3.3

**External:**
- Node.js 20+
- PostgreSQL 14+
- HAProxy 2.4+

### Security

- All dependencies scanned for vulnerabilities (0 found)
- CodeQL security analysis passed
- No hardcoded secrets
- Environment-based configuration
- Secure defaults for production use
- GitHub Actions permissions properly configured

### Migration Path

For users migrating from Nginx-based proxy:
1. Backup existing configuration and database
2. Update database schema with new fields
3. Migrate existing proxy configurations
4. Update environment variables
5. Replace Nginx container with HAProxy
6. Update firewall rules for new ports
7. Test all services

See [MIGRATION.md](docs/MIGRATION.md) for detailed instructions.

### Breaking Changes

- Configuration format changed from Nginx to HAProxy
- Database schema requires migration
- Port ranges for non-HTTP protocols added
- Environment variable names updated
- New required fields in reverse_proxy table

### Upgrade Instructions

1. Backup database: `pg_dump > backup.sql`
2. Pull latest code: `git pull origin main`
3. Install dependencies: `npm install`
4. Run migrations: `npx prisma migrate deploy`
5. Setup triggers: `psql $DATABASE_URL < sql/setup-db-triggers.sql`
6. Update .env file with new variables
7. Rebuild containers: `docker-compose build`
8. Restart services: `docker-compose up -d`

### Known Issues

None at this time.

### Contributors

- Initial implementation and documentation
- Security improvements from code review
- CI/CD setup

### Future Enhancements

Planned for future releases:
- Web UI for configuration management
- Prometheus metrics export
- Rate limiting support
- Geographic routing
- Auto-scaling based on load
- SSL certificate automation (Let's Encrypt)
- WebSocket enhancements
- gRPC support
- Advanced load balancing algorithms
- Custom health checks

---

## How to Use This Changelog

This changelog helps you:
- Understand what changed in each version
- Plan your upgrade path
- Identify breaking changes
- Track new features and bug fixes
- Follow project development

For questions or issues, please:
- Check [FAQ.md](docs/FAQ.md)
- Review [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- Open a GitHub issue
- Consult documentation in `/docs`

## Version Format

We use [Semantic Versioning](https://semver.org/):
- MAJOR version for incompatible API changes
- MINOR version for backwards-compatible functionality
- PATCH version for backwards-compatible bug fixes

## Release Process

1. Update version in package.json
2. Update this CHANGELOG.md
3. Create git tag: `git tag v1.0.0`
4. Push tag: `git push origin v1.0.0`
5. Create GitHub release
6. Build and push Docker images
