import { LayoutGroup, motion } from 'framer-motion';
import { Building2, Gift, Landmark as LandmarkIcon, Lock, Minus, Plus, RotateCcw, Shield, Sparkles, TrainFront, Zap, Droplets, Coffee, Flag } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { BOARD, GROUP_META, tokenDef, type GameState, type Space } from '@shared';
import { cx, rupees } from '../../lib/utils/format';

type Side = 'bottom' | 'left' | 'top' | 'right' | 'corner';

export function cellPosition(i: number): { row: number; col: number; side: Side } {
  if (i % 10 === 0) {
    const corners = { 0: [11, 11], 10: [11, 1], 20: [1, 1], 30: [1, 11] } as Record<number, [number, number]>;
    const [row, col] = corners[i];
    return { row, col, side: 'corner' };
  }
  if (i < 10) return { row: 11, col: 11 - i, side: 'bottom' };
  if (i < 20) return { row: 11 - (i - 10), col: 1, side: 'left' };
  if (i < 30) return { row: 1, col: 1 + (i - 20), side: 'top' };
  return { row: 1 + (i - 30), col: 11, side: 'right' };
}

const BAND: Record<Exclude<Side, 'corner'>, string> = {
  bottom: 'top-0 inset-x-0 h-[22%]',
  top: 'bottom-0 inset-x-0 h-[22%]',
  left: 'right-0 inset-y-0 w-[22%]',
  right: 'left-0 inset-y-0 w-[22%]',
};

function SpaceIcon({ space }: { space: Space }) {
  const cls = 'h-[1.6em] w-[1.6em] text-muted';
  switch (space.type) {
    case 'TRANSIT':
      return <TrainFront className={cls} aria-hidden />;
    case 'UTILITY':
      return space.id === 12 ? <Zap className={cls} aria-hidden /> : <Droplets className={cls} aria-hidden />;
    case 'CARD':
      return space.deck === 'FORTUNE' ? <Sparkles className={cx(cls, 'text-gold')} aria-hidden /> : <Gift className={cx(cls, 'text-emerald')} aria-hidden />;
    case 'TAX':
      return <LandmarkIcon className={cls} aria-hidden />;
    default:
      return null;
  }
}

function Corner({ space }: { space: Space }) {
  const icon =
    space.type === 'START' ? (
      <Flag className="h-[2.6em] w-[2.6em] text-emerald" />
    ) : space.type === 'JAIL' ? (
      <Lock className="h-[2.6em] w-[2.6em] text-ink" />
    ) : space.type === 'REST_HOUSE' ? (
      <Coffee className="h-[2.6em] w-[2.6em] text-gold" />
    ) : (
      <Shield className="h-[2.6em] w-[2.6em] text-danger" />
    );
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[0.3em] p-[0.4em] text-center">
      {icon}
      <span className="font-display text-[1.25em] font-extrabold leading-tight">{space.type === 'JAIL' ? 'Jail' : space.name}</span>
      {space.type === 'START' && <span className="text-[0.95em] text-muted">Collect ₹2,000</span>}
      {space.type === 'JAIL' && <span className="text-[0.9em] text-muted">Just visiting</span>}
    </div>
  );
}

export interface BoardProps {
  game: GameState;
  /** animated token positions (falls back to authoritative positions) */
  displayPositions: Record<string, number>;
  highlight?: number | null;
  onSelect?: (spaceId: number) => void;
  center: ReactNode;
}

