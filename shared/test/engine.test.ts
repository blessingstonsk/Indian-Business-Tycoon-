import { describe, expect, it } from 'vitest';
import { DomainError } from '../api';
import { validateBoard } from '../board-config';
import { CARDS } from '../cards';
import { netWorth, rentFor } from '../engine/queries';
import { RULESET } from '../ruleset';
import { A, Harness } from './helpers';

const err = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  throw new Error('expected DomainError');
};

describe('board config', () => {
  it('is a valid 40-space board', () => {
    expect(validateBoard()).toEqual([]);
  });
  it('has 16 cards per deck with one jail card each', () => {
    for (const deck of ['FORTUNE', 'CIVIC'] as const) {
      const cards = CARDS.filter((c) => c.deck === deck);
      expect(cards).toHaveLength(16);
      expect(cards.filter((c) => c.effect.type === 'JAIL_FREE')).toHaveLength(1);
    }
  });
});

describe('turns and movement', () => {
  it('rejects out-of-turn rolls', () => {
    const h = new Harness();
    expect(err(() => h.roll('p2', 1, 2))).toBe('NOT_YOUR_TURN');
  });

  it('moves by dice total and offers purchase', () => {
    const h = new Harness();
    h.roll('p1', 1, 2);
    expect(h.player('p1').position).toBe(3);
    expect(h.game.phase).toBe('PROPERTY_DECISION');
    expect(h.game.status).toBe('ACTION_REQUIRED');
  });

  it('pays START reward exactly once when passing', () => {
    const h = new Harness();
    h.player('p1').position = 38;
    h.roll('p1', 1, 3); // 38 -> 2 (Civic Chest)
    const rewards = h.events.filter((e) => e.type === 'START_REWARD');
    expect(rewards).toHaveLength(1);
  });

  it('cannot roll twice without doubles', () => {
    const h = new Harness();
    h.player('p1').position = 6;
    h.give('p2', 10 + 1); // irrelevant
    h.roll('p1', 1, 3); // 6 -> 10 jail visiting
    expect(h.game.phase).toBe('TURN_END');
    expect(err(() => h.roll('p1', 1, 2))).toBe('INVALID_PHASE');
  });

  it('doubles grant another roll', () => {
    const h = new Harness();
    h.roll('p1', 3, 3); // -> 6 Patna
    h.act('p1', A('BUY_PROPERTY'));
    expect(h.game.phase).toBe('AWAIT_ROLL');
  });

  it('three doubles sends player to jail without resolving third destination', () => {
    const h = new Harness();
    h.roll('p1', 1, 1); // -> 2 civic chest card
    if (h.game.phase === 'DEBT') throw new Error('unexpected');
    // force a clean state for determinism
    h.player('p1').position = 0;
    h.game.phase = 'AWAIT_ROLL';
    h.game.debt = null;
    h.roll('p1', 3, 3); // -> 6, second double
    h.act('p1', A('DECLINE_PROPERTY'));
    h.act('p1', A('PASS_BID'));
    h.act('p2', A('PASS_BID'));
    const cashBefore = h.player('p1').cash;
    h.roll('p1', 4, 4); // third double
    expect(h.player('p1').inJail).toBe(true);
    expect(h.player('p1').position).toBe(10);
    expect(h.player('p1').cash).toBe(cashBefore);
    expect(h.game.phase).toBe('TURN_END');
    expect(h.events.some((e) => e.type === 'MOVED' && e.direct)).toBe(true);
  });

  it('end turn rotates to the next solvent player and counts rounds', () => {
    const h = new Harness(3);
    h.player('p2').bankrupt = true;
    h.roll('p1', 1, 3);
    h.act('p1', A('END_TURN'));
    expect(h.game.currentPlayerUid).toBe('p3');
    h.roll('p3', 1, 3);
    h.act('p3', A('END_TURN'));
    expect(h.game.currentPlayerUid).toBe('p1');
    expect(h.game.round).toBe(2);
  });

  it('version strictly increases', () => {
    const h = new Harness();
    const v = h.game.version;
    h.roll('p1', 1, 3);
    expect(h.game.version).toBe(v + 1);
  });
});

