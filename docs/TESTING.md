# Testing Guide

This guide provides examples for testing each protocol supported by the HAProxy Dynamic Multi-Protocol Proxy.

## Prerequisites

- HAProxy Dynamic Proxy running
- Database configured with reverse proxy entries
- DNS or `/etc/hosts` configured for domain names

## Testing HTTPS with SNI

### Using curl

```bash
# Test HTTPS connection with SNI
curl -v https://app1.domain.com

# Test with specific SNI domain
curl -v --resolve app1.domain.com:443:YOUR_SERVER_IP https://app1.domain.com

# Test SSL handshake
openssl s_client -connect domain.com:443 -servername app1.domain.com
```

### Expected Result

```
* Connected to app1.domain.com (192.168.1.1) port 443
* Server certificate:
*  subject: CN=app1.domain.com
*  start date: ...
*  expire date: ...
< HTTP/1.1 200 OK
```

## Testing HTTP with Host Header

### Using curl

```bash
# Test HTTP connection
curl -v http://www.domain.com

# Test with host header override
curl -v -H "Host: blog.domain.com" http://YOUR_SERVER_IP
```

### Expected Result

```
< HTTP/1.1 200 OK
< Server: ...
< Content-Type: text/html
```

## Testing SSH

### Using ssh command

```bash
# Connect to SSH on custom port
ssh -p 2201 user@domain.com

# Test connection without login
ssh -p 2201 -o BatchMode=yes user@domain.com echo "Connection successful"

# Check if port is open
nc -zv domain.com 2201
```

### Expected Result

```
Connection to domain.com 2201 port [tcp/*] succeeded!
```

## Testing PostgreSQL

### Using psql

```bash
# Connect to PostgreSQL on custom port
psql -h domain.com -p 5433 -U username -d database_name

# Test connection
pg_isready -h domain.com -p 5433

# One-liner query test
psql -h domain.com -p 5433 -U username -d database_name -c "SELECT version();"
```

### Using connection string

```bash
psql "postgresql://username:password@domain.com:5433/database_name"
```

### Expected Result

```
psql (16.1)
Type "help" for help.

database_name=#
```

## Testing MySQL

### Using mysql client

```bash
# Connect to MySQL on custom port
mysql -h domain.com -P 3307 -u username -p database_name

# Test connection
mysqladmin -h domain.com -P 3307 -u username -p ping

# One-liner query test
mysql -h domain.com -P 3307 -u username -p -e "SELECT VERSION();"
```

### Expected Result

```
mysqld is alive
```

## Testing Redis

### Using redis-cli

```bash
# Connect to Redis on custom port
redis-cli -h domain.com -p 6380

# Test connection with ping
redis-cli -h domain.com -p 6380 PING

# Set and get a value
redis-cli -h domain.com -p 6380 SET test "Hello"
redis-cli -h domain.com -p 6380 GET test
```

### Expected Result

```
PONG
OK
"Hello"
```

## Viewing HAProxy Stats

### Access Stats Dashboard

```bash
# Open in browser
http://domain.com:8404/stats

# Or use curl
curl -u admin:changeme http://domain.com:8404/stats
```

### Stats Information

The stats page shows:
- Frontend status and statistics
- Backend server health
- Connection counts
- Error rates
- Response times

## Debugging Connection Issues

### Check HAProxy is Running

```bash
# Check HAProxy process
ps aux | grep haproxy

# Check HAProxy status (systemd)
systemctl status haproxy

# Check HAProxy logs
tail -f /var/log/haproxy/haproxy.log
```

### Check Configuration

```bash
# Test configuration syntax
haproxy -c -f /etc/haproxy/haproxy.cfg

# View current configuration
cat /etc/haproxy/haproxy.cfg
```

### Check Port Binding

```bash
# Check if ports are listening
netstat -tuln | grep -E ':(80|443|8404|2201|5433)'

# Or with ss
ss -tuln | grep -E ':(80|443|8404|2201|5433)'
```

### Test Backend Connectivity

```bash
# From HAProxy server, test backend connection
telnet 192.168.1.10 22
telnet 192.168.1.20 5432

# Test with netcat
nc -zv 192.168.1.10 22
nc -zv 192.168.1.20 5432
```

### Check Database Configuration

```bash
# Connect to database
psql $DATABASE_URL

# List all reverse proxies
SELECT id, protocol, "publicPort", "targetPort", "customDomain", enabled 
FROM reverse_proxy 
WHERE enabled = true;

# List all instances
SELECT id, name, "ipAddress", state, "vmStatus" 
FROM instance 
WHERE state = 'ACTIVE' AND "vmStatus" = 'RUNNING';
```

### Check Database Watcher

```bash
# View watcher logs
docker logs -f haproxy-dynamic-proxy

# Or with journalctl (systemd)
journalctl -u haproxy-dynamic-proxy -f
```

### Test Database Notifications

```bash
# In psql, trigger a notification
UPDATE reverse_proxy SET enabled = true WHERE id = 1;

# Check watcher received notification
# Should see: "📢 Received notification: ..."
```

## Performance Testing

### HTTP Load Testing with wrk

```bash
# Install wrk
apt-get install wrk  # Ubuntu/Debian
brew install wrk     # macOS

# Run load test
wrk -t4 -c100 -d30s https://app1.domain.com
```

### TCP Connection Testing

```bash
# Test concurrent connections
for i in {1..10}; do
  (ssh -p 2201 user@domain.com "echo Connection $i" &)
done
```

## Troubleshooting Common Issues

### Issue: Connection Refused

**Possible causes:**
- HAProxy not running
- Port not exposed in Docker/firewall
- Backend server not running

**Solution:**
```bash
# Check HAProxy is running
docker ps | grep haproxy

# Check ports are exposed
docker port haproxy-dynamic-proxy

# Restart HAProxy
docker restart haproxy-dynamic-proxy
```

### Issue: Wrong Backend

**Possible causes:**
- SNI/Host header mismatch
- Configuration not reloaded

**Solution:**
```bash
# Regenerate configuration
docker exec haproxy-dynamic-proxy node dist/generate-haproxy-config.js --reload

# Check configuration
docker exec haproxy-dynamic-proxy cat /etc/haproxy/haproxy.cfg
```

### Issue: SSL Certificate Error

**Possible causes:**
- Certificate not valid for SNI domain
- Backend not serving correct certificate

**Solution:**
```bash
# Check certificate
openssl s_client -connect domain.com:443 -servername app1.domain.com | openssl x509 -noout -text

# Verify SNI routing
curl -v --resolve app1.domain.com:443:YOUR_IP https://app1.domain.com
```

## Automated Testing Script

Create a test script `test-all-protocols.sh`:

```bash
#!/bin/bash

echo "Testing HTTPS..."
curl -s -o /dev/null -w "%{http_code}" https://app1.domain.com

echo "Testing HTTP..."
curl -s -o /dev/null -w "%{http_code}" http://www.domain.com

echo "Testing SSH..."
nc -zv domain.com 2201

echo "Testing PostgreSQL..."
pg_isready -h domain.com -p 5433

echo "Testing HAProxy Stats..."
curl -s -u admin:changeme http://domain.com:8404/stats | grep -q "HAProxy Statistics"

echo "All tests completed!"
```

Run with:
```bash
chmod +x test-all-protocols.sh
./test-all-protocols.sh
```
