#!/usr/bin/env node

/**
 * Database Change Watcher - Polling Implementation
 * 
 * This script polls the database at regular intervals to detect changes
 * in reverse proxy configurations and triggers Nginx config regeneration.
 */

import { PrismaClient } from '@prisma/client';
import { main as generateConfig } from './generate-nginx-config';

const prisma = new PrismaClient();

// Configuration
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '30000', 10); // 30 seconds default
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

interface ChangeDetectionState {
  lastChecksum: string;
  lastUpdate: Date;
}

let state: ChangeDetectionState = {
  lastChecksum: '',
  lastUpdate: new Date()
};

/**
 * Logger utility
 */
function log(level: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] [POLLING] ${message}`;
  console.log(logMessage);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Calculate checksum of current proxy configurations
 */
async function calculateChecksum(): Promise<string> {
  try {
    const reverseProxies = await prisma.reverseProxy.findMany({
      where: {
        enabled: true
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
      },
      orderBy: [
        { subdomain: 'asc' },
        { targetPort: 'asc' }
      ]
    });

    // Create a deterministic string representation
    const configString = JSON.stringify(reverseProxies.map(rp => ({
      id: rp.id,
      subdomain: rp.subdomain,
      targetPort: rp.targetPort,
      protocol: rp.protocol,
      enabled: rp.enabled,
      instanceStatus: rp.instance.status,
      vmStatus: rp.instance.pveVm?.status,
      ipAddress: rp.instance.pveVm?.ipAddress?.address,
      updatedAt: rp.updatedAt
    })));

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < configString.length; i++) {
      const char = configString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return hash.toString(36);
  } catch (error) {
    log('error', 'Failed to calculate checksum', error);
    throw error;
  }
}

/**
 * Check for database changes
 */
async function checkForChanges(): Promise<boolean> {
  try {
    const currentChecksum = await calculateChecksum();
    
    if (currentChecksum !== state.lastChecksum) {
      log('info', 'Database changes detected', {
        oldChecksum: state.lastChecksum,
        newChecksum: currentChecksum
      });
      state.lastChecksum = currentChecksum;
      state.lastUpdate = new Date();
      return true;
    }
    
    return false;
  } catch (error) {
    log('error', 'Failed to check for changes', error);
    return false;
  }
}

/**
 * Handle detected changes
 */
async function handleChanges() {
  try {
    log('info', 'Triggering Nginx configuration regeneration...');
    await generateConfig();
    log('info', 'Configuration regeneration completed');
  } catch (error) {
    log('error', 'Failed to regenerate configuration', error);
  }
}

/**
 * Poll for database changes
 */
async function poll() {
  log('info', `Checking for database changes (interval: ${POLL_INTERVAL}ms)...`);
  
  const hasChanges = await checkForChanges();
  
  if (hasChanges) {
    await handleChanges();
  } else {
    if (LOG_LEVEL === 'debug') {
      log('debug', 'No changes detected');
    }
  }
}

/**
 * Main execution loop
 */
async function main() {
  log('info', 'Starting database polling watcher...');
  log('info', `Poll interval: ${POLL_INTERVAL}ms`);
  
  // Initial checksum calculation
  try {
    state.lastChecksum = await calculateChecksum();
    log('info', 'Initial checksum calculated', { checksum: state.lastChecksum });
  } catch (error) {
    log('error', 'Failed to calculate initial checksum', error);
  }
  
  // Start polling loop
  setInterval(async () => {
    try {
      await poll();
    } catch (error) {
      log('error', 'Polling error', error);
    }
  }, POLL_INTERVAL);
  
  log('info', 'Polling watcher started successfully');
  
  // Keep process alive
  process.on('SIGINT', async () => {
    log('info', 'Shutting down polling watcher...');
    await prisma.$disconnect();
    process.exit(0);
  });
}

// Run main function if called directly
if (require.main === module) {
  main().catch(error => {
    log('error', 'Fatal error', error);
    process.exit(1);
  });
}

export { main, checkForChanges };
