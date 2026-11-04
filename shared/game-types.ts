// Shared domain types for the authoritative game engine and the UI.
// All money values are integer rupees.

export type SpaceType =
  | 'START'
  | 'PROPERTY'
  | 'TRANSIT'
  | 'UTILITY'
  | 'CARD'
  | 'TAX'
  | 'JAIL'
  | 'REST_HOUSE'
  | 'GO_TO_JAIL';

export type ColorGroup =
  | 'terracotta'
  | 'sky'
  | 'rose'
  | 'saffron'
  | 'crimson'
  | 'turmeric'
  | 'emerald'
  | 'indigo';

export type DeckId = 'FORTUNE' | 'CIVIC';

export type Landmark =
  | 'fort'
  | 'tower'
  | 'temple'
  | 'gate'
  | 'palace'
  | 'beach'
  | 'bridge'
  | 'skyline'
  | 'ghat'
  | 'tea';

export interface BaseSpace {
  id: number;
  type: SpaceType;
  name: string;
  short: string;
}

export interface PropertySpace extends BaseSpace {
  type: 'PROPERTY';
  group: ColorGroup;
  city: string;
  price: number;
  /** rent[0] = bare site, rent[1..4] = blocks, rent[5] = tower */
  rent: [number, number, number, number, number, number];
  buildCost: number;
  landmark: Landmark;
}

export interface TransitSpace extends BaseSpace {
  type: 'TRANSIT';
  price: number;
  /** rent by number of transit assets owned (1..4) */
  rent: [number, number, number, number];
}

export interface UtilitySpace extends BaseSpace {
  type: 'UTILITY';
  price: number;
  /** dice multiplier when 1 or 2 utilities owned */
  multipliers: [number, number];
}

export interface CardSpace extends BaseSpace {
  type: 'CARD';
  deck: DeckId;
}

export interface TaxSpace extends BaseSpace {
  type: 'TAX';
  amount: number;
}

export interface SimpleSpace extends BaseSpace {
  type: 'START' | 'JAIL' | 'REST_HOUSE' | 'GO_TO_JAIL';
}

export type Space = PropertySpace | TransitSpace | UtilitySpace | CardSpace | TaxSpace | SimpleSpace;
export type OwnableSpace = PropertySpace | TransitSpace | UtilitySpace;

export type CardEffect =
  | { type: 'COLLECT'; amount: number }
  | { type: 'PAY'; amount: number }
  | { type: 'ADVANCE_TO'; spaceId: number }
  | { type: 'MOVE_BY'; steps: number }
  | { type: 'GO_TO_JAIL' }
  | { type: 'JAIL_FREE' }
  | { type: 'REPAIRS'; perBlock: number; perTower: number }
  | { type: 'NEAREST'; spaceType: 'TRANSIT' | 'UTILITY' };

export interface CardDef {
  id: string;
  deck: DeckId;
  text: string;
  effect: CardEffect;
}

export type GameMode = 'STANDARD' | 'TIMED';
export type TurnTimer = 0 | 30 | 45 | 60;

export interface GameSettings {
  maxPlayers: number;
  mode: GameMode;
  turnTimerSeconds: TurnTimer;
}

export type GameStatus = 'IN_PROGRESS' | 'ACTION_REQUIRED' | 'COMPLETED';

export type Phase =
  | 'AWAIT_ROLL'
  | 'JAIL_DECISION'
  | 'PROPERTY_DECISION'
  | 'AUCTION'
  | 'DEBT'
  | 'TURN_END';

export interface PlayerStats {
  rentCollected: number;
  rentPaid: number;
  biggestTrade: number;
  passedStart: number;
}

export interface PlayerState {
  uid: string;
  displayName: string;
  photoURL: string | null;
  token: string;
  color: string;
  cash: number;
  position: number;
  inJail: boolean;
  jailAttempts: number;
  jailCards: DeckId[];
  bankrupt: boolean;
  bankruptAt: number | null;
  stats: PlayerStats;
}

export interface PropertyState {
  spaceId: number;
  ownerUid: string | null;
  /** 0..4 blocks, 5 = tower */
  level: number;
  mortgaged: boolean;
}

export interface Dice {
  first: number;
  second: number;
  rolledAt: number;
}

export interface AuctionState {
  spaceId: number;
  highestBid: number;
  highestBidderUid: string | null;
  activeUids: string[];
  endsAt: number;
}

