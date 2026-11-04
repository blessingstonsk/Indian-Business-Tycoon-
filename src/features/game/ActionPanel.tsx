import { AlertTriangle, Dices, Gavel, KeyRound, LogOut, Timer, Unlock } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { getSpace, isOwnable, liquidationValue, RULESET } from '@shared';
import { Button } from '../../components/ui/primitives';
import { rupees } from '../../lib/utils/format';
import type { GameController } from './controller';
import { DeedDetails } from './PropertyCard';
import { secondsLeft, useNow } from './useTimeoutClaims';

function Countdown({ deadline }: { deadline: number | null }) {
  const now = useNow();
  const s = secondsLeft(deadline, now);
  if (s === null) return null;
  return (
    <span className={`chip ${s <= 10 ? 'border-danger text-danger' : ''}`} aria-label={`${s} seconds left`}>
      <Timer className="h-3.5 w-3.5" /> {s}s
    </span>
  );
}

function AuctionBox({ ctl }: { ctl: GameController }) {
  const { game, myUid, send, pending } = ctl;
  const a = game.auction!;
  const me = game.players.find((p) => p.uid === myUid)!;
  const min = a.highestBid + RULESET.minBidIncrement;
  const [bid, setBid] = useState(min);
  const value = Math.max(bid, min);
  const active = a.activeUids.includes(myUid);
  const leader = game.players.find((p) => p.uid === a.highestBidderUid);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Gavel className="h-5 w-5 text-gold" /> Auction
        </h3>
        <Countdown deadline={a.endsAt} />
      </div>
      <DeedDetails game={game} spaceId={a.spaceId} compact />
      <p className="text-sm">
        Highest bid: <strong>{a.highestBid ? rupees(a.highestBid) : 'none yet'}</strong>
        {leader && <> by {leader.uid === myUid ? 'you' : leader.displayName}</>}
      </p>
      {active && a.highestBidderUid !== myUid ? (
        <>
          <div className="flex gap-2">
            {[10, 100, 500].map((inc) => (
              <Button key={inc} size="sm" variant="secondary" onClick={() => setBid(Math.min(me.cash, a.highestBid + inc))}>
                +{inc}
              </Button>
            ))}
          </div>
          <label className="label" htmlFor="bid">
            Your bid (you have {rupees(me.cash)})
          </label>
          <input id="bid" className="field" type="number" inputMode="numeric" min={min} max={me.cash} step={10} value={value} onChange={(e) => setBid(Number(e.target.value))} />
          <div className="flex gap-2">
            <Button className="flex-1" variant="gold" disabled={value > me.cash || pending !== null} loading={pending === 'PLACE_BID'} onClick={() => send('PLACE_BID', { amount: value })}>
              Bid {rupees(value)}
            </Button>
            <Button variant="secondary" disabled={pending !== null} loading={pending === 'PASS_BID'} onClick={() => send('PASS_BID')}>
              Pass
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">{a.highestBidderUid === myUid ? 'You are leading. Waiting for others…' : 'You passed. Waiting for the auction to close…'}</p>
      )}
    </div>
  );
}

