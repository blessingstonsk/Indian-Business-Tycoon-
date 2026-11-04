import { motion } from 'framer-motion';
import { Clock, Dices, Home, PlusCircle, ScrollText, Trophy, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { netWorth, ownedSpaceIds, standings, type TradeOffer } from '@shared';
import { Board } from '../../components/board/Board';
import { Die } from '../../components/board/Dice3D';
import { CardRevealOverlay, Confetti, ReactionBubbles, ReactionTray } from '../../components/feedback/Overlays';
import { Avatar, Button, Dialog, TokenBadge } from '../../components/ui/primitives';
import { cx, duration, rupees } from '../../lib/utils/format';
import { ActionPanel } from './ActionPanel';
import type { GameController } from './controller';
import { PropertyDialog } from './PropertyCard';
import { EventFeed, MyAssets, PlayersPanel } from './SidePanels';
import { TradeComposer, TradeList } from './TradePanel';
import { useGameAnimation } from './useGameAnimation';
import { useNow, useTimeoutClaims } from './useTimeoutClaims';

const PHASE_TEXT: Record<string, string> = {
  AWAIT_ROLL: 'Ready to roll',
  JAIL_DECISION: 'In Jail – deciding',
  PROPERTY_DECISION: 'Deciding to buy',
  AUCTION: 'Auction in progress',
  DEBT: 'Raising funds',
  TURN_END: 'Managing assets',
};

function BoardCenter({ ctl }: { ctl: GameController }) {
  const { game, myUid, send, pending } = ctl;
  const now = useNow();
  const current = game.players.find((p) => p.uid === game.currentPlayerUid)!;
  const myRoll = game.currentPlayerUid === myUid && game.phase === 'AWAIT_ROLL' && game.status !== 'COMPLETED';
  const timeLeft = game.endsAt ? Math.max(0, Math.round((game.endsAt - now) / 1000)) : null;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3%] p-[4%] text-center">
      <p className="font-display text-[clamp(0.9rem,3.2vw,2rem)] font-extrabold leading-none tracking-tight text-emerald">Indian Business Tycoon</p>
      <p className="text-[clamp(0.6rem,1.4vw,0.85rem)] text-muted">
        Round {game.round} · Turn {game.turnNumber}
        {timeLeft !== null && (
          <>
            {' '}
            · <Clock className="inline h-3 w-3" /> {duration(timeLeft)} left
          </>
        )}
      </p>
      <div className="scale-[0.6] sm:scale-75 lg:scale-90 xl:scale-100">
        <div className="flex items-center gap-4" aria-label={game.dice ? `Dice show ${game.dice.first} and ${game.dice.second}` : 'Dice not rolled yet'}>
          <Die value={game.dice?.first ?? 1} rollKey={game.dice?.rolledAt ?? 'idle'} idle={!game.dice} />
          <Die value={game.dice?.second ?? 6} rollKey={`${game.dice?.rolledAt ?? 'idle'}-b`} idle={!game.dice} />
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[clamp(0.65rem,1.5vw,0.9rem)] shadow-sm">
        <TokenBadge token={current.token} size={20} />
        <span className="font-semibold">{current.uid === myUid ? 'Your turn' : `${current.displayName}'s turn`}</span>
        <span className="text-muted">· {PHASE_TEXT[game.phase]}</span>
      </div>
      {myRoll && (
        <Button variant="gold" size="lg" icon={<Dices className="h-5 w-5" />} loading={pending === 'ROLL_DICE'} disabled={pending !== null} onClick={() => send('ROLL_DICE')}>
          Roll dice
        </Button>
      )}
      {ctl.stale && <p className="rounded-lg bg-gold-soft px-2 py-1 text-xs">This game has been inactive for a while.</p>}
    </div>
  );
}

