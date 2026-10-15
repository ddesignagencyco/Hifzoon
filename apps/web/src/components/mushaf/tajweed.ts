/**
 * Tajweed colour layer (FR-CLS-05). Rule names come from the licensed content
 * provider (`AyahWord.tajweedRules`); we only choose a colour per rule name, we never
 * infer rules ourselves.
 */

const PALETTE = [
  { text: 'text-[#b4482d]', swatch: 'bg-[#b4482d]' },
  { text: 'text-[#2a6553]', swatch: 'bg-[#2a6553]' },
  { text: 'text-[#1d5fa8]', swatch: 'bg-[#1d5fa8]' },
  { text: 'text-[#a97f3c]', swatch: 'bg-[#a97f3c]' },
  { text: 'text-[#7a3e9d]', swatch: 'bg-[#7a3e9d]' },
  { text: 'text-[#c8761d]', swatch: 'bg-[#c8761d]' },
] as const;

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function tajweedColour(rule: string): (typeof PALETTE)[number] {
  return PALETTE[hash(rule.toLowerCase()) % PALETTE.length];
}

export function humanizeRule(rule: string): string {
  const spaced = rule.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
