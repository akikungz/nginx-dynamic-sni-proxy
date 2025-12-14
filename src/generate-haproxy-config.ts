#!/usr/bin/env node

import { PrismaClient, ProxyProtocol, InstanceState, VmStatus } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const HAPROXY_CONFIG_PATH = process.env.HAPROXY_CONFIG_PATH || '/etc/haproxy/haproxy.cfg';
const STATS_PORT = process.env.STATS_PORT || '8404';
const STATS_USERNAME = process.env.STATS_USERNAME || 'admin';
const STATS_PASSWORD = process.env.STATS_PASSWORD || 'changeme';

interface ProxyConfig {
  id: number;
  protocol: ProxyProtocol;
  publicPort: number | null;
  targetPort: number;
  customDomain: string | null;
  maxConnections: number;
  timeoutConnect: number;
  timeoutServer: number;
  enabled: boolean;
  targetInstance: {
    id: number;
    name: string;
    ipAddress: string;
    state: InstanceState;
    vmStatus: VmStatus;
  };
}

async function fetchProxyConfigs(): Promise<ProxyConfig[]> {
  const proxies = await prisma.reverse_proxy.findMany({
    where: {
      enabled: true,
      targetInstance: {
        state: InstanceState.ACTIVE,
        vmStatus: VmStatus.RUNNING,
      },
    },
    include: {
      targetInstance: true,
    },
    orderBy: [{ protocol: 'asc' }, { publicPort: 'asc' }],
  });

  return proxies as ProxyConfig[];
}

function generateGlobalSection(): string {
  return `global
    log /dev/log local0
    log /dev/log local1 notice
    maxconn 4096
    user haproxy
    group haproxy
    daemon
    # Default SSL material locations
    ca-base /etc/ssl/certs
    crt-base /etc/ssl/private

`;
}

function generateDefaultsSection(): string {
  return `defaults
    log     global
    mode    tcp
    option  tcplog
    option  dontlognull
    timeout connect 5s
    timeout client  300s
    timeout server  300s
    retries 3

`;
}

function generateHTTPSFrontend(configs: ProxyConfig[]): string {
  const httpsConfigs = configs.filter((c) => c.protocol === ProxyProtocol.HTTPS_SNI && c.customDomain);

  if (httpsConfigs.length === 0) {
    return '';
  }

  let config = `# HTTPS Frontend with SNI Routing
frontend https_front
    bind *:443
    mode tcp
    option tcplog
    tcp-request inspect-delay 5s
    tcp-request content accept if { req_ssl_hello_type 1 }

`;

  // Generate ACLs for each domain
  for (const proxy of httpsConfigs) {
    const safeName = proxy.customDomain!.replace(/[^a-zA-Z0-9]/g, '_');
    config += `    acl ${safeName}_sni req_ssl_sni -i ${proxy.customDomain}\n`;
  }

  config += '\n';

  // Generate use_backend rules
  for (const proxy of httpsConfigs) {
    const safeName = proxy.customDomain!.replace(/[^a-zA-Z0-9]/g, '_');
    config += `    use_backend https_${safeName} if ${safeName}_sni\n`;
  }

  config += '\n';

  return config;
}

function generateHTTPFrontend(configs: ProxyConfig[]): string {
  const httpConfigs = configs.filter((c) => c.protocol === ProxyProtocol.HTTP && c.customDomain);

  if (httpConfigs.length === 0) {
    return '';
  }

  let config = `# HTTP Frontend with Host Header Routing
frontend http_front
    bind *:80
    mode http
    option httplog

`;

  // Generate ACLs for each domain
  for (const proxy of httpConfigs) {
    const safeName = proxy.customDomain!.replace(/[^a-zA-Z0-9]/g, '_');
    config += `    acl ${safeName}_host hdr(host) -i ${proxy.customDomain}\n`;
  }

  config += '\n';

  // Generate use_backend rules
  for (const proxy of httpConfigs) {
    const safeName = proxy.customDomain!.replace(/[^a-zA-Z0-9]/g, '_');
    config += `    use_backend http_${safeName} if ${safeName}_host\n`;
  }

  config += '\n';

  return config;
}

function generateHTTPSBackends(configs: ProxyConfig[]): string {
  const httpsConfigs = configs.filter((c) => c.protocol === ProxyProtocol.HTTPS_SNI && c.customDomain);

  if (httpsConfigs.length === 0) {
    return '';
  }

  let config = '# HTTPS Backends\n';

  for (const proxy of httpsConfigs) {
    const safeName = proxy.customDomain!.replace(/[^a-zA-Z0-9]/g, '_');
    const timeoutConnectSec = Math.ceil(proxy.timeoutConnect / 1000);
    const timeoutServerSec = Math.ceil(proxy.timeoutServer / 1000);

    config += `backend https_${safeName}
    mode tcp
    balance roundrobin
    timeout connect ${timeoutConnectSec}s
    timeout server ${timeoutServerSec}s
    server ${proxy.targetInstance.name} ${proxy.targetInstance.ipAddress}:${proxy.targetPort} check maxconn ${proxy.maxConnections}

`;
  }

  return config;
}

