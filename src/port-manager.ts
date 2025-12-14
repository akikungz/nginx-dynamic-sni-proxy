import { PrismaClient, ProxyProtocol } from '@prisma/client';

const prisma = new PrismaClient();

interface PortRange {
  start: number;
  end: number;
}

const PORT_RANGES: Record<string, PortRange> = {
  SSH: {
    start: parseInt(process.env.SSH_PORT_START || '2201'),
    end: parseInt(process.env.SSH_PORT_END || '2299'),
  },
  POSTGRESQL: {
    start: parseInt(process.env.POSTGRES_PORT_START || '5433'),
    end: parseInt(process.env.POSTGRES_PORT_END || '5533'),
  },
  MYSQL: {
    start: parseInt(process.env.MYSQL_PORT_START || '3307'),
    end: parseInt(process.env.MYSQL_PORT_END || '3407'),
  },
  REDIS: {
    start: parseInt(process.env.REDIS_PORT_START || '6380'),
    end: parseInt(process.env.REDIS_PORT_END || '6480'),
  },
};

export async function getUsedPorts(): Promise<Set<number>> {
  const proxies = await prisma.reverse_proxy.findMany({
    where: {
      publicPort: { not: null },
      enabled: true,
    },
    select: { publicPort: true },
  });

  return new Set(proxies.map((p) => p.publicPort!).filter((p) => p !== null));
}

export function getPortRangeForProtocol(protocol: ProxyProtocol): PortRange | null {
  switch (protocol) {
    case ProxyProtocol.SSH:
      return PORT_RANGES.SSH;
    case ProxyProtocol.POSTGRESQL:
      return PORT_RANGES.POSTGRESQL;
    case ProxyProtocol.MYSQL:
      return PORT_RANGES.MYSQL;
    case ProxyProtocol.REDIS:
      return PORT_RANGES.REDIS;
    default:
      return null;
  }
}

export async function getNextAvailablePort(protocol: ProxyProtocol): Promise<number | null> {
  const range = getPortRangeForProtocol(protocol);
  if (!range) return null;

  const usedPorts = await getUsedPorts();

  for (let port = range.start; port <= range.end; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }

  return null;
}

export async function isPortAvailable(port: number): Promise<boolean> {
  const usedPorts = await getUsedPorts();
  return !usedPorts.has(port);
}

export function validatePortInRange(port: number, protocol: ProxyProtocol): boolean {
  const range = getPortRangeForProtocol(protocol);
  if (!range) return true; // No range restriction for this protocol

  return port >= range.start && port <= range.end;
}

export async function suggestPort(protocol: ProxyProtocol): Promise<{ port: number | null; message: string }> {
  const range = getPortRangeForProtocol(protocol);
  
  if (!range) {
    return {
      port: null,
      message: `Protocol ${protocol} does not require a public port (uses SNI or host-based routing)`,
    };
  }

  const nextPort = await getNextAvailablePort(protocol);
  
  if (nextPort) {
    return {
      port: nextPort,
      message: `Suggested port: ${nextPort} (Range: ${range.start}-${range.end})`,
    };
  }

  return {
    port: null,
    message: `No available ports in range ${range.start}-${range.end} for protocol ${protocol}`,
  };
}
