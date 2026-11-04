import { DECK_LABEL, getSpace, type DeckId, type GameState } from '@shared';
import { rupees } from '../../lib/utils/format';
import type { EventDoc } from '../../domain/docs';

export type FeedTone = 'money-in' | 'money-out' | 'neutral' | 'alert' | 'success';

export function describeEvent(e: EventDoc, game: GameState): { text: string; tone: FeedTone } | null {
  const p = e.payload as Record<string, unknown>;
  const name = (uid: unknown) => game.players.find((x) => x.uid === uid)?.displayName ?? 'Someone';
  const space = (id: unknown) => getSpace(id as number).name;
  const amt = (v: unknown) => rupees(v as number);
  switch (e.type) {
    case 'TURN_STARTED':
      return { text: `${name(p.uid)}'s turn`, tone: 'neutral' };
    case 'DICE_ROLLED':
      return { text: `${name(p.uid)} rolled ${p.first} + ${p.second}${p.doubles ? ' — doubles!' : ''}`, tone: 'neutral' };
    case 'MOVED':
      return p.direct ? null : { text: `${name(p.uid)} moved to ${space(p.to)}`, tone: 'neutral' };
    case 'START_REWARD':
      return { text: `${name(p.uid)} passed START and collected ${amt(p.amount)}`, tone: 'money-in' };
    case 'CARD_DRAWN':
      return { text: `${name(p.uid)} drew ${DECK_LABEL[p.deck as DeckId]}: “${p.text}”`, tone: 'neutral' };
    case 'PROPERTY_BOUGHT':
      return { text: `${name(p.uid)} bought ${space(p.spaceId)} for ${amt(p.price)}`, tone: 'success' };
    case 'PROPERTY_DECLINED':
      return { text: `${name(p.uid)} declined ${space(p.spaceId)} — it goes to auction`, tone: 'neutral' };
    case 'AUCTION_STARTED':
      return { text: `Auction opened for ${space(p.spaceId)}`, tone: 'alert' };
    case 'BID_PLACED':
      return { text: `${name(p.uid)} bid ${amt(p.amount)}`, tone: 'neutral' };
    case 'BID_PASSED':
      return { text: `${name(p.uid)} passed`, tone: 'neutral' };
    case 'AUCTION_WON':
      return p.uid
        ? { text: `${name(p.uid)} won ${space(p.spaceId)} for ${amt(p.amount)}`, tone: 'success' }
        : { text: `No bids — ${space(p.spaceId)} stays with the bank`, tone: 'neutral' };
    case 'RENT_PAID':
      return { text: `${name(p.fromUid)} paid ${amt(p.amount)} rent to ${name(p.toUid)} for ${space(p.spaceId)}`, tone: 'money-out' };
    case 'PAID_BANK':
      // Purchases, builds and redemptions already have their own, clearer entries.
      if (/^(Bought|Won auction|Built on|Redeemed)/.test(p.reason as string)) return null;
      return { text: `${name(p.uid)} paid ${amt(p.amount)} — ${p.reason}`, tone: 'money-out' };
    case 'RECEIVED_BANK':
      return /^(START reward|Mortgaged|Sold building)/.test(p.reason as string) ? null : { text: `${name(p.uid)} received ${amt(p.amount)} — ${p.reason}`, tone: 'money-in' };
    case 'SENT_TO_JAIL':
      return { text: `${name(p.uid)} went to Jail (${p.reason})`, tone: 'alert' };
    case 'LEFT_JAIL':
      return { text: `${name(p.uid)} left Jail`, tone: 'neutral' };
    case 'JAIL_ATTEMPT_FAILED':
      return { text: `${name(p.uid)} failed to roll doubles (${p.attempts}/3)`, tone: 'neutral' };
    case 'BUILT':
      return { text: `${name(p.uid)} ${p.level === 5 ? 'built a tower' : 'added a block'} on ${space(p.spaceId)}`, tone: 'success' };
    case 'BUILDING_SOLD':
      return { text: `${name(p.uid)} sold a building on ${space(p.spaceId)} for ${amt(p.refund)}`, tone: 'money-in' };
    case 'MORTGAGED':
      return { text: `${name(p.uid)} mortgaged ${space(p.spaceId)} for ${amt(p.amount)}`, tone: 'money-in' };
    case 'UNMORTGAGED':
      return { text: `${name(p.uid)} redeemed ${space(p.spaceId)} for ${amt(p.amount)}`, tone: 'money-out' };
    case 'DEBT_STARTED':
      return { text: `${name(p.uid)} owes ${amt(p.amount)} and must raise funds`, tone: 'alert' };
    case 'DEBT_PAID':
      return { text: `${name(p.uid)} settled ${amt(p.amount)}`, tone: 'neutral' };
    case 'TRADE_PROPOSED': {
      const t = p.trade as { fromUid: string; toUid: string };
      return { text: `${name(t.fromUid)} sent a trade offer to ${name(t.toUid)}`, tone: 'neutral' };
    }
    case 'TRADE_ACCEPTED':
      return { text: `${name(p.fromUid)} and ${name(p.toUid)} completed a trade`, tone: 'success' };
    case 'TRADE_REJECTED':
      return { text: `${name(p.byUid)} rejected a trade`, tone: 'neutral' };
    case 'TRADE_CANCELLED':
      return { text: `A trade offer was withdrawn (${p.reason})`, tone: 'neutral' };
    case 'BANKRUPT':
      return { text: `${name(p.uid)} is bankrupt${p.creditorUid ? ` — assets go to ${name(p.creditorUid)}` : ''}`, tone: 'alert' };
    case 'TIMEOUT':
      return { text: `Time ran out for ${name(p.uid)} — the server took the default action`, tone: 'alert' };
    case 'GAME_COMPLETED':
      return { text: `${name(p.winnerUid)} wins the game!`, tone: 'success' };
    default:
      return null;
  }
}
