import { motion } from 'framer-motion';
import { BookOpen, LogIn, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { BOARD, GROUP_META, type PropertySpace } from '@shared';
import { useAuth } from '../../app/providers/AuthProvider';
import { Die } from '../../components/board/Dice3D';
import { PropertyArt } from '../../components/board/PropertyArt';
import { Button, Spinner } from '../../components/ui/primitives';
import { Logo, SoundToggle, ThemeToggle } from '../../components/ui/TopBar';
import { usingEmulators } from '../../lib/firebase/client';
import { rupees } from '../../lib/utils/format';
import { HowToPlay } from '../howto/HowToPlay';

const SHOWCASE = [39, 32, 29, 1].map((id) => BOARD[id] as PropertySpace);

export function Hero({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo />
        <div className="flex items-center">
          <SoundToggle />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-6 lg:grid-cols-2">
        <div>
          <p className="chip mb-4 border-gold/50 bg-gold-soft text-ink">Real-time multiplayer · 2–6 friends</p>
          <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">
            Indian Business <span className="text-emerald">Tycoon</span>
          </h1>
          <p className="mt-4 text-xl font-medium text-muted">Buy Cities. Build Empires. Bankrupt Your Friends.</p>
          <div className="mt-8">{children}</div>
        </div>
        <div className="relative">
          <div className="absolute -top-6 right-6 z-10 flex gap-4 drop-shadow-xl">
            <Die value={5} rollKey="hero-a" idle size={64} />
            <Die value={3} rollKey="hero-b" idle size={64} />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-10">
            {SHOWCASE.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }} className="card overflow-hidden">
                <div className="h-2" style={{ background: GROUP_META[s.group].color }} />
                <PropertyArt landmark={s.landmark} color={GROUP_META[s.group].color} className="h-24 w-full" />
                <div className="p-3">
                  <p className="font-display font-semibold leading-tight">{s.name}</p>
                  <p className="text-sm text-muted">{rupees(s.price)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export function LandingPage() {
  const { user, profile, initializing, signIn, signInTestUser } = useAuth();
  const [testName, setTestName] = useState('');
  const location = useLocation();
  const [howTo, setHowTo] = useState(false);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/home';
  if (user && profile) return <Navigate to={from} replace />;
  return (
    <Hero>
      {initializing ? (
        <Spinner label="Checking your session…" />
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button
            size="lg"
            icon={<LogIn className="h-5 w-5" />}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await signIn();
              setBusy(false);
            }}
          >
            Sign in with Google
          </Button>
          <Button size="lg" variant="secondary" icon={<BookOpen className="h-5 w-5" />} onClick={() => setHowTo(true)}>
            How to play
          </Button>
        </div>
      )}
      {usingEmulators && !initializing && (
        <form
          className="mt-4 flex max-w-md gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await signInTestUser(testName).catch(() => undefined);
            setBusy(false);
          }}
        >
          <label htmlFor="test-name" className="sr-only">
            Test player name
          </label>
          <input id="test-name" className="field" placeholder="Emulator test player name" value={testName} onChange={(e) => setTestName(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={testName.trim().length < 2} loading={busy}>
            Test sign-in
          </Button>
        </form>
      )}
      <p className="mt-4 max-w-md text-sm text-muted">Sign in to create a private room, invite friends with a code, and play together from anywhere. Virtual money only.</p>
      <HowToPlay open={howTo} onOpenChange={setHowTo} />
    </Hero>
  );
}

export function SetupRequired() {
  return (
    <Hero>
      <div className="card space-y-3 p-5 text-sm">
        <p className="flex items-center gap-2 font-display text-lg font-semibold">
          <Wrench className="h-5 w-5 text-gold" /> Firebase is not configured
        </p>
        <p className="text-muted">
          Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Firebase web config (or set <code>VITE_USE_EMULATORS=true</code> with the Emulator Suite). See the README for
          the full setup.
        </p>
        {import.meta.env.DEV && (
          <Link to="/dev/playground">
            <Button variant="secondary">Open the local board playground</Button>
          </Link>
        )}
      </div>
    </Hero>
  );
}
