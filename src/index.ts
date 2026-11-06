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
export class IpAddressError extends Error {
  constructor(
    readonly code: 'invalid' | 'limit',
    message: string,
  ) {
    super(message);
    this.name = 'IpAddressError';
  }
}
function invalid(message: string): never {
  throw new IpAddressError('invalid', message);
}
function width(version: IpVersion): number {
  if (version !== 4 && version !== 6) invalid('IP version must be 4 or 6.');
  return version === 4 ? 32 : 128;
}
function checked(address: IpAddress): number {
  if (!address || typeof address !== 'object') invalid('Expected an address object.');
  const bits = width(address.version);
  if (
    typeof address.value !== 'bigint' ||
    address.value < 0n ||
    address.value >= 1n << BigInt(bits)
  )
    invalid('Address integer is outside its version width.');
  return bits;
}
function prefix(value: number, bits: number): void {
  if (!Number.isInteger(value) || value < 0 || value > bits)
    invalid('Invalid network prefix length.');
}
function mask(bits: number, length: number): bigint {
  return ((1n << BigInt(length)) - 1n) << BigInt(bits - length);
}
function network(input: IpNetwork): IpNetwork {
  const bits = checked(input);
  prefix(input.prefix, bits);
  if ((input.value & mask(bits, input.prefix)) !== input.value)
    invalid('Network value must not contain host bits.');
  return { version: input.version, value: input.value, prefix: input.prefix };
}
function sameVersion(left: IpAddress, right: IpAddress): number {
  const bits = checked(left);
  checked(right);
  if (left.version !== right.version) invalid('Mixed IP versions are not comparable.');
  return bits;
}
export function parseIp(text: string): IpAddress {
  if (typeof text !== 'string' || text.length < 2 || text.length > 45 || /[\s%/[\]]/.test(text))
    invalid('Expected a bare IPv4 or IPv6 address without whitespace, brackets or zone.');
  if (!text.includes(':')) {
    const parts = text.split('.');
    if (
      parts.length !== 4 ||
      parts.some((part) => !/^(?:0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)
    )
      invalid('IPv4 must use four unpadded decimal octets.');
    return { version: 4, value: parts.reduce((value, part) => (value << 8n) | BigInt(part), 0n) };
  }
  let value = text;
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    const tail = parseIp(value.slice(lastColon + 1));
    if (tail.version !== 4) invalid('Invalid embedded IPv4 tail.');
    value =
      value.slice(0, lastColon + 1) +
      `${(tail.value >> 16n).toString(16)}:${(tail.value & 65535n).toString(16)}`;
  }
  if (!/^[0-9a-f:]+$/i.test(value)) invalid('IPv6 contains unsupported characters.');
  const pieces = value.split('::');
  if (pieces.length > 2) invalid('IPv6 can compress only one zero run.');
  const left = pieces[0] === '' ? [] : pieces[0]!.split(':');
  const right = pieces.length === 2 && pieces[1] !== '' ? pieces[1]!.split(':') : [];
  const supplied = [...left, ...right];
  if (supplied.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) invalid('Invalid IPv6 group.');
  if (pieces.length === 1 ? left.length !== 8 : supplied.length >= 8)
    invalid('Invalid IPv6 group count.');
  const groups =
    pieces.length === 1
      ? left
      : [...left, ...Array<string>(8 - supplied.length).fill('0'), ...right];
  return {
    version: 6,
    value: groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n),
  };
}
export function formatIp(address: IpAddress): string {
  const bits = checked(address);
  if (bits === 32)
    return [24n, 16n, 8n, 0n]
      .map((shift) => ((address.value >> shift) & 255n).toString())
      .join('.');
  const groups = Array.from({ length: 8 }, (_, index) =>
    Number((address.value >> BigInt((7 - index) * 16)) & 65535n),
  );
  let start = -1,
    length = 1;
  for (let index = 0; index < groups.length;) {
    if (groups[index] !== 0) {
      index++;
      continue;
    }
    let end = index + 1;
    while (groups[end] === 0) end++;
    if (end - index > length) {
      start = index;
      length = end - index;
    }
    index = end;
  }
  const strings = groups.map((group) => group.toString(16));
  return start === -1
    ? strings.join(':')
    : `${strings.slice(0, start).join(':')}::${strings.slice(start + length).join(':')}`;
}
export function parseCidr(text: string, options: { normalize?: boolean } = {}): IpNetwork {
  if (typeof text !== 'string' || text.length > 49 || /\s/.test(text))
    invalid('Expected bounded CIDR text without whitespace.');
  const parts = text.split('/');
  if (parts.length !== 2 || !/^(?:0|[1-9]\d{0,2})$/.test(parts[1]!))
    invalid('Expected address/prefix.');
  if (options.normalize !== undefined && typeof options.normalize !== 'boolean')
    invalid('normalize must be boolean.');
  const address = parseIp(parts[0]!),
    bits = width(address.version),
    length = Number(parts[1]);
  prefix(length, bits);
  const value = address.value & mask(bits, length);
  if (value !== address.value && !options.normalize)
    invalid('CIDR has host bits; explicitly request normalization.');
  return { version: address.version, value, prefix: length };
}
export function formatCidr(input: IpNetwork): string {
  const value = network(input);
  return `${formatIp(value)}/${value.prefix}`;
}
export function cidrRange(input: IpNetwork): IpRange {
  const value = network(input),
    bits = width(value.version),
    size = 1n << BigInt(bits - value.prefix);
  return {
    first: { version: value.version, value: value.value },
    last: { version: value.version, value: value.value + size - 1n },
    size,
  };
}
export function cidrContains(input: IpNetwork, address: IpAddress): boolean {
  const value = network(input),
    bits = sameVersion(value, address);
  return (address.value & mask(bits, value.prefix)) === value.value;
}
export function cidrOverlaps(left: IpNetwork, right: IpNetwork): boolean {
  const a = network(left),
    b = network(right);
  const bits = sameVersion(a, b),
    shorter = Math.min(a.prefix, b.prefix);
  return (a.value & mask(bits, shorter)) === (b.value & mask(bits, shorter));
}
export function summarizeIpRange(first: IpAddress, last: IpAddress): IpNetwork[] {
  const bits = sameVersion(first, last);
  if (first.value > last.value) invalid('Range endpoints must be ordered.');
  const result: IpNetwork[] = [];
  let current = first.value;
  while (current <= last.value) {
    let hostBits = 0;
    while (hostBits < bits && (current & ((1n << BigInt(hostBits + 1)) - 1n)) === 0n) hostBits++;
    while (current + (1n << BigInt(hostBits)) - 1n > last.value) hostBits--;
    result.push({ version: first.version, value: current, prefix: bits - hostBits });
    current += 1n << BigInt(hostBits);
  }
  return result;
}
export function collapseCidrs(inputs: readonly IpNetwork[], maxNetworks = 4096): IpNetwork[] {
  if (!Number.isSafeInteger(maxNetworks) || maxNetworks < 1 || maxNetworks > 100000)
    invalid('maxNetworks must be an integer in 1..100000.');
  if (!Array.isArray(inputs)) invalid('Expected a network array.');
  if (inputs.length > maxNetworks)
    throw new IpAddressError('limit', 'Network count limit exceeded.');
  const validated: IpNetwork[] = [];
  for (const input of inputs) validated.push(network(input));
  const output: IpNetwork[] = [];
  for (const version of [4, 6] as const) {
    const sorted = validated
      .filter((input) => input.version === version)
      .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : a.prefix - b.prefix));
    let first: bigint | undefined,
      last = 0n;
    const flush = (): void => {
      if (first !== undefined)
        output.push(...summarizeIpRange({ version, value: first }, { version, value: last }));
    };
    for (const entry of sorted) {
      const end = cidrRange(entry).last.value;
      if (first === undefined) {
        first = entry.value;
        last = end;
      } else if (entry.value <= last + 1n) {
        if (end > last) last = end;
      } else {
        flush();
        first = entry.value;
        last = end;
      }
    }
    flush();
  }
  return output;
}
