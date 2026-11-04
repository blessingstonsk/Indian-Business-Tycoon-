import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, ScrollText, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../app/providers/AuthProvider';
import { Avatar, Button, EmptyState, Spinner, TokenBadge } from '../../components/ui/primitives';
import { api } from '../../lib/api/callables';
import { cx, duration, rupees } from '../../lib/utils/format';
import type { GameArchiveDoc } from '../../domain/docs';

function ArchiveCard({ a, uid }: { a: GameArchiveDoc; uid: string }) {
  const [open, setOpen] = useState(false);
  const mine = a.playerSnapshots.find((s) => s.uid === uid);
  const winner = a.playerSnapshots.find((s) => s.uid === a.winnerUid);
  return (
    <li className="card overflow-hidden">
      <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Trophy className={cx('h-6 w-6 shrink-0', mine?.rank === 1 ? 'text-gold' : 'text-muted')} />
        <div className="flex-1">
          <p className="font-semibold">{mine?.rank === 1 ? 'Victory!' : `${winner?.displayName ?? 'Someone'} won`}</p>
          <p className="text-sm text-muted">
            {new Date(a.completedAt).toLocaleString()} · {duration(a.durationSeconds)} · {a.totalTurns} turns · you finished #{mine?.rank}
          </p>
        </div>
        <ChevronDown className={cx('h-5 w-5 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-line p-4">
          <ol className="space-y-1">
            {a.playerSnapshots.map((s) => (
              <li key={s.uid} className="flex items-center gap-3 text-sm">
                <span className="w-6 font-bold">#{s.rank}</span>
                <Avatar name={s.displayName} photoURL={s.photoURL} size={26} />
                <TokenBadge token={s.token} size={20} />
                <span className="flex-1">{s.displayName}</span>
                <span className="text-muted">{s.propertiesOwned} deeds</span>
                <span className="w-28 text-right font-semibold tabular-nums">{rupees(s.netWorth)}</span>
              </li>
            ))}
          </ol>
          {a.eventSummary.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-emerald">Key moments ({a.eventSummary.length})</summary>
              <ol className="mt-2 max-h-64 space-y-0.5 overflow-y-auto text-sm text-muted">
                {a.eventSummary.map((e) => (
                  <li key={e.sequence}>{e.summary}</li>
                ))}
              </ol>
            </details>
          )}
          <p className="text-xs text-muted">Ruleset v{a.rulesetVersion}</p>
        </div>
      )}
    </li>
  );
}

export function HistoryPage() {
  const { user } = useAuth();
  const q = useInfiniteQuery({
    queryKey: ['archives', user?.uid],
    queryFn: ({ pageParam }) => api.getMyArchives(pageParam, 10),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(user),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <h1 className="font-display text-3xl font-extrabold">Game history</h1>
      <p className="text-sm text-muted">Completed games are archived for 12 months and visible only to the players who took part.</p>
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <p className="text-danger">Could not load your history. Please retry.</p>
      ) : items.length === 0 ? (
        <EmptyState icon={<ScrollText className="h-8 w-8" />} title="No finished games yet" />
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <ArchiveCard key={a.gameId} a={a} uid={user!.uid} />
          ))}
        </ul>
      )}
      {q.hasNextPage && (
        <Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          Load more
        </Button>
      )}
    </div>
  );
}