function generateHTTPBackends(configs: ProxyConfig[]): string {
  const httpConfigs = configs.filter((c) => c.protocol === ProxyProtocol.HTTP && c.customDomain);

  if (httpConfigs.length === 0) {
    return '';
  }

  let config = '# HTTP Backends\n';

  for (const proxy of httpConfigs) {
    const safeName = proxy.customDomain!.replace(/[^a-zA-Z0-9]/g, '_');
    const timeoutConnectSec = Math.ceil(proxy.timeoutConnect / 1000);
    const timeoutServerSec = Math.ceil(proxy.timeoutServer / 1000);

    config += `backend http_${safeName}
    mode http
    balance roundrobin
    timeout connect ${timeoutConnectSec}s
    timeout server ${timeoutServerSec}s
    server ${proxy.targetInstance.name} ${proxy.targetInstance.ipAddress}:${proxy.targetPort} check maxconn ${proxy.maxConnections}

`;
  }

  return config;
}

function generatePortBasedFrontends(configs: ProxyConfig[], protocol: ProxyProtocol, protocolName: string): string {
  const protocolConfigs = configs.filter((c) => c.protocol === protocol && c.publicPort);

  if (protocolConfigs.length === 0) {
    return '';
  }

  let config = `# ${protocolName} Frontends\n`;

  for (const proxy of protocolConfigs) {
    const safeName = `${protocolName.toLowerCase()}_${proxy.publicPort}`;
    const timeoutConnectSec = Math.ceil(proxy.timeoutConnect / 1000);
    const timeoutServerSec = Math.ceil(proxy.timeoutServer / 1000);

    config += `frontend ${safeName}_front
    bind *:${proxy.publicPort}
    mode tcp
    option tcplog
    timeout connect ${timeoutConnectSec}s
    default_backend ${safeName}_back

backend ${safeName}_back
    mode tcp
    balance roundrobin
    timeout connect ${timeoutConnectSec}s
    timeout server ${timeoutServerSec}s
    server ${proxy.targetInstance.name} ${proxy.targetInstance.ipAddress}:${proxy.targetPort} check maxconn ${proxy.maxConnections}

`;
  }

  return config;
}

function generateStatsSection(): string {
  return `# Stats Page
listen stats
    bind *:${STATS_PORT}
    mode http
    stats enable
    stats uri /stats
    stats refresh 30s
    stats auth ${STATS_USERNAME}:${STATS_PASSWORD}
    stats admin if TRUE

`;
}

async function generateHAProxyConfig(): Promise<string> {
  const configs = await fetchProxyConfigs();

  console.log(`📊 Found ${configs.length} active proxy configurations`);

  let config = '';

  // Global section
  config += generateGlobalSection();

  // Defaults section
  config += generateDefaultsSection();

  // HTTPS frontend with SNI
  config += generateHTTPSFrontend(configs);

  // HTTP frontend with host header routing
  config += generateHTTPFrontend(configs);

  // HTTPS backends
  config += generateHTTPSBackends(configs);

  // HTTP backends
  config += generateHTTPBackends(configs);

  // Port-based protocols
  config += generatePortBasedFrontends(configs, ProxyProtocol.SSH, 'SSH');
  config += generatePortBasedFrontends(configs, ProxyProtocol.POSTGRESQL, 'PostgreSQL');
  config += generatePortBasedFrontends(configs, ProxyProtocol.MYSQL, 'MySQL');
  config += generatePortBasedFrontends(configs, ProxyProtocol.REDIS, 'Redis');
  config += generatePortBasedFrontends(configs, ProxyProtocol.TCP_GENERIC, 'TCP');

  // Stats section
  config += generateStatsSection();

  return config;
}

function backupConfig(configPath: string): void {
  if (fs.existsSync(configPath)) {
    const backupPath = `${configPath}.backup.${Date.now()}`;
    fs.copyFileSync(configPath, backupPath);
    console.log(`📦 Backed up existing config to ${backupPath}`);
  }
}

function testConfig(configPath: string): boolean {
  try {
    execSync(`haproxy -c -f ${configPath}`, { stdio: 'pipe' });
    console.log('✅ HAProxy configuration is valid');
    return true;
  } catch (error: any) {
    console.error('❌ HAProxy configuration is invalid:');
    console.error(error.stderr?.toString() || error.message);
    return false;
  }
}

function reloadHAProxy(): void {
  try {
    const pidFile = '/run/haproxy.pid';
    
    if (fs.existsSync(pidFile)) {
      const pid = fs.readFileSync(pidFile, 'utf-8').trim();
      execSync(`haproxy -f ${HAPROXY_CONFIG_PATH} -p ${pidFile} -sf ${pid}`, { stdio: 'inherit' });
      console.log('🔄 HAProxy reloaded gracefully');
    } else {
      console.log('⚠️  HAProxy PID file not found, skipping reload');
    }
  } catch (error: any) {
    console.error('❌ Failed to reload HAProxy:', error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log('🚀 Generating HAProxy configuration...');

    const config = await generateHAProxyConfig();

    // Ensure directory exists
    const configDir = path.dirname(HAPROXY_CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Backup existing config
    backupConfig(HAPROXY_CONFIG_PATH);

    // Write new config
    fs.writeFileSync(HAPROXY_CONFIG_PATH, config);
    console.log(`📝 Configuration written to ${HAPROXY_CONFIG_PATH}`);

    // Test config
    if (!testConfig(HAPROXY_CONFIG_PATH)) {
      console.error('❌ Configuration test failed, not reloading HAProxy');
      process.exit(1);
    }

    // Reload HAProxy if running
    if (process.env.NODE_ENV === 'production' || process.argv.includes('--reload')) {
      reloadHAProxy();
    }

    console.log('✅ HAProxy configuration generated successfully');
  } catch (error: any) {
    console.error('❌ Error generating HAProxy configuration:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { generateHAProxyConfig, fetchProxyConfigs };
