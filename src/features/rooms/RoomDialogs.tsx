import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { inviteCodeSchema, type GameMode, type TurnTimer } from '@shared';
import { Button, Dialog } from '../../components/ui/primitives';
import { api, type RoomSettingsInput } from '../../lib/api/callables';
import { cx } from '../../lib/utils/format';
import { reportError } from '../../stores/toasts';

export function RoomSettingsFields({ value, onChange, disabled }: { value: RoomSettingsInput; onChange: (v: RoomSettingsInput) => void; disabled?: boolean }) {
  const seg = (active: boolean) => cx('min-h-11 flex-1 rounded-xl border px-3 text-sm font-medium', active ? 'border-emerald bg-emerald-soft text-emerald' : 'border-line');
  return (
    <div className="space-y-4">
      <fieldset disabled={disabled}>
        <legend className="label">Max players</legend>
        <div className="flex gap-2">
          {[2, 3, 4, 5, 6].map((n) => (
            <button type="button" key={n} className={seg(value.maxPlayers === n)} aria-pressed={value.maxPlayers === n} onClick={() => onChange({ ...value, maxPlayers: n })}>
              {n}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend className="label">Game mode</legend>
        <div className="flex gap-2">
          {(
            [
              ['STANDARD', 'Standard', 'Last solvent player wins'],
              ['TIMED', 'Timed (90 min)', 'Highest net worth wins'],
            ] as [GameMode, string, string][]
          ).map(([m, label, hint]) => (
            <button type="button" key={m} className={cx(seg(value.mode === m), 'py-2 text-left')} aria-pressed={value.mode === m} onClick={() => onChange({ ...value, mode: m })}>
              <span className="block">{label}</span>
              <span className="block text-xs font-normal text-muted">{hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend className="label">Turn timer</legend>
        <div className="flex gap-2">
          {([0, 30, 45, 60] as TurnTimer[]).map((t) => (
            <button type="button" key={t} className={seg(value.turnTimerSeconds === t)} aria-pressed={value.turnTimerSeconds === t} onClick={() => onChange({ ...value, turnTimerSeconds: t })}>
              {t ? `${t}s` : 'Off'}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function CreateRoomDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<RoomSettingsInput>({ maxPlayers: 4, mode: 'STANDARD', turnTimerSeconds: 45 });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const { roomId } = await api.createRoom(settings);
      navigate(`/room/${roomId}`);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Create a private room" description="You can change these in the lobby before starting.">
      <RoomSettingsFields value={settings} onChange={setSettings} />
      <Button className="mt-5 w-full" size="lg" loading={busy} onClick={submit}>
        Create room
      </Button>
    </Dialog>
  );
}

export function JoinRoomForm({ initialCode = '' }: { initialCode?: string }) {
  const navigate = useNavigate();
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const parsed = inviteCodeSchema.safeParse(code);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.success) return;
    setBusy(true);
    try {
      const { roomId } = await api.joinRoom(parsed.data);
      navigate(`/room/${roomId}`);
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex gap-2">
      <label htmlFor="join-code" className="sr-only">
        Room code
      </label>
      <input
        id="join-code"
        className="field font-mono uppercase tracking-[0.3em]"
        placeholder="ROOM CODE"
        autoComplete="off"
        maxLength={7}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
      />
      <Button type="submit" disabled={!parsed.success} loading={busy}>
        Join
      </Button>
    </form>
  );
}
