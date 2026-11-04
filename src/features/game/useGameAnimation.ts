import { useEffect, useRef, useState } from 'react';
import type { DeckId, GameState } from '@shared';
import { sfx } from '../../lib/sound';
import { prefersReducedMotion } from '../../stores/settings';
import { toast } from '../../stores/toasts';
import type { EventDoc } from '../../domain/docs';

const STEP_MS = 170;
const DICE_MS = 850;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CardReveal {
  key: number;
  deck: DeckId;
  text: string;
  drawnBy: string;
}

/**
 * Presentation-only playback of new events: dice spin, step-by-step token movement, sounds and card reveals.
 * Authoritative state (cash, ownership) is rendered immediately; only token positions are delayed.
 */
export function useGameAnimation(game: GameState | null, events: EventDoc[], myUid: string | null) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [highlight, setHighlight] = useState<number | null>(null);
  const [card, setCard] = useState<CardReveal | null>(null);
  const seen = useRef<number | null>(null);
  const queue = useRef<EventDoc[]>([]);
  const running = useRef(false);
  const gameRef = useRef(game);
  gameRef.current = game;

  useEffect(() => {
    if (!events.length) return;
    const max = Math.max(...events.map((e) => e.sequence));
    if (seen.current === null) {
      seen.current = max; // first snapshot: don't replay history after a refresh
      return;
    }
    const fresh = events.filter((e) => e.sequence > seen.current!).sort((a, b) => a.sequence - b.sequence);
    if (!fresh.length) return;
    seen.current = max;
    queue.current.push(...fresh);
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  async function run() {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length) {
        const e = queue.current.shift()!;
        await play(e);
      }
    } finally {
      running.current = false;
      setOverrides({});
    }
  }

  async function play(e: EventDoc) {
    const p = e.payload as Record<string, unknown>;
    const reduced = prefersReducedMotion();
    switch (e.type) {
      case 'DICE_ROLLED':
        sfx.dice();
        if (!reduced) await wait(DICE_MS);
        return;
      case 'MOVED': {
        const uid = p.uid as string;
        const path = p.path as number[];
        if (p.direct || reduced || !path.length) {
          setOverrides((o) => ({ ...o, [uid]: p.to as number }));
          setHighlight(p.to as number);
          return;
        }
        for (const pos of path) {
          setOverrides((o) => ({ ...o, [uid]: pos }));
          sfx.step();
          await wait(STEP_MS);
        }
        setHighlight(p.to as number);
        return;
      }
      case 'CARD_DRAWN':
        sfx.card();
        setCard({ key: e.sequence, deck: p.deck as DeckId, text: p.text as string, drawnBy: p.uid as string });
        if (!reduced) await wait(600);
        return;
      case 'PROPERTY_BOUGHT':
      case 'AUCTION_WON':
        sfx.buy();
        return;
      case 'RENT_PAID':
      case 'PAID_BANK':
      case 'RECEIVED_BANK':
      case 'DEBT_PAID':
        sfx.cash();
        return;
      case 'BUILT':
        sfx.build();
        return;
      case 'SENT_TO_JAIL':
        sfx.jail();
        return;
      case 'GAME_COMPLETED':
        sfx.victory();
        return;
      case 'TRADE_PROPOSED': {
        const t = p.trade as { toUid: string };
        if (t.toUid === myUid) {
          sfx.pop();
          toast.info('You have a new trade offer');
        }
        return;
      }
      case 'TURN_STARTED':
        setHighlight(null);
        if (p.uid === myUid) {
          sfx.turn();
          toast.info("It's your turn!");
        }
        return;
      default:
        return;
    }
  }

  const displayPositions: Record<string, number> = {};
  for (const pl of game?.players ?? []) displayPositions[pl.uid] = overrides[pl.uid] ?? pl.position;
  return { displayPositions, highlight, card, dismissCard: () => setCard(null) };
}
