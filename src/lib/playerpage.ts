import type { PageFont } from "@/db/schema";

// Personalization presets for player pages (goal 12). Kids pick from
// curated choices — everything stays legible and team-appropriate.

export const BG_CHOICES: { id: string; label: string; css: string }[] = [
  { id: "columbia", label: "Columbia sky", css: "#ddedf9" },
  { id: "grass", label: "Outfield grass", css: "#d9f2df" },
  { id: "sand", label: "Infield sand", css: "#f7ecd9" },
  { id: "sunset", label: "Sunset", css: "#fde4d0" },
  { id: "bubblegum", label: "Bubblegum", css: "#fbe0ec" },
  { id: "night", label: "Night game", css: "#1d2733" },
];

export const BORDER_CHOICES: { id: string; label: string; css: string }[] = [
  { id: "orange", label: "Crusher orange", css: "#f47f0c" },
  { id: "blue", label: "Columbia blue", css: "#2f6f9f" },
  { id: "ink", label: "Ink", css: "#171a20" },
  { id: "green", label: "Green monster", css: "#1d7a46" },
  { id: "gold", label: "Trophy gold", css: "#d4a017" },
  { id: "red", label: "Bullpen red", css: "#c0392b" },
];

export const FONT_STACKS: Record<PageFont, { label: string; css: string }> = {
  sporty: { label: "Sporty", css: "var(--font-display), sans-serif" },
  classic: { label: "Classic", css: "var(--font-body), sans-serif" },
  fun: {
    label: "Fun",
    css: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive',
  },
};

// Wallpapers are tiny inline SVG patterns — no external requests.
const svgUri = (svg: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

export const WALLPAPERS: { id: string; label: string; css: string | null }[] = [
  { id: "none", label: "Plain", css: null },
  {
    id: "stitches",
    label: "Stitches",
    css: svgUri(
      `<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56'><path d='M8 0c8 8 8 20 0 28s-8 20 0 28' fill='none' stroke='rgba(192,57,43,0.28)' stroke-width='2' stroke-dasharray='4 5'/><path d='M36 0c8 8 8 20 0 28s-8 20 0 28' fill='none' stroke='rgba(192,57,43,0.28)' stroke-width='2' stroke-dasharray='4 5'/></svg>`,
    ),
  },
  {
    id: "diamonds",
    label: "Diamonds",
    css: svgUri(
      `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect x='14' y='14' width='12' height='12' transform='rotate(45 20 20)' fill='none' stroke='rgba(47,111,159,0.3)' stroke-width='2'/></svg>`,
    ),
  },
  {
    id: "stars",
    label: "All-star",
    css: svgUri(
      `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'><path d='M24 6l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z' fill='rgba(212,160,23,0.25)'/></svg>`,
    ),
  },
  {
    id: "scoreboard",
    label: "Scoreboard",
    css: svgUri(
      `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36'><rect x='4' y='4' width='28' height='28' fill='none' stroke='rgba(23,26,32,0.18)' stroke-width='2'/></svg>`,
    ),
  },
];

export const byId = <T extends { id: string }>(list: T[], id: string | null | undefined) =>
  list.find((x) => x.id === id);

// ---- Avatar builder options ------------------------------------------------

export interface AvatarConfig {
  skin: string;
  hairStyle: string;
  hairColor: string;
  cap: string;
  eyes: string;
  extra: string;
}

export const AVATAR_OPTIONS = {
  skin: [
    { id: "s1", css: "#f6d7b8" },
    { id: "s2", css: "#eab98a" },
    { id: "s3", css: "#c98d5e" },
    { id: "s4", css: "#9c6a3f" },
    { id: "s5", css: "#6f4a2a" },
  ],
  hairStyle: [
    { id: "short", label: "Short" },
    { id: "curly", label: "Curly" },
    { id: "flow", label: "Flow" },
    { id: "buzz", label: "Buzz" },
  ],
  hairColor: [
    { id: "h1", css: "#2c1e12" },
    { id: "h2", css: "#5b3a1e" },
    { id: "h3", css: "#a5652a" },
    { id: "h4", css: "#d9a441" },
    { id: "h5", css: "#1c1c1c" },
  ],
  cap: [
    { id: "blue", css: "#2f6f9f" },
    { id: "columbia", css: "#9bcbeb" },
    { id: "orange", css: "#f47f0c" },
    { id: "black", css: "#171a20" },
    { id: "none", css: "" },
  ],
  eyes: [
    { id: "happy", label: "Happy" },
    { id: "game", label: "Game face" },
    { id: "wink", label: "Wink" },
  ],
  extra: [
    { id: "none", label: "None" },
    { id: "eyeblack", label: "Eye black" },
    { id: "shades", label: "Shades" },
  ],
} as const;

export const DEFAULT_AVATAR: AvatarConfig = {
  skin: "s2",
  hairStyle: "short",
  hairColor: "h2",
  cap: "blue",
  eyes: "happy",
  extra: "none",
};

export function parseAvatarConfig(raw: string | null | undefined): AvatarConfig {
  if (!raw) return DEFAULT_AVATAR;
  try {
    const parsed = JSON.parse(raw) as Partial<AvatarConfig>;
    return { ...DEFAULT_AVATAR, ...parsed };
  } catch {
    return DEFAULT_AVATAR;
  }
}