export interface DebtState {
  debtorUid: string;
  creditorUid: string | null;
  amount: number;
  reason: string;
}

export interface TradeSide {
  cash: number;
  spaceIds: number[];
  jailCards: number;
}

export interface TradeOffer {
  id: string;
  fromUid: string;
  toUid: string;
  give: TradeSide;
  get: TradeSide;
  createdAt: number;
}

export interface LastCard {
  deck: DeckId;
  cardId: string;
  text: string;
  drawnBy: string;
  at: number;
}

export interface GameState {
  gameId: string;
  roomId: string;
  rulesetVersion: string;
  status: GameStatus;
  version: number;
  settings: GameSettings;
  playerOrder: string[];
  currentPlayerUid: string;
  turnNumber: number;
  round: number;
  phase: Phase;
  doublesCount: number;
  canRollAgain: boolean;
  /** dice total to use when resolving utility rent after a debt is cleared */
  pendingMoveSteps: number | null;
  players: PlayerState[];
  properties: PropertyState[];
  bank: { blocksLeft: number; towersLeft: number; paidOut: number; collected: number };
  dice: Dice | null;
  auction: AuctionState | null;
  debt: DebtState | null;
  trades: TradeOffer[];
  lastCard: LastCard | null;
  turnDeadline: number | null;
  startedAt: number;
  endsAt: number | null;
  updatedAt: number;
  completedAt: number | null;
  winnerUid: string | null;
  endReason: 'LAST_SOLVENT' | 'TIME_LIMIT' | null;
}

/** Server-only state. Never sent to clients. */
export interface PrivateState {
  decks: Record<DeckId, string[]>;
}

export type GameEvent =
  | { type: 'TURN_STARTED'; uid: string; turnNumber: number }
  | { type: 'DICE_ROLLED'; uid: string; first: number; second: number; doubles: boolean }
  | { type: 'MOVED'; uid: string; from: number; to: number; path: number[]; passedStart: boolean; direct: boolean }
  | { type: 'START_REWARD'; uid: string; amount: number }
  | { type: 'CARD_DRAWN'; uid: string; deck: DeckId; cardId: string; text: string }
  | { type: 'PROPERTY_BOUGHT'; uid: string; spaceId: number; price: number }
  | { type: 'PROPERTY_DECLINED'; uid: string; spaceId: number }
  | { type: 'AUCTION_STARTED'; spaceId: number; endsAt: number }
  | { type: 'BID_PLACED'; uid: string; spaceId: number; amount: number }
  | { type: 'BID_PASSED'; uid: string; spaceId: number }
  | { type: 'AUCTION_WON'; uid: string | null; spaceId: number; amount: number }
  | { type: 'RENT_PAID'; fromUid: string; toUid: string; spaceId: number; amount: number }
  | { type: 'PAID_BANK'; uid: string; amount: number; reason: string }
  | { type: 'RECEIVED_BANK'; uid: string; amount: number; reason: string }
  | { type: 'SENT_TO_JAIL'; uid: string; reason: string }
  | { type: 'LEFT_JAIL'; uid: string; method: 'BAIL' | 'DOUBLES' | 'CARD' | 'FORCED_BAIL' }
  | { type: 'JAIL_ATTEMPT_FAILED'; uid: string; attempts: number }
  | { type: 'BUILT'; uid: string; spaceId: number; level: number; cost: number }
  | { type: 'BUILDING_SOLD'; uid: string; spaceId: number; level: number; refund: number }
  | { type: 'MORTGAGED'; uid: string; spaceId: number; amount: number }
  | { type: 'UNMORTGAGED'; uid: string; spaceId: number; amount: number }
  | { type: 'DEBT_STARTED'; uid: string; creditorUid: string | null; amount: number; reason: string }
  | { type: 'DEBT_PAID'; uid: string; creditorUid: string | null; amount: number }
  | { type: 'TRADE_PROPOSED'; trade: TradeOffer }
  | { type: 'TRADE_ACCEPTED'; tradeId: string; fromUid: string; toUid: string; value: number }
  | { type: 'TRADE_REJECTED'; tradeId: string; byUid: string }
  | { type: 'TRADE_CANCELLED'; tradeId: string; reason: string }
  | { type: 'BANKRUPT'; uid: string; creditorUid: string | null }
  | { type: 'TIMEOUT'; uid: string; phase: Phase }
  | { type: 'GAME_COMPLETED'; winnerUid: string | null; reason: 'LAST_SOLVENT' | 'TIME_LIMIT' };
