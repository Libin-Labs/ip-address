# @lp-labs/ip-address

Strict IPv4/IPv6 parsing, canonical formatting, bigint CIDR operations, minimal range summaries and network union.

Original MIT TypeScript implementation with **zero runtime or peer dependencies**. ESM/CommonJS with separate declarations. Node18+ and compatible ES2022 browsers with bigint support. No network, file I/O or globals accessed at import; development-only TypeScript and Prettier.

## Install

```sh
npm install @lp-labs/ip-address
```

## Working example

```js
import {
  parseIp,
  formatIp,
  parseCidr,
  formatCidr,
  cidrRange,
  cidrContains,
  cidrOverlaps,
  summarizeIpRange,
  collapseCidrs,
  IpAddressError,
} from '@lp-labs/ip-address';
const net = parseCidr('192.168.10.37/24', { normalize: true });
if (formatCidr(net) !== '192.168.10.0/24') throw new Error('Bad normalization');
if (!cidrContains(net, parseIp('192.168.10.255'))) throw new Error('Bad membership');
if (!cidrOverlaps(net, parseCidr('192.168.10.128/25'))) throw new Error('Bad overlap');
if (cidrRange(net).size !== 256n) throw new Error('Bad range');
if (formatIp(parseIp('2001:0DB8:0:0:1:0:0:1')) !== '2001:db8::1:0:0:1') throw new Error('Bad IPv6');
const blocks = summarizeIpRange(parseIp('192.0.2.1'), parseIp('192.0.2.6'));
if (blocks.length !== 4) throw new Error('Bad range summary');
const union = collapseCidrs(['192.0.2.0/25', '192.0.2.128/25'].map((value) => parseCidr(value)));
if (formatCidr(union[0]) !== '192.0.2.0/24') throw new Error('Bad union');
if (!(new IpAddressError('invalid', 'example') instanceof Error)) throw new Error('Error API');
```

CommonJS: `const api = require('@lp-labs/ip-address')`.

## Behavior, customization, errors and performance

Addresses are {version:4|6,value:bigint}; networks add an integer prefix. Plain immutable-style inputs are never changed and outputs are caller-owned objects. Values must fit 32/128 bits. Bigints avoid IPv6 rounding and signed IPv4 bitwise bugs; JSON.stringify requires your explicit string conversion for bigint fields. This is purely lexical arithmetic: no DNS, sockets, requests, registry/private-address data, routing, firewall enforcement, zone IDs or public-reachability claims.

parseIp accepts bare IPv4 dotted decimal with exactly four unpadded octets, or IPv6 with eight hex groups, a single :: zero-run abbreviation, and optional trailing IPv4 dotted notation. Rejects whitespace, brackets, ports, percent zones, legacy octal/hex/short IPv4 and multiple compressions. IPv4 input length <=15, IPv6 textual input <=45, overall guard <=45 characters. formatIp uses lowercase unpadded hex, longest zero run of length>=2 (leftmost tie), and no compression for isolated zero. Embedded IPv4 tails are formatted in pure hex, not dotted mixed notation; e.g. ::ffff:192.0.2.128 -> ::ffff:c000:280. Original textual spelling is not retained.

parseCidr requires address/prefix with no padded prefix; default rejects any host bits. Customize {normalize:true} to mask explicitly. formatCidr, cidrRange, cidrContains and cidrOverlaps require already-normalized networks. Mixed version membership/overlap/range operations throw, not false. cidrRange returns inclusive first/last and bigint size; includes all addresses even IPv4 network/broadcast, including /31,/32. No arbitrary usable-host convention is imposed. summarizeIpRange returns the minimal ascending aligned CIDRs that exactly cover inclusive same-version endpoints (up to 2*bitWidth blocks). collapseCidrs merges overlaps, duplicates, containment and adjacency; partitions IPv4 first then IPv6, each ascending. Empty input returns []. Customize maxNetworks (default4096, allowed1..100000); exceeding it throws.

IpAddressError.code is invalid for malformed data, type/range/version mismatch or bad limits, limit for count overflow. Parse checks are bounded to 45 characters; formatting and CIDR arithmetic use at most128-bit bigint work. Range summary O(bitWidth squared) bounded by128 bits. Collapse O(n log n + n*bitWidth squared) time/O(n) retained intervals and output; computation is synchronous, no hidden workers. Hostile getters/proxies are not a supported input form. No dependencies or standards reference tables are embedded.

## Complete public API

Configure through these interfaces; no private internals or source edits are required. Type-only exports are available in both module formats.

```ts
export type IpVersion = 4 | 6;
export interface IpAddress {
  version: IpVersion;
  value: bigint;
}
export interface IpNetwork extends IpAddress {
  prefix: number;
}
export interface IpRange {
  first: IpAddress;
  last: IpAddress;
  size: bigint;
}
export declare class IpAddressError extends Error {
  readonly code: 'invalid' | 'limit';
  constructor(code: 'invalid' | 'limit', message: string);
}
export declare function parseIp(text: string): IpAddress;
export declare function formatIp(address: IpAddress): string;
export declare function parseCidr(
  text: string,
  options?: {
    normalize?: boolean;
  },
): IpNetwork;
export declare function formatCidr(input: IpNetwork): string;
export declare function cidrRange(input: IpNetwork): IpRange;
export declare function cidrContains(input: IpNetwork, address: IpAddress): boolean;
export declare function cidrOverlaps(left: IpNetwork, right: IpNetwork): boolean;
export declare function summarizeIpRange(first: IpAddress, last: IpAddress): IpNetwork[];
export declare function collapseCidrs(
  inputs: readonly IpNetwork[],
  maxNetworks?: number,
): IpNetwork[];
```

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
