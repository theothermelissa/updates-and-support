// Every emoji a family can offer as a reaction, grouped, in the order they appear everywhere.
// `kind` is the stored key and never changes; `name` is only for screen readers.
export type Reaction = { kind: string; emoji: string; name: string };

export const CATALOG: readonly { group: string; reactions: readonly Reaction[] }[] = [
  {
    group: "Love",
    reactions: [
      { kind: "heart", emoji: "❤️", name: "Red heart" },
      { kind: "orange_heart", emoji: "🧡", name: "Orange heart" },
      { kind: "yellow_heart", emoji: "💛", name: "Yellow heart" },
      { kind: "green_heart", emoji: "💚", name: "Green heart" },
      { kind: "blue_heart", emoji: "💙", name: "Blue heart" },
      { kind: "purple_heart", emoji: "💜", name: "Purple heart" },
      { kind: "white_heart", emoji: "🤍", name: "White heart" },
      { kind: "sparkling_heart", emoji: "💖", name: "Sparkling heart" },
      { kind: "mending_heart", emoji: "❤️‍🩹", name: "Mending heart" },
      { kind: "heart_hands", emoji: "🫶", name: "Heart hands" },
      { kind: "hearts_face", emoji: "🥰", name: "Smiling face with hearts" },
      { kind: "kiss", emoji: "😘", name: "Blowing a kiss" },
    ],
  },
  {
    group: "Support",
    reactions: [
      { kind: "hug", emoji: "🤗", name: "Hug" },
      { kind: "people_hugging", emoji: "🫂", name: "People hugging" },
      { kind: "strong", emoji: "💪", name: "Flexed arm" },
      { kind: "pray", emoji: "🙏", name: "Folded hands" },
      { kind: "raised_hands", emoji: "🙌", name: "Raised hands" },
      { kind: "clap", emoji: "👏", name: "Clapping hands" },
      { kind: "thumbs_up", emoji: "👍", name: "Thumbs up" },
      { kind: "handshake", emoji: "🤝", name: "Handshake" },
      { kind: "fingers_crossed", emoji: "🤞", name: "Fingers crossed" },
      { kind: "salute", emoji: "🫡", name: "Saluting face" },
      { kind: "candle", emoji: "🕯️", name: "Candle" },
      { kind: "dove", emoji: "🕊️", name: "Dove" },
    ],
  },
  {
    group: "Hope",
    reactions: [
      { kind: "sunflower", emoji: "🌻", name: "Sunflower" },
      { kind: "bouquet", emoji: "💐", name: "Bouquet" },
      { kind: "rose", emoji: "🌹", name: "Rose" },
      { kind: "rainbow", emoji: "🌈", name: "Rainbow" },
      { kind: "sun", emoji: "☀️", name: "Sun" },
      { kind: "star", emoji: "⭐", name: "Star" },
      { kind: "sparkles", emoji: "✨", name: "Sparkles" },
      { kind: "seedling", emoji: "🌱", name: "Seedling" },
      { kind: "butterfly", emoji: "🦋", name: "Butterfly" },
      { kind: "clover", emoji: "🍀", name: "Four-leaf clover" },
    ],
  },
  {
    group: "Joy",
    reactions: [
      { kind: "party", emoji: "🎉", name: "Party popper" },
      { kind: "confetti", emoji: "🎊", name: "Confetti ball" },
      { kind: "laugh", emoji: "😂", name: "Laughing" },
      { kind: "rofl", emoji: "🤣", name: "Rolling on the floor laughing" },
      { kind: "smile", emoji: "😊", name: "Smiling face" },
      { kind: "grin", emoji: "😁", name: "Grinning face" },
      { kind: "star_struck", emoji: "🤩", name: "Star-struck" },
      { kind: "trophy", emoji: "🏆", name: "Trophy" },
      { kind: "hundred", emoji: "💯", name: "Hundred points" },
      { kind: "fire", emoji: "🔥", name: "Fire" },
    ],
  },
  {
    group: "Sad",
    reactions: [
      { kind: "cry", emoji: "😢", name: "Crying face" },
      { kind: "sob", emoji: "😭", name: "Sobbing face" },
      { kind: "broken_heart", emoji: "💔", name: "Broken heart" },
      { kind: "wilted_flower", emoji: "🥀", name: "Wilted flower" },
      { kind: "pensive", emoji: "😔", name: "Pensive face" },
      { kind: "pleading", emoji: "🥺", name: "Pleading face" },
      { kind: "holding_back_tears", emoji: "🥹", name: "Holding back tears" },
      { kind: "worried", emoji: "😟", name: "Worried face" },
      { kind: "exhale", emoji: "😮‍💨", name: "Exhaling face" },
    ],
  },
  {
    group: "Angry",
    reactions: [
      { kind: "angry", emoji: "😠", name: "Angry face" },
      { kind: "rage", emoji: "😡", name: "Enraged face" },
      { kind: "cursing", emoji: "🤬", name: "Face with symbols on mouth" },
      { kind: "eye_roll", emoji: "🙄", name: "Rolling eyes" },
      { kind: "unamused", emoji: "😒", name: "Unamused face" },
      { kind: "weary", emoji: "😩", name: "Weary face" },
      { kind: "tired", emoji: "😫", name: "Tired face" },
      { kind: "exploding_head", emoji: "🤯", name: "Exploding head" },
      { kind: "middle_finger", emoji: "🖕", name: "Middle finger" },
    ],
  },
  {
    group: "Dark humor",
    reactions: [
      { kind: "skull", emoji: "💀", name: "Skull" },
      { kind: "coffin", emoji: "⚰️", name: "Coffin" },
      { kind: "ghost", emoji: "👻", name: "Ghost" },
      { kind: "upside_down", emoji: "🙃", name: "Upside-down face" },
      { kind: "melting", emoji: "🫠", name: "Melting face" },
      { kind: "sweat_smile", emoji: "😅", name: "Grinning face with sweat" },
      { kind: "grimace", emoji: "😬", name: "Grimacing face" },
      { kind: "clown", emoji: "🤡", name: "Clown face" },
      { kind: "facepalm", emoji: "🤦", name: "Facepalm" },
      { kind: "shrug", emoji: "🤷", name: "Shrug" },
    ],
  },
];

export const REACTIONS: readonly Reaction[] = CATALOG.flatMap((g) => g.reactions);

// The six every update gets unless the family chooses otherwise, and every note gets.
export const USUAL_REACTIONS: readonly string[] = ["heart", "hug", "strong", "clap", "party", "laugh"];

// Most an update can offer.
export const MAX_REACTIONS = 6;

const ORDER = new Map(REACTIONS.map((r, i) => [r.kind, i]));

export function reactionFor(kind: string): Reaction | undefined {
  return REACTIONS[ORDER.get(kind) ?? -1];
}

// The kinds in catalog order. Unknown kinds go last.
export function inCatalogOrder(kinds: readonly string[]): string[] {
  const at = (k: string) => ORDER.get(k) ?? Infinity;
  return [...kinds].sort((a, b) => at(a) - at(b));
}

export function isUsual(kinds: readonly string[]): boolean {
  return kinds.length === USUAL_REACTIONS.length && USUAL_REACTIONS.every((k, i) => kinds[i] === k);
}
