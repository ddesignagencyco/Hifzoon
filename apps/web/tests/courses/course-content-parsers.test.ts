import { describe, expect, it } from 'vitest';
import { linesOf, parseKeyValueLines, parseRubric } from '@/lib/api/modules/courses-admin';
import { hifzPaceLabel } from '@/lib/api/modules/parent-progress';

describe('course content parsers (level rubric, lesson objectives / materials)', () => {
  it('splits objectives into trimmed, non-empty lines', () => {
    expect(linesOf('  Read Alif \n\n Ba with fatha  \n')).toEqual(['Read Alif', 'Ba with fatha']);
  });

  it('parses materials as label: value and keeps colons inside the value', () => {
    expect(parseKeyValueLines('workbook: Noorani Qaida page 1\nlink: https://x.test/a')).toEqual({
      value: { workbook: 'Noorani Qaida page 1', link: 'https://x.test/a' },
    });
    expect(parseKeyValueLines('').value).toBeUndefined();
    expect(parseKeyValueLines('no separator here').error).toMatch(/label: value/);
    expect(parseKeyValueLines('a: 1\na: 2').error).toMatch(/twice/);
  });

  it('accepts a rubric whose whole-number weights add up to 100, as seeded', () => {
    expect(parseRubric('recitation: 40\ntajweed: 30\nfluency: 30')).toEqual({
      value: { recitation: 40, tajweed: 30, fluency: 30 },
    });
    expect(parseRubric('recitation: 40\ntajweed: 30').error).toMatch(/add up to 70/);
    expect(parseRubric('recitation: 40.5\ntajweed: 59.5').error).toMatch(/whole number/);
    expect(parseRubric('').value).toBeUndefined();
  });
});

describe('Hifz goal pace', () => {
  it('formats the Decimal string from the API and hides nonsense values', () => {
    expect(hifzPaceLabel('4.25')).toBe('≈ 4.3 lines a day to finish on time');
    expect(hifzPaceLabel(1)).toBe('≈ 1 line a day to finish on time');
    expect(hifzPaceLabel(12.6)).toBe('≈ 13 lines a day to finish on time');
    expect(hifzPaceLabel('0')).toBeNull();
    expect(hifzPaceLabel(null)).toBeNull();
    expect(hifzPaceLabel('abc')).toBeNull();
  });
});
