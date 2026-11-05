import { History, Home, Monitor, Moon, Settings, Sun, Users, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import { useLiveConnected } from '../../hooks/useLive';
import { useOnline } from '../../lib/presence';
import { cx } from '../../lib/utils/format';
import { useSettings, type Theme } from '../../stores/settings';
import { Avatar } from './primitives';

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

export function ThemeToggle() {
  const { theme, setTheme } = useSettings();
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <button
      className="rounded-xl p-2.5 text-ink hover:bg-sunken"
      onClick={() => setTheme(NEXT_THEME[theme])}
      aria-label={`Theme: ${theme}. Switch to ${NEXT_THEME[theme]}`}
      title={`Theme: ${theme}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

export function SoundToggle() {
  const { muted, toggleMute } = useSettings();
  return (
    <button className="rounded-xl p-2.5 text-ink hover:bg-sunken" onClick={toggleMute} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} aria-pressed={muted}>
      {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
    </button>
  );
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
      {!compact && <span className="font-display text-lg font-extrabold tracking-tight">Indian Business Tycoon</span>}
    </span>
  );
}

const NAV = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/history', label: 'History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function TopBar() {
  const { profile } = useAuth();
  const online = useOnline();
  const connected = useLiveConnected();
  // Only complain after a few seconds so the initial connect doesn't flash a banner.
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    if (connected) return setGraceOver(false);
    const t = setTimeout(() => setGraceOver(true), 3000);
    return () => clearTimeout(t);
  }, [connected]);
  return (
    <>
      {(!online || (!connected && graceOver)) && (
        <div className="flex items-center justify-center gap-2 bg-gold-soft px-3 py-1.5 text-sm font-medium text-ink" role="status">
          <WifiOff className="h-4 w-4" /> {online ? 'Reconnecting to the game server…' : 'You are offline – reconnecting.'} Your seat is safe.
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:px-4">
          <Link to="/home" aria-label="Indian Business Tycoon home">
            <span className="hidden sm:block">
              <Logo />
            </span>
            <span className="sm:hidden">
              <Logo compact />
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-1" aria-label="Main">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => cx('flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-medium hover:bg-sunken', isActive && 'bg-sunken text-emerald')}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span className="hidden md:inline">{label}</span>
                <span className="sr-only md:hidden">{label}</span>
              </NavLink>
            ))}
            <SoundToggle />
            <ThemeToggle />
            {profile && (
              <Link to="/profile" className="ml-1 rounded-full" aria-label="Your profile">
                <Avatar name={profile.displayName} photoURL={profile.photoURL} size={32} />
              </Link>
            )}
          </nav>
        </div>
      </header>
    </>
  );
}
