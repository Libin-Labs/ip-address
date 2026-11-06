import {
  parseIp,
  formatIp,
  parseCidr,
  formatCidr,
  cidrContains,
  cidrOverlaps,
  cidrRange,
  summarizeIpRange,
  collapseCidrs,
  IpAddressError,
  type IpAddress,
  type IpNetwork,
} from '@lp-labs/ip-address';
const address: IpAddress = parseIp('::1');
const net: IpNetwork = parseCidr('::/0');
const text: string = formatIp(address) + formatCidr(net);
const included: boolean = cidrContains(net, address) && cidrOverlaps(net, net);
const size: bigint = cidrRange(net).size;
const nets: IpNetwork[] = collapseCidrs(summarizeIpRange(address, address));
const code: 'invalid' | 'limit' = new IpAddressError('invalid', 'x').code;
void text;
void included;
void size;
void nets;
void code;
// @ts-expect-error Address values must be bigint
formatIp({ version: 4, value: 1 });