function VictoryScreen({ ctl }: { ctl: GameController }) {
  const { game } = ctl;
  const ranked = standings(game);
  const winner = game.players.find((p) => p.uid === game.winnerUid);
  const biggest = Math.max(0, ...game.players.map((p) => p.stats.biggestTrade));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal aria-labelledby="victory-title">
      <Confetti />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card relative max-h-[92vh] w-full max-w-lg overflow-y-auto p-6 text-center">
        <Trophy className="mx-auto h-12 w-12 text-gold" />
        <h2 id="victory-title" className="mt-2 font-display text-3xl font-extrabold">
          {winner ? `${winner.displayName} wins!` : 'Game over'}
        </h2>
        <p className="text-sm text-muted">{game.endReason === 'TIME_LIMIT' ? 'Highest net worth when time ran out' : 'Last solvent tycoon standing'}</p>
        {winner && (
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {[
              ['Final net worth', rupees(netWorth(game, winner.uid))],
              ['Properties owned', String(ownedSpaceIds(game, winner.uid).length)],
              ['Rent collected', rupees(winner.stats.rentCollected)],
              ['Biggest trade (game)', biggest ? rupees(biggest) : '—'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-sunken p-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-display text-lg font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <ol className="mt-4 space-y-1 text-left">
          {ranked.map((r) => {
            const p = game.players.find((x) => x.uid === r.uid)!;
            return (
              <li key={r.uid} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                <span className="w-6 font-display font-bold">#{r.rank}</span>
                <Avatar name={p.displayName} photoURL={p.photoURL} size={28} />
                <span className="flex-1 truncate">{p.displayName}</span>
                <span className="font-semibold tabular-nums">{p.bankrupt ? 'Bankrupt' : rupees(r.netWorth)}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Link to="/home?create=1">
            <Button className="w-full" icon={<PlusCircle className="h-4 w-4" />}>
              New room
            </Button>
          </Link>
          <Button variant="secondary" icon={<Home className="h-4 w-4" />} onClick={ctl.onExit}>
            Home
          </Button>
          <Link to="/history">
            <Button variant="secondary" className="w-full" icon={<ScrollText className="h-4 w-4" />}>
              History
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

export function GameView({ ctl }: { ctl: GameController }) {
  const { game, events, myUid } = ctl;
  const { displayPositions, highlight, card, dismissCard } = useGameAnimation(game, events, myUid);
  const [selected, setSelected] = useState<number | null>(null);
  const [trading, setTrading] = useState(false);
  const [counter, setCounter] = useState<TradeOffer | null>(null);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [victoryHidden, setVictoryHidden] = useState(false);
  const me = game.players.find((p) => p.uid === myUid);

  useTimeoutClaims(game, myUid, () => void ctl.send('CLAIM_TIMEOUT'));

  const drawnBy = card ? (game.players.find((p) => p.uid === card.drawnBy)?.displayName ?? '') : '';

  return (
    <div className="mx-auto max-w-7xl px-2 pb-6 pt-3 sm:px-4">
      {/* Mobile: compact player strip */}
      <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1 lg:hidden">
        {game.playerOrder.map((uid) => {
          const p = game.players.find((x) => x.uid === uid)!;
          return (
            <div key={uid} className={cx('flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-xs', uid === game.currentPlayerUid ? 'border-gold bg-gold-soft' : 'border-line', p.bankrupt && 'opacity-50')}>
              <TokenBadge token={p.token} size={18} />
              <span className="max-w-20 truncate font-semibold">{p.displayName}</span>
              <span className="tabular-nums">{rupees(p.cash)}</span>
            </div>
          );
        })}
        <Button size="sm" variant="secondary" className="ml-auto shrink-0" icon={<Users className="h-4 w-4" />} onClick={() => setPlayersOpen(true)}>
          Players
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="relative mx-auto w-full max-w-[min(100%,calc(100vh-6rem))]">
            <Board game={game} displayPositions={displayPositions} highlight={highlight} onSelect={setSelected} center={<BoardCenter ctl={ctl} />} />
            <CardRevealOverlay card={card} drawnByName={drawnBy} onDone={dismissCard} />
          </div>
          <div className="hidden lg:block">
            <EventFeed game={game} events={events} />
          </div>
        </div>
        <aside className="space-y-4">
          <div className="hidden lg:block">
            <PlayersPanel game={game} presence={ctl.presence} myUid={myUid} />
          </div>
          <div className="sticky bottom-2 z-20 lg:static">{me && !me.bankrupt ? <ActionPanel ctl={ctl} onTrade={() => setTrading(true)} /> : <section className="card p-4 text-sm text-muted">You are watching the rest of the game.</section>}</div>
          <TradeList ctl={ctl} onCounter={(t) => setCounter(t)} />
          <MyAssets ctl={ctl} onSelect={setSelected} />
          <section className="card p-4">
            <h2 className="mb-2 font-display text-lg font-semibold">Reactions</h2>
            <ReactionTray onReact={ctl.react} />
          </section>
          <div className="lg:hidden">
            <EventFeed game={game} events={events} />
          </div>
        </aside>
      </div>

      <ReactionBubbles reactions={ctl.reactions} />
      <PropertyDialog ctl={ctl} spaceId={selected} onClose={() => setSelected(null)} />
      {trading && <TradeComposer ctl={ctl} open onClose={() => setTrading(false)} />}
      {counter && <TradeComposer ctl={ctl} open counterOf={counter} onClose={() => setCounter(null)} />}
      <Dialog open={playersOpen} onOpenChange={setPlayersOpen} title="Players">
        <PlayersPanel game={game} presence={ctl.presence} myUid={myUid} />
      </Dialog>
      {game.status === 'COMPLETED' && !victoryHidden && (
        <>
          <VictoryScreen ctl={ctl} />
          <button className="fixed right-3 top-3 z-[55] rounded-xl bg-surface px-3 py-2 text-sm shadow-card" onClick={() => setVictoryHidden(true)}>
            View board
          </button>
        </>
      )}
    </div>
  );
}
