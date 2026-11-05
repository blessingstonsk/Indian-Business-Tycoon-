import { BookOpen, ChevronRight, Copy, DoorOpen, Mail, PlusCircle, ScrollText, Trophy, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../app/providers/AuthProvider';
import { Button, EmptyState } from '../../components/ui/primitives';
import { useDoc, useQueryDocs } from '../../hooks/useLive';
import { api } from '../../lib/api/callables';
import { duration, relativeTime } from '../../lib/utils/format';
import { reportError, toast } from '../../stores/toasts';
import type { RoomDoc, RoomInviteDoc } from '../../domain/docs';
import { HowToPlay } from '../howto/HowToPlay';
import { CreateRoomDialog, JoinRoomForm } from '../rooms/RoomDialogs';

function ActiveRoomRow({ roomId }: { roomId: string }) {
  const room = useDoc<RoomDoc>(`rooms/${roomId}`);
  if (!room.data) return null;
  const r = room.data;
  const href = r.status === 'IN_PROGRESS' && r.gameId ? `/game/${r.gameId}` : `/room/${roomId}`;
  return (
    <li>
      <Link to={href} className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3 hover:bg-sunken">
        <span className="font-mono text-sm tracking-widest">{r.inviteCode}</span>
        <span className="chip">{r.status === 'LOBBY' ? 'Lobby' : r.status === 'IN_PROGRESS' ? 'Playing' : 'Finished'}</span>
        <span className="text-sm text-muted">{r.memberUids.length} players</span>
        <ChevronRight className="ml-auto h-4 w-4" />
      </Link>
    </li>
  );
}

export function HomePage() {
  const { user, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(params.get('create') === '1');
  const [howTo, setHowTo] = useState(false);
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (params.get('create')) setParams({}, { replace: true });
  }, [params, setParams]);

  const invites = useQueryDocs<RoomInviteDoc>(uid ? { collection: 'roomInvites', where: [['toUid', '==', uid]] } : null);
  const recent = useQuery({ queryKey: ['archives', uid, 'recent'], queryFn: () => api.getMyArchives(null, 3), enabled: Boolean(uid) });

  if (!profile) return null;
  const liveInvites = invites.data.filter((i) => i.expiresAt > Date.now());

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Namaste,</p>
          <h1 className="font-display text-3xl font-extrabold">{profile.displayName}</h1>
        </div>
        <button
          className="chip min-h-9"
          onClick={() => {
            void navigator.clipboard.writeText(profile.friendCode);
            toast.success('Friend code copied');
          }}
        >
          Friend code <span className="font-mono tracking-widest">{profile.friendCode}</span> <Copy className="h-3.5 w-3.5" />
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card flex flex-col gap-3 p-5">
          <PlusCircle className="h-7 w-7 text-emerald" />
          <h2 className="font-display text-xl font-semibold">Create a private room</h2>
          <p className="text-sm text-muted">Pick settings, share the code, and start when everyone is ready.</p>
          <Button className="mt-auto" size="lg" onClick={() => setCreating(true)}>
            Create room
          </Button>
        </div>
        <div className="card flex flex-col gap-3 p-5">
          <DoorOpen className="h-7 w-7 text-gold" />
          <h2 className="font-display text-xl font-semibold">Join with a code</h2>
          <p className="text-sm text-muted">Enter the six-character code your friend shared.</p>
          <div className="mt-auto">
            <JoinRoomForm />
          </div>
        </div>
      </section>

      {liveInvites.length > 0 && (
        <section className="card p-5" aria-label="Room invites">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
            <Mail className="h-5 w-5 text-emerald" /> Invitations
          </h2>
          <ul className="space-y-2">
            {liveInvites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3 text-sm">
                <span className="flex-1">
                  <strong>{inv.fromName}</strong> invited you to a game · {relativeTime(inv.createdAt)}
                </span>
                <Link to={`/join/${inv.inviteCode}`}>
                  <Button size="sm">Join</Button>
                </Link>
                <Button size="sm" variant="ghost" aria-label="Dismiss invite" onClick={() => api.dismissInvite(inv.id).catch(reportError)}>
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Your rooms</h2>
          {profile.activeRoomIds.length ? (
            <ul className="space-y-2">
              {profile.activeRoomIds.map((id) => (
                <ActiveRoomRow key={id} roomId={id} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No active rooms. Create one or join a friend.</p>
          )}
        </div>
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Recent games</h2>
            <Link to="/history" className="text-sm font-medium text-emerald">
              View all
            </Link>
          </div>
          {recent.data?.items.length ? (
            <ul className="space-y-2">
              {recent.data.items.map((a) => {
                const mine = a.playerSnapshots.find((s) => s.uid === uid);
                const winner = a.playerSnapshots.find((s) => s.uid === a.winnerUid);
                return (
                  <li key={a.gameId} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                    <Trophy className={mine?.rank === 1 ? 'h-4 w-4 text-gold' : 'h-4 w-4 text-muted'} />
                    <span className="flex-1">
                      {mine?.rank === 1 ? 'You won' : `${winner?.displayName ?? 'Someone'} won`} · #{mine?.rank} of {a.playerSnapshots.length}
                    </span>
                    <span className="text-muted">{duration(a.durationSeconds)}</span>
                  </li>
                );
              })}
            </ul>
          ) : recent.isLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <EmptyState icon={<ScrollText className="h-6 w-6" />} title="No finished games yet" />
          )}
        </div>
      </section>

      <Button variant="ghost" icon={<BookOpen className="h-4 w-4" />} onClick={() => setHowTo(true)}>
        How to play
      </Button>
      <CreateRoomDialog open={creating} onOpenChange={setCreating} />
      <HowToPlay open={howTo} onOpenChange={setHowTo} />
    </div>
  );
}

