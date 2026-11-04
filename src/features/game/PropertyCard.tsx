import type { ReactElement } from 'react';
import { Building2, Hammer, HandCoins, Landmark, Undo2 } from 'lucide-react';
import {
  getSpace,
  GROUP_META,
  isOwnable,
  mortgageValue,
  propertyState,
  redemptionCost,
  rentFor,
  type GameState,
} from '@shared';
import { Button, Dialog } from '../../components/ui/primitives';
import { PropertyArt } from '../../components/board/PropertyArt';
import { cx, rupees } from '../../lib/utils/format';
import { buildBlocker, mortgageBlocker, sellBlocker, unmortgageBlocker, type GameController } from './controller';

/** Deed details: rents with upgrades, mortgage value, owner. Used by the purchase panel and the board. */
export function DeedDetails({ game, spaceId, compact }: { game: GameState; spaceId: number; compact?: boolean }) {
  const s = getSpace(spaceId);
  if (!isOwnable(s)) return <p className="text-sm text-muted">{s.name}</p>;
  const ps = propertyState(game, spaceId);
  const owner = game.players.find((p) => p.uid === ps.ownerUid);
  const color = s.type === 'PROPERTY' ? GROUP_META[s.group].color : '#6b7280';
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="px-4 py-2 text-white" style={{ background: color }}>
        <p className="text-xs font-semibold uppercase tracking-wider opacity-90">
          {s.type === 'PROPERTY' ? `${GROUP_META[s.group].label} group` : s.type === 'TRANSIT' ? 'Transit' : 'Utility'}
        </p>
        <p className="font-display text-lg font-bold leading-tight">{s.name}</p>
      </div>
      {s.type === 'PROPERTY' && !compact && <PropertyArt landmark={s.landmark} color={color} className="h-24 w-full" />}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 p-4 text-sm">
        <dt className="text-muted">Price</dt>
        <dd className="text-right font-semibold">{rupees(s.price)}</dd>
        {s.type === 'PROPERTY' && (
          <>
            <dt className="text-muted">Rent (site)</dt>
            <dd className="text-right">{rupees(s.rent[0])}</dd>
            <dt className="text-muted">Full group</dt>
            <dd className="text-right">{rupees(s.rent[0] * 2)}</dd>
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="contents">
                <dt className="text-muted">
                  {n} block{n > 1 ? 's' : ''}
                </dt>
                <dd className={cx('text-right', ps.level === n && 'font-bold text-emerald')}>{rupees(s.rent[n])}</dd>
              </div>
            ))}
            <dt className="text-muted">Tower</dt>
            <dd className={cx('text-right', ps.level === 5 && 'font-bold text-emerald')}>{rupees(s.rent[5])}</dd>
            <dt className="text-muted">Build cost</dt>
            <dd className="text-right">{rupees(s.buildCost)} each</dd>
          </>
        )}
        {s.type === 'TRANSIT' &&
          s.rent.map((r, i) => (
            <div key={i} className="contents">
              <dt className="text-muted">{i + 1} transit owned</dt>
              <dd className="text-right">{rupees(r)}</dd>
            </div>
          ))}
        {s.type === 'UTILITY' && (
          <>
            <dt className="text-muted">One utility</dt>
            <dd className="text-right">{s.multipliers[0]}× dice</dd>
            <dt className="text-muted">Both utilities</dt>
            <dd className="text-right">{s.multipliers[1]}× dice</dd>
          </>
        )}
        <dt className="text-muted">Mortgage value</dt>
        <dd className="text-right">{rupees(mortgageValue(s.price))}</dd>
        {owner && (
          <>
            <dt className="text-muted">Owner</dt>
            <dd className="text-right font-semibold">{owner.displayName}</dd>
            <dt className="text-muted">Current rent</dt>
            <dd className="text-right font-semibold">{ps.mortgaged ? 'Mortgaged' : s.type === 'UTILITY' ? `${rentFor(game, spaceId, 1)}× dice` : rupees(rentFor(game, spaceId, 7))}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/** Build / sell / mortgage controls for one deed, with the reason when an action is unavailable. */
export function DeedActions({ ctl, spaceId }: { ctl: GameController; spaceId: number }) {
  const { game, myUid, send, pending } = ctl;
  const s = getSpace(spaceId);
  if (!isOwnable(s)) return null;
  const ps = propertyState(game, spaceId);
  if (ps.ownerUid !== myUid) return null;
  const actions = [
    s.type === 'PROPERTY' && { label: `Build (${rupees(s.buildCost)})`, icon: <Hammer className="h-4 w-4" />, type: 'BUILD' as const, blocker: buildBlocker(game, myUid, spaceId) },
    s.type === 'PROPERTY' && ps.level > 0 && { label: 'Sell building', icon: <Building2 className="h-4 w-4" />, type: 'SELL_BUILDING' as const, blocker: sellBlocker(game, myUid, spaceId) },
    !ps.mortgaged && { label: `Mortgage (+${rupees(mortgageValue(s.price))})`, icon: <HandCoins className="h-4 w-4" />, type: 'MORTGAGE' as const, blocker: mortgageBlocker(game, myUid, spaceId) },
    ps.mortgaged && { label: `Redeem (${rupees(redemptionCost(s.price))})`, icon: <Undo2 className="h-4 w-4" />, type: 'UNMORTGAGE' as const, blocker: unmortgageBlocker(game, myUid, spaceId) },
  ].filter(Boolean) as { label: string; icon: ReactElement; type: 'BUILD' | 'SELL_BUILDING' | 'MORTGAGE' | 'UNMORTGAGE'; blocker: string | null }[];
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Button
          key={a.type}
          size="sm"
          variant={a.type === 'BUILD' ? 'primary' : 'secondary'}
          icon={a.icon}
          disabled={Boolean(a.blocker) || pending !== null}
          loading={pending === a.type}
          title={a.blocker ?? undefined}
          onClick={() => send(a.type, { spaceId })}
        >
          {a.label}
        </Button>
      ))}
    </div>
  );
}

export function PropertyDialog({ ctl, spaceId, onClose }: { ctl: GameController; spaceId: number | null; onClose: () => void }) {
  if (spaceId === null) return null;
  const s = getSpace(spaceId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={s.name}>
      {isOwnable(s) ? (
        <div className="space-y-4">
          <DeedDetails game={ctl.game} spaceId={spaceId} />
          <DeedActions ctl={ctl} spaceId={spaceId} />
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Landmark className="h-4 w-4" /> {describeSpecial(spaceId)}
        </p>
      )}
    </Dialog>
  );
}

function describeSpecial(id: number): string {
  const s = getSpace(id);
  switch (s.type) {
    case 'START':
      return 'Collect ₹2,000 every time you pass or land on START.';
    case 'CARD':
      return s.deck === 'FORTUNE' ? 'Draw a Fortune card.' : 'Draw a Civic Chest card.';
    case 'TAX':
      return `Pay ${rupees(s.amount)} to the bank.`;
    case 'JAIL':
      return 'Just visiting – unless you were sent here. Bail is ₹500, or roll doubles (3 tries).';
    case 'REST_HOUSE':
      return 'Take a break. Nothing happens here.';
    case 'GO_TO_JAIL':
      return 'Go directly to Jail. Do not pass START.';
    default:
      return s.name;
  }
}
