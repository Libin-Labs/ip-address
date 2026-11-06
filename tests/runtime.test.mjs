import test from 'node:test';
import assert from 'node:assert/strict';
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
} from '../dist/esm/index.js';
test('IPv4 decimal addresses preserve the entire unsigned range', () => {
  for (const [source, integer] of [
    ['0.0.0.0', 0n],
    ['127.0.0.1', 2130706433n],
    ['255.255.255.255', 4294967295n],
  ]) {
    assert.deepEqual(parseIp(source), { version: 4, value: integer });
    assert.equal(formatIp(parseIp(source)), source);
  }
});
test('IPv6 canonical formatting chooses longest and leftmost non-single zero run', () => {
  const cases = [
    ['0:0:0:0:0:0:0:0', '::'],
    ['0:0:0:0:0:0:0:1', '::1'],
    ['2001:0DB8:0:0:1:0:0:1', '2001:db8::1:0:0:1'],
    ['2001:db8:0:1:1:1:1:1', '2001:db8:0:1:1:1:1:1'],
    ['1:0:0:1:0:0:0:0', '1:0:0:1::'],
    ['::ffff:192.0.2.128', '::ffff:c000:280'],
  ];
  for (const [input, expected] of cases) assert.equal(formatIp(parseIp(input)), expected);
});
test('strict addresses reject ambiguous padded octets zones brackets and malformed compression', () => {
  for (const source of [
    '',
    '1.2.3',
    '01.2.3.4',
    '256.0.0.1',
    '+1.2.3.4',
    ' 1.2.3.4',
    '::1 ',
    '[::1]',
    'fe80::1%eth0',
    '1::2::3',
    '1:2:3:4:5:6:7:8::',
    '1:2:3:4:5:6:7',
    '1:2:3:4:5:6:7:8:9',
    '::gggg',
    ':::1',
    ':1:2:3:4:5:6:7',
    '::ffff:192.000.2.1',
  ])
    assert.throws(() => parseIp(source), { code: 'invalid' });
});
test('CIDR requires an aligned network unless normalization explicitly requested', () => {
  assert.throws(() => parseCidr('0.0.0.0/0\n'), { code: 'invalid' });
  assert.throws(() => parseCidr('192.168.1.1/24'), { code: 'invalid' });
  assert.equal(formatCidr(parseCidr('192.168.1.1/24', { normalize: true })), '192.168.1.0/24');
  assert.equal(formatCidr(parseCidr('2001:db8:abcd::1/32', { normalize: true })), '2001:db8::/32');
  for (const source of ['1.2.3.4', '1.2.3.4/33', '::/129', '::/-1', '::/01', '::/1/2'])
    assert.throws(() => parseCidr(source), IpAddressError);
});
test('range boundaries are inclusive without IPv4 usable-host exclusions', () => {
  const range = cidrRange(parseCidr('192.0.2.0/31'));
  assert.equal(formatIp(range.first), '192.0.2.0');
  assert.equal(formatIp(range.last), '192.0.2.1');
  assert.equal(range.size, 2n);
  assert.equal(cidrRange(parseCidr('::/0')).size, 1n << 128n);
  assert.equal(cidrRange(parseCidr('255.255.255.255/32')).size, 1n);
});
test('containment and overlap are exact for nested and separate subnets', () => {
  const net = parseCidr('10.0.0.0/8');
  assert.ok(cidrContains(net, parseIp('10.255.255.255')));
  assert.equal(cidrContains(net, parseIp('11.0.0.0')), false);
  assert.ok(cidrOverlaps(net, parseCidr('10.1.0.0/16')));
  assert.equal(cidrOverlaps(net, parseCidr('11.0.0.0/8')), false);
  assert.throws(() => cidrContains(net, parseIp('::1')), { code: 'invalid' });
});
test('range summary is minimal aligned CIDRs for a known uneven interval', () => {
  assert.deepEqual(summarizeIpRange(parseIp('192.0.2.1'), parseIp('192.0.2.6')).map(formatCidr), [
    '192.0.2.1/32',
    '192.0.2.2/31',
    '192.0.2.4/31',
    '192.0.2.6/32',
  ]);
  assert.deepEqual(
    summarizeIpRange(parseIp('::'), parseIp('ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')).map(
      formatCidr,
    ),
    ['::/0'],
  );
});
test('exhaustive small ranges contain every requested point exactly once', () => {
  for (let first = 0; first < 32; first++)
    for (let last = first; last < 32; last++) {
      const blocks = summarizeIpRange(
        { version: 4, value: BigInt(first) },
        { version: 4, value: BigInt(last) },
      );
      let position = BigInt(first);
      for (const block of blocks) {
        const range = cidrRange(block);
        assert.equal(range.first.value, position);
        position = range.last.value + 1n;
        assert.ok(range.last.value <= BigInt(last));
      }
      assert.equal(position, BigInt(last) + 1n);
    }
});
test('collapse unions overlapping duplicate adjacent prefixes and partitions versions', () => {
  const inputs = ['192.0.2.128/25', '192.0.2.0/25', '192.0.2.0/26', '::1/128', '::/128'].map(
    (value) => parseCidr(value),
  );
  const before = structuredClone(inputs);
  assert.deepEqual(collapseCidrs(inputs).map(formatCidr), ['192.0.2.0/24', '::/127']);
  assert.deepEqual(inputs, before);
  assert.deepEqual(collapseCidrs([]), []);
});
test('seeded collapsing agrees with independent per-address union oracle', () => {
  let state = 17;
  const random = (maximum) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % maximum;
  };
  for (let sample = 0; sample < 100; sample++) {
    const inputs = Array.from({ length: 10 }, () => {
      const hostBits = random(5),
        value = random(256) & ~((1 << hostBits) - 1);
      return { version: 4, value: BigInt(value), prefix: 32 - hostBits };
    });
    const collapsed = collapseCidrs(inputs);
    for (let value = 0; value < 256; value++) {
      const point = { version: 4, value: BigInt(value) };
      assert.equal(
        collapsed.some((block) => cidrContains(block, point)),
        inputs.some((block) => cidrContains(block, point)),
      );
    }
    for (let index = 1; index < collapsed.length; index++)
      assert.ok(cidrRange(collapsed[index - 1]).last.value < collapsed[index].value);
  }
});
test('raw object guards reject invalid versions bigints prefixes and mixed endpoints', () => {
  for (const input of [
    { version: 5, value: 0n },
    { version: 4, value: -1n },
    { version: 4, value: 1n << 32n },
    { version: 6, value: 0 },
  ])
    assert.throws(() => formatIp(input), { code: 'invalid' });
  assert.throws(() => formatCidr({ version: 4, value: 1n, prefix: 24 }), IpAddressError);
  assert.throws(() => cidrRange({ version: 4, value: 0n, prefix: NaN }), IpAddressError);
  assert.throws(() => summarizeIpRange(parseIp('::'), parseIp('1.2.3.4')), IpAddressError);
  assert.throws(() => summarizeIpRange(parseIp('1.2.3.4'), parseIp('1.2.3.3')), IpAddressError);
});
test('network count is bounded and returned data is independent', () => {
  assert.throws(() => collapseCidrs(new Array(1)), { code: 'invalid' });
  const inputs = [parseCidr('::/0')];
  assert.throws(() => collapseCidrs([...inputs, ...inputs], 1), { code: 'limit' });
  for (const limit of [0, NaN, 1.2, 100001])
    assert.throws(() => collapseCidrs([], limit), { code: 'invalid' });
  const result = collapseCidrs(inputs);
  result[0].prefix = 128;
  assert.equal(inputs[0].prefix, 0);
});
