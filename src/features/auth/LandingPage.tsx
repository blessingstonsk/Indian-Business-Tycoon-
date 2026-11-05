import { motion } from 'framer-motion';
import { BookOpen, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { BOARD, GROUP_META, type PropertySpace } from '@shared';
import { useAuth } from '../../app/providers/AuthProvider';
import { Die } from '../../components/board/Dice3D';
import { PropertyArt } from '../../components/board/PropertyArt';
import { Button, Spinner } from '../../components/ui/primitives';
import { Logo, SoundToggle, ThemeToggle } from '../../components/ui/TopBar';
import { DEV_LOGIN } from '../../lib/backend';
import { rupees } from '../../lib/utils/format';
import { HowToPlay } from '../howto/HowToPlay';
import { GoogleSignInButton } from './GoogleSignInButton';

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
  const { user, profile, initializing, signInTestUser } = useAuth();
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
        <div className="flex flex-wrap items-center gap-3">
          <GoogleSignInButton />
          <Button size="lg" variant="secondary" icon={<BookOpen className="h-5 w-5" />} onClick={() => setHowTo(true)}>
            How to play
          </Button>
        </div>
      )}
      {DEV_LOGIN && !initializing && (
        <form
          className="mt-4 flex max-w-md gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await signInTestUser(testName);
            setBusy(false);
          }}
        >
          <label htmlFor="test-name" className="sr-only">
            Test player name
          </label>
          <input id="test-name" className="field" placeholder="Test player name (dev only)" value={testName} onChange={(e) => setTestName(e.target.value)} />
          <Button type="submit" variant="secondary" className="shrink-0 whitespace-nowrap" disabled={testName.trim().length < 2} loading={busy}>
            Test sign-in
          </Button>
        </form>
      )}
      <p className="mt-4 max-w-md text-sm text-muted">Sign in to create a private room, invite friends with a code, and play together from anywhere. Virtual money only.</p>
      <HowToPlay open={howTo} onOpenChange={setHowTo} />
    </Hero>
  );
}

/** Shown when this build has no game server address (VITE_API_URL). */
export function SetupRequired() {
  const [howTo, setHowTo] = useState(false);
  return (
    <Hero>
      <div className="card space-y-3 p-5 text-sm">
        <p className="flex items-center gap-2 font-display text-lg font-semibold">
          <Wrench className="h-5 w-5 text-gold" /> The game server is getting ready
        </p>
        <p className="text-muted">Online play opens as soon as the server is connected. Meanwhile, learn the rules!</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<BookOpen className="h-4 w-4" />} onClick={() => setHowTo(true)}>
            How to play
          </Button>
          {import.meta.env.DEV && (
            <Link to="/dev/playground">
              <Button variant="secondary">Open the local board playground</Button>
            </Link>
          )}
        </div>
        <p className="text-xs text-muted">Site owner: set <code>VITE_API_URL</code> (see README → Deployment).</p>
      </div>
      <HowToPlay open={howTo} onOpenChange={setHowTo} />
    </Hero>
  );
}
