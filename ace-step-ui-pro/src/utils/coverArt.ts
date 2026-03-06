// Random cover art generator based on song ID hash
const PALETTES = [
  ['#6366f1', '#a855f7'], // indigo → violet
  ['#ec4899', '#f97316'], // pink → orange
  ['#14b8a6', '#3b82f6'], // teal → blue
  ['#f43f5e', '#a855f7'], // rose → violet
  ['#eab308', '#ef4444'], // yellow → red
  ['#22c55e', '#0ea5e9'], // green → sky
  ['#8b5cf6', '#ec4899'], // violet → pink
  ['#06b6d4', '#6366f1'], // cyan → indigo
  ['#f97316', '#facc15'], // orange → amber
  ['#64748b', '#6366f1'], // slate → indigo
  ['#d946ef', '#0ea5e9'], // fuchsia → sky
  ['#059669', '#8b5cf6'], // emerald → violet
];

function hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function generateCoverGradient(songId: string): { from: string; to: string; angle: number } {
  const hash = hashCode(songId);
  const palette = PALETTES[hash % PALETTES.length];
  const angle = (hash % 360);
  return { from: palette[0], to: palette[1], angle };
}

export function getCoverStyle(songId: string): React.CSSProperties {
  const { from, to, angle } = generateCoverGradient(songId);
  return { background: `linear-gradient(${angle}deg, ${from}, ${to})` };
}
