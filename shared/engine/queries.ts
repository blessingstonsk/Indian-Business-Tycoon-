import { BOARD, getSpace, groupSpaceIds, isOwnable } from '../board-config';
import type { ColorGroup, GameState, OwnableSpace, PlayerState, PropertyState } from '../game-types';
import { mortgageValue, redemptionCost, RULESET } from '../ruleset';

// Read-only helpers shared by the engine and the UI.

export function findPlayer(game: GameState, uid: string): PlayerState | undefined {
  return game.players.find((p) => p.uid === uid);
}

export function propertyState(game: GameState, spaceId: number): PropertyState {
  const ps = game.properties.find((p) => p.spaceId === spaceId);
  if (!ps) throw new Error(`Space ${spaceId} is not ownable`);
  return ps;
}

export function ownableSpace(spaceId: number): OwnableSpace {
  const s = getSpace(spaceId);
  if (!isOwnable(s)) throw new Error(`Space ${spaceId} is not ownable`);
  return s;
}

export function ownsFullGroup(game: GameState, uid: string, group: ColorGroup): boolean {
  return groupSpaceIds(group).every((id) => propertyState(game, id).ownerUid === uid);
}

export function groupLevels(game: GameState, group: ColorGroup): number[] {
  return groupSpaceIds(group).map((id) => propertyState(game, id).level);
}

export function groupHasBuildings(game: GameState, spaceId: number): boolean {
  const s = getSpace(spaceId);
  if (s.type !== 'PROPERTY') return false;
  return groupLevels(game, s.group).some((l) => l > 0);
}

export function rentFor(game: GameState, spaceId: number, diceTotal: number): number {
  const ps = propertyState(game, spaceId);
  if (!ps.ownerUid || ps.mortgaged) return 0;
  const owner = ps.ownerUid;
  const s = ownableSpace(spaceId);
  if (s.type === 'PROPERTY') {
    if (ps.level > 0) return s.rent[ps.level];
    return s.rent[0] * (ownsFullGroup(game, owner, s.group) ? 2 : 1);
  }
  const sameType = game.properties.filter(
    (p) => p.ownerUid === owner && !p.mortgaged && getSpace(p.spaceId).type === s.type,
  ).length;
  if (s.type === 'TRANSIT') return s.rent[Math.max(0, sameType - 1)];
  return s.multipliers[Math.max(0, sameType - 1)] * diceTotal;
}

export function ownedSpaceIds(game: GameState, uid: string): number[] {
  return game.properties.filter((p) => p.ownerUid === uid).map((p) => p.spaceId);
}

export function buildingCounts(game: GameState, uid: string): { blocks: number; towers: number } {
  let blocks = 0;
  let towers = 0;
  for (const p of game.properties) {
    if (p.ownerUid !== uid) continue;
    if (p.level === 5) towers++;
    else blocks += p.level;
  }
  return { blocks, towers };
}

export function netWorth(game: GameState, uid: string): number {
  const player = findPlayer(game, uid);
  if (!player || player.bankrupt) return 0;
  let total = player.cash;
  for (const p of game.properties) {
    if (p.ownerUid !== uid) continue;
    const s = ownableSpace(p.spaceId);
    total += p.mortgaged ? s.price - mortgageValue(s.price) : s.price;
    if (s.type === 'PROPERTY') total += p.level * s.buildCost;
  }
  return total;
}

export function mortgageDebt(game: GameState, uid: string): number {
  return game.properties
    .filter((p) => p.ownerUid === uid && p.mortgaged)
    .reduce((sum, p) => sum + redemptionCost(ownableSpace(p.spaceId).price), 0);
}

/** Max cash a player could hold after selling every building and mortgaging every deed. */
export function liquidationValue(game: GameState, uid: string): number {
  const player = findPlayer(game, uid);
  if (!player) return 0;
  let total = player.cash;
  for (const p of game.properties) {
    if (p.ownerUid !== uid) continue;
    const s = ownableSpace(p.spaceId);
    if (s.type === 'PROPERTY') total += Math.round(p.level * s.buildCost * RULESET.buildingSellRate);
    if (!p.mortgaged) total += mortgageValue(s.price);
  }
  return total;
}

export function standings(game: GameState): { uid: string; netWorth: number; rank: number }[] {
  const solvent = game.players
    .filter((p) => !p.bankrupt)
    .map((p) => ({ uid: p.uid, netWorth: netWorth(game, p.uid), at: Infinity }))
    .sort((a, b) => b.netWorth - a.netWorth);
  const out = game.players
    .filter((p) => p.bankrupt)
    .map((p) => ({ uid: p.uid, netWorth: 0, at: p.bankruptAt ?? 0 }))
    .sort((a, b) => b.at - a.at);
  return [...solvent, ...out].map((s, i) => ({ uid: s.uid, netWorth: s.netWorth, rank: i + 1 }));
}

export function isActionRequiredPhase(phase: GameState['phase']): boolean {
  return phase === 'JAIL_DECISION' || phase === 'PROPERTY_DECISION' || phase === 'AUCTION' || phase === 'DEBT';
}

export function spaceName(id: number): string {
  return BOARD[id]?.name ?? `Space ${id}`;
}
