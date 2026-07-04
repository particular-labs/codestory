// Inline SVG icon set — stroke-based, currentColor, no dependency. Path data
// follows the lucide (ISC) 24x24 grid so controls render crisp at any size,
// unlike the unicode glyphs they replace.
const PATHS = {
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-up': ['m18 15-6-6-6 6'],
  'chevron-left': ['m15 18-6-6 6-6'],
  'chevron-right': ['m9 18 6-6-6-6'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  pencil: ['M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'],
  sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8', 'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  'arrows-lr': ['m8 3-4 4 4 4', 'M4 7h16', 'm16 21 4-4-4-4', 'M20 17H4'],
  'arrows-ud': ['m21 16-4 4-4-4', 'M17 20V4', 'm3 8 4-4 4 4', 'M7 4v16'],
  branch: ['M6 3v12', 'M18 9a9 9 0 0 1-9 9', 'M18 3a3 3 0 1 0 0 6 3 3 0 1 0 0-6', 'M6 15a3 3 0 1 0 0 6 3 3 0 1 0 0-6'],
} as const;

export type IconName = keyof typeof PATHS;

export function Ic({ n, size = 16 }: { n: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: '0 0 auto' }} aria-hidden="true">
      {PATHS[n].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