describe('purchase, rent and tax', () => {
  it('buys a property and deducts cash', () => {
    const h = new Harness();
    h.roll('p1', 1, 2);
    h.act('p1', A('BUY_PROPERTY'));
    expect(h.prop(3).ownerUid).toBe('p1');
    expect(h.player('p1').cash).toBe(RULESET.startingCash - 600);
  });

  it('collects rent, doubled for a full group', () => {
    const h = new Harness();
    h.give('p2', 1);
    expect(rentFor(h.game, 1, 7)).toBe(20);
    h.give('p2', 3);
    expect(rentFor(h.game, 3, 7)).toBe(80);
    h.roll('p1', 1, 2);
    expect(h.player('p1').cash).toBe(RULESET.startingCash - 80);
    expect(h.player('p2').cash).toBe(RULESET.startingCash + 80);
    expect(h.player('p2').stats.rentCollected).toBe(80);
  });

  it('mortgaged property collects no rent', () => {
    const h = new Harness();
    h.give('p2', 3);
    h.prop(3).mortgaged = true;
    h.roll('p1', 1, 2);
    expect(h.player('p1').cash).toBe(RULESET.startingCash);
  });

  it('transit rent scales with assets owned and utilities use dice', () => {
    const h = new Harness();
    h.give('p2', 5, 15);
    expect(rentFor(h.game, 5, 7)).toBe(500);
    h.give('p2', 12);
    expect(rentFor(h.game, 12, 7)).toBe(280);
    h.give('p2', 28);
    expect(rentFor(h.game, 12, 7)).toBe(700);
  });

  it('charges GST Checkpost tax', () => {
    const h = new Harness();
    h.roll('p1', 1, 3);
    expect(h.player('p1').cash).toBe(RULESET.startingCash - 2000);
  });

  it('insufficient cash for rent enters the debt flow', () => {
    const h = new Harness();
    h.give('p2', 3);
    h.give('p1', 39);
    h.player('p1').cash = 10;
    h.roll('p1', 1, 2);
    expect(h.game.phase).toBe('DEBT');
    expect(h.game.debt).toMatchObject({ debtorUid: 'p1', creditorUid: 'p2', amount: 40 });
    expect(err(() => h.act('p1', A('DECLARE_BANKRUPTCY')))).toBe('INVALID_ACTION');
    h.act('p1', A('MORTGAGE', { spaceId: 39 }));
    h.act('p1', A('PAY_DEBT'));
    expect(h.game.debt).toBeNull();
    expect(h.player('p2').cash).toBe(RULESET.startingCash + 40);
    expect(h.game.phase).toBe('TURN_END');
  });
});

describe('auctions', () => {
  it('declined property is auctioned to the highest bidder', () => {
    const h = new Harness(3);
    h.roll('p1', 1, 2);
    h.act('p1', A('DECLINE_PROPERTY'));
    expect(h.game.phase).toBe('AUCTION');
    h.act('p2', A('PLACE_BID', { amount: 100 }));
    expect(err(() => h.act('p3', A('PLACE_BID', { amount: 100 })))).toBe('INVALID_ACTION');
    h.act('p3', A('PLACE_BID', { amount: 200 }));
    h.act('p1', A('PASS_BID'));
    h.act('p2', A('PASS_BID'));
    expect(h.prop(3).ownerUid).toBe('p3');
    expect(h.player('p3').cash).toBe(RULESET.startingCash - 200);
    expect(h.game.phase).toBe('TURN_END');
  });

  it('auction closes on timeout with no bids and property stays unowned', () => {
    const h = new Harness();
    h.roll('p1', 1, 2);
    h.act('p1', A('DECLINE_PROPERTY'));
    expect(err(() => h.act('p2', A('CLAIM_TIMEOUT')))).toBe('INVALID_ACTION');
    h.deps.advance(RULESET.auctionSeconds * 1000);
    h.act('p2', A('CLAIM_TIMEOUT'));
    expect(h.prop(3).ownerUid).toBeNull();
    expect(h.game.auction).toBeNull();
  });

  it('cannot bid more than cash', () => {
    const h = new Harness();
    h.roll('p1', 1, 2);
    h.act('p1', A('DECLINE_PROPERTY'));
    expect(err(() => h.act('p2', A('PLACE_BID', { amount: RULESET.startingCash + 1 })))).toBe('INSUFFICIENT_FUNDS');
  });
});

