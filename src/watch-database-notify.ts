#!/usr/bin/env node

/**
 * Database Change Watcher - PostgreSQL LISTEN/NOTIFY Implementation
 * 
 * This script uses PostgreSQL's LISTEN/NOTIFY mechanism to receive
 * real-time notifications about database changes and triggers Nginx
 * config regeneration.
 */

import { Client } from 'pg';
import { main as generateConfig } from './generate-nginx-config';

// Configuration
const DATABASE_URL = process.env.DATABASE_URL || '';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const DEBOUNCE_DELAY = parseInt(process.env.DEBOUNCE_DELAY || '5000', 10); // 5 seconds default

let debounceTimer: NodeJS.Timeout | null = null;

/**
 * Logger utility
 */
function log(level: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] [NOTIFY] ${message}`;
  console.log(logMessage);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Debounced configuration regeneration
 * Prevents multiple rapid changes from triggering multiple regenerations
 */
function debouncedRegenerate() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  
  debounceTimer = setTimeout(async () => {
    try {
      log('info', 'Triggering Nginx configuration regeneration...');
      await generateConfig();
      log('info', 'Configuration regeneration completed');
    } catch (error) {
      log('error', 'Failed to regenerate configuration', error);
    }
  }, DEBOUNCE_DELAY);
}

/**
 * Handle notification from PostgreSQL
 */
function handleNotification(msg: any) {
  try {
    log('info', 'Received database notification', {
      channel: msg.channel,
      payload: msg.payload
    });
    
    const payload = JSON.parse(msg.payload);
    
    log('info', 'Change detected', {
      table: payload.table,
      operation: payload.operation,
      id: payload.id
    });
    
    // Trigger debounced regeneration
    debouncedRegenerate();
  } catch (error) {
    log('error', 'Failed to handle notification', error);
  }
}

/**
 * Setup PostgreSQL LISTEN connection
 */
async function setupListener(): Promise<Client> {
  const client = new Client({
    connectionString: DATABASE_URL
  });
  
  try {
    await client.connect();
    log('info', 'Connected to PostgreSQL');
    
    // Listen to multiple channels
    await client.query('LISTEN reverse_proxy_changes');
    await client.query('LISTEN instance_changes');
    await client.query('LISTEN pve_vm_changes');
    
    log('info', 'Listening for database changes on channels:', {
      channels: ['reverse_proxy_changes', 'instance_changes', 'pve_vm_changes']
    });
    
    // Set up notification handler
    client.on('notification', handleNotification);
    
    // Error handling
    client.on('error', (err) => {
      log('error', 'Database connection error', err);
    });
    
    client.on('end', () => {
      log('warn', 'Database connection closed');
    });
    
    return client;
  } catch (error) {
    log('error', 'Failed to setup listener', error);
    throw error;
  }
}

/**
 * Keep connection alive with periodic ping
 */
function setupKeepAlive(client: Client) {
  const KEEPALIVE_INTERVAL = 30000; // 30 seconds
  
  setInterval(async () => {
    try {
      await client.query('SELECT 1');
      if (LOG_LEVEL === 'debug') {
        log('debug', 'Keepalive ping sent');
      }
    } catch (error) {
      log('error', 'Keepalive ping failed', error);
    }
  }, KEEPALIVE_INTERVAL);
}

/**
 * Main execution function
 */
async function main() {
  log('info', 'Starting PostgreSQL LISTEN/NOTIFY watcher...');
  log('info', `Debounce delay: ${DEBOUNCE_DELAY}ms`);
  
  if (!DATABASE_URL) {
    log('error', 'DATABASE_URL environment variable is not set');
    process.exit(1);
  }
  
  try {
    const client = await setupListener();
    setupKeepAlive(client);
    
    log('info', 'LISTEN/NOTIFY watcher started successfully');
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      log('info', 'Shutting down LISTEN/NOTIFY watcher...');
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      await client.end();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      log('info', 'Shutting down LISTEN/NOTIFY watcher...');
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      await client.end();
      process.exit(0);
    });
  } catch (error) {
    log('error', 'Fatal error', error);
    process.exit(1);
  }
}

// Run main function if called directly
if (require.main === module) {
  main();
}

export { main, setupListener, handleNotification };
