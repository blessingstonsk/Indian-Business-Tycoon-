import { Building2, Crown, Lock, Skull, Trophy } from 'lucide-react';
import { buildingCounts, getSpace, GROUP_META, mortgageDebt, netWorth, ownedSpaceIds, type GameState } from '@shared';
import { Avatar, TokenBadge } from '../../components/ui/primitives';
import { cx, rupees } from '../../lib/utils/format';
import type { PresenceState } from '../../lib/presence';
import type { EventDoc } from '../../domain/docs';
import type { GameController } from './controller';
import { describeEvent } from './events';

const PRESENCE_DOT: Record<PresenceState, string> = { online: 'bg-emerald', reconnecting: 'bg-gold', offline: 'bg-muted' };

export function PlayersPanel({ game, presence, myUid }: { game: GameState; presence: Record<string, PresenceState>; myUid: string }) {
  const ranked = [...game.players].sort((a, b) => netWorth(game, b.uid) - netWorth(game, a.uid));
  const rank = new Map(ranked.map((p, i) => [p.uid, i + 1]));
  return (
    <section className="card p-3" aria-label="Players">
      <h2 className="mb-2 flex items-center gap-2 px-1 font-display text-lg font-semibold">
        <Trophy className="h-4 w-4 text-gold" /> Players
      </h2>
      <ul className="space-y-1.5">
        {game.playerOrder.map((uid) => {
          const p = game.players.find((x) => x.uid === uid)!;
          const b = buildingCounts(game, uid);
          const deeds = ownedSpaceIds(game, uid).length;
          const debt = mortgageDebt(game, uid);
          const active = game.currentPlayerUid === uid && game.status !== 'COMPLETED';
          const state = presence[uid] ?? 'online';
          return (
            <li
              key={uid}
              className={cx('rounded-xl border p-2.5 transition', active ? 'border-gold bg-gold-soft/60' : 'border-transparent', p.bankrupt && 'opacity-50')}
              aria-current={active ? 'true' : undefined}
            >
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Avatar name={p.displayName} photoURL={p.photoURL} size={34} />
                  <span className="absolute -bottom-1 -right-1">
                    <TokenBadge token={p.token} size={18} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    <span className={cx('h-2 w-2 shrink-0 rounded-full', PRESENCE_DOT[state])} title={state} aria-label={state} />
                    <span className="truncate">{p.displayName}</span>
                    {uid === myUid && <span className="text-xs font-normal text-muted">(you)</span>}
                    {rank.get(uid) === 1 && !p.bankrupt && <Crown className="h-3.5 w-3.5 text-gold" aria-label="Leader" />}
                  </p>
                  <p className="text-xs text-muted">
                    #{rank.get(uid)} · worth {rupees(netWorth(game, uid))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{p.bankrupt ? '—' : rupees(p.cash)}</p>
                  <p className="flex items-center justify-end gap-1 text-xs text-muted">
                    {p.bankrupt ? (
                      <>
                        <Skull className="h-3 w-3" /> Bankrupt
                      </>
                    ) : p.inJail ? (
                      <>
                        <Lock className="h-3 w-3" /> In jail
                      </>
                    ) : (
                      state !== 'online' && <span className="capitalize">{state}</span>
                    )}
                  </p>
                </div>
              </div>
              {!p.bankrupt && (deeds > 0 || debt > 0) && (
                <p className="mt-1.5 flex flex-wrap gap-x-3 pl-11 text-xs text-muted">
                  <span>
                    {deeds} deed{deeds === 1 ? '' : 's'}
                  </span>
                  {b.blocks + b.towers > 0 && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {b.blocks} blocks, {b.towers} towers
                    </span>
                  )}
                  {debt > 0 && <span>mortgages {rupees(debt)}</span>}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function MyAssets({ ctl, onSelect }: { ctl: GameController; onSelect: (id: number) => void }) {
  const ids = ownedSpaceIds(ctl.game, ctl.myUid);
  if (!ids.length) return null;
  return (
    <section className="card p-4" aria-label="Your deeds">
      <h2 className="mb-2 font-display text-lg font-semibold">Your deeds</h2>
      <ul className="grid grid-cols-2 gap-1.5">
        {ids.map((id) => {
          const s = getSpace(id);
          const ps = ctl.game.properties.find((p) => p.spaceId === id)!;
          const color = s.type === 'PROPERTY' ? GROUP_META[s.group].color : '#6b7280';
          return (
            <li key={id}>
              <button onClick={() => onSelect(id)} className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-line px-2 text-left text-sm hover:bg-sunken">
                <span className="h-6 w-1.5 shrink-0 rounded" style={{ background: color }} />
                <span className={cx('flex-1 truncate', ps.mortgaged && 'text-muted line-through')}>{s.short}</span>
                {ps.level > 0 && <span className="text-xs text-emerald">{ps.level === 5 ? 'T' : `${ps.level}B`}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const TONE: Record<string, string> = {
  'money-in': 'text-emerald',
  'money-out': 'text-danger',
  alert: 'text-gold',
  success: 'text-emerald',
  neutral: 'text-ink',
};

export function EventFeed({ game, events }: { game: GameState; events: EventDoc[] }) {
  const items = [...events]
    .sort((a, b) => b.sequence - a.sequence)
    .map((e) => ({ e, d: describeEvent(e, game) }))
    .filter((x) => x.d)
    .slice(0, 40);
  return (
    <section className="card p-4" aria-label="Activity log">
      <h2 className="mb-2 font-display text-lg font-semibold">Activity</h2>
      <ol className="max-h-72 space-y-1 overflow-y-auto pr-1 text-sm" aria-live="polite">
        {items.map(({ e, d }) => (
          <li key={e.sequence} className={cx('leading-snug', TONE[d!.tone])}>
            {d!.text}
          </li>
        ))}
        {!items.length && <li className="text-muted">The game has just begun.</li>}
      </ol>
    </section>
  );
}
