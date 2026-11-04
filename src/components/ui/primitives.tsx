import * as RDialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { tokenDef } from '@shared';
import { cx } from '../../lib/utils/format';
import { useToasts } from '../../stores/toasts';

type Variant = 'primary' | 'gold' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-emerald text-white hover:brightness-110 shadow-sm',
  gold: 'bg-gold text-navy hover:brightness-105 shadow-sm dark:text-[#101424]',
  secondary: 'border border-line bg-surface text-ink hover:bg-sunken',
  ghost: 'text-ink hover:bg-sunken',
  danger: 'bg-danger text-white hover:brightness-110',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        size === 'md' && 'min-h-11 px-4 text-sm',
        size === 'lg' && 'min-h-12 px-6 text-base',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <RDialog.Content
          className={cx(
            'card fixed inset-x-3 bottom-3 z-50 max-h-[88vh] overflow-y-auto p-5 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2',
            wide ? 'sm:max-w-3xl' : 'sm:max-w-md',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <RDialog.Title className="font-display text-xl font-semibold">{title}</RDialog.Title>
              {description && <RDialog.Description className="mt-1 text-sm text-muted">{description}</RDialog.Description>}
            </div>
            <RDialog.Close className="rounded-lg p-2 text-muted hover:bg-sunken" aria-label="Close">
              <X className="h-5 w-5" />
            </RDialog.Close>
          </div>
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-muted" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function Avatar({ name, photoURL, size = 36 }: { name: string; photoURL: string | null; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return photoURL ? (
    <img src={photoURL} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-soft font-semibold text-emerald"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || '?'}
    </span>
  );
}

export function TokenBadge({ token, size = 28 }: { token: string; size?: number }) {
  const t = tokenDef(token);
  return (
    <span
      role="img"
      aria-label={`${t.label} token`}
      className="inline-flex shrink-0 items-center justify-center rounded-full ring-2 ring-white dark:ring-[#101424]"
      style={{ width: size, height: size, background: t.color, fontSize: size * 0.55 }}
    >
      {t.glyph}
    </span>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            onClick={() => dismiss(t.id)}
            className={cx(
              'pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-left text-sm font-medium shadow-card',
              t.tone === 'error' && 'bg-danger text-white',
              t.tone === 'success' && 'bg-emerald text-white',
              t.tone === 'info' && 'border border-line bg-surface text-ink',
            )}
          >
            {t.message}
            {t.detail && <span className="ml-2 opacity-75">{t.detail}</span>}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line p-8 text-center text-muted">
      <div className="text-emerald">{icon}</div>
      <p className="font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}
