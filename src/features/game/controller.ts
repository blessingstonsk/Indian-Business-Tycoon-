import {
  getSpace,
  groupHasBuildings,
  groupLevels,
  groupSpaceIds,
  isOwnable,
  ownsFullGroup,
  propertyState,
  redemptionCost,
  type GameAction,
  type GameState,
} from '@shared';
import type { EventDoc, ReactionDoc } from '../../domain/docs';
import type { PresenceState } from '../../lib/presence';

export type ActionType = GameAction['type'];

/** Everything the game screen needs, whether backed by Firestore or the local dev playground. */
export interface GameController {
  game: GameState;
  events: EventDoc[];
  myUid: string;
  pending: ActionType | null;
  send: (type: ActionType, payload?: Record<string, unknown>) => Promise<boolean>;
  react: (emoteId: string) => void;
  reactions: ReactionDoc[];
  presence: Record<string, PresenceState>;
  stale?: boolean;
  onExit: () => void;
}

// Client-side hints for enabling buttons. The server re-validates everything.

const MANAGE: GameState['phase'][] = ['AWAIT_ROLL', 'JAIL_DECISION', 'TURN_END'];
const RAISE: GameState['phase'][] = [...MANAGE, 'DEBT', 'PROPERTY_DECISION'];

export function canManage(game: GameState, uid: string, raising = false): boolean {
  return game.status !== 'COMPLETED' && game.currentPlayerUid === uid && (raising ? RAISE : MANAGE).includes(game.phase);
}

export function buildBlocker(game: GameState, uid: string, spaceId: number): string | null {
  const s = getSpace(spaceId);
  if (s.type !== 'PROPERTY') return 'Only cities can be developed';
  const ps = propertyState(game, spaceId);
  if (ps.ownerUid !== uid) return 'Not yours';
  if (!canManage(game, uid)) return 'Build on your turn';
  if (!ownsFullGroup(game, uid, s.group)) return 'Own the full colour group first';
  if (groupSpaceIds(s.group).some((id) => propertyState(game, id).mortgaged)) return 'Redeem the group first';
  if (ps.level >= 5) return 'Tower already built';
  if (ps.level > Math.min(...groupLevels(game, s.group))) return 'Build evenly';
  if (ps.level < 4 && game.bank.blocksLeft < 1) return 'Bank has no blocks';
  if (ps.level === 4 && game.bank.towersLeft < 1) return 'Bank has no towers';
  const me = game.players.find((p) => p.uid === uid)!;
  if (me.cash < s.buildCost) return 'Not enough cash';
  return null;
}

export function sellBlocker(game: GameState, uid: string, spaceId: number): string | null {
  const s = getSpace(spaceId);
  if (s.type !== 'PROPERTY') return 'No buildings';
  const ps = propertyState(game, spaceId);
  if (ps.ownerUid !== uid) return 'Not yours';
  if (!canManage(game, uid, true)) return 'Sell on your turn';
  if (ps.level === 0) return 'No buildings';
  if (ps.level < Math.max(...groupLevels(game, s.group))) return 'Sell evenly';
  return null;
}

export function mortgageBlocker(game: GameState, uid: string, spaceId: number): string | null {
  const s = getSpace(spaceId);
  if (!isOwnable(s)) return 'Not ownable';
  const ps = propertyState(game, spaceId);
  if (ps.ownerUid !== uid) return 'Not yours';
  if (!canManage(game, uid, true)) return 'Mortgage on your turn';
  if (ps.mortgaged) return 'Already mortgaged';
  if (groupHasBuildings(game, spaceId)) return 'Sell buildings first';
  return null;
}

export function unmortgageBlocker(game: GameState, uid: string, spaceId: number): string | null {
  const s = getSpace(spaceId);
  if (!isOwnable(s)) return 'Not ownable';
  const ps = propertyState(game, spaceId);
  if (ps.ownerUid !== uid) return 'Not yours';
  if (!canManage(game, uid)) return 'Redeem on your turn';
  if (!ps.mortgaged) return 'Not mortgaged';
  const me = game.players.find((p) => p.uid === uid)!;
  if (me.cash < redemptionCost(s.price)) return 'Not enough cash';
  return null;
}
