import type { GameAction } from '../action-schemas';
import { fail } from '../api';
import { BOARD, BOARD_SIZE, getSpace, groupSpaceIds, isOwnable, OWNABLE_IDS } from '../board-config';
import { CARDS, deckCardIds, getCard } from '../cards';
import type {
  DeckId,
  GameEvent,
  GameSettings,
  GameState,
  Phase,
  PlayerState,
  PrivateState,
  TradeOffer,
  TradeSide,
} from '../game-types';
import { mortgageValue, redemptionCost, RULESET } from '../ruleset';
import { tokenDef } from '../social';
import {
  findPlayer,
  groupHasBuildings,
  groupLevels,
  isActionRequiredPhase,
  liquidationValue,
  netWorth,
  ownableSpace,
  ownsFullGroup,
  propertyState,
  rentFor,
  standings,
} from './queries';

/** Injected so the engine is deterministic under test. */
export interface EngineDeps {
  now: number;
  /** uniform integer in [0, maxExclusive) */
  randomInt: (maxExclusive: number) => number;
  newId: () => string;
}

export interface EngineResult {
  game: GameState;
  priv: PrivateState;
  events: GameEvent[];
}

export interface NewGamePlayer {
  uid: string;
  displayName: string;
  photoURL: string | null;
  token: string;
}

