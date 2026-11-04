import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { GameAction } from '../action-schemas';
import { DomainError } from '../api';
import { getSpace, groupSpaceIds, OWNABLE_IDS } from '../board-config';
import { applyAction } from '../engine/engine';
import type { GameState, PrivateState } from '../game-types';
import { RULESET } from '../ruleset';
import { newGame, scriptedDeps } from './helpers';

// Property-based invariants across random legal-ish action sequences (manual §11.2).

const actionArb: fc.Arbitrary<GameAction> = fc.oneof(
  { weight: 6, arbitrary: fc.constant({ type: 'ROLL_DICE', payload: {} } as GameAction) },
  { weight: 3, arbitrary: fc.constant({ type: 'BUY_PROPERTY', payload: {} } as GameAction) },
  { weight: 2, arbitrary: fc.constant({ type: 'DECLINE_PROPERTY', payload: {} } as GameAction) },
  { weight: 2, arbitrary: fc.integer({ min: 10, max: 3000 }).map((amount) => ({ type: 'PLACE_BID', payload: { amount } }) as GameAction) },
  { weight: 3, arbitrary: fc.constant({ type: 'PASS_BID', payload: {} } as GameAction) },
  { weight: 1, arbitrary: fc.constant({ type: 'PAY_BAIL', payload: {} } as GameAction) },
  { weight: 2, arbitrary: fc.constant({ type: 'TRY_DOUBLES', payload: {} } as GameAction) },
  { weight: 3, arbitrary: fc.constantFrom(...OWNABLE_IDS).map((spaceId) => ({ type: 'BUILD', payload: { spaceId } }) as GameAction) },
  { weight: 1, arbitrary: fc.constantFrom(...OWNABLE_IDS).map((spaceId) => ({ type: 'SELL_BUILDING', payload: { spaceId } }) as GameAction) },
  { weight: 1, arbitrary: fc.constantFrom(...OWNABLE_IDS).map((spaceId) => ({ type: 'MORTGAGE', payload: { spaceId } }) as GameAction) },
  { weight: 1, arbitrary: fc.constantFrom(...OWNABLE_IDS).map((spaceId) => ({ type: 'UNMORTGAGE', payload: { spaceId } }) as GameAction) },
  { weight: 2, arbitrary: fc.constant({ type: 'PAY_DEBT', payload: {} } as GameAction) },
  { weight: 1, arbitrary: fc.constant({ type: 'DECLARE_BANKRUPTCY', payload: {} } as GameAction) },
  { weight: 5, arbitrary: fc.constant({ type: 'END_TURN', payload: {} } as GameAction) },
  { weight: 1, arbitrary: fc.constant({ type: 'CLAIM_TIMEOUT', payload: {} } as GameAction) },
);

function checkInvariants(g: GameState, priv: PrivateState, startTotal: number, prevVersion: number) {
  const cash = g.players.reduce((s, p) => s + p.cash, 0);
  expect(cash).toBe(startTotal + g.bank.paidOut - g.bank.collected);
  expect(g.version).toBeGreaterThan(prevVersion);
  for (const p of g.players) {
    expect(Number.isInteger(p.position) && p.position >= 0 && p.position <= 39).toBe(true);
    expect(Number.isInteger(p.cash)).toBe(true);
    if (!p.bankrupt) expect(p.cash).toBeGreaterThanOrEqual(0);
  }
  expect(new Set(g.properties.map((p) => p.spaceId)).size).toBe(g.properties.length);
  let blocks = 0;
  let towers = 0;
  for (const ps of g.properties) {
    const s = getSpace(ps.spaceId);
    if (ps.mortgaged) expect(ps.level).toBe(0);
    if (ps.level > 0) {
      expect(s.type).toBe('PROPERTY');
      expect(ps.ownerUid).not.toBeNull();
    }
    if (ps.ownerUid) expect(g.players.find((p) => p.uid === ps.ownerUid)!.bankrupt).toBe(false);
    if (ps.level === 5) towers++;
    else blocks += ps.level;
    if (s.type === 'PROPERTY') {
      const levels = groupSpaceIds(s.group).map((id) => g.properties.find((x) => x.spaceId === id)!.level);
      expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(1);
    }
  }
  expect(blocks + g.bank.blocksLeft).toBe(RULESET.blockInventory);
  expect(towers + g.bank.towersLeft).toBe(RULESET.towerInventory);
  // jail cards: every card is either in a deck or held, exactly once
  const held = g.players.flatMap((p) => p.jailCards);
  for (const deck of ['FORTUNE', 'CIVIC'] as const) {
    expect(priv.decks[deck].length + held.filter((d) => d === deck).length).toBe(16);
  }
}

describe('engine invariants (property-based)', () => {
  it('hold across random action sequences', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.array(fc.tuple(fc.nat(5), actionArb), { minLength: 50, maxLength: 400 }),
        (players, seed, steps) => {
          const deps = scriptedDeps([], seed);
          let { game, priv } = newGame(players, { maxPlayers: 6, mode: 'STANDARD', turnTimerSeconds: 30 }, deps);
          const startTotal = RULESET.startingCash * players;
          for (const [who, action] of steps) {
            if (game.status === 'COMPLETED') break;
            deps.advance(5_000);
            // Mostly act as the current player so games actually progress.
            const uid = who < 3 ? game.currentPlayerUid : game.playerOrder[who % players];
            try {
              const r = applyAction(game, priv, uid, action, deps);
              checkInvariants(r.game, r.priv, startTotal, game.version);
              game = r.game;
              priv = r.priv;
            } catch (e) {
              if (!(e instanceof DomainError)) throw e;
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('rejected actions never mutate state', () => {
    const { game, priv, deps } = newGame(2);
    const before = JSON.stringify({ game, priv });
    expect(() => applyAction(game, priv, 'p2', { type: 'ROLL_DICE', payload: {} }, deps)).toThrow(DomainError);
    expect(() => applyAction(game, priv, 'p1', { type: 'BUY_PROPERTY', payload: {} }, deps)).toThrow(DomainError);
    expect(JSON.stringify({ game, priv })).toBe(before);
  });
});