describe('jail', () => {
  const jailed = () => {
    const h = new Harness();
    h.player('p1').inJail = true;
    h.player('p1').position = 10;
    h.game.phase = 'JAIL_DECISION';
    return h;
  };

  it('pay bail then roll normally', () => {
    const h = jailed();
    h.act('p1', A('PAY_BAIL'));
    expect(h.player('p1').inJail).toBe(false);
    expect(h.player('p1').cash).toBe(RULESET.startingCash - RULESET.jailBail);
    expect(h.game.phase).toBe('AWAIT_ROLL');
  });

  it('doubles release without an extra roll', () => {
    const h = jailed();
    h.deps.faces.push(2, 2);
    h.act('p1', A('TRY_DOUBLES'));
    expect(h.player('p1').inJail).toBe(false);
    expect(h.player('p1').position).toBe(14);
    expect(h.game.phase).toBe('PROPERTY_DECISION');
    h.act('p1', A('BUY_PROPERTY'));
    expect(h.game.phase).toBe('TURN_END');
  });

  it('third failed attempt forces bail and moves', () => {
    const h = jailed();
    h.player('p1').jailAttempts = 2;
    h.deps.faces.push(1, 2);
    h.act('p1', A('TRY_DOUBLES'));
    expect(h.player('p1').inJail).toBe(false);
    expect(h.player('p1').position).toBe(13);
    expect(h.player('p1').cash).toBe(RULESET.startingCash - RULESET.jailBail);
  });

  it('jail card is used and returned to its deck', () => {
    const h = jailed();
    h.player('p1').jailCards = ['CIVIC'];
    const civicLen = h.priv.decks.CIVIC.length;
    h.act('p1', A('USE_JAIL_CARD'));
    expect(h.player('p1').jailCards).toEqual([]);
    expect(h.priv.decks.CIVIC.length).toBe(civicLen + 1);
  });
});

describe('cards', () => {
  it('advance card crossing START pays once and resolves destination', () => {
    const h = new Harness();
    topCard(h, 'FORTUNE', 'F03'); // advance to Chennai (32)
    h.player('p1').position = 33; // Civic.. move to Fortune at 36 via roll 3
    h.roll('p1', 1, 2); // 33 -> 36 Fortune; card moves to 32 crossing START
    expect(h.player('p1').position).toBe(32);
    expect(h.events.filter((e) => e.type === 'START_REWARD')).toHaveLength(1);
    expect(h.game.phase).toBe('PROPERTY_DECISION');
  });

  it('go back 3 does not pay START', () => {
    const h = new Harness();
    topCard(h, 'FORTUNE', 'F09');
    h.roll('p1', 3, 4); // 0 -> 7 Fortune -> back to 4 GST
    expect(h.player('p1').position).toBe(4);
    expect(h.player('p1').cash).toBe(RULESET.startingCash - 2000);
  });

  it('jail-free card is kept out of the deck', () => {
    const h = new Harness();
    topCard(h, 'CIVIC', 'C09');
    h.roll('p1', 1, 1); // -> 2 Civic
    expect(h.player('p1').jailCards).toEqual(['CIVIC']);
    expect(h.priv.decks.CIVIC).not.toContain('C09');
  });
});

