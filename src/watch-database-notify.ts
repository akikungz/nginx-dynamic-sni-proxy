#!/usr/bin/env node

import { Client } from 'pg';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
const HAPROXY_CONFIG_PATH = process.env.HAPROXY_CONFIG_PATH || '/etc/haproxy/haproxy.cfg';

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

let isGenerating = false;
let pendingRegeneration = false;

async function generateAndReloadHAProxy(): Promise<void> {
  if (isGenerating) {
    pendingRegeneration = true;
    console.log('⏳ Configuration generation already in progress, will regenerate after completion');
    return;
  }

  try {
    isGenerating = true;
    console.log('\n🔄 Detected database change, regenerating HAProxy configuration...');

    // Generate HAProxy config
    execSync('node dist/generate-haproxy-config.js --reload', {
      stdio: 'inherit',
      env: { ...process.env },
    });

    console.log('✅ HAProxy configuration regenerated and reloaded successfully\n');
  } catch (error: any) {
    console.error('❌ Error regenerating HAProxy configuration:', error.message);
  } finally {
    isGenerating = false;

    // If another change came in while we were generating, trigger again
    if (pendingRegeneration) {
      pendingRegeneration = false;
      setTimeout(() => generateAndReloadHAProxy(), 1000);
    }
  }
}

async function startWatching(): Promise<void> {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database');

    // Listen to the notification channel
    await client.query('LISTEN config_changes');
    console.log('👂 Listening for configuration changes on channel "config_changes"...\n');

    client.on('notification', (msg) => {
      if (msg.channel === 'config_changes') {
        console.log(`📢 Received notification: ${msg.payload}`);
        generateAndReloadHAProxy();
      }
    });

    // Handle errors
    client.on('error', (err) => {
      console.error('❌ Database connection error:', err.message);
      console.log('🔄 Attempting to reconnect in 5 seconds...');
      setTimeout(() => {
        client.end();
        startWatching();
      }, 5000);
    });

    // Handle shutdown gracefully
    process.on('SIGTERM', async () => {
      console.log('\n⏹️  Received SIGTERM, shutting down gracefully...');
      await client.end();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('\n⏹️  Received SIGINT, shutting down gracefully...');
      await client.end();
      process.exit(0);
    });

  } catch (error: any) {
    console.error('❌ Error starting database watcher:', error.message);
    await client.end();
    process.exit(1);
  }
}

async function main() {
  console.log('🚀 Starting HAProxy Database Watcher...\n');
  await startWatching();
}

main();
