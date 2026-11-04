import type { GameAction } from '../action-schemas';
import { applyAction, createInitialGame, type EngineDeps } from '../engine/engine';
import type { GameSettings, GameState, PrivateState } from '../game-types';

export const SETTINGS: GameSettings = { maxPlayers: 6, mode: 'STANDARD', turnTimerSeconds: 0 };

/** Deterministic dice: queue of die faces (1..6); falls back to a seeded LCG. */
export function scriptedDeps(faces: number[] = [], seed = 42) {
  let s = seed;
  let n = 0;
  let now = 1_700_000_000_000;
  const deps: EngineDeps & { faces: number[]; advance(ms: number): void } = {
    faces,
    get now() {
      return now;
    },
    randomInt(max: number) {
      if (max === 6 && deps.faces.length) return deps.faces.shift()! - 1;
      s = (s * 1103515245 + 12345) % 2 ** 31;
      return s % max;
    },
    newId: () => `id${++n}`,
    advance(ms: number) {
      now += ms;
    },
  };
  return deps;
}

export function newGame(playerCount = 2, settings: GameSettings = SETTINGS, deps = scriptedDeps()) {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    uid: `p${i + 1}`,
    displayName: `Player ${i + 1}`,
    photoURL: null,
    token: ['elephant', 'rickshaw', 'tiger', 'peacock', 'lotus', 'cricket'][i],
  }));
  const r = createInitialGame({ gameId: 'g1', roomId: 'r1', settings, players }, deps);
  return { game: r.game, priv: r.priv, deps };
}

export class Harness {
  game: GameState;
  priv: PrivateState;
  deps: ReturnType<typeof scriptedDeps>;
  events: ReturnType<typeof applyAction>['events'] = [];

  constructor(playerCount = 2, settings: GameSettings = SETTINGS) {
    const g = newGame(playerCount, settings);
    this.game = g.game;
    this.priv = g.priv;
    this.deps = g.deps;
  }

  act(uid: string, action: GameAction) {
    const r = applyAction(this.game, this.priv, uid, action, this.deps);
    this.game = r.game;
    this.priv = r.priv;
    this.events = r.events;
    return r;
  }

  roll(uid: string, a: number, b: number) {
    this.deps.faces.push(a, b);
    return this.act(uid, { type: 'ROLL_DICE', payload: {} });
  }

  player(uid: string) {
    return this.game.players.find((p) => p.uid === uid)!;
  }

  prop(spaceId: number) {
    return this.game.properties.find((p) => p.spaceId === spaceId)!;
  }

  give(uid: string, ...spaceIds: number[]) {
    for (const id of spaceIds) this.prop(id).ownerUid = uid;
  }

  totalCash() {
    return this.game.players.reduce((s, p) => s + p.cash, 0);
  }
}

export const A = (type: GameAction['type'], payload: Record<string, unknown> = {}) =>
  ({ type, payload }) as GameAction;
