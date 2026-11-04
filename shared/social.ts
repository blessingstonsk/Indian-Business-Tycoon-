// Curated, allowlisted reactions and quick phrases. No free text exists anywhere in the app.

export interface Emote {
  id: string;
  label: string;
  glyph: string;
  kind: 'emote' | 'phrase';
}

export const EMOTES: readonly Emote[] = [
  { id: 'clap', label: 'Clap', glyph: '👏', kind: 'emote' },
  { id: 'laugh', label: 'Laugh', glyph: '😂', kind: 'emote' },
  { id: 'wow', label: 'Wow', glyph: '😮', kind: 'emote' },
  { id: 'cry', label: 'Cry', glyph: '😭', kind: 'emote' },
  { id: 'angry', label: 'Angry', glyph: '😤', kind: 'emote' },
  { id: 'cool', label: 'Cool', glyph: '😎', kind: 'emote' },
  { id: 'namaste', label: 'Namaste', glyph: '🙏', kind: 'emote' },
  { id: 'fire', label: 'Fire', glyph: '🔥', kind: 'emote' },
  { id: 'money', label: 'Money', glyph: '💰', kind: 'emote' },
  { id: 'chai', label: 'Chai break', glyph: '☕', kind: 'emote' },
  { id: 'q_rent', label: 'Pay my rent!', glyph: '🧾', kind: 'phrase' },
  { id: 'q_trade', label: "Let's trade!", glyph: '🤝', kind: 'phrase' },
  { id: 'q_turn', label: 'Your turn!', glyph: '⏰', kind: 'phrase' },
  { id: 'q_gg', label: 'Good game!', glyph: '🏆', kind: 'phrase' },
  { id: 'q_luck', label: 'Best of luck!', glyph: '🍀', kind: 'phrase' },
  { id: 'q_wait', label: 'One minute…', glyph: '⏳', kind: 'phrase' },
];

export const EMOTE_IDS = new Set(EMOTES.map((e) => e.id));

export const REACTION_LIMIT = { count: 3, windowMs: 5_000 } as const;
export const REACTION_TTL_MS = 8_000;

export interface TokenDef {
  id: string;
  label: string;
  glyph: string;
  color: string;
}

export const TOKENS: readonly TokenDef[] = [
  { id: 'elephant', label: 'Elephant', glyph: '🐘', color: '#2f6fb5' },
  { id: 'rickshaw', label: 'Auto rickshaw', glyph: '🛺', color: '#d4a017' },
  { id: 'tiger', label: 'Tiger', glyph: '🐅', color: '#e06c1f' },
  { id: 'peacock', label: 'Peacock', glyph: '🦚', color: '#138a72' },
  { id: 'lotus', label: 'Lotus', glyph: '🪷', color: '#c2417a' },
  { id: 'cricket', label: 'Cricket bat', glyph: '🏏', color: '#7a4fb3' },
];

export const TOKEN_IDS = new Set(TOKENS.map((t) => t.id));

export function tokenDef(id: string): TokenDef {
  return TOKENS.find((t) => t.id === id) ?? TOKENS[0];
}

export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const FRIEND_CODE_LENGTH = 8;
export const INVITE_CODE_LENGTH = 6;
