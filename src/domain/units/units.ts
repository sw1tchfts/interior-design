// All lengths in the app are stored in meters. These helpers convert to and
// from what the designer types and reads.

export const INCH = 0.0254;
export const FOOT = 12 * INCH;

export type UnitSystem = 'imperial' | 'metric';
export type Precision = '1' | '1/2' | '1/4' | '1/8' | '1/16' | 'cm' | 'mm';
export type DefaultUnit = 'in' | 'ft' | 'cm' | 'm';

export interface UnitSettings {
  unitSystem: UnitSystem;
  precision: Precision;
}

export const inches = (n: number) => n * INCH;
export const feet = (ft: number, inch = 0) => ft * FOOT + inch * INCH;

const NUM = String.raw`\d+(?:\.\d+)?|\.\d+`;

// "6", "6.5", "6 1/2", "6-1/2", "1/2"; returns a number of the implied unit.
function parseMixedNumber(text: string): number | null {
  const s = text.trim();
  if (s === '') return null;
  const m = new RegExp(String.raw`^(${NUM})?(?:(?:\s+|-)?(\d+)\s*/\s*(\d+))?$`).exec(s);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  let value = m[1] !== undefined ? parseFloat(m[1]) : 0;
  if (m[2] !== undefined && m[3] !== undefined) {
    const den = parseInt(m[3], 10);
    if (den === 0) return null;
    value += parseInt(m[2], 10) / den;
  }
  return value;
}

/**
 * Parses a length typed in any unit and returns meters, or null if invalid.
 * Accepts e.g. `12'6"`, `12' 6 1/2"`, `12ft 6in`, `12'-6"`, `150.5"`, `320cm`,
 * `3.2m`, `450 mm`, and bare numbers in `defaultUnit`.
 */
export function parseLength(input: string, defaultUnit: DefaultUnit): number | null {
  let s = input.trim().toLowerCase();
  if (s === '') return null;
  let sign = 1;
  if (s.startsWith('-')) {
    sign = -1;
    s = s.slice(1).trim();
  }
  s = s
    .replace(/[′’]/g, "'")
    .replace(/[″”]|''/g, '"')
    .replace(/\s*(feet|foot|ft)\b\.?/g, "'")
    .replace(/\s*(inches|inch|in)\b\.?/g, '"');

  const metric = new RegExp(String.raw`^(${NUM})\s*(mm|cm|m)$`).exec(s);
  if (metric) {
    const v = parseFloat(metric[1]!);
    const factor = metric[2] === 'mm' ? 0.001 : metric[2] === 'cm' ? 0.01 : 1;
    return sign * v * factor;
  }

  const feetIdx = s.indexOf("'");
  if (feetIdx >= 0) {
    const ft = parseMixedNumber(s.slice(0, feetIdx));
    if (ft === null) return null;
    let rest = s.slice(feetIdx + 1).trim();
    if (rest.startsWith('-')) rest = rest.slice(1).trim();
    if (rest.endsWith('"')) rest = rest.slice(0, -1).trim();
    if (rest.includes("'") || rest.includes('"')) return null;
    const inch = rest === '' ? 0 : parseMixedNumber(rest);
    if (inch === null) return null;
    return sign * (ft * FOOT + inch * INCH);
  }

  if (s.endsWith('"')) {
    const inch = parseMixedNumber(s.slice(0, -1));
    return inch === null ? null : sign * inch * INCH;
  }

  const bare = parseMixedNumber(s);
  if (bare === null) return null;
  const factor = { in: INCH, ft: FOOT, cm: 0.01, m: 1 }[defaultUnit];
  return sign * bare * factor;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function precisionDenominator(p: Precision): number {
  switch (p) {
    case '1': return 1;
    case '1/2': return 2;
    case '1/4': return 4;
    case '1/8': return 8;
    case '1/16': return 16;
    default: return 1;
  }
}

function formatInches(whole: number, num: number, den: number): string {
  if (num === 0) return `${whole}"`;
  const g = gcd(num, den);
  const frac = `${num / g}/${den / g}`;
  return whole === 0 ? `${frac}"` : `${whole} ${frac}"`;
}

/** Formats meters for display, e.g. `12' 6 1/2"` or `381 cm`. */
export function formatLength(meters: number, settings: UnitSettings): string {
  const sign = meters < 0 ? '-' : '';
  const abs = Math.abs(meters);
  if (settings.unitSystem === 'metric') {
    if (settings.precision === 'mm') {
      const cm = Math.round(abs * 1000) / 10;
      return `${sign}${cm} cm`;
    }
    return `${sign}${Math.round(abs * 100)} cm`;
  }
  const den = precisionDenominator(settings.precision);
  const units = Math.round((abs / INCH) * den); // total inches in 1/den steps
  const totalWholeInches = Math.floor(units / den);
  const num = units - totalWholeInches * den;
  const ft = Math.floor(totalWholeInches / 12);
  const inch = totalWholeInches - ft * 12;
  if (ft === 0) return sign + formatInches(inch, num, den);
  return `${sign}${ft}' ${formatInches(inch, num, den)}`;
}

/** Default unit for bare numbers typed into a length field. */
export function defaultUnitFor(settings: UnitSettings): DefaultUnit {
  return settings.unitSystem === 'imperial' ? 'in' : 'cm';
}

export function formatArea(m2: number, settings: UnitSettings): string {
  if (settings.unitSystem === 'metric') return `${m2.toFixed(1)} m²`;
  return `${Math.round(m2 / (FOOT * FOOT))} sq ft`;
}