describe('development and mortgages', () => {
  const monopoly = () => {
    const h = new Harness();
    h.give('p1', 6, 8, 9);
    return h;
  };

  it('requires the full group and even building', () => {
    const h = new Harness();
    h.give('p1', 6, 8);
    expect(err(() => h.act('p1', A('BUILD', { spaceId: 6 })))).toBe('INVALID_ACTION');
    h.give('p1', 9);
    h.act('p1', A('BUILD', { spaceId: 6 }));
    expect(err(() => h.act('p1', A('BUILD', { spaceId: 6 })))).toBe('INVALID_ACTION');
    h.act('p1', A('BUILD', { spaceId: 8 }));
    h.act('p1', A('BUILD', { spaceId: 9 }));
    h.act('p1', A('BUILD', { spaceId: 6 }));
    expect(h.prop(6).level).toBe(2);
    expect(h.game.bank.blocksLeft).toBe(RULESET.blockInventory - 4);
  });

  it('tower returns four blocks to the bank', () => {
    const h = monopoly();
    for (let lvl = 0; lvl < 4; lvl++) for (const id of [6, 8, 9]) h.act('p1', A('BUILD', { spaceId: id }));
    expect(h.game.bank.blocksLeft).toBe(RULESET.blockInventory - 12);
    h.act('p1', A('BUILD', { spaceId: 6 }));
    expect(h.prop(6).level).toBe(5);
    expect(h.game.bank.towersLeft).toBe(RULESET.towerInventory - 1);
    expect(h.game.bank.blocksLeft).toBe(RULESET.blockInventory - 8);
  });

  it('respects block inventory', () => {
    const h = monopoly();
    h.game.bank.blocksLeft = 0;
    expect(err(() => h.act('p1', A('BUILD', { spaceId: 6 })))).toBe('INVALID_ACTION');
  });

  it('cannot mortgage with buildings in group; refunds half on sale', () => {
    const h = monopoly();
    h.act('p1', A('BUILD', { spaceId: 6 }));
    expect(err(() => h.act('p1', A('MORTGAGE', { spaceId: 8 })))).toBe('INVALID_ACTION');
    const cash = h.player('p1').cash;
    h.act('p1', A('SELL_BUILDING', { spaceId: 6 }));
    expect(h.player('p1').cash).toBe(cash + 250);
    h.act('p1', A('MORTGAGE', { spaceId: 8 }));
    expect(h.player('p1').cash).toBe(cash + 250 + 500);
    expect(err(() => h.act('p1', A('BUILD', { spaceId: 6 })))).toBe('INVALID_ACTION');
    h.act('p1', A('UNMORTGAGE', { spaceId: 8 }));
    expect(h.player('p1').cash).toBe(cash + 250 + 500 - 550);
  });

  it('cannot manage other players assets', () => {
    const h = monopoly();
    expect(err(() => h.act('p2', A('MORTGAGE', { spaceId: 6 })))).toBe('NOT_YOUR_TURN');
  });
});

describe('trading', () => {
  it('executes a combined trade atomically', () => {
    const h = new Harness();
    h.give('p1', 1);
    h.give('p2', 3);
    h.player('p2').jailCards = ['FORTUNE'];
    h.act('p1', A('PROPOSE_TRADE', { toUid: 'p2', give: { cash: 500, spaceIds: [1], jailCards: 0 }, get: { cash: 0, spaceIds: [3], jailCards: 1 } }));
    const id = h.game.trades[0].id;
    expect(err(() => h.act('p1', A('ACCEPT_TRADE', { tradeId: id })))).toBe('PERMISSION_DENIED');
    h.act('p2', A('ACCEPT_TRADE', { tradeId: id }));
    expect(h.prop(1).ownerUid).toBe('p2');
    expect(h.prop(3).ownerUid).toBe('p1');
    expect(h.player('p1').jailCards).toEqual(['FORTUNE']);
    expect(h.player('p1').cash).toBe(RULESET.startingCash - 500);
    expect(h.player('p2').cash).toBe(RULESET.startingCash + 500);
    expect(h.player('p1').stats.biggestTrade).toBe(1700);
  });

  it('accept revalidates ownership and cash', () => {
    const h = new Harness();
    h.give('p1', 1);
    h.act('p1', A('PROPOSE_TRADE', { toUid: 'p2', give: { cash: 1000, spaceIds: [], jailCards: 0 }, get: { cash: 0, spaceIds: [], jailCards: 0 } }));
    h.player('p1').cash = 100;
    expect(err(() => h.act('p2', A('ACCEPT_TRADE', { tradeId: h.game.trades[0].id })))).toBe('INSUFFICIENT_FUNDS');
  });

  it('rejects trading property with buildings in its group', () => {
    const h = new Harness();
    h.give('p1', 1, 3);
    h.prop(1).level = 1;
    expect(err(() => h.act('p1', A('PROPOSE_TRADE', { toUid: 'p2', give: { cash: 0, spaceIds: [3], jailCards: 0 }, get: { cash: 100, spaceIds: [], jailCards: 0 } })))).toBe('INVALID_ACTION');
  });
});

