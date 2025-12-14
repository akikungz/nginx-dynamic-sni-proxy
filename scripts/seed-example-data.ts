#!/usr/bin/env ts-node

/**
 * Seed example data for testing HAProxy Dynamic Proxy
 * 
 * This script creates sample instances and reverse proxies
 * to demonstrate all supported protocols.
 */

import { PrismaClient, ProxyProtocol, InstanceState, VmStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding example data...\n');

  // Create instances
  console.log('📦 Creating instances...');
  
  const webServer1 = await prisma.instance.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'web-server-1',
      ipAddress: '192.168.1.10',
      state: InstanceState.ACTIVE,
      vmStatus: VmStatus.RUNNING,
    },
  });
  console.log(`  ✅ Created instance: ${webServer1.name}`);

  const webServer2 = await prisma.instance.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: 'web-server-2',
      ipAddress: '192.168.1.11',
      state: InstanceState.ACTIVE,
      vmStatus: VmStatus.RUNNING,
    },
  });
  console.log(`  ✅ Created instance: ${webServer2.name}`);

  const dbServer1 = await prisma.instance.upsert({
    where: { id: 3 },
    update: {},
    create: {
      name: 'postgres-server-1',
      ipAddress: '192.168.1.20',
      state: InstanceState.ACTIVE,
      vmStatus: VmStatus.RUNNING,
    },
  });
  console.log(`  ✅ Created instance: ${dbServer1.name}`);

  const redisServer1 = await prisma.instance.upsert({
    where: { id: 4 },
    update: {},
    create: {
      name: 'redis-server-1',
      ipAddress: '192.168.1.30',
      state: InstanceState.ACTIVE,
      vmStatus: VmStatus.RUNNING,
    },
  });
  console.log(`  ✅ Created instance: ${redisServer1.name}`);

  // Create reverse proxies
  console.log('\n🔀 Creating reverse proxies...\n');

  // HTTPS proxies with SNI
  console.log('📡 HTTPS Proxies:');
  const httpsProxy1 = await prisma.reverse_proxy.create({
    data: {
      protocol: ProxyProtocol.HTTPS_SNI,
      targetPort: 443,
      targetInstanceId: webServer1.id,
      customDomain: 'app1.example.com',
      maxConnections: 1000,
      enabled: true,
    },
  });
  console.log(`  ✅ HTTPS: app1.example.com -> ${webServer1.ipAddress}:443`);

  const httpsProxy2 = await prisma.reverse_proxy.create({
    data: {
      protocol: ProxyProtocol.HTTPS_SNI,
      targetPort: 443,
      targetInstanceId: webServer2.id,
      customDomain: 'app2.example.com',
      maxConnections: 1000,
      enabled: true,
    },
  });
  console.log(`  ✅ HTTPS: app2.example.com -> ${webServer2.ipAddress}:443`);

  // HTTP proxies
  console.log('\n🌐 HTTP Proxies:');
  const httpProxy1 = await prisma.reverse_proxy.create({
    data: {
      protocol: ProxyProtocol.HTTP,
      targetPort: 80,
      targetInstanceId: webServer1.id,
      customDomain: 'www.example.com',
      maxConnections: 1000,
      enabled: true,
    },
  });
  console.log(`  ✅ HTTP: www.example.com -> ${webServer1.ipAddress}:80`);

  // SSH proxies
  console.log('\n🔐 SSH Proxies:');
  const sshProxy1 = await prisma.reverse_proxy.create({
    data: {
      protocol: ProxyProtocol.SSH,
      publicPort: 2201,
      targetPort: 22,
      targetInstanceId: webServer1.id,
      maxConnections: 100,
      enabled: true,
    },
  });
  console.log(`  ✅ SSH: port 2201 -> ${webServer1.ipAddress}:22`);

  const sshProxy2 = await prisma.reverse_proxy.create({
    data: {
      protocol: ProxyProtocol.SSH,
      publicPort: 2202,
      targetPort: 22,
      targetInstanceId: webServer2.id,
      maxConnections: 100,
      enabled: true,
    },
  });
  console.log(`  ✅ SSH: port 2202 -> ${webServer2.ipAddress}:22`);

  // PostgreSQL proxies
  console.log('\n🐘 PostgreSQL Proxies:');
  const pgProxy1 = await prisma.reverse_proxy.create({
    data: {
      protocol: ProxyProtocol.POSTGRESQL,
      publicPort: 5433,
      targetPort: 5432,
      targetInstanceId: dbServer1.id,
      maxConnections: 200,
      timeoutConnect: 10000,
      timeoutServer: 600000,
      enabled: true,
    },
  });
  console.log(`  ✅ PostgreSQL: port 5433 -> ${dbServer1.ipAddress}:5432`);

  // Redis proxies
  console.log('\n📮 Redis Proxies:');
  const redisProxy1 = await prisma.reverse_proxy.create({
    data: {
      protocol: ProxyProtocol.REDIS,
      publicPort: 6380,
      targetPort: 6379,
      targetInstanceId: redisServer1.id,
      maxConnections: 1000,
      enabled: true,
    },
  });
  console.log(`  ✅ Redis: port 6380 -> ${redisServer1.ipAddress}:6379`);

  console.log('\n✅ Seeding completed successfully!\n');
  console.log('📊 Summary:');
  console.log(`  - Instances created: 4`);
  console.log(`  - HTTPS proxies: 2`);
  console.log(`  - HTTP proxies: 1`);
  console.log(`  - SSH proxies: 2`);
  console.log(`  - PostgreSQL proxies: 1`);
  console.log(`  - Redis proxies: 1`);
  console.log(`  - Total proxies: 7\n`);
  
  console.log('🚀 Next steps:');
  console.log('  1. Update domain names in database (if needed)');
  console.log('  2. Update IP addresses to match your infrastructure');
  console.log('  3. Generate HAProxy config: npm run generate-haproxy-config');
  console.log('  4. Test connections to your services\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