export function ActionPanel({ ctl, onTrade }: { ctl: GameController; onTrade: () => void }) {
  const { game, myUid, send, pending } = ctl;
  const me = game.players.find((p) => p.uid === myUid);
  const current = game.players.find((p) => p.uid === game.currentPlayerUid)!;
  const myTurn = game.currentPlayerUid === myUid;
  const [confirmResign, setConfirmResign] = useState(false);
  const busy = pending !== null;

  if (game.status === 'COMPLETED') return <p className="text-sm text-muted">The game has finished.</p>;

  let body: ReactElement;
  if (game.phase === 'AUCTION' && game.auction) {
    body = <AuctionBox ctl={ctl} />;
  } else if (!myTurn) {
    const debt = game.debt;
    body = (
      <div className="space-y-2">
        <p className="flex items-center justify-between gap-2 text-sm">
          <span>
            Waiting for <strong>{current.displayName}</strong>
            {game.phase === 'PROPERTY_DECISION' && ' to decide on a purchase'}
            {game.phase === 'JAIL_DECISION' && ' to get out of Jail'}
            {game.phase === 'TURN_END' && ' to end their turn'}…
          </span>
          <Countdown deadline={game.turnDeadline} />
        </p>
        {debt && (
          <p className="rounded-lg bg-gold-soft px-3 py-2 text-sm">
            {current.displayName} must raise {rupees(debt.amount - current.cash)} to pay {rupees(debt.amount)}.
          </p>
        )}
      </div>
    );
  } else if (game.phase === 'AWAIT_ROLL') {
    body = (
      <div className="space-y-2">
        {game.canRollAgain && <p className="text-sm font-semibold text-emerald">Doubles! Roll again.</p>}
        <Button size="lg" className="w-full" icon={<Dices className="h-5 w-5" />} loading={pending === 'ROLL_DICE'} disabled={busy} onClick={() => send('ROLL_DICE')}>
          Roll dice
        </Button>
        <p className="text-xs text-muted">Tip: tap any of your deeds on the board to build or mortgage before rolling.</p>
      </div>
    );
  } else if (game.phase === 'JAIL_DECISION') {
    body = (
      <div className="space-y-2">
        <p className="text-sm">
          You are in Jail. Attempt {me!.jailAttempts + 1} of {RULESET.maxJailAttempts}
          {me!.jailAttempts + 1 === RULESET.maxJailAttempts && ' — if this fails you must pay bail and move'}.
        </p>
        <Button className="w-full" icon={<Dices className="h-5 w-5" />} disabled={busy} loading={pending === 'TRY_DOUBLES'} onClick={() => send('TRY_DOUBLES')}>
          Try for doubles
        </Button>
        <div className="flex gap-2">
          <Button className="flex-1" variant="secondary" icon={<Unlock className="h-4 w-4" />} disabled={busy || me!.cash < RULESET.jailBail} loading={pending === 'PAY_BAIL'} onClick={() => send('PAY_BAIL')}>
            Pay bail {rupees(RULESET.jailBail)}
          </Button>
          {me!.jailCards.length > 0 && (
            <Button className="flex-1" variant="secondary" icon={<KeyRound className="h-4 w-4" />} disabled={busy} loading={pending === 'USE_JAIL_CARD'} onClick={() => send('USE_JAIL_CARD')}>
              Use card
            </Button>
          )}
        </div>
      </div>
    );
  } else if (game.phase === 'PROPERTY_DECISION') {
    const s = getSpace(me!.position);
    const price = isOwnable(s) ? s.price : 0;
    const short = me!.cash < price;
    body = (
      <div className="space-y-3">
        <DeedDetails game={game} spaceId={me!.position} compact />
        <p className="text-sm">
          Your balance: <strong>{rupees(me!.cash)}</strong>
          {short && <span className="text-danger"> — mortgage a deed to afford it, or decline</span>}
        </p>
        <div className="flex gap-2">
          <Button className="flex-1" variant="gold" disabled={busy || short} loading={pending === 'BUY_PROPERTY'} onClick={() => send('BUY_PROPERTY')}>
            Buy for {rupees(price)}
          </Button>
          <Button variant="secondary" disabled={busy} loading={pending === 'DECLINE_PROPERTY'} onClick={() => send('DECLINE_PROPERTY')}>
            Decline (auction)
          </Button>
        </div>
      </div>
    );
  } else if (game.phase === 'DEBT' && game.debt) {
    const d = game.debt;
    const reachable = liquidationValue(game, myUid);
    const creditor = game.players.find((p) => p.uid === d.creditorUid);
    body = (
      <div className="space-y-3">
        <p className="flex items-start gap-2 rounded-lg bg-gold-soft px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <span>
            You owe <strong>{rupees(d.amount)}</strong> {creditor ? `to ${creditor.displayName}` : 'to the bank'} ({d.reason}). You have {rupees(me!.cash)}. Sell buildings, mortgage deeds or
            trade to raise {rupees(Math.max(0, d.amount - me!.cash))}.
          </span>
        </p>
        <Button className="w-full" disabled={busy || me!.cash < d.amount} loading={pending === 'PAY_DEBT'} onClick={() => send('PAY_DEBT')}>
          Pay {rupees(d.amount)}
        </Button>
        <Button
          className="w-full"
          variant="danger"
          disabled={busy || reachable >= d.amount}
          title={reachable >= d.amount ? `You can still raise ${rupees(reachable)}` : undefined}
          loading={pending === 'DECLARE_BANKRUPTCY'}
          onClick={() => send('DECLARE_BANKRUPTCY')}
        >
          Declare bankruptcy
        </Button>
      </div>
    );
  } else {
    body = (
      <Button size="lg" className="w-full" disabled={busy} loading={pending === 'END_TURN'} onClick={() => send('END_TURN')}>
        End turn
      </Button>
    );
  }

  return (
    <section className="card space-y-3 p-4" aria-label="Your actions">
      {myTurn && game.phase !== 'AUCTION' && (
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Your turn</h2>
          <Countdown deadline={game.turnDeadline} />
        </div>
      )}
      {body}
      {me && !me.bankrupt && (
        <div className="flex items-center gap-2 border-t border-line pt-3">
          <Button size="sm" variant="secondary" className="flex-1" onClick={onTrade} disabled={game.phase === 'AUCTION'}>
            Propose trade
          </Button>
          {confirmResign ? (
            <>
              <Button size="sm" variant="danger" loading={pending === 'RESIGN'} onClick={() => send('RESIGN').then(() => setConfirmResign(false))}>
                Confirm resign
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmResign(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" icon={<LogOut className="h-4 w-4" />} onClick={() => setConfirmResign(true)}>
              Resign
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
