import { networkInterfaces } from 'node:os';

export function phoneAddresses(port = 8787) {
  return Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses || []).filter(a => a.family === 'IPv4' && !a.internal)
      .map(a => ({ name, url: `http://${a.address}:${port}/` })));
}
