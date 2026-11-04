import { AnimatePresence, motion } from 'framer-motion';
import { Gift, Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { DECK_LABEL, EMOTES } from '@shared';
import { useReducedMotion } from '../../stores/settings';
import type { CardReveal } from '../../features/game/useGameAnimation';
import type { ReactionDoc } from '../../domain/docs';

export function CardRevealOverlay({ card, drawnByName, onDone }: { card: CardReveal | null; drawnByName: string; onDone: () => void }) {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!card) return;
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
  }, [card, onDone]);
  return (
    <AnimatePresence>
      {card && (
        <motion.button
          key={card.key}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 p-4"
          onClick={onDone}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-label="Dismiss card"
        >
          <div className="dice-scene w-full max-w-[18rem]">
            <motion.div
              className="dice-cube relative aspect-[3/2] w-full"
              initial={{ rotateY: reduced ? 0 : 180, scale: reduced ? 1 : 0.6 }}
              animate={{ rotateY: 0, scale: 1 }}
              transition={{ duration: reduced ? 0 : 0.7, ease: 'easeOut' }}
            >
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border-4 p-4 text-center shadow-2xl"
                style={{
                  backfaceVisibility: 'hidden',
                  background: card.deck === 'FORTUNE' ? 'rgb(var(--gold-soft))' : 'rgb(var(--emerald-soft))',
                  borderColor: card.deck === 'FORTUNE' ? 'rgb(var(--gold))' : 'rgb(var(--emerald))',
                }}
                role="dialog"
                aria-live="assertive"
              >
                <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-muted">
                  {card.deck === 'FORTUNE' ? <Sparkles className="h-4 w-4 text-gold" /> : <Gift className="h-4 w-4 text-emerald" />}
                  {DECK_LABEL[card.deck]} · {drawnByName}
                </span>
                <p className="font-display text-base font-semibold leading-snug text-ink">{card.text}</p>
              </div>
              <div
                className="absolute inset-0 flex items-center justify-center rounded-2xl bg-navy font-display text-xl font-bold text-gold"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                {DECK_LABEL[card.deck]}
              </div>
            </motion.div>
          </div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/** Lightweight canvas confetti; skipped entirely for reduced motion. */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reduced) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
    };
    resize();
    const colors = ['#1f8a5b', '#c9a227', '#c0392b', '#2b3a8f', '#e8892b', '#c8558a'];
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: -Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 2,
      vy: 2 + Math.random() * 3,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
      s: (4 + Math.random() * 6) * devicePixelRatio,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy * devicePixelRatio;
        p.r += p.vr;
        if (p.y > canvas.height && t - start < 5000) p.y = -20;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      if (t - start < 9000) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}

export function ReactionBubbles({ reactions }: { reactions: ReactionDoc[] }) {
  const now = Date.now();
  const live = reactions.filter((r) => r.ttlAt > now).slice(-6);
  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-30 flex flex-col items-end gap-2" aria-live="polite">
      <AnimatePresence>
        {live.map((r) => {
          const e = EMOTES.find((x) => x.id === r.emoteId);
          if (!e) return null;
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm shadow-card"
            >
              <span className="text-lg" aria-hidden>
                {e.glyph}
              </span>
              <span>
                <strong>{r.displayName}</strong> {e.kind === 'phrase' ? `“${e.label}”` : ''}
              </span>
              <span className="sr-only">reacted {e.label}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function ReactionTray({ onReact, disabled }: { onReact: (id: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2" aria-label="Reactions">
      <div className="flex flex-wrap gap-1">
        {EMOTES.filter((e) => e.kind === 'emote').map((e) => (
          <button
            key={e.id}
            disabled={disabled}
            onClick={() => onReact(e.id)}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-xl hover:bg-sunken disabled:opacity-40"
            aria-label={e.label}
            title={e.label}
          >
            {e.glyph}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EMOTES.filter((e) => e.kind === 'phrase').map((e) => (
          <button key={e.id} disabled={disabled} onClick={() => onReact(e.id)} className="chip min-h-9 hover:bg-surface disabled:opacity-40">
            {e.glyph} {e.label}
          </button>
        ))}
      </div>
    </div>
  );
}
