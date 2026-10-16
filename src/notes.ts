// The note palette. The server stores only the key; each key's fill and text color live here,
// and every pair meets WCAG AA contrast (see notes.test.ts).
export const PALETTE = {
  sky: { name: "Sky", fill: "#DCEBF7", text: "#1B5C8C" },
  teal: { name: "Teal", fill: "#DCEBEA", text: "#2D5254" },
  sage: { name: "Sage", fill: "#E6EEE4", text: "#3D5A40" },
  oak: { name: "Oak", fill: "#F3EEE2", text: "#5E5136" },
  rose: { name: "Rose", fill: "#F9E3E1", text: "#8C3341" },
  lavender: { name: "Lavender", fill: "#ECE6F5", text: "#553C80" },
} as const;

export type NoteColor = keyof typeof PALETTE;
export const COLORS = Object.keys(PALETTE) as NoteColor[];

export const MAX_NOTE = 1_000;

export type Note = {
  id: string;
  updateId: string;
  // Empty for a video note.
  body: string;
  // A video note's signed links to its video and still.
  video: { src: string; poster: string } | null;
  color: NoteColor;
  authorName: string;
  authorIsFamily: boolean;
  createdAt: string;
  mine: boolean;
};

export function randomColor(random = Math.random): NoteColor {
  return COLORS[Math.floor(random() * COLORS.length)]!;
}

// WCAG contrast ratio between two "#RRGGBB" colors.
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
