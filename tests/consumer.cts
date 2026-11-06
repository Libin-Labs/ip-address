import { parseCidr, formatCidr, type IpNetwork } from '@lp-labs/ip-address';
const net: IpNetwork = parseCidr('0.0.0.0/0');
const text: string = formatCidr(net);
void text;
// @ts-expect-error IPv5 unsupported
formatCidr({ version: 5, value: 0n, prefix: 0 });
