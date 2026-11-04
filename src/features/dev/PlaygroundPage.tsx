import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { applyAction, createInitialGame, DomainError, type GameAction, type GameState, type PrivateState } from '@shared';
import { reportError } from '../../stores/toasts';
import type { EventDoc, ReactionDoc } from '../../domain/docs';
import type { ActionType, GameController } from '../game/controller';
import { GameView } from '../game/GameView';

// DEVELOPMENT ONLY (excluded from production routes): runs the pure engine in the browser,
// hot-seat style, so the board UI can be exercised without the Firebase backend.

const rand = (n: number) => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
};

function fresh() {
  const players = [
    { uid: 'dev-asha', displayName: 'Asha', photoURL: null, token: 'elephant' },
    { uid: 'dev-ravi', displayName: 'Ravi', photoURL: null, token: 'rickshaw' },
    { uid: 'dev-meera', displayName: 'Meera', photoURL: null, token: 'peacock' },
  ];
  const r = createInitialGame(
    { gameId: 'dev', roomId: 'dev', settings: { maxPlayers: 6, mode: 'STANDARD', turnTimerSeconds: 0 }, players },
    { now: Date.now(), randomInt: rand, newId: () => crypto.randomUUID().slice(0, 8) },
  );
  return { game: r.game, priv: r.priv, events: toDocs(r.events, 0, 'dev', r.game.version) };
}

function toDocs(events: ReturnType<typeof applyAction>['events'], start: number, actor: string, version: number): EventDoc[] {
  return events.map((e, i) => {
    const { type, ...payload } = e;
    return { sequence: start + i + 1, commandId: 'local', actorUid: actor, type, payload, createdAt: Date.now(), versionAfter: version };
  });
}

export function PlaygroundPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<{ game: GameState; priv: PrivateState; events: EventDoc[] }>(fresh);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [reactions, setReactions] = useState<ReactionDoc[]>([]);
  const [viewAs, setViewAs] = useState<string | null>(null);
  const myUid = viewAs ?? state.game.currentPlayerUid;

  const send = useCallback(
    async (type: ActionType, payload: Record<string, unknown> = {}) => {
      try {
        const s = stateRef.current;
        const actor = type === 'PLACE_BID' || type === 'PASS_BID' || type.endsWith('_TRADE') ? myUid : s.game.currentPlayerUid;
        const r = applyAction(s.game, s.priv, actor, { type, payload } as GameAction, { now: Date.now(), randomInt: rand, newId: () => crypto.randomUUID().slice(0, 8) });
        const lastSeq = s.events.length ? s.events[s.events.length - 1].sequence : 0;
        const next = { game: r.game, priv: r.priv, events: [...s.events, ...toDocs(r.events, lastSeq, actor, r.game.version)].slice(-120) };
        stateRef.current = next;
        setState(next);
        return true;
      } catch (e) {
        if (type !== 'CLAIM_TIMEOUT') reportError(e instanceof DomainError ? e : new Error(String(e)));
        return false;
      }
    },
    [myUid],
  );

  const ctl = useMemo<GameController>(
    () => ({
      game: state.game,
      events: state.events,
      myUid,
      pending: null,
      send,
      react: (emoteId) => {
        const now = Date.now();
        const me = state.game.players.find((p) => p.uid === myUid)!;
        setReactions((r) => [...r.slice(-5), { id: String(now), uid: myUid, displayName: me.displayName, emoteId, createdAt: now, ttlAt: now + 8000 }]);
      },
      reactions,
      presence: {},
      onExit: () => navigate('/'),
    }),
    [state, myUid, send, reactions, navigate],
  );

  return (
    <div>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pt-3 text-sm">
        <span className="chip border-gold bg-gold-soft">Dev playground – local engine, not multiplayer</span>
        <label className="flex items-center gap-1">
          View as
          <select className="field min-h-9 w-auto py-1" value={viewAs ?? ''} onChange={(e) => setViewAs(e.target.value || null)}>
            <option value="">Current player</option>
            {state.game.players.map((p) => (
              <option key={p.uid} value={p.uid}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        <button className="chip" onClick={() => setState(fresh())}>
          Reset
        </button>
      </div>
      <GameView ctl={ctl} />
    </div>
  );
}
