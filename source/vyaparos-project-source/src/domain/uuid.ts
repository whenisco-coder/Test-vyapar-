/**
 * RFC 9562 UUIDv7 generator
 * 48-bit timestamp in milliseconds + 74 bits of entropy/randomness
 * Monotonically sortable by creation time.
 */

let lastMs = 0;
let seq = 0;

export function generateUUIDv7(): string {
  let now = Date.now();
  if (now === lastMs) {
    seq = (seq + 1) & 0xfff;
    if (seq === 0) {
      // Small clock drift adjustment if exhausted within same millisecond
      now += 1;
      lastMs = now;
    }
  } else {
    lastMs = now;
    seq = Math.floor(Math.random() * 0x1000);
  }

  // 48-bit timestamp
  const tsHigh = Math.floor(now / 0x100000000);
  const tsLow = now >>> 0;

  // Random bytes for remainder
  const randBytes = new Uint8Array(10);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randBytes);
  } else {
    for (let i = 0; i < 10; i++) {
      randBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // Inject 12-bit sequence into first 12 bits of random section
  const randA = (seq >> 8) & 0x0f;
  const randB = seq & 0xff;

  const hexBytes: string[] = [];
  // 6 bytes timestamp
  hexBytes.push((tsHigh >> 8 & 0xff).toString(16).padStart(2, '0'));
  hexBytes.push((tsHigh & 0xff).toString(16).padStart(2, '0'));
  hexBytes.push((tsLow >> 24 & 0xff).toString(16).padStart(2, '0'));
  hexBytes.push((tsLow >> 16 & 0xff).toString(16).padStart(2, '0'));
  hexBytes.push((tsLow >> 8 & 0xff).toString(16).padStart(2, '0'));
  hexBytes.push((tsLow & 0xff).toString(16).padStart(2, '0'));

  // 2 bytes: 4-bit version 7 + 12-bit sequence
  const byte6 = 0x70 | randA;
  const byte7 = randB;
  hexBytes.push(byte6.toString(16).padStart(2, '0'));
  hexBytes.push(byte7.toString(16).padStart(2, '0'));

  // 2 bytes: 2-bit variant (0b10) + random
  const byte8 = 0x80 | (randBytes[0] & 0x3f);
  hexBytes.push(byte8.toString(16).padStart(2, '0'));
  for (let i = 1; i < 8; i++) {
    hexBytes.push(randBytes[i].toString(16).padStart(2, '0'));
  }

  // Format 8-4-4-4-12
  const s = hexBytes.join('');
  return `${s.substring(0, 8)}-${s.substring(8, 12)}-${s.substring(12, 16)}-${s.substring(16, 20)}-${s.substring(20, 32)}`;
}
