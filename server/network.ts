import { isIPv4, isIPv6 } from "node:net";

// The network an address belongs to, for the gate's per-network limit: an IPv4
// address as is, or an IPv6 address's /64 prefix, since one home connection on
// IPv6 can use any address in its /64.
export function networkKey(address: string): string {
  const ip = address.trim().replace(/%.*$/, ""); // drop an IPv6 zone like %en0
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return mapped[1]!;
  if (isIPv4(ip)) return ip;
  if (!isIPv6(ip)) return ip || "unknown";

  const [head = "", tail] = ip.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups = tail === undefined ? headGroups : [...headGroups, ...Array(missing).fill("0"), ...tailGroups];
  const prefix = groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16));
  return `${prefix.join(":")}::/64`;
}
