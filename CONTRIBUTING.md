# Contributing to HAProxy Dynamic Multi-Protocol Proxy

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/haproxy-dynamic-proxy.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes
6. Commit and push
7. Create a Pull Request

## Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- HAProxy 2.4+ (for local testing)
- Docker & Docker Compose (optional)

### Local Setup

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Setup database triggers
psql $DATABASE_URL < sql/setup-db-triggers.sql

# Build
npm run build

# Run in development mode
npm run dev
```

### Using Docker

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Run migrations
docker-compose exec haproxy-dynamic-proxy npx prisma migrate deploy
```

## Code Style

### TypeScript

- Use TypeScript for all new code
- Follow existing code style
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Prefer `const` over `let`
- Use async/await instead of callbacks

### Example

```typescript
/**
 * Generates HAProxy configuration from database
 * @returns Promise resolving to configuration string
 */
async function generateHAProxyConfig(): Promise<string> {
  const configs = await fetchProxyConfigs();
  // ...
}
```

### SQL

- Use lowercase for SQL keywords in application code
- Use uppercase in documentation examples
- Use proper indentation
- Add comments for complex queries

### Configuration

- Use environment variables for all configuration
- Provide sensible defaults
- Document all options in `.env.example`

## Testing

### Manual Testing

```bash
# Test HTTPS
curl -v https://app1.domain.com

# Test SSH
ssh -p 2201 user@domain.com

# Test PostgreSQL
psql -h localhost -p 5433 -U user dbname

# Test stats
curl -u admin:changeme http://localhost:8404/stats
```

### Integration Testing

Before submitting a PR:

1. Test all supported protocols
2. Test configuration regeneration
3. Test graceful reloads
4. Test error handling
5. Verify documentation accuracy

## Pull Request Process

1. **Update Documentation**: Update README.md and relevant docs if needed
2. **Test Thoroughly**: Ensure all features work as expected
3. **Follow Code Style**: Match existing code style
4. **Write Clear Commit Messages**: Use descriptive commit messages
5. **One Feature Per PR**: Keep PRs focused on a single feature/fix

### Commit Message Format

```
type(scope): subject

body (optional)

footer (optional)
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(ssh): add SSH connection pooling

Add connection pooling support for SSH proxies to improve
performance under high load.

Closes #123
```

```
fix(config): handle missing customDomain for HTTPS

Fix crash when HTTPS_SNI proxy has no customDomain set.
Now properly validates and skips invalid configurations.
```

## What to Contribute

### Good First Issues

- Documentation improvements
- Adding more protocol examples
- Improving error messages
- Adding configuration validation
- Writing tests

### Feature Ideas

- Web UI for configuration management
- Metrics export (Prometheus)
- Rate limiting
- SSL certificate automation
- Auto-scaling support
- WebSocket support
- gRPC support

### Bug Reports

When reporting bugs, include:

1. Description of the issue
2. Steps to reproduce
3. Expected behavior
4. Actual behavior
5. Environment details (OS, Node version, etc.)
6. Relevant logs
7. Configuration (sanitized)

### Feature Requests

When requesting features, include:

1. Clear description of the feature
2. Use case / problem it solves
3. Proposed solution (if any)
4. Alternative solutions considered
5. Impact on existing functionality

## Code Review

All submissions require review. We use GitHub pull requests for this purpose.

Reviewers will check:
- Code quality and style
- Test coverage
- Documentation
- Performance impact
- Security implications
- Breaking changes

## Security

If you discover a security vulnerability:

1. **Do NOT** open a public issue
2. Email the maintainers directly
3. Provide details about the vulnerability
4. Wait for acknowledgment before public disclosure

## Architecture Guidelines

### Database Schema Changes

1. Create Prisma migration
2. Update schema.prisma
3. Consider backward compatibility
4. Update documentation
5. Test migration on existing data

### HAProxy Configuration

1. Test configuration validity
2. Ensure graceful reload works
3. Document new directives
4. Provide examples
5. Consider performance impact

### Protocol Support

When adding new protocol support:

1. Update ProxyProtocol enum
2. Add port range configuration
3. Update config generator
4. Add documentation
5. Provide usage examples
6. Add to testing guide

## Documentation

### README Updates

Update README.md when adding:
- New protocols
- New features
- Configuration options
- Examples

### Documentation Files

- `README.md`: Main documentation
- `docs/TESTING.md`: Testing procedures
- `docs/MIGRATION.md`: Migration guides
- `CONTRIBUTING.md`: This file
- `examples/`: Configuration examples

### Code Comments

Add comments for:
- Complex logic
- Non-obvious decisions
- Workarounds
- TODOs (with issue reference)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

- Open a Discussion on GitHub
- Check existing Issues and PRs
- Review documentation in `/docs`

## Thank You!

Your contributions make this project better for everyone. Thank you for taking the time to contribute!