export function Board({ game, displayPositions, highlight, onSelect, center }: BoardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(8);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setFontSize(Math.max(5, entry.contentRect.width / 95)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoom = (delta: number) => {
    setScale((s) => {
      const next = Math.min(2.5, Math.max(1, +(s + delta).toFixed(2)));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (scale === 1) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    setOffset({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y });
  };
  const endDrag = () => (drag.current = null);

  const ownerColor = (uid: string | null) => (uid ? tokenDef(game.players.find((p) => p.uid === uid)?.token ?? '').color : null);
  const byPosition = new Map<number, string[]>();
  for (const p of game.players) {
    if (p.bankrupt) continue;
    const pos = displayPositions[p.uid] ?? p.position;
    byPosition.set(pos, [...(byPosition.get(pos) ?? []), p.uid]);
  }
  const currentPos = displayPositions[game.currentPlayerUid] ?? game.players.find((p) => p.uid === game.currentPlayerUid)?.position;

  return (
    <div className="relative w-full">
      <div className="absolute right-[15%] top-[15%] z-20 flex flex-col gap-1">
        <button className="rounded-lg border border-line bg-surface/90 p-2 shadow-sm" onClick={() => zoom(0.25)} aria-label="Zoom in">
          <Plus className="h-4 w-4" />
        </button>
        <button className="rounded-lg border border-line bg-surface/90 p-2 shadow-sm" onClick={() => zoom(-0.25)} aria-label="Zoom out" disabled={scale === 1}>
          <Minus className="h-4 w-4" />
        </button>
        {scale > 1 && (
          <button className="rounded-lg border border-line bg-surface/90 p-2 shadow-sm" onClick={() => (setScale(1), setOffset({ x: 0, y: 0 }))} aria-label="Reset zoom">
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>
      <div
        ref={wrapRef}
        className={cx('relative aspect-square w-full overflow-hidden rounded-2xl', scale > 1 && 'cursor-grab touch-none')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="grid h-full w-full gap-[2px] rounded-2xl border-2 border-navy/70 bg-navy/70 p-[2px] transition-transform duration-200"
          style={{
            fontSize,
            gridTemplateColumns: '1.6fr repeat(9, 1fr) 1.6fr',
            gridTemplateRows: '1.6fr repeat(9, 1fr) 1.6fr',
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        >
          <LayoutGroup>
            {BOARD.map((space) => {
              const { row, col, side } = cellPosition(space.id);
              const ps = game.properties.find((p) => p.spaceId === space.id);
              const owner = ownerColor(ps?.ownerUid ?? null);
              const tokens = byPosition.get(space.id) ?? [];
              const label = `${space.name}${ps?.ownerUid ? `, owned by ${game.players.find((p) => p.uid === ps.ownerUid)?.displayName}` : ''}${ps?.mortgaged ? ', mortgaged' : ''}`;
              return (
                <button
                  key={space.id}
                  type="button"
                  onClick={() => onSelect?.(space.id)}
                  aria-label={label}
                  className={cx(
                    'relative overflow-hidden bg-surface text-left transition-colors hover:bg-sunken focus-visible:z-10',
                    highlight === space.id && 'z-10 ring-4 ring-inset ring-gold',
                    currentPos === space.id && highlight !== space.id && 'ring-2 ring-inset ring-emerald',
                  )}
                  style={{ gridRow: row, gridColumn: col, boxShadow: owner ? `inset 0 0 0 0.35em ${owner}` : undefined }}
                >
                  {side === 'corner' ? (
                    <Corner space={space} />
                  ) : (
                    <>
                      {space.type === 'PROPERTY' && <span className={cx('absolute', BAND[side])} style={{ background: GROUP_META[space.group].color }} />}
                      <span
                        className={cx(
                          'absolute flex flex-col items-center justify-center gap-[0.15em] p-[0.25em] text-center',
                          side === 'bottom' && 'inset-x-0 bottom-0 top-[22%]',
                          side === 'top' && 'inset-x-0 top-0 bottom-[22%]',
                          side === 'left' && 'inset-y-0 left-0 right-[22%]',
                          side === 'right' && 'inset-y-0 right-0 left-[22%]',
                          space.type !== 'PROPERTY' && 'inset-0',
                        )}
                      >
                        <SpaceIcon space={space} />
                        <span className="line-clamp-2 text-[0.95em] font-semibold leading-[1.1]">{space.short}</span>
                        {'price' in space && <span className="text-[0.85em] text-muted">{rupees(space.price)}</span>}
                        {space.type === 'TAX' && <span className="text-[0.85em] text-muted">Pay {rupees(space.amount)}</span>}
                      </span>
                      {ps && ps.level > 0 && (
                        <span
                          className={cx(
                            'absolute z-[1] flex items-center justify-center gap-[0.15em]',
                            side === 'bottom' && 'inset-x-0 top-0 h-[22%]',
                            side === 'top' && 'inset-x-0 bottom-0 h-[22%]',
                            side === 'left' && 'inset-y-0 right-0 w-[22%] flex-col',
                            side === 'right' && 'inset-y-0 left-0 w-[22%] flex-col',
                          )}
                          aria-label={ps.level === 5 ? 'Tower' : `${ps.level} blocks`}
                        >
                          {ps.level === 5 ? (
                            <Building2 className="h-[1.4em] w-[1.4em] text-white drop-shadow" />
                          ) : (
                            Array.from({ length: ps.level }, (_, i) => <span key={i} className="h-[0.7em] w-[0.7em] rounded-[0.15em] bg-white shadow" />)
                          )}
                        </span>
                      )}
                      {ps?.mortgaged && (
                        <span className="absolute inset-0 flex items-center justify-center bg-[repeating-linear-gradient(45deg,transparent,transparent_0.5em,rgb(0_0_0/0.08)_0.5em,rgb(0_0_0/0.08)_1em)]">
                          <span className="rounded bg-ink/80 px-[0.3em] text-[0.75em] font-bold text-canvas">MORTGAGED</span>
                        </span>
                      )}
                    </>
                  )}
                  {tokens.length > 0 && (
                    <span className="pointer-events-none absolute inset-0 z-[2] flex flex-wrap items-center justify-center gap-[0.2em] p-[0.3em]">
                      {tokens.map((uid) => {
                        const p = game.players.find((x) => x.uid === uid)!;
                        const t = tokenDef(p.token);
                        return (
                          <motion.span
                            key={uid}
                            layoutId={`token-${uid}`}
                            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                            className={cx(
                              'flex items-center justify-center rounded-full shadow-md ring-[0.18em] ring-white',
                              uid === game.currentPlayerUid && 'ring-gold',
                            )}
                            style={{ width: '2.6em', height: '2.6em', background: t.color, fontSize: '1em' }}
                            role="img"
                            aria-label={`${p.displayName} (${t.label})`}
                          >
                            <span style={{ fontSize: '1.5em' }}>{t.glyph}</span>
                          </motion.span>
                        );
                      })}
                    </span>
                  )}
                </button>
              );
            })}
          </LayoutGroup>
          <div className="relative overflow-hidden bg-canvas" style={{ gridRow: '2 / 11', gridColumn: '2 / 11' }}>
            {center}
          </div>
        </div>
      </div>
    </div>
  );
}
