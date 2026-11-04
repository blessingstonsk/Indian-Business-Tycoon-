import { LogOut, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateProfileSchema } from '@shared';
import { useAuth } from '../../app/providers/AuthProvider';
import { Avatar, Button, Dialog } from '../../components/ui/primitives';
import { api } from '../../lib/api/callables';
import { cx } from '../../lib/utils/format';
import { useSettings, type Theme } from '../../stores/settings';
import { reportError, toast } from '../../stores/toasts';
import type { UserDoc } from '../../domain/docs';

export function ProfilePage() {
  const { profile } = useAuth();
  const [name, setName] = useState(profile?.displayName ?? '');
  const [privacy, setPrivacy] = useState<UserDoc['privacy']['allowFriendRequests']>(profile?.privacy.allowFriendRequests ?? 'everyone');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (profile) {
      setName(profile.displayName);
      setPrivacy(profile.privacy.allowFriendRequests);
    }
  }, [profile]);
  if (!profile) return null;
  const valid = updateProfileSchema.safeParse({ displayName: name }).success;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.updateProfile({ displayName: name.trim(), allowFriendRequests: privacy });
      toast.success('Profile saved');
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 py-6">
      <h1 className="font-display text-3xl font-extrabold">Profile</h1>
      <form onSubmit={save} className="card space-y-4 p-5">
        <div className="flex items-center gap-4">
          <Avatar name={profile.displayName} photoURL={profile.photoURL} size={56} />
          <div>
            <p className="text-sm text-muted">Friend code</p>
            <p className="font-mono text-lg tracking-widest">{profile.friendCode}</p>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="display-name">
            Display name
          </label>
          <input id="display-name" className="field" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} aria-invalid={!valid} />
          {!valid && <p className="mt-1 text-sm text-danger">2–24 letters, numbers, spaces, dots, dashes or underscores.</p>}
        </div>
        <div>
          <label className="label" htmlFor="privacy">
            Who can send you friend requests?
          </label>
          <select id="privacy" className="field" value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)}>
            <option value="everyone">Anyone with my friend code</option>
            <option value="friendsOfFriends">Friends of friends</option>
            <option value="nobody">Nobody</option>
          </select>
        </div>
        <p className="text-xs text-muted">Other players see only your display name, photo and friend code. Your email is never shown.</p>
        <Button type="submit" disabled={!valid} loading={busy}>
          Save
        </Button>
      </form>
    </div>
  );
}

export function SettingsPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const s = useSettings();
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const themes: [Theme, string][] = [
    ['system', 'System'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];
  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 py-6">
      <h1 className="font-display text-3xl font-extrabold">Settings</h1>
      <section className="card space-y-5 p-5">
        <div>
          <p className="label">Theme</p>
          <div className="flex gap-2">
            {themes.map(([t, label]) => (
              <button key={t} className={cx('min-h-11 flex-1 rounded-xl border text-sm font-medium', s.theme === t ? 'border-emerald bg-emerald-soft text-emerald' : 'border-line')} aria-pressed={s.theme === t} onClick={() => s.setTheme(t)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span>Mute all sounds</span>
          <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--emerald))]" checked={s.muted} onChange={s.toggleMute} />
        </label>
        <label className="block">
          <span className="label">Volume</span>
          <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => s.setVolume(Number(e.target.value))} className="w-full accent-[rgb(var(--emerald))]" disabled={s.muted} />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span>
            Reduce motion
            <span className="block text-xs text-muted">Also follows your system preference.</span>
          </span>
          <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--emerald))]" checked={s.reduceMotion} onChange={(e) => s.setReduceMotion(e.target.checked)} />
        </label>
      </section>
      <section className="card space-y-3 p-5">
        <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => signOut().then(() => navigate('/'))}>
          Sign out
        </Button>
        <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(true)}>
          Delete account
        </Button>
      </section>
      <Dialog open={deleting} onOpenChange={setDeleting} title="Delete your account?" description="This removes your profile, friends and pending requests. Finished games other players keep will show you as “Deleted player”.">
        <label className="label" htmlFor="confirm-delete">
          Type DELETE to confirm
        </label>
        <input id="confirm-delete" className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button
          variant="danger"
          className="mt-4 w-full"
          disabled={confirm !== 'DELETE'}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.deleteAccount();
              await signOut();
              navigate('/');
            } catch (e) {
              reportError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          Permanently delete
        </Button>
      </Dialog>
    </div>
  );
}