describe('bankruptcy and completion', () => {
  it('bankruptcy to a player transfers deeds and ends a 2-player game', () => {
    const h = new Harness();
    h.give('p2', 3);
    h.prop(3).level = 0;
    h.give('p1', 1);
    h.prop(1).mortgaged = true;
    h.player('p1').cash = 10;
    h.roll('p1', 1, 2);
    expect(h.game.phase).toBe('DEBT');
    h.act('p1', A('DECLARE_BANKRUPTCY'));
    expect(h.player('p1').bankrupt).toBe(true);
    expect(h.prop(1).ownerUid).toBe('p2');
    expect(h.game.status).toBe('COMPLETED');
    expect(h.game.winnerUid).toBe('p2');
    expect(err(() => h.roll('p2', 1, 2))).toBe('GAME_ALREADY_COMPLETED');
  });

  it('bankruptcy to the bank frees deeds and play continues', () => {
    const h = new Harness(3);
    h.give('p1', 1);
    h.player('p1').cash = 0;
    h.roll('p1', 2, 2); // GST 2000
    expect(h.game.phase).toBe('DEBT');
    h.act('p1', A('MORTGAGE', { spaceId: 1 }));
    h.act('p1', A('DECLARE_BANKRUPTCY'));
    expect(h.prop(1).ownerUid).toBeNull();
    expect(h.prop(1).mortgaged).toBe(false);
    expect(h.game.status).not.toBe('COMPLETED');
    expect(h.game.currentPlayerUid).toBe('p2');
  });

  it('debt timeout auto-liquidates before bankruptcy', () => {
    const h = new Harness(2, { maxPlayers: 6, mode: 'STANDARD', turnTimerSeconds: 30 });
    h.give('p1', 39);
    h.player('p1').cash = 0;
    h.roll('p1', 2, 2);
    expect(h.game.phase).toBe('DEBT');
    h.deps.advance(31_000);
    h.act('p2', A('CLAIM_TIMEOUT'));
    expect(h.prop(39).mortgaged).toBe(true);
    expect(h.player('p1').bankrupt).toBe(false);
    expect(h.player('p1').cash).toBe(0);
  });

  it('timed mode ends on the time limit with highest net worth', () => {
    const h = new Harness(2, { maxPlayers: 6, mode: 'TIMED', turnTimerSeconds: 0 });
    h.give('p2', 39);
    h.deps.advance(RULESET.timedModeMinutes * 60_000);
    h.act('p1', A('CLAIM_TIMEOUT'));
    expect(h.game.status).toBe('COMPLETED');
    expect(h.game.endReason).toBe('TIME_LIMIT');
    expect(h.game.winnerUid).toBe('p2');
    expect(netWorth(h.game, 'p2')).toBe(RULESET.startingCash + 4000);
  });

  it('resign by a non-current player is allowed', () => {
    const h = new Harness(3);
    h.act('p3', A('RESIGN'));
    expect(h.player('p3').bankrupt).toBe(true);
    expect(h.game.currentPlayerUid).toBe('p1');
  });
});

function topCard(h: Harness, deck: 'FORTUNE' | 'CIVIC', id: string) {
  h.priv.decks[deck] = [id, ...h.priv.decks[deck].filter((c) => c !== id)];
}
