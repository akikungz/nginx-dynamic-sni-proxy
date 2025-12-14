#!/usr/bin/env node

/**
 * Generate Nginx Configuration from Database
 * 
 * This script fetches reverse proxy configurations from the database,
 * generates Nginx stream configuration, backs up the existing config,
 * tests the new configuration, and reloads Nginx if successful.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

// Configuration from environment variables
const NGINX_CONFIG_PATH = process.env.NGINX_CONFIG_PATH || '/etc/nginx/nginx.conf';
const DOMAIN_SUFFIX = process.env.DOMAIN_SUFFIX || 'example.com';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

interface ProxyConfig {
  subdomain: string;
  targetPort: number;
  protocol: string;
  ipAddress: string;
  instanceName: string;
}

/**
 * Logger utility
 */
function log(level: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(logMessage);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Fetch active reverse proxy configurations from database
 */
async function fetchProxyConfigs(): Promise<ProxyConfig[]> {
  try {
    log('info', 'Fetching reverse proxy configurations from database...');
    
    const reverseProxies = await prisma.reverseProxy.findMany({
      where: {
        enabled: true,
        instance: {
          status: {
            in: ['ACTIVE', 'ARCHIVED']
          },
          pveVm: {
            status: 'RUNNING',
            ipAddress: {
              isNot: null
            }
          }
        }
      },
      include: {
        instance: {
          include: {
            pveVm: {
              include: {
                ipAddress: true
              }
            }
          }
        }
      }
    });

    const configs: ProxyConfig[] = reverseProxies
      .filter(rp => rp.instance.pveVm?.ipAddress?.address)
      .map(rp => ({
        subdomain: rp.subdomain,
        targetPort: rp.targetPort,
        protocol: rp.protocol,
        ipAddress: rp.instance.pveVm!.ipAddress!.address,
        instanceName: rp.instance.name
      }));

    log('info', `Found ${configs.length} active proxy configurations`);
    return configs;
  } catch (error) {
    log('error', 'Failed to fetch proxy configurations', error);
    throw error;
  }
}

/**
 * Generate Nginx stream configuration
 */
function generateNginxConfig(configs: ProxyConfig[]): string {
  // Generate mapping entries with comments
  const mapEntries = configs.map(config => {
    const serverName = `${config.subdomain}.${DOMAIN_SUFFIX}`;
    return `        ${serverName} ${config.ipAddress}:${config.targetPort};  # ${config.instanceName} - ${config.protocol}`;
  }).join('\n');

  return `# Auto-generated Nginx configuration for dynamic SNI proxy
# Generated at: ${new Date().toISOString()}
# DO NOT EDIT MANUALLY - Changes will be overwritten

user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log ${LOG_LEVEL};
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

stream {
    # SNI-based routing map
    map $ssl_preread_server_name $backend_name {
${mapEntries}
        default 127.0.0.1:8080;
    }

    # Logging
    log_format proxy '$remote_addr [$time_local] '
                     '$protocol $status $bytes_sent $bytes_received '
                     '$session_time "$ssl_preread_server_name"';
    
    access_log /var/log/nginx/stream-access.log proxy;

    # Main proxy server - uses SNI map for routing
    server {
        listen 443;
        proxy_pass $backend_name;
        ssl_preread on;
        proxy_protocol on;
    }
}
`;
}

/**
 * Backup existing Nginx configuration
 */
async function backupConfig(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${NGINX_CONFIG_PATH}.backup-${timestamp}`;
  
  try {
    if (fs.existsSync(NGINX_CONFIG_PATH)) {
      fs.copyFileSync(NGINX_CONFIG_PATH, backupPath);
      log('info', `Backed up existing config to ${backupPath}`);
      return backupPath;
    } else {
      log('warn', 'No existing config file to backup');
      return '';
    }
  } catch (error) {
    log('error', 'Failed to backup config', error);
    throw error;
  }
}

/**
 * Write new Nginx configuration
 */
async function writeConfig(config: string): Promise<void> {
  try {
    const dir = path.dirname(NGINX_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(NGINX_CONFIG_PATH, config, 'utf8');
    log('info', `Wrote new configuration to ${NGINX_CONFIG_PATH}`);
  } catch (error) {
    log('error', 'Failed to write config', error);
    throw error;
  }
}

/**
 * Test Nginx configuration
 */
async function testNginxConfig(): Promise<boolean> {
  try {
    log('info', 'Testing Nginx configuration...');
    await execAsync('nginx -t');
    log('info', 'Nginx configuration test passed');
    return true;
  } catch (error: any) {
    log('error', 'Nginx configuration test failed', {
      stdout: error.stdout,
      stderr: error.stderr
    });
    return false;
  }
}

/**
 * Reload Nginx
 */
async function reloadNginx(): Promise<void> {
  try {
    log('info', 'Reloading Nginx...');
    await execAsync('nginx -s reload');
    log('info', 'Nginx reloaded successfully');
  } catch (error: any) {
    log('error', 'Failed to reload Nginx', {
      stdout: error.stdout,
      stderr: error.stderr
    });
    throw error;
  }
}

/**
 * Main execution flow
 */
async function main() {
  let backupPath = '';
  
  try {
    log('info', 'Starting Nginx configuration generation...');
    
    // Fetch configurations from database
    const configs = await fetchProxyConfigs();
    
    if (configs.length === 0) {
      log('warn', 'No active proxy configurations found. Skipping update.');
      return;
    }
    
    // Generate new configuration
    const newConfig = generateNginxConfig(configs);
    
    // Backup existing configuration
    backupPath = await backupConfig();
    
    // Write new configuration
    await writeConfig(newConfig);
    
    // Test configuration
    const testPassed = await testNginxConfig();
    
    if (!testPassed) {
      // Restore backup if test fails
      if (backupPath && fs.existsSync(backupPath)) {
        log('warn', 'Restoring backup configuration...');
        fs.copyFileSync(backupPath, NGINX_CONFIG_PATH);
        log('info', 'Backup restored');
      }
      throw new Error('Nginx configuration test failed');
    }
    
    // Reload Nginx
    await reloadNginx();
    
    log('info', 'Nginx configuration updated successfully');
  } catch (error) {
    log('error', 'Failed to generate Nginx configuration', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run main function if called directly
if (require.main === module) {
  main();
}

export { main, fetchProxyConfigs, generateNginxConfig };
