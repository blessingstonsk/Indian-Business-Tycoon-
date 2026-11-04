import { collection, query, where } from 'firebase/firestore';
import { Check, Copy, UserPlus, Users, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FRIEND_CODE_LENGTH } from '@shared';
import { useAuth } from '../../app/providers/AuthProvider';
import { Avatar, Button, EmptyState } from '../../components/ui/primitives';
import { useQueryDocs } from '../../hooks/useFirestore';
import { api } from '../../lib/api/callables';
import { firebase } from '../../lib/firebase/client';
import { usePresence } from '../../lib/presence';
import { reportError, toast } from '../../stores/toasts';
import type { FriendRequestDoc, FriendshipDoc } from '../../domain/docs';

export function FriendsPage() {
  const { user, profile } = useAuth();
  const uid = user!.uid;
  const friends = useQueryDocs<FriendshipDoc>(`friendships-${uid}`, () => query(collection(firebase().db, 'friendships'), where('uids', 'array-contains', uid)));
  const requests = useQueryDocs<FriendRequestDoc>(`requests-${uid}`, () =>
    query(collection(firebase().db, 'friendRequests'), where('participants', 'array-contains', uid), where('status', '==', 'PENDING')),
  );
  const friendUids = friends.data.map((f) => f.uids.find((u) => u !== uid)!);
  const presence = usePresence(friendUids);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run('send', () => api.sendFriendRequest(code.trim().toUpperCase()), 'Friend request sent').then(() => setCode(''));
  };

  const incoming = requests.data.filter((r) => r.toUid === uid);
  const outgoing = requests.data.filter((r) => r.fromUid === uid);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <h1 className="font-display text-3xl font-extrabold">Friends</h1>

      <section className="card space-y-3 p-5">
        <p className="text-sm text-muted">
          Your friend code:{' '}
          <button
            className="chip min-h-9 font-mono tracking-widest"
            onClick={() => {
              void navigator.clipboard.writeText(profile!.friendCode);
              toast.success('Friend code copied');
            }}
          >
            {profile?.friendCode} <Copy className="h-3.5 w-3.5" />
          </button>
        </p>
        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor="friend-code" className="sr-only">
            Friend code
          </label>
          <input
            id="friend-code"
            className="field font-mono uppercase tracking-widest"
            placeholder="Enter a friend code"
            maxLength={FRIEND_CODE_LENGTH + 2}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" icon={<UserPlus className="h-4 w-4" />} disabled={code.replace(/[^A-Za-z0-9]/g, '').length !== FRIEND_CODE_LENGTH} loading={busy === 'send'}>
            Add
          </Button>
        </form>
      </section>

      {incoming.length > 0 && (
        <section className="card p-5" aria-label="Friend requests">
          <h2 className="mb-3 font-display text-lg font-semibold">Requests</h2>
          <ul className="space-y-2">
            {incoming.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line p-2">
                <Avatar name={r.from.displayName} photoURL={r.from.photoURL} size={36} />
                <span className="flex-1">{r.from.displayName}</span>
                <Button size="sm" icon={<Check className="h-4 w-4" />} loading={busy === `a-${r.id}`} onClick={() => run(`a-${r.id}`, () => api.respondFriendRequest(r.id, 'ACCEPT'))}>
                  Accept
                </Button>
                <Button size="sm" variant="ghost" aria-label="Reject" loading={busy === `r-${r.id}`} onClick={() => run(`r-${r.id}`, () => api.respondFriendRequest(r.id, 'REJECT'))}>
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5" aria-label="Your friends">
        <h2 className="mb-3 font-display text-lg font-semibold">Your friends ({friends.data.length})</h2>
        {friends.data.length === 0 ? (
          <EmptyState icon={<Users className="h-7 w-7" />} title="No friends yet">
            <p>Share your friend code, or add someone by theirs.</p>
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {friends.data.map((f) => {
              const fid = f.uids.find((u) => u !== uid)!;
              const p = f.profiles[fid];
              return (
                <li key={f.pairId} className="flex items-center gap-3 rounded-xl border border-line p-2">
                  <Avatar name={p.displayName} photoURL={p.photoURL} size={36} />
                  <span className="flex-1">
                    {p.displayName}
                    <span className="ml-2 text-xs capitalize text-muted">{presence[fid]}</span>
                  </span>
                  <Button size="sm" variant="ghost" loading={busy === `rm-${fid}`} onClick={() => run(`rm-${fid}`, () => api.removeFriend(fid))}>
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section className="card p-5" aria-label="Sent requests">
          <h2 className="mb-3 font-display text-lg font-semibold">Sent</h2>
          <ul className="space-y-2">
            {outgoing.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line p-2 text-sm">
                <Avatar name={r.to.displayName} photoURL={r.to.photoURL} size={32} />
                <span className="flex-1">{r.to.displayName} · pending</span>
                <Button size="sm" variant="ghost" loading={busy === `c-${r.id}`} onClick={() => run(`c-${r.id}`, () => api.cancelFriendRequest(r.id))}>
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
