import { ShieldAlert } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { Button, EmptyState, Spinner } from '../../components/ui/primitives';
import { useDoc, useQueryDocs } from '../../hooks/useLive';
import { api, ApiClientError } from '../../lib/api/callables';
import { usePresence } from '../../lib/presence';
import { reportError, toast } from '../../stores/toasts';
import type { EventDoc, GameDoc, ReactionDoc } from '../../domain/docs';
import type { ActionType, GameController } from './controller';
import { GameView } from './GameView';

export function GamePage() {
  const { gameId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const game = useDoc<GameDoc>(`games/${gameId}`);
  const events = useQueryDocs<EventDoc>(
    game.data ? { collection: `games/${gameId}/events`, orderBy: { field: 'sequence', direction: 'desc' }, limit: 80 } : null,
  );
  const [since] = useState(() => Date.now() - 10_000);
  const roomId = game.data?.roomId ?? null;
  const reactions = useQueryDocs<ReactionDoc>(
    roomId ? { collection: `rooms/${roomId}/reactions`, where: [['createdAt', '>', since]], orderBy: { field: 'createdAt', direction: 'asc' }, limit: 30 } : null,
  );
  const presence = usePresence(game.data?.playerOrder ?? []);
  const [pending, setPending] = useState<ActionType | null>(null);
  const versionRef = useRef(0);
  versionRef.current = game.data?.version ?? 0;

  const send = useCallback(
    async (type: ActionType, payload: Record<string, unknown> = {}) => {
      if (!game.data) return false;
      const silent = type === 'CLAIM_TIMEOUT';
      const command = { commandId: crypto.randomUUID(), roomId: game.data.roomId, gameId, expectedVersion: versionRef.current, type, payload };
      if (!silent) setPending(type);
      try {
        try {
          await api.submitGameAction(command);
        } catch (e) {
          // One safe retry for network failures: the same commandId is idempotent on the server.
          if (e instanceof ApiClientError && e.code === 'INTERNAL' && e.retryable) await api.submitGameAction(command);
          else throw e;
        }
        return true;
      } catch (e) {
        if (silent) return false;
        if (e instanceof ApiClientError && e.code === 'VERSION_CONFLICT') toast.info('The board just changed – check it and try again.');
        else reportError(e);
        return false;
      } finally {
        if (!silent) setPending(null);
      }
    },
    [game.data, gameId],
  );

  const react = useCallback(
    (emoteId: string) => {
      if (roomId) api.sendReaction(roomId, gameId, emoteId).catch(reportError);
    },
    [roomId, gameId],
  );

  const ctl = useMemo<GameController | null>(
    () =>
      game.data && user
        ? {
            game: game.data,
            events: events.data,
            myUid: user.uid,
            pending,
            send,
            react,
            reactions: reactions.data,
            presence,
            stale: game.data.stale,
            onExit: () => navigate('/home'),
          }
        : null,
    [game.data, user, events.data, pending, send, react, reactions.data, presence, navigate],
  );

  if (game.loading) return <Spinner label="Loading the board…" />;
  if (!ctl) {
    return (
      <div className="mx-auto max-w-md p-6">
        <EmptyState icon={<ShieldAlert className="h-8 w-8" />} title="Game not available">
          <p>It may have finished and been archived, or you are not a player in it.</p>
          <div className="mt-3 flex gap-2">
            <Link to="/history">
              <Button variant="secondary">Game history</Button>
            </Link>
            <Link to="/home">
              <Button>Home</Button>
            </Link>
          </div>
        </EmptyState>
      </div>
    );
  }
  return <GameView ctl={ctl} />;
}