function shuffle<T>(items: T[], randomInt: (n: number) => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createInitialGame(
  input: { gameId: string; roomId: string; settings: GameSettings; players: NewGamePlayer[] },
  deps: EngineDeps,
): EngineResult {
  const { players, settings } = input;
  if (players.length < RULESET.minPlayers || players.length > RULESET.maxPlayers) {
    fail('INVALID_ACTION', `A game needs ${RULESET.minPlayers}-${RULESET.maxPlayers} players`);
  }
  const playerStates: PlayerState[] = players.map((p) => ({
    uid: p.uid,
    displayName: p.displayName,
    photoURL: p.photoURL,
    token: p.token,
    color: tokenDef(p.token).color,
    cash: RULESET.startingCash,
    position: 0,
    inJail: false,
    jailAttempts: 0,
    jailCards: [],
    bankrupt: false,
    bankruptAt: null,
    stats: { rentCollected: 0, rentPaid: 0, biggestTrade: 0, passedStart: 0 },
  }));
  const game: GameState = {
    gameId: input.gameId,
    roomId: input.roomId,
    rulesetVersion: RULESET.version,
    status: 'IN_PROGRESS',
    version: 1,
    settings,
    playerOrder: players.map((p) => p.uid),
    currentPlayerUid: players[0].uid,
    turnNumber: 1,
    round: 1,
    phase: 'AWAIT_ROLL',
    doublesCount: 0,
    canRollAgain: false,
    pendingMoveSteps: null,
    players: playerStates,
    properties: OWNABLE_IDS.map((spaceId) => ({ spaceId, ownerUid: null, level: 0, mortgaged: false })),
    bank: { blocksLeft: RULESET.blockInventory, towersLeft: RULESET.towerInventory, paidOut: 0, collected: 0 },
    dice: null,
    auction: null,
    debt: null,
    trades: [],
    lastCard: null,
    turnDeadline: settings.turnTimerSeconds ? deps.now + settings.turnTimerSeconds * 1000 : null,
    startedAt: deps.now,
    endsAt: settings.mode === 'TIMED' ? deps.now + RULESET.timedModeMinutes * 60_000 : null,
    updatedAt: deps.now,
    completedAt: null,
    winnerUid: null,
    endReason: null,
  };
  const priv: PrivateState = {
    decks: {
      FORTUNE: shuffle(deckCardIds('FORTUNE'), deps.randomInt),
      CIVIC: shuffle(deckCardIds('CIVIC'), deps.randomInt),
    },
  };
  return { game, priv, events: [{ type: 'TURN_STARTED', uid: game.currentPlayerUid, turnNumber: 1 }] };
}

/** Actions any seated, solvent player may submit when it is not their turn. */
const OFF_TURN_ACTIONS = new Set<GameAction['type']>([
  'PLACE_BID',
  'PASS_BID',
  'PROPOSE_TRADE',
  'ACCEPT_TRADE',
  'REJECT_TRADE',
  'CANCEL_TRADE',
  'CLAIM_TIMEOUT',
  'RESIGN',
]);

const MANAGEMENT_PHASES: Phase[] = ['AWAIT_ROLL', 'JAIL_DECISION', 'TURN_END'];
const RAISE_FUNDS_PHASES: Phase[] = [...MANAGEMENT_PHASES, 'DEBT', 'PROPERTY_DECISION'];

/**
 * Apply one validated command. Pure with respect to its inputs: the originals are never mutated,
 * so a thrown DomainError leaves state untouched (atomicity).
 */
export function applyAction(
  game: GameState,
  priv: PrivateState,
  actorUid: string,
  action: GameAction,
  deps: EngineDeps,
): EngineResult {
  const tx = new Transition(structuredClone(game), structuredClone(priv), deps);
  tx.run(actorUid, action);
  return tx.finish();
}

/** Ends a game by net worth (abandonment policy / admin tooling). */
export function completeByNetWorth(game: GameState, priv: PrivateState, deps: EngineDeps): EngineResult {
  const tx = new Transition(structuredClone(game), structuredClone(priv), deps);
  if (tx.g.status !== 'COMPLETED') tx.endByNetWorth();
  return tx.finish();
}

class Transition {
  events: GameEvent[] = [];

  constructor(
    public g: GameState,
    public priv: PrivateState,
    private deps: EngineDeps,
  ) {}

  finish(): EngineResult {
    const g = this.g;
    if (g.status !== 'COMPLETED') {
      if (g.endsAt !== null && this.deps.now >= g.endsAt && !g.auction && !g.debt) this.complete('TIME_LIMIT');
      else g.status = isActionRequiredPhase(g.phase) ? 'ACTION_REQUIRED' : 'IN_PROGRESS';
    }
    g.version += 1;
    g.updatedAt = this.deps.now;
    return { game: g, priv: this.priv, events: this.events };
  }

  // ---------- dispatch ----------

  run(actorUid: string, action: GameAction): void {
    const g = this.g;
    if (g.status === 'COMPLETED') fail('GAME_ALREADY_COMPLETED', 'This game has finished');
    const actor = findPlayer(g, actorUid);
    if (!actor) fail('NOT_ROOM_MEMBER', 'You are not seated in this game');
    if (actor.bankrupt) fail('PERMISSION_DENIED', 'Bankrupt players can no longer act');
    if (!OFF_TURN_ACTIONS.has(action.type) && g.currentPlayerUid !== actorUid) {
      fail('NOT_YOUR_TURN', 'Wait for your turn');
    }

    switch (action.type) {
      case 'ROLL_DICE':
        return this.roll(actor);
      case 'TRY_DOUBLES':
        return this.tryDoubles(actor);
      case 'PAY_BAIL':
        return this.payBail(actor);
      case 'USE_JAIL_CARD':
        return this.useJailCard(actor);
      case 'BUY_PROPERTY':
        return this.buy(actor);
      case 'DECLINE_PROPERTY':
        return this.decline(actor);
      case 'PLACE_BID':
        return this.bid(actor, action.payload.amount);
      case 'PASS_BID':
        return this.passBid(actor);
      case 'BUILD':
        return this.build(actor, action.payload.spaceId);
      case 'SELL_BUILDING':
        return this.sellBuilding(actor, action.payload.spaceId);
      case 'MORTGAGE':
        return this.mortgage(actor, action.payload.spaceId);
      case 'UNMORTGAGE':
        return this.unmortgage(actor, action.payload.spaceId);
      case 'PROPOSE_TRADE':
        return this.proposeTrade(actor, action.payload.toUid, action.payload.give, action.payload.get);
      case 'ACCEPT_TRADE':
        return this.acceptTrade(actor, action.payload.tradeId);
      case 'REJECT_TRADE':
        return this.rejectTrade(actor, action.payload.tradeId);
      case 'CANCEL_TRADE':
        return this.cancelTrade(actor, action.payload.tradeId);
      case 'PAY_DEBT':
        return this.payDebt(actor);
      case 'DECLARE_BANKRUPTCY':
        return this.declareBankruptcy(actor);
      case 'END_TURN':
        return this.endTurn();
      case 'CLAIM_TIMEOUT':
        return this.claimTimeout();
      case 'RESIGN':
        return this.resign(actor);
    }
  }

  private requirePhase(...phases: Phase[]): void {
    if (!phases.includes(this.g.phase)) fail('INVALID_PHASE', 'That action is not available right now');
  }

  private current(): PlayerState {
    return findPlayer(this.g, this.g.currentPlayerUid)!;
  }

  private setPhase(phase: Phase): void {
    const g = this.g;
    g.phase = phase;
    if (phase === 'AUCTION' && g.auction) g.turnDeadline = g.auction.endsAt;
    else g.turnDeadline = g.settings.turnTimerSeconds ? this.deps.now + g.settings.turnTimerSeconds * 1000 : null;
  }

  /** After any step resolves: decide what the current player does next. */
  private settle(): void {
    const g = this.g;
    if (g.status === 'COMPLETED') return;
    if (g.debt) return this.setPhase('DEBT');
    if (g.auction) return this.setPhase('AUCTION');
    if (g.phase === 'PROPERTY_DECISION') return;
    const p = this.current();
    this.setPhase(g.canRollAgain && !p.inJail ? 'AWAIT_ROLL' : 'TURN_END');
  }

  // ---------- dice & movement ----------

  private rollDice(uid: string): { first: number; second: number; total: number; doubles: boolean } {
    const first = this.deps.randomInt(6) + 1;
    const second = this.deps.randomInt(6) + 1;
    this.g.dice = { first, second, rolledAt: this.deps.now };
    const doubles = first === second;
    this.events.push({ type: 'DICE_ROLLED', uid, first, second, doubles });
    return { first, second, total: first + second, doubles };
  }

  private roll(p: PlayerState): void {
    this.requirePhase('AWAIT_ROLL');
    const r = this.rollDice(p.uid);
    if (r.doubles) {
      this.g.doublesCount += 1;
      if (this.g.doublesCount >= RULESET.maxDoublesBeforeJail) {
        this.sendToJail(p, 'Three doubles in a row');
        return this.settle();
      }
    }
    this.g.canRollAgain = r.doubles;
    this.moveBy(p, r.total);
    this.resolveLanding(p, r.total, 0);
    this.settle();
  }

  private moveBy(p: PlayerState, steps: number): void {
    const from = p.position;
    const path: number[] = [];
    let passedStart = false;
    const dir = steps >= 0 ? 1 : -1;
    for (let i = 0; i < Math.abs(steps); i++) {
      const next = (from + dir * (i + 1) + BOARD_SIZE * 4) % BOARD_SIZE;
      path.push(next);
      if (dir > 0 && next === 0) passedStart = true;
    }
    p.position = (from + steps + BOARD_SIZE * 4) % BOARD_SIZE;
    this.events.push({ type: 'MOVED', uid: p.uid, from, to: p.position, path, passedStart, direct: false });
    if (passedStart) {
      p.stats.passedStart += 1;
      this.bankPays(p, RULESET.startReward, 'START reward');
      this.events.push({ type: 'START_REWARD', uid: p.uid, amount: RULESET.startReward });
    }
  }

  private moveTo(p: PlayerState, target: number): void {
    const steps = (target - p.position + BOARD_SIZE) % BOARD_SIZE;
    if (steps > 0) this.moveBy(p, steps);
  }

  private sendToJail(p: PlayerState, reason: string): void {
    const from = p.position;
    p.position = RULESET.jailSpaceId;
    p.inJail = true;
    p.jailAttempts = 0;
    this.g.canRollAgain = false;
    this.g.doublesCount = 0;
    this.events.push({ type: 'MOVED', uid: p.uid, from, to: p.position, path: [], passedStart: false, direct: true });
    this.events.push({ type: 'SENT_TO_JAIL', uid: p.uid, reason });
  }

  private resolveLanding(p: PlayerState, diceTotal: number, depth: number): void {
    const space = getSpace(p.position);
    if (isOwnable(space)) {
      const ps = propertyState(this.g, space.id);
      if (!ps.ownerUid) {
        this.setPhase('PROPERTY_DECISION');
        return;
      }
      if (ps.ownerUid !== p.uid) {
        const owner = findPlayer(this.g, ps.ownerUid)!;
        const rent = rentFor(this.g, space.id, diceTotal);
        if (rent > 0 && !owner.bankrupt) this.charge(p, rent, owner.uid, `Rent for ${space.name}`, space.id);
      }
      return;
    }
    switch (space.type) {
      case 'TAX':
        this.charge(p, space.amount, null, space.name);
        return;
      case 'CARD':
        this.drawCard(p, space.deck, diceTotal, depth);
        return;
      case 'GO_TO_JAIL':
        this.sendToJail(p, 'Landed on Go To Jail');
        return;
      default:
        return;
    }
  }

  private drawCard(p: PlayerState, deck: DeckId, diceTotal: number, depth: number): void {
    if (depth >= RULESET.maxNestedResolution) return;
    const pile = this.priv.decks[deck];
    const cardId = pile.shift();
    if (!cardId) return;
    const card = getCard(cardId);
    if (card.effect.type === 'JAIL_FREE') p.jailCards.push(deck);
    else pile.push(cardId);
    this.g.lastCard = { deck, cardId, text: card.text, drawnBy: p.uid, at: this.deps.now };
    this.events.push({ type: 'CARD_DRAWN', uid: p.uid, deck, cardId, text: card.text });

    const e = card.effect;
    switch (e.type) {
      case 'COLLECT':
        this.bankPays(p, e.amount, card.text);
        return;
      case 'PAY':
        this.charge(p, e.amount, null, card.text);
        return;
      case 'ADVANCE_TO':
        this.moveTo(p, e.spaceId);
        this.resolveLanding(p, diceTotal, depth + 1);
        return;
      case 'MOVE_BY':
        this.moveBy(p, e.steps);
        this.resolveLanding(p, diceTotal, depth + 1);
        return;
      case 'GO_TO_JAIL':
        this.sendToJail(p, card.text);
        return;
      case 'JAIL_FREE':
        return;
      case 'REPAIRS': {
        let blocks = 0;
        let towers = 0;
        for (const ps of this.g.properties) {
          if (ps.ownerUid !== p.uid) continue;
          if (ps.level === 5) towers++;
          else blocks += ps.level;
        }
        const total = blocks * e.perBlock + towers * e.perTower;
        if (total > 0) this.charge(p, total, null, 'Repairs');
        return;
      }
      case 'NEAREST': {
        let target = p.position;
        for (let i = 1; i <= BOARD_SIZE; i++) {
          const id = (p.position + i) % BOARD_SIZE;
          if (BOARD[id].type === e.spaceType) {
            target = id;
            break;
          }
        }
        this.moveTo(p, target);
        this.resolveLanding(p, diceTotal, depth + 1);
        return;
      }
    }
  }

  // ---------- money ----------

  private bankPays(p: PlayerState, amount: number, reason: string): void {
    p.cash += amount;
    this.g.bank.paidOut += amount;
    this.events.push({ type: 'RECEIVED_BANK', uid: p.uid, amount, reason });
  }

  private transfer(from: PlayerState, toUid: string | null, amount: number, reason: string, spaceId?: number): void {
    from.cash -= amount;
    if (toUid) {
      const to = findPlayer(this.g, toUid)!;
      to.cash += amount;
      if (spaceId !== undefined) {
        to.stats.rentCollected += amount;
        from.stats.rentPaid += amount;
        this.events.push({ type: 'RENT_PAID', fromUid: from.uid, toUid, spaceId, amount });
      }
    } else {
      this.g.bank.collected += amount;
      this.events.push({ type: 'PAID_BANK', uid: from.uid, amount, reason });
    }
  }

  /** Pay or enter the debt/liquidation flow. Returns true when paid immediately. */
  private charge(p: PlayerState, amount: number, creditorUid: string | null, reason: string, spaceId?: number): boolean {
    if (amount <= 0) return true;
    if (p.cash >= amount) {
      this.transfer(p, creditorUid, amount, reason, spaceId);
      return true;
    }
    this.g.debt = { debtorUid: p.uid, creditorUid, amount, reason };
    this.events.push({ type: 'DEBT_STARTED', uid: p.uid, creditorUid, amount, reason });
    this.setPhase('DEBT');
    return false;
  }

  private payDebt(p: PlayerState): void {
    this.requirePhase('DEBT');
    const debt = this.g.debt!;
    if (debt.debtorUid !== p.uid) fail('PERMISSION_DENIED', 'This debt is not yours');
    if (p.cash < debt.amount) fail('INSUFFICIENT_FUNDS', 'Raise more cash first');
    this.transfer(p, debt.creditorUid, debt.amount, debt.reason, debt.creditorUid ? p.position : undefined);
    this.events.push({ type: 'DEBT_PAID', uid: p.uid, creditorUid: debt.creditorUid, amount: debt.amount });
    this.g.debt = null;
    this.continueAfterDebt(p);
  }

  private continueAfterDebt(p: PlayerState): void {
    const steps = this.g.pendingMoveSteps;
    if (steps !== null) {
      this.g.pendingMoveSteps = null;
      this.moveBy(p, steps);
      this.resolveLanding(p, steps, 0);
    }
    this.settle();
  }

  private declareBankruptcy(p: PlayerState): void {
    this.requirePhase('DEBT');
    const debt = this.g.debt!;
    if (debt.debtorUid !== p.uid) fail('PERMISSION_DENIED', 'This debt is not yours');
    const reachable = liquidationValue(this.g, p.uid);
    if (reachable >= debt.amount) {
      fail('INVALID_ACTION', `You can still raise ₹${reachable.toLocaleString('en-IN')} by selling or mortgaging`);
    }
    this.bankrupt(p, debt.creditorUid);
  }

  /** Sell buildings then mortgage until the debt is covered (timeout policy). */
  private autoLiquidate(p: PlayerState, target: number): void {
    const g = this.g;
    let guard = 200;
    while (p.cash < target && guard-- > 0) {
      const built = g.properties
        .filter((ps) => ps.ownerUid === p.uid && ps.level > 0)
        .filter((ps) => {
          const s = getSpace(ps.spaceId);
          return s.type === 'PROPERTY' && ps.level >= Math.max(...groupLevels(g, s.group));
        })
        .filter((ps) => ps.level < 5 || g.bank.blocksLeft >= 4)
        .sort((a, b) => b.level - a.level)[0];
      if (built) {
        this.sellBuilding(p, built.spaceId, true);
        continue;
      }
      const deed = g.properties
        .filter((ps) => ps.ownerUid === p.uid && !ps.mortgaged && !groupHasBuildings(g, ps.spaceId))
        .sort((a, b) => ownableSpace(a.spaceId).price - ownableSpace(b.spaceId).price)[0];
      if (!deed) break;
      this.mortgage(p, deed.spaceId, true);
    }
  }

  // ---------- jail ----------

  private leaveJail(p: PlayerState, method: 'BAIL' | 'DOUBLES' | 'CARD' | 'FORCED_BAIL'): void {
    p.inJail = false;
    p.jailAttempts = 0;
    this.events.push({ type: 'LEFT_JAIL', uid: p.uid, method });
  }

  private payBail(p: PlayerState): void {
    this.requirePhase('JAIL_DECISION');
    if (p.cash < RULESET.jailBail) fail('INSUFFICIENT_FUNDS', 'Not enough cash for bail');
    this.transfer(p, null, RULESET.jailBail, 'Jail bail');
    this.leaveJail(p, 'BAIL');
    this.setPhase('AWAIT_ROLL');
  }

  private useJailCard(p: PlayerState): void {
    this.requirePhase('JAIL_DECISION');
    const deck = p.jailCards.shift();
    if (!deck) fail('INVALID_ACTION', 'You have no Get Out of Jail Free card');
    this.returnJailCard(deck);
    this.leaveJail(p, 'CARD');
    this.setPhase('AWAIT_ROLL');
  }

  private returnJailCard(deck: DeckId): void {
    const card = CARDS.find((c) => c.deck === deck && c.effect.type === 'JAIL_FREE')!;
    this.priv.decks[deck].push(card.id);
  }

  private tryDoubles(p: PlayerState): void {
    this.requirePhase('JAIL_DECISION');
    const r = this.rollDice(p.uid);
    this.g.canRollAgain = false;
    if (r.doubles) {
      this.leaveJail(p, 'DOUBLES');
      this.moveBy(p, r.total);
      this.resolveLanding(p, r.total, 0);
      return this.settle();
    }
    p.jailAttempts += 1;
    this.events.push({ type: 'JAIL_ATTEMPT_FAILED', uid: p.uid, attempts: p.jailAttempts });
    if (p.jailAttempts < RULESET.maxJailAttempts) return this.setPhase('TURN_END');
    // Final attempt failed: bail is mandatory, then move by this roll.
    this.leaveJail(p, 'FORCED_BAIL');
    if (!this.charge(p, RULESET.jailBail, null, 'Jail bail')) {
      this.g.pendingMoveSteps = r.total;
      return;
    }
    this.moveBy(p, r.total);
    this.resolveLanding(p, r.total, 0);
    this.settle();
  }

  // ---------- purchase & auction ----------

  private buy(p: PlayerState): void {
    this.requirePhase('PROPERTY_DECISION');
    const s = ownableSpace(p.position);
    if (p.cash < s.price) fail('INSUFFICIENT_FUNDS', 'Not enough cash – mortgage or decline to auction');
    this.transfer(p, null, s.price, `Bought ${s.name}`);
    propertyState(this.g, s.id).ownerUid = p.uid;
    this.events.push({ type: 'PROPERTY_BOUGHT', uid: p.uid, spaceId: s.id, price: s.price });
    this.g.phase = 'TURN_END';
    this.settle();
  }

  private decline(p: PlayerState): void {
    this.requirePhase('PROPERTY_DECISION');
    const spaceId = p.position;
    this.events.push({ type: 'PROPERTY_DECLINED', uid: p.uid, spaceId });
    const endsAt = this.deps.now + RULESET.auctionSeconds * 1000;
    this.g.auction = {
      spaceId,
      highestBid: 0,
      highestBidderUid: null,
      activeUids: this.g.playerOrder.filter((uid) => !findPlayer(this.g, uid)!.bankrupt),
      endsAt,
    };
    this.events.push({ type: 'AUCTION_STARTED', spaceId, endsAt });
    this.setPhase('AUCTION');
  }

  private bid(p: PlayerState, amount: number): void {
    this.requirePhase('AUCTION');
    const a = this.g.auction!;
    if (!a.activeUids.includes(p.uid)) fail('INVALID_ACTION', 'You have left this auction');
    if (a.highestBidderUid === p.uid) fail('INVALID_ACTION', 'You already hold the highest bid');
    const min = a.highestBid + RULESET.minBidIncrement;
    if (amount < min) fail('INVALID_ACTION', `Bid at least ₹${min.toLocaleString('en-IN')}`);
    if (amount > p.cash) fail('INSUFFICIENT_FUNDS', 'You cannot bid more cash than you hold');
    a.highestBid = amount;
    a.highestBidderUid = p.uid;
    a.endsAt = Math.max(a.endsAt, this.deps.now + 10_000);
    this.g.turnDeadline = a.endsAt;
    this.events.push({ type: 'BID_PLACED', uid: p.uid, spaceId: a.spaceId, amount });
    this.maybeCloseAuction();
  }

  private passBid(p: PlayerState): void {
    this.requirePhase('AUCTION');
    const a = this.g.auction!;
    if (!a.activeUids.includes(p.uid)) fail('INVALID_ACTION', 'You have already passed');
    if (a.highestBidderUid === p.uid) fail('INVALID_ACTION', 'The highest bidder cannot pass');
    a.activeUids = a.activeUids.filter((u) => u !== p.uid);
    this.events.push({ type: 'BID_PASSED', uid: p.uid, spaceId: a.spaceId });
    this.maybeCloseAuction();
  }

  private maybeCloseAuction(): void {
    const a = this.g.auction!;
    const onlyLeader = a.activeUids.length === 1 && a.activeUids[0] === a.highestBidderUid;
    if (a.activeUids.length === 0 || onlyLeader) {
      this.resolveAuction();
      this.settle();
    }
  }

  private resolveAuction(): void {
    const a = this.g.auction!;
    this.g.auction = null;
    const winner = a.highestBidderUid ? findPlayer(this.g, a.highestBidderUid) : undefined;
    if (winner && !winner.bankrupt && winner.cash >= a.highestBid) {
      this.transfer(winner, null, a.highestBid, `Won auction for ${getSpace(a.spaceId).name}`);
      propertyState(this.g, a.spaceId).ownerUid = winner.uid;
      this.events.push({ type: 'AUCTION_WON', uid: winner.uid, spaceId: a.spaceId, amount: a.highestBid });
    } else {
      this.events.push({ type: 'AUCTION_WON', uid: null, spaceId: a.spaceId, amount: 0 });
    }
    if (this.g.phase === 'AUCTION') this.g.phase = 'TURN_END';
  }

  // ---------- development & mortgages ----------

  private requireOwned(p: PlayerState, spaceId: number) {
    const s = getSpace(spaceId);
    if (!isOwnable(s)) fail('INVALID_ACTION', 'That space cannot be owned');
    const ps = propertyState(this.g, spaceId);
    if (ps.ownerUid !== p.uid) fail('PERMISSION_DENIED', 'You do not own that deed');
    return { s, ps };
  }

  private build(p: PlayerState, spaceId: number): void {
    this.requirePhase(...MANAGEMENT_PHASES);
    const { s, ps } = this.requireOwned(p, spaceId);
    if (s.type !== 'PROPERTY') fail('INVALID_ACTION', 'Only city properties can be developed');
    if (!ownsFullGroup(this.g, p.uid, s.group)) fail('INVALID_ACTION', 'Own the whole colour group first');
    const ids = groupSpaceIds(s.group);
    if (ids.some((id) => propertyState(this.g, id).mortgaged)) fail('INVALID_ACTION', 'Redeem mortgages in this group first');
    if (ps.level >= 5) fail('INVALID_ACTION', 'Already has a tower');
    if (ps.level > Math.min(...groupLevels(this.g, s.group))) fail('INVALID_ACTION', 'Build evenly across the group');
    if (ps.level < 4 && this.g.bank.blocksLeft < 1) fail('INVALID_ACTION', 'The bank has no blocks left');
    if (ps.level === 4 && this.g.bank.towersLeft < 1) fail('INVALID_ACTION', 'The bank has no towers left');
    if (p.cash < s.buildCost) fail('INSUFFICIENT_FUNDS', 'Not enough cash to build');
    if (ps.level === 4) {
      this.g.bank.towersLeft -= 1;
      this.g.bank.blocksLeft += 4;
    } else {
      this.g.bank.blocksLeft -= 1;
    }
    ps.level += 1;
    this.transfer(p, null, s.buildCost, `Built on ${s.name}`);
    this.events.push({ type: 'BUILT', uid: p.uid, spaceId, level: ps.level, cost: s.buildCost });
  }

  private sellBuilding(p: PlayerState, spaceId: number, internal = false): void {
    if (!internal) this.requirePhase(...RAISE_FUNDS_PHASES);
    const { s, ps } = this.requireOwned(p, spaceId);
    if (s.type !== 'PROPERTY' || ps.level === 0) fail('INVALID_ACTION', 'Nothing to sell there');
    if (ps.level < Math.max(...groupLevels(this.g, s.group))) fail('INVALID_ACTION', 'Sell evenly across the group');
    if (ps.level === 5) {
      if (this.g.bank.blocksLeft < 4) fail('INVALID_ACTION', 'The bank lacks blocks to break down this tower');
      this.g.bank.blocksLeft -= 4;
      this.g.bank.towersLeft += 1;
    } else {
      this.g.bank.blocksLeft += 1;
    }
    ps.level -= 1;
    const refund = Math.round(s.buildCost * RULESET.buildingSellRate);
    this.bankPays(p, refund, `Sold building on ${s.name}`);
    this.events.push({ type: 'BUILDING_SOLD', uid: p.uid, spaceId, level: ps.level, refund });
  }

  private mortgage(p: PlayerState, spaceId: number, internal = false): void {
    if (!internal) this.requirePhase(...RAISE_FUNDS_PHASES);
    const { s, ps } = this.requireOwned(p, spaceId);
    if (ps.mortgaged) fail('INVALID_ACTION', 'Already mortgaged');
    if (groupHasBuildings(this.g, spaceId)) fail('INVALID_ACTION', 'Sell buildings in this group first');
    ps.mortgaged = true;
    const amount = mortgageValue(s.price);
    this.bankPays(p, amount, `Mortgaged ${s.name}`);
    this.events.push({ type: 'MORTGAGED', uid: p.uid, spaceId, amount });
  }

  private unmortgage(p: PlayerState, spaceId: number): void {
    this.requirePhase(...MANAGEMENT_PHASES);
    const { s, ps } = this.requireOwned(p, spaceId);
    if (!ps.mortgaged) fail('INVALID_ACTION', 'Not mortgaged');
    const cost = redemptionCost(s.price);
    if (p.cash < cost) fail('INSUFFICIENT_FUNDS', 'Not enough cash to redeem');
    ps.mortgaged = false;
    this.transfer(p, null, cost, `Redeemed ${s.name}`);
    this.events.push({ type: 'UNMORTGAGED', uid: p.uid, spaceId, amount: cost });
  }

  // ---------- trades ----------

  private validateSide(owner: PlayerState, side: TradeSide): void {
    if (new Set(side.spaceIds).size !== side.spaceIds.length) fail('INVALID_ACTION', 'Duplicate deed in trade');
    for (const id of side.spaceIds) {
      const s = getSpace(id);
      if (!isOwnable(s)) fail('INVALID_ACTION', 'That space cannot be traded');
      if (propertyState(this.g, id).ownerUid !== owner.uid) fail('INVALID_ACTION', `${owner.displayName} no longer owns ${s.name}`);
      if (groupHasBuildings(this.g, id)) fail('INVALID_ACTION', `Sell buildings in ${s.name}'s group before trading it`);
    }
    if (side.cash > owner.cash) fail('INSUFFICIENT_FUNDS', `${owner.displayName} does not have that much cash`);
    if (side.jailCards > owner.jailCards.length) fail('INVALID_ACTION', 'Not enough jail cards');
  }

  private tradeCounterparty(uid: string): PlayerState {
    const p = findPlayer(this.g, uid);
    if (!p || p.bankrupt) fail('INVALID_ACTION', 'That player cannot trade');
    return p;
  }

  private proposeTrade(p: PlayerState, toUid: string, give: TradeSide, get: TradeSide): void {
    if (this.g.phase === 'AUCTION') fail('INVALID_PHASE', 'Trading is paused during auctions');
    if (toUid === p.uid) fail('INVALID_ACTION', 'You cannot trade with yourself');
    const to = this.tradeCounterparty(toUid);
    const isEmpty = (s: TradeSide) => s.cash === 0 && s.spaceIds.length === 0 && s.jailCards === 0;
    if (isEmpty(give) && isEmpty(get)) fail('INVALID_ACTION', 'Add something to the trade');
    if (this.g.trades.filter((t) => t.fromUid === p.uid).length >= RULESET.maxPendingTradesPerPlayer) {
      fail('RATE_LIMITED', 'Too many open offers – cancel one first');
    }
    this.validateSide(p, give);
    this.validateSide(to, get);
    const trade: TradeOffer = { id: this.deps.newId(), fromUid: p.uid, toUid, give, get, createdAt: this.deps.now };
    this.g.trades.push(trade);
    this.events.push({ type: 'TRADE_PROPOSED', trade });
  }

  private takeTrade(p: PlayerState, tradeId: string): TradeOffer {
    const t = this.g.trades.find((x) => x.id === tradeId);
    if (!t) fail('NOT_FOUND', 'That offer is no longer open');
    void p;
    return t;
  }

  private acceptTrade(p: PlayerState, tradeId: string): void {
    if (this.g.phase === 'AUCTION') fail('INVALID_PHASE', 'Trading is paused during auctions');
    const t = this.takeTrade(p, tradeId);
    if (t.toUid !== p.uid) fail('PERMISSION_DENIED', 'Only the recipient can accept');
    const from = this.tradeCounterparty(t.fromUid);
    this.validateSide(from, t.give);
    this.validateSide(p, t.get);

    const move = (a: PlayerState, b: PlayerState, side: TradeSide) => {
      a.cash -= side.cash;
      b.cash += side.cash;
      for (const id of side.spaceIds) propertyState(this.g, id).ownerUid = b.uid;
      for (let i = 0; i < side.jailCards; i++) b.jailCards.push(a.jailCards.shift()!);
    };
    move(from, p, t.give);
    move(p, from, t.get);

    const sideValue = (s: TradeSide) => s.cash + s.spaceIds.reduce((sum, id) => sum + ownableSpace(id).price, 0);
    const value = sideValue(t.give) + sideValue(t.get);
    from.stats.biggestTrade = Math.max(from.stats.biggestTrade, value);
    p.stats.biggestTrade = Math.max(p.stats.biggestTrade, value);
    this.g.trades = this.g.trades.filter((x) => x.id !== t.id);
    this.events.push({ type: 'TRADE_ACCEPTED', tradeId: t.id, fromUid: from.uid, toUid: p.uid, value });
    this.pruneInvalidTrades();
  }

  private pruneInvalidTrades(): void {
    this.g.trades = this.g.trades.filter((t) => {
      try {
        this.validateSide(this.tradeCounterparty(t.fromUid), t.give);
        this.validateSide(this.tradeCounterparty(t.toUid), t.get);
        return true;
      } catch {
        this.events.push({ type: 'TRADE_CANCELLED', tradeId: t.id, reason: 'Assets changed' });
        return false;
      }
    });
  }

  private rejectTrade(p: PlayerState, tradeId: string): void {
    const t = this.takeTrade(p, tradeId);
    if (t.toUid !== p.uid) fail('PERMISSION_DENIED', 'Only the recipient can reject');
    this.g.trades = this.g.trades.filter((x) => x.id !== t.id);
    this.events.push({ type: 'TRADE_REJECTED', tradeId: t.id, byUid: p.uid });
  }

  private cancelTrade(p: PlayerState, tradeId: string): void {
    const t = this.takeTrade(p, tradeId);
    if (t.fromUid !== p.uid) fail('PERMISSION_DENIED', 'Only the sender can cancel');
    this.g.trades = this.g.trades.filter((x) => x.id !== t.id);
    this.events.push({ type: 'TRADE_CANCELLED', tradeId: t.id, reason: 'Cancelled by sender' });
  }

  // ---------- turns, timeouts, bankruptcy, completion ----------

  private endTurn(): void {
    this.requirePhase('TURN_END');
    this.advanceTurn();
  }

  private advanceTurn(): void {
    const g = this.g;
    if (g.endsAt !== null && this.deps.now >= g.endsAt) return this.complete('TIME_LIMIT');
    const order = g.playerOrder;
    const curIdx = order.indexOf(g.currentPlayerUid);
    for (let i = 1; i <= order.length; i++) {
      const idx = (curIdx + i) % order.length;
      const next = findPlayer(g, order[idx])!;
      if (next.bankrupt) continue;
      if (idx <= curIdx) g.round += 1;
      g.turnNumber += 1;
      g.currentPlayerUid = next.uid;
      g.doublesCount = 0;
      g.canRollAgain = false;
      g.pendingMoveSteps = null;
      g.dice = null;
      this.setPhase(next.inJail ? 'JAIL_DECISION' : 'AWAIT_ROLL');
      this.events.push({ type: 'TURN_STARTED', uid: next.uid, turnNumber: g.turnNumber });
      return;
    }
  }

  /**
   * Deterministic timeout policy, enforced against server time only:
   * roll → auto-roll, jail → one doubles attempt, purchase → decline (auction),
   * auction → close, debt → auto-liquidate then pay or go bankrupt, turn end → end turn.
   */
  private claimTimeout(): void {
    const g = this.g;
    const now = this.deps.now;
    if (g.endsAt !== null && now >= g.endsAt && !g.auction && !g.debt) return this.complete('TIME_LIMIT');
    if (g.auction) {
      if (now < g.auction.endsAt) fail('INVALID_ACTION', 'The auction is still running');
      this.events.push({ type: 'TIMEOUT', uid: g.currentPlayerUid, phase: 'AUCTION' });
      this.resolveAuction();
      return this.settle();
    }
    if (g.turnDeadline === null || now < g.turnDeadline) fail('INVALID_ACTION', 'Nothing has timed out yet');
    const p = this.current();
    this.events.push({ type: 'TIMEOUT', uid: p.uid, phase: g.phase });
    switch (g.phase) {
      case 'AWAIT_ROLL':
        return this.roll(p);
      case 'JAIL_DECISION':
        return this.tryDoubles(p);
      case 'PROPERTY_DECISION':
        return this.decline(p);
      case 'DEBT': {
        const debt = g.debt!;
        this.autoLiquidate(p, debt.amount);
        if (p.cash >= debt.amount) return this.payDebt(p);
        return this.bankrupt(p, debt.creditorUid);
      }
      case 'TURN_END':
        return this.advanceTurn();
      default:
        return;
    }
  }

  private resign(p: PlayerState): void {
    const creditor = this.g.debt?.debtorUid === p.uid ? this.g.debt.creditorUid : null;
    this.bankrupt(p, creditor);
  }

  private bankrupt(p: PlayerState, creditorUid: string | null): void {
    const g = this.g;
    const creditor = creditorUid ? findPlayer(g, creditorUid) : undefined;
    const wasCurrent = g.currentPlayerUid === p.uid;

    // Buildings go back to the bank at the sell-back rate.
    for (const ps of g.properties) {
      if (ps.ownerUid !== p.uid || ps.level === 0) continue;
      const s = ownableSpace(ps.spaceId);
      if (s.type !== 'PROPERTY') continue;
      if (ps.level === 5) g.bank.towersLeft += 1;
      else g.bank.blocksLeft += ps.level;
      const refund = Math.round(ps.level * s.buildCost * RULESET.buildingSellRate);
      p.cash += refund;
      g.bank.paidOut += refund;
      ps.level = 0;
    }

    if (creditor && !creditor.bankrupt) {
      creditor.cash += p.cash;
      for (const ps of g.properties) if (ps.ownerUid === p.uid) ps.ownerUid = creditor.uid;
      creditor.jailCards.push(...p.jailCards);
    } else {
      g.bank.collected += p.cash;
      for (const ps of g.properties) {
        if (ps.ownerUid !== p.uid) continue;
        ps.ownerUid = null;
        ps.mortgaged = false;
      }
      for (const deck of p.jailCards) this.returnJailCard(deck);
    }
    p.cash = 0;
    p.jailCards = [];
    p.inJail = false;
    p.bankrupt = true;
    p.bankruptAt = this.deps.now;
    if (g.debt?.debtorUid === p.uid) g.debt = null;
    g.trades = g.trades.filter((t) => {
      const keep = t.fromUid !== p.uid && t.toUid !== p.uid;
      if (!keep) this.events.push({ type: 'TRADE_CANCELLED', tradeId: t.id, reason: 'Player left the game' });
      return keep;
    });
    if (g.auction) {
      g.auction.activeUids = g.auction.activeUids.filter((u) => u !== p.uid);
      if (g.auction.highestBidderUid === p.uid) {
        g.auction.highestBidderUid = null;
        g.auction.highestBid = 0;
      }
    }
    this.events.push({ type: 'BANKRUPT', uid: p.uid, creditorUid: creditor?.uid ?? null });

    const solvent = g.players.filter((x) => !x.bankrupt);
    if (solvent.length <= 1) return this.complete('LAST_SOLVENT');

    if (wasCurrent) {
      if (g.auction) this.resolveAuction();
      g.pendingMoveSteps = null;
      this.advanceTurn();
    } else if (g.auction) {
      this.maybeCloseAuction();
    }
  }

  endByNetWorth(): void {
    this.g.debt = null;
    this.complete('TIME_LIMIT');
  }

  private complete(reason: 'LAST_SOLVENT' | 'TIME_LIMIT'): void {
    const g = this.g;
    if (g.auction) this.resolveAuction();
    const ranked = standings(g);
    g.winnerUid = ranked[0]?.uid ?? null;
    g.status = 'COMPLETED';
    g.endReason = reason;
    g.completedAt = this.deps.now;
    g.turnDeadline = null;
    g.debt = null;
    g.trades = [];
    g.phase = 'TURN_END';
    this.events.push({ type: 'GAME_COMPLETED', winnerUid: g.winnerUid, reason });
  }
}

export { netWorth };
