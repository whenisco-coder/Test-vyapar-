import { describe, expect, it } from 'vitest';
import { compareHLC, parseHLC, tickHLC } from '../src/domain/hlc';

describe('Hybrid logical clock (HLC)', () => {
  it('starts at wall-clock time with logical counter zero', () => {
    expect(tickHLC(null, 1_700_000_000_000, 'device-a')).toBe('1700000000000:0:device-a');
  });

  it('increments logical time when wall clock stalls or moves backward', () => {
    const first = tickHLC(null, 100, 'device-a');
    expect(tickHLC(first, 100, 'device-a')).toBe('100:1:device-a');
    expect(tickHLC('100:8:device-a', 90, 'device-a')).toBe('100:9:device-a');
  });

  it('observes remote HLC even when the local wall clock is behind', () => {
    expect(tickHLC('100:2:device-a', 80, 'device-a', '120:7:device-b'))
      .toBe('120:8:device-a');
  });

  it('increments above both local and remote logical counters on a shared physical time', () => {
    expect(tickHLC('120:7:device-a', 120, 'device-a', '120:9:device-b'))
      .toBe('120:10:device-a');
  });

  it('provides deterministic total ordering and rejects malformed values', () => {
    expect(compareHLC('100:1:device-a', '100:2:device-a')).toBeLessThan(0);
    expect(compareHLC('100:2:device-a', '100:2:device-b')).toBeLessThan(0);
    expect(parseHLC('100:2:device-b')).toEqual({ physicalMs: 100, logical: 2, deviceId: 'device-b' });
    expect(() => parseHLC('not-an-hlc')).toThrow('Invalid HLC');
  });
});
