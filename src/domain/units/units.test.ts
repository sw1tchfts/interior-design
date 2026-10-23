import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { FOOT, INCH, formatLength, parseLength, type UnitSettings } from './units';

const imperial: UnitSettings = { unitSystem: 'imperial', precision: '1/4' };
const sixteenth: UnitSettings = { unitSystem: 'imperial', precision: '1/16' };
const metric: UnitSettings = { unitSystem: 'metric', precision: 'cm' };

describe('parseLength', () => {
  const cases: [string, number][] = [
    [`12'6"`, 12 * FOOT + 6 * INCH],
    [`12' 6"`, 12 * FOOT + 6 * INCH],
    [`12'6`, 12 * FOOT + 6 * INCH],
    [`12'-6"`, 12 * FOOT + 6 * INCH],
    [`12' 6 1/2"`, 12 * FOOT + 6.5 * INCH],
    [`12' 6-1/2"`, 12 * FOOT + 6.5 * INCH],
    [`12ft 6in`, 12 * FOOT + 6 * INCH],
    [`12 feet 6 inches`, 12 * FOOT + 6 * INCH],
    [`12'`, 12 * FOOT],
    [`1.5'`, 18 * INCH],
    [`150.5"`, 150.5 * INCH],
    [`3/4"`, 0.75 * INCH],
    [`84`, 84 * INCH],
    [`6 1/2`, 6.5 * INCH],
    [`320cm`, 3.2],
    [`320 cm`, 3.2],
    [`3.2m`, 3.2],
    [`450 mm`, 0.45],
    [`-2"`, -2 * INCH],
  ];
  for (const [input, expected] of cases) {
    it(`parses ${input}`, () => {
      expect(parseLength(input, 'in')).toBeCloseTo(expected, 9);
    });
  }

  it('uses the default unit for bare numbers', () => {
    expect(parseLength('250', 'cm')).toBeCloseTo(2.5, 9);
    expect(parseLength('10', 'ft')).toBeCloseTo(10 * FOOT, 9);
    expect(parseLength('2.5', 'm')).toBeCloseTo(2.5, 9);
  });

  for (const bad of ['', 'abc', `12'6'`, '1/0"', '5 kg', `"`, `'`]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      expect(parseLength(bad, 'in')).toBeNull();
    });
  }
});

describe('formatLength', () => {
  it('formats feet and inches', () => {
    expect(formatLength(12 * FOOT + 6 * INCH, imperial)).toBe(`12' 6"`);
    expect(formatLength(12 * FOOT, imperial)).toBe(`12' 0"`);
    expect(formatLength(6.5 * INCH, imperial)).toBe(`6 1/2"`);
    expect(formatLength(0.25 * INCH, imperial)).toBe(`1/4"`);
    expect(formatLength(12 * FOOT + 11.9 * INCH, imperial)).toBe(`13' 0"`);
    expect(formatLength(1 / 16 * INCH, sixteenth)).toBe(`1/16"`);
  });

  it('formats metric', () => {
    expect(formatLength(3.2, metric)).toBe('320 cm');
    expect(formatLength(3.2054, { unitSystem: 'metric', precision: 'mm' })).toBe('320.5 cm');
  });

  it('round-trips through parse at the display precision', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 30, noNaN: true }), (m) => {
        const text = formatLength(m, sixteenth);
        const parsed = parseLength(text, 'in');
        expect(parsed).not.toBeNull();
        expect(formatLength(parsed!, sixteenth)).toBe(text);
        expect(Math.abs(parsed! - m)).toBeLessThanOrEqual(INCH / 32 + 1e-9);
      }),
    );
  });
});
