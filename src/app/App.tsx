import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect } from 'react';
import { createHashRouter, Navigate, Outlet, RouterProvider, useLocation, type RouteObject } from 'react-router-dom';
import { Spinner, Toasts } from '../components/ui/primitives';
import { TopBar } from '../components/ui/TopBar';
import { LandingPage, SetupRequired } from '../features/auth/LandingPage';
import { HomePage } from '../features/dashboard/HomePage';
import { FriendsPage } from '../features/friends/FriendsPage';
import { GamePage } from '../features/game/GamePage';
import { HistoryPage } from '../features/history/HistoryPage';
import { JoinLinkPage, LobbyPage } from '../features/rooms/LobbyPage';
import { ProfilePage, SettingsPage } from '../features/settings/SettingsPages';
import { backendConfigured } from '../lib/backend';
import { useSettings } from '../stores/settings';
import { AuthProvider, useAuth } from './providers/AuthProvider';

// Dev-only: the constant-false branch is tree-shaken from production builds.
const PlaygroundPage = import.meta.env.DEV
  ? lazy(() => import('../features/dev/PlaygroundPage').then((m) => ({ default: m.PlaygroundPage })))
  : () => null;

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

function useThemeClass() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101424' : '#fbf7ef');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function RequireAuth() {
  const { user, profile, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <Spinner label="Signing you in…" />;
  if (!user || !profile) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  return (
    <>
      <TopBar />
      <main id="main">
        <Outlet />
      </main>
    </>
  );
}

const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/playground',
        element: (
          <Suspense fallback={<Spinner />}>
            <PlaygroundPage />
          </Suspense>
        ),
      },
    ]
  : [];

const routes: RouteObject[] = backendConfigured
  ? [
      { path: '/', element: <LandingPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/home', element: <HomePage /> },
          { path: '/friends', element: <FriendsPage /> },
          { path: '/room/:roomId', element: <LobbyPage /> },
          { path: '/game/:gameId', element: <GamePage /> },
          { path: '/join/:code', element: <JoinLinkPage /> },
          { path: '/history', element: <HistoryPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
      ...devRoutes,
      { path: '*', element: <Navigate to="/" replace /> },
    ]
  : [...devRoutes, { path: '*', element: <SetupRequired /> }];

const router = createHashRouter(routes);

export function App() {
  useThemeClass();
  const content = <RouterProvider router={router} />;
  return (
    <QueryClientProvider client={queryClient}>
      {backendConfigured ? <AuthProvider>{content}</AuthProvider> : content}
      <Toasts />
    </QueryClientProvider>
  );
}
