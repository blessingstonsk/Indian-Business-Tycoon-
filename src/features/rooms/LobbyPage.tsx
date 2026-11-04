import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { Check, Copy, Crown, LogOut, Play, Share2, UserMinus, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { RULESET, TOKENS } from '@shared';
import { useAuth } from '../../app/providers/AuthProvider';
import { ReactionBubbles, ReactionTray } from '../../components/feedback/Overlays';
import { Avatar, Button, Dialog, EmptyState, Spinner, TokenBadge } from '../../components/ui/primitives';
import { useDoc, useQueryDocs } from '../../hooks/useFirestore';
import { api, type RoomSettingsInput } from '../../lib/api/callables';
import { firebase } from '../../lib/firebase/client';
import { usePresence } from '../../lib/presence';
import { cx } from '../../lib/utils/format';
import { reportError, toast } from '../../stores/toasts';
import type { FriendshipDoc, MemberDoc, ReactionDoc, RoomDoc } from '../../domain/docs';
import { JoinRoomForm, RoomSettingsFields } from './RoomDialogs';

export function inviteUrl(code: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/join/${code}`;
}

function InviteFriends({ roomId, open, onOpenChange, memberUids }: { roomId: string; open: boolean; onOpenChange: (o: boolean) => void; memberUids: string[] }) {
  const { user } = useAuth();
  const uid = user!.uid;
  const friends = useQueryDocs<FriendshipDoc>(open ? `friends-${uid}` : null, () => query(collection(firebase().db, 'friendships'), where('uids', 'array-contains', uid)));
  const [sent, setSent] = useState<Set<string>>(new Set());
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Invite friends" description="They'll see the invite on their home screen.">
      {friends.data.length === 0 ? (
        <p className="text-sm text-muted">
          No friends yet. <Link to="/friends" className="text-emerald underline">Add friends</Link> with their friend code.
        </p>
      ) : (
        <ul className="space-y-2">
          {friends.data.map((f) => {
            const fid = f.uids.find((u) => u !== uid)!;
            const p = f.profiles[fid];
            const inRoom = memberUids.includes(fid);
            return (
              <li key={f.pairId} className="flex items-center gap-3 rounded-xl border border-line p-2">
                <Avatar name={p.displayName} photoURL={p.photoURL} size={32} />
                <span className="flex-1">{p.displayName}</span>
                <Button
                  size="sm"
                  disabled={inRoom || sent.has(fid)}
                  onClick={() =>
                    api
                      .inviteFriend(roomId, fid)
                      .then(() => setSent((s) => new Set(s).add(fid)))
                      .catch(reportError)
                  }
                >
                  {inRoom ? 'In room' : sent.has(fid) ? 'Invited' : 'Invite'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

export function LobbyPage() {
  const { roomId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = user!.uid;
  const room = useDoc<RoomDoc>(`rooms/${roomId}`);
  const members = useQueryDocs<MemberDoc>(room.data ? `members-${roomId}` : null, () => query(collection(firebase().db, `rooms/${roomId}/members`), orderBy('joinedAt', 'asc')));
  const [since] = useState(() => Date.now() - 10_000);
  const reactions = useQueryDocs<ReactionDoc>(room.data ? `lobby-reactions-${roomId}` : null, () =>
    query(collection(firebase().db, `rooms/${roomId}/reactions`), where('createdAt', '>', since), orderBy('createdAt', 'asc'), limit(30)),
  );
  const presence = usePresence(room.data?.memberUids ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [draft, setDraft] = useState<RoomSettingsInput | null>(null);

  const r = room.data;
  useEffect(() => {
    if (r) setDraft({ maxPlayers: r.maxPlayers, mode: r.gameMode, turnTimerSeconds: r.turnTimerSeconds });
  }, [r?.maxPlayers, r?.gameMode, r?.turnTimerSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  if (room.loading) return <Spinner label="Opening the lobby…" />;
  if (!r) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-6">
        <EmptyState icon={<UserPlus className="h-8 w-8" />} title="You're not in this room">
          <p>Ask the host for the room code, or it may have expired.</p>
        </EmptyState>
        <JoinRoomForm />
      </div>
    );
  }
  if (r.status === 'IN_PROGRESS' && r.gameId) return <Navigate to={`/game/${r.gameId}`} replace />;

  const isHost = r.hostUid === uid;
  const me = members.data.find((m) => m.uid === uid);
  const taken = new Set(members.data.filter((m) => m.uid !== uid).map((m) => m.token));
  const everyoneReady = members.data.every((m) => m.isHost || m.ready);
  const canStart = isHost && members.data.length >= RULESET.minPlayers && everyoneReady;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    const url = inviteUrl(r.inviteCode);
    if (navigator.share) await navigator.share({ title: 'Join my Indian Business Tycoon game', text: `Room code ${r.inviteCode}`, url }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(url);
      toast.success('Invite link copied');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <section className="card flex flex-wrap items-center gap-4 p-5">
        <div>
          <p className="text-sm text-muted">Room code</p>
          <p className="font-mono text-4xl font-bold tracking-[0.25em]">{r.inviteCode}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={<Copy className="h-4 w-4" />}
            onClick={() => {
              void navigator.clipboard.writeText(r.inviteCode);
              toast.success('Code copied');
            }}
          >
            Copy code
          </Button>
          <Button variant="secondary" icon={<Share2 className="h-4 w-4" />} onClick={share}>
            Invite link
          </Button>
          <Button variant="secondary" icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviting(true)}>
            Invite friends
          </Button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="card p-5" aria-label="Players">
          <h2 className="mb-3 font-display text-lg font-semibold">
            Players ({members.data.length}/{r.maxPlayers})
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {members.data.map((m) => (
              <li key={m.uid} className={cx('flex items-center gap-3 rounded-xl border p-3', m.ready || m.isHost ? 'border-emerald/50 bg-emerald-soft/40' : 'border-line')}>
                <div className="relative">
                  <Avatar name={m.displayName} photoURL={m.photoURL} size={40} />
                  <span className="absolute -bottom-1 -right-1">
                    <TokenBadge token={m.token} size={20} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate font-semibold">
                    <span className={cx('h-2 w-2 rounded-full', presence[m.uid] === 'online' ? 'bg-emerald' : presence[m.uid] === 'reconnecting' ? 'bg-gold' : 'bg-muted')} aria-label={presence[m.uid]} />
                    {m.displayName}
                    {m.isHost && <Crown className="h-4 w-4 text-gold" aria-label="Host" />}
                  </p>
                  <p className="text-xs text-muted">{m.isHost ? 'Host' : m.ready ? 'Ready' : 'Not ready'}</p>
                </div>
                {isHost && m.uid !== uid && (
                  <Button size="sm" variant="ghost" aria-label={`Remove ${m.displayName}`} loading={busy === `kick-${m.uid}`} onClick={() => run(`kick-${m.uid}`, () => api.kickMember(roomId, m.uid))}>
                    <UserMinus className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
            {Array.from({ length: Math.max(0, r.maxPlayers - members.data.length) }, (_, i) => (
              <li key={`empty-${i}`} className="flex min-h-[66px] items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
                Waiting for a player…
              </li>
            ))}
          </ul>

          {me && (
            <div className="mt-5">
              <p className="label">Your token</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Choose your token">
                {TOKENS.map((t) => (
                  <button
                    key={t.id}
                    role="radio"
                    aria-checked={me.token === t.id}
                    aria-label={t.label}
                    disabled={taken.has(t.id) || busy !== null}
                    onClick={() => run('token', () => api.chooseToken(roomId, t.id))}
                    className={cx('rounded-full p-1 disabled:opacity-30', me.token === t.id && 'ring-2 ring-emerald')}
                  >
                    <TokenBadge token={t.id} size={40} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="card space-y-4 p-5">
            <h2 className="font-display text-lg font-semibold">Game settings</h2>
            {draft && (
              <RoomSettingsFields
                value={draft}
                disabled={!isHost || busy !== null}
                onChange={(v) => {
                  setDraft(v);
                  void run('settings', () => api.updateRoomSettings(roomId, v));
                }}
              />
            )}
            {!isHost && <p className="text-xs text-muted">Only the host can change settings.</p>}
          </section>
          <section className="card space-y-3 p-5">
            {isHost ? (
              <>
                <Button size="lg" className="w-full" icon={<Play className="h-5 w-5" />} disabled={!canStart} loading={busy === 'start'} onClick={() => run('start', () => api.startGame(roomId))}>
                  Start game
                </Button>
                {!canStart && (
                  <p className="text-center text-xs text-muted">{members.data.length < RULESET.minPlayers ? 'Waiting for at least one more player' : 'Waiting for everyone to be ready'}</p>
                )}
              </>
            ) : (
              <Button
                size="lg"
                className="w-full"
                variant={me?.ready ? 'secondary' : 'primary'}
                icon={<Check className="h-5 w-5" />}
                loading={busy === 'ready'}
                onClick={() => run('ready', () => api.setReady(roomId, !me?.ready))}
              >
                {me?.ready ? 'Ready – tap to undo' : "I'm ready"}
              </Button>
            )}
            <Button variant="ghost" className="w-full" icon={<LogOut className="h-4 w-4" />} loading={busy === 'leave'} onClick={() => run('leave', () => api.leaveRoom(roomId).then(() => navigate('/home')))}>
              Leave room
            </Button>
          </section>
          <section className="card p-5">
            <h2 className="mb-2 font-display text-lg font-semibold">Say hello</h2>
            <ReactionTray onReact={(id) => api.sendReaction(roomId, null, id).catch(reportError)} />
          </section>
        </aside>
      </div>
      <ReactionBubbles reactions={reactions.data} />
      <InviteFriends roomId={roomId} open={inviting} onOpenChange={setInviting} memberUids={r.memberUids} />
    </div>
  );
}

export function JoinLinkPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .joinRoom(code)
      .then(({ roomId }) => !cancelled && navigate(`/room/${roomId}`, { replace: true }))
      .catch((e) => {
        if (cancelled) return;
        reportError(e);
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, navigate]);
  if (!error) return <Spinner label="Joining room…" />;
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <p className="text-sm text-muted">We couldn't join with that link. Check the code and try again.</p>
      <JoinRoomForm initialCode={code} />
    </div>
  );
}
