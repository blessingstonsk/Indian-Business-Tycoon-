// Versioned ruleset. Archives record RULESET.version so old games stay interpretable.
export const RULESET = {
  version: '1.0.0',
  minPlayers: 2,
  maxPlayers: 6,
  startingCash: 15_000,
  startReward: 2_000,
  jailSpaceId: 10,
  jailBail: 500,
  maxJailAttempts: 3,
  maxDoublesBeforeJail: 3,
  mortgageRate: 0.5,
  redemptionRate: 1.1,
  buildingSellRate: 0.5,
  blockInventory: 32,
  towerInventory: 12,
  auctionSeconds: 20,
  minBidIncrement: 10,
  timedModeMinutes: 90,
  maxNestedResolution: 3,
  maxPendingTradesPerPlayer: 3,
  allowedTurnTimers: [0, 30, 45, 60] as const,
} as const;

export type Ruleset = typeof RULESET;

/** Rupee amounts are always whole rupees. */
export function roundRupees(value: number): number {
  return Math.round(value);
}

export function mortgageValue(price: number): number {
  return roundRupees(price * RULESET.mortgageRate);
}

export function redemptionCost(price: number): number {
  return Math.ceil((mortgageValue(price) * RULESET.redemptionRate) / 10) * 10;
}
