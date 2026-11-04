import { ArrowLeftRight, Check, KeyRound, X } from 'lucide-react';
import { useState } from 'react';
import { getSpace, groupHasBuildings, ownedSpaceIds, type TradeOffer, type TradeSide } from '@shared';
import { Button, Dialog, TokenBadge } from '../../components/ui/primitives';
import { cx, rupees } from '../../lib/utils/format';
import type { GameController } from './controller';

const emptySide = (): TradeSide => ({ cash: 0, spaceIds: [], jailCards: 0 });

function SideEditor({
  ctl,
  uid,
  side,
  onChange,
  title,
}: {
  ctl: GameController;
  uid: string;
  side: TradeSide;
  onChange: (s: TradeSide) => void;
  title: string;
}) {
  const player = ctl.game.players.find((p) => p.uid === uid)!;
  const deeds = ownedSpaceIds(ctl.game, uid);
  const toggle = (id: number) =>
    onChange({ ...side, spaceIds: side.spaceIds.includes(id) ? side.spaceIds.filter((x) => x !== id) : [...side.spaceIds, id] });
  return (
    <fieldset className="space-y-2 rounded-xl border border-line p-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {deeds.length === 0 && <p className="text-sm text-muted">No deeds.</p>}
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {deeds.map((id) => {
          const locked = groupHasBuildings(ctl.game, id);
          const s = getSpace(id);
          return (
            <li key={id}>
              <label className={cx('flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm', locked ? 'opacity-50' : 'hover:bg-sunken')}>
                <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--emerald))]" disabled={locked} checked={side.spaceIds.includes(id)} onChange={() => toggle(id)} />
                <span className="flex-1">{s.name}</span>
                {locked && <span className="text-xs">has buildings</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <label className="label" htmlFor={`cash-${uid}`}>
        Cash (max {rupees(player.cash)})
      </label>
      <input
        id={`cash-${uid}`}
        className="field"
        type="number"
        inputMode="numeric"
        min={0}
        max={player.cash}
        step={10}
        value={side.cash}
        onChange={(e) => onChange({ ...side, cash: Math.max(0, Math.min(player.cash, Math.floor(Number(e.target.value) || 0))) })}
      />
      {player.jailCards.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <KeyRound className="h-4 w-4" /> Jail cards
          <input
            className="field w-20"
            type="number"
            min={0}
            max={player.jailCards.length}
            value={side.jailCards}
            onChange={(e) => onChange({ ...side, jailCards: Math.max(0, Math.min(player.jailCards.length, Number(e.target.value) || 0)) })}
          />
        </label>
      )}
    </fieldset>
  );
}

export function TradeComposer({
  ctl,
  open,
  onClose,
  counterOf,
}: {
  ctl: GameController;
  open: boolean;
  onClose: () => void;
  counterOf?: TradeOffer | null;
}) {
  const others = ctl.game.players.filter((p) => p.uid !== ctl.myUid && !p.bankrupt);
  const [toUid, setToUid] = useState<string>(counterOf?.fromUid ?? others[0]?.uid ?? '');
  const [give, setGive] = useState<TradeSide>(counterOf ? counterOf.get : emptySide());
  const [get, setGet] = useState<TradeSide>(counterOf ? counterOf.give : emptySide());
  const empty = give.cash + give.spaceIds.length + give.jailCards + get.cash + get.spaceIds.length + get.jailCards === 0;

  const submit = async () => {
    if (counterOf) await ctl.send('REJECT_TRADE', { tradeId: counterOf.id });
    if (await ctl.send('PROPOSE_TRADE', { toUid, give, get })) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={counterOf ? 'Counter offer' : 'Propose a trade'} description="Both sides are checked again by the server when the offer is accepted." wide>
      <div className="space-y-4">
        {!counterOf && (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Trade with">
            {others.map((p) => (
              <button
                key={p.uid}
                role="radio"
                aria-checked={toUid === p.uid}
                onClick={() => {
                  setToUid(p.uid);
                  setGet(emptySide());
                }}
                className={cx('flex min-h-11 items-center gap-2 rounded-xl border px-3', toUid === p.uid ? 'border-emerald bg-emerald-soft' : 'border-line')}
              >
                <TokenBadge token={p.token} size={24} /> {p.displayName}
              </button>
            ))}
          </div>
        )}
        {toUid && (
          <div className="grid gap-3 sm:grid-cols-2">
            <SideEditor ctl={ctl} uid={ctl.myUid} side={give} onChange={setGive} title="You give" />
            <SideEditor ctl={ctl} uid={toUid} side={get} onChange={setGet} title="You get" />
          </div>
        )}
        <Button className="w-full" icon={<ArrowLeftRight className="h-4 w-4" />} disabled={!toUid || empty || ctl.pending !== null} loading={ctl.pending === 'PROPOSE_TRADE'} onClick={submit}>
          Send offer
        </Button>
      </div>
    </Dialog>
  );
}

function sideText(s: TradeSide): string {
  const parts = [
    ...s.spaceIds.map((id) => getSpace(id).short),
    s.cash ? rupees(s.cash) : '',
    s.jailCards ? `${s.jailCards} jail card${s.jailCards > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'nothing';
}

export function TradeList({ ctl, onCounter }: { ctl: GameController; onCounter: (t: TradeOffer) => void }) {
  const { game, myUid, send, pending } = ctl;
  const mine = game.trades.filter((t) => t.toUid === myUid || t.fromUid === myUid);
  if (!mine.length) return null;
  const name = (uid: string) => game.players.find((p) => p.uid === uid)?.displayName ?? '';
  return (
    <section className="card space-y-2 p-4" aria-label="Trade offers">
      <h2 className="font-display text-lg font-semibold">Trade offers</h2>
      {mine.map((t) => (
        <div key={t.id} className="rounded-xl border border-line p-3 text-sm">
          {t.toUid === myUid ? (
            <>
              <p>
                <strong>{name(t.fromUid)}</strong> offers {sideText(t.give)} for your {sideText(t.get)}.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" icon={<Check className="h-4 w-4" />} disabled={pending !== null} onClick={() => send('ACCEPT_TRADE', { tradeId: t.id })}>
                  Accept
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onCounter(t)}>
                  Counter
                </Button>
                <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} disabled={pending !== null} onClick={() => send('REJECT_TRADE', { tradeId: t.id })}>
                  Reject
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>
                You offered {sideText(t.give)} to <strong>{name(t.toUid)}</strong> for {sideText(t.get)}.
              </p>
              <Button size="sm" variant="ghost" className="mt-2" disabled={pending !== null} onClick={() => send('CANCEL_TRADE', { tradeId: t.id })}>
                Withdraw
              </Button>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
