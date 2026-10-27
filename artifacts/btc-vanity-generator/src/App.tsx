import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import DonationAddress from '@/components/donation-address';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import BitcoinPuzzlePage from '@/pages/bitcoin-puzzle';
import BitcoinPuzzleAddressLookupPage from '@/pages/bitcoin-puzzle-address-lookup';
import BitcoinBalancePage from '@/pages/bitcoin-balance';
import BitcoinRangeLookupPage from '@/pages/bitcoin-range-lookup';
import FinderPage from '@/pages/finder'; // ✅ زدنا هادي
import SelfTestPage from '@/pages/self-test';
import { queueBalanceCheck } from '@/lib/balance-check-transfer';
import { rememberGeneratedAddressRanges } from '@/lib/range-lookup-index';
import {
  ArrowUpRight,
  Bitcoin,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Cpu,
  Download,
  Eye,
  Fingerprint,
  Globe2,
  KeyRound,
  LockKeyhole,
  RotateCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import {
  isValidBitcoinAddressTarget,
  PRIVATE_KEY_LIMIT,
  type AddressFormat,
} from '@/lib/bitcoin';
import {
  MAX_RECORDED_RANGE_CANDIDATES,
  type CandidateRecord,
  type SearchResult,
  type WorkerResponse,
} from '@/lib/vanity-protocol';
import {
  Link,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

const RANGE_RESUME_STORAGE_KEY = 'bitcoin-vanity-generator:range-resume:v1';
const MAX_CPU_WORKERS = 32;

function getMaxCpuWorkers(): number {
  const reportedCores =
    typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency;
  const availableCores =
    Number.isInteger(reportedCores) && reportedCores > 0 ? reportedCores : 2;
  return Math.max(1, Math.min(availableCores, MAX_CPU_WORKERS));
}

type RangeResumeSettings = {
  format: AddressFormat;
  startHex: string;
  endHex: string;
  batchSize: string;
};

type RangeResumeLoad = {
  settings: RangeResumeSettings | null;
  available: boolean;
};

function parseRangeResumeSettings(value: unknown): RangeResumeSettings | null {
  if (!value || typeof value !== 'object') return null;
  const settings = value as Record<string, unknown>;
  if (
    (settings.format !== 'legacy' && settings.format !== 'segwit') ||
    typeof settings.startHex !== 'string' ||
    !/^[0-9a-f]{1,64}$/i.test(settings.startHex) ||
    typeof settings.endHex !== 'string' ||
    !/^[0-9a-f]{1,64}$/i.test(settings.endHex)
  ) {
    return null;
  }
  const start = BigInt(`0x${settings.startHex}`);
  const end = BigInt(`0x${settings.endHex}`);
  if (start < 1n || end < start || end >= PRIVATE_KEY_LIMIT) return null;
  const fallbackBatchSize = end - start + 1n;
  const storedBatchSize =
    typeof settings.batchSize === 'string' &&
    /^\d{1,78}$/.test(settings.batchSize)
      ? BigInt(settings.batchSize)
      : fallbackBatchSize;
  if (storedBatchSize < 1n || storedBatchSize >= PRIVATE_KEY_LIMIT) return null;
  return {
    format: settings.format,
    startHex: settings.startHex,
    endHex: settings.endHex,
    batchSize: storedBatchSize.toString(),
  };
}

function readRangeResumeSettings(): RangeResumeLoad {
  if (typeof window === 'undefined') return { settings: null, available: false };
  try {
    const saved = window.sessionStorage.getItem(RANGE_RESUME_STORAGE_KEY);
    if (!saved) return { settings: null, available: true };
    const parsed: unknown = JSON.parse(saved);
    const settings = parseRangeResumeSettings(parsed);
    if (settings) return { settings, available: true };
    window.sessionStorage.removeItem(RANGE_RESUME_STORAGE_KEY);
    return { settings: null, available: true };
  } catch {
    return { settings: null, available: false };
  }
}

function parseRangeHex(value: string): bigint | null {
  const normalized = value.trim().replace(/^0x/i, '');
  if (!/^[0-9a-f]{1,64}$/i.test(normalized)) return null;
  const parsed = BigInt(`0x${normalized}`);
  return parsed >= 1n && parsed < PRIVATE_KEY_LIMIT ? parsed : null;
}

function getRangeSize(startHex: string, endHex: string): bigint | null {
  const start = parseRangeHex(startHex);
  const end = parseRangeHex(endHex);
  if (start === null || end === null || start > end) return null;
  return end - start + 1n;
}

function formatRangeHex(value: bigint, width: number): string {
  return value.toString(16).padStart(width, '0');
}

function SiteHeader({
  activePage,
  children,
}: {
  activePage: 'generator' | 'puzzle' | 'balance' | 'range-lookup' | 'finder' | 'self-test'; // ✅ زدنا finder
  children: ReactNode;
}) {
  return (
    <header className="topbar">
      <Link href="/" className="brand" data-testid="link-brand-home" aria-label="LUCKY BTC home">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 40 40" fill="none">
            <path d="M8 12h10M13 12v16M8 28h10" />
            <path d="M31 13c-2.2-1.6-7.3-1.9-9.8.3-3 2.6-.5 5.2 4.2 6.2 4.8 1 6.4 3.4 4.1 6.1-2.3 2.9-8.1 3-11.3 1.3" />
          </svg>
        </span>
        <span>LUCKY BTC</span>
      </Link>
      <nav className="site-nav" aria-label="Main navigation">
        <Link
          href="/"
          className={`site-nav-link ${activePage === 'generator' ? 'active' : ''}`}
          aria-current={activePage === 'generator' ? 'page' : undefined}
          data-testid="link-vanity-generator"
        >
          Generator
        </Link>
        <Link
          href="/bitcoin-puzzle"
          className={`site-nav-link ${activePage === 'puzzle' ? 'active' : ''}`}
          aria-current={activePage === 'puzzle' ? 'page' : undefined}
          data-testid="link-bitcoin-puzzle"
        >
          Bitcoin Puzzle
        </Link>
        <Link
          href="/balance-check"
          className={`site-nav-link ${activePage === 'balance' ? 'active' : ''}`}
          aria-current={activePage === 'balance' ? 'page' : undefined}
          data-testid="link-balance-check"
        >
          Balance Check
        </Link>
        <Link
          href="/range-lookup"
          className={`site-nav-link ${activePage === 'range-lookup' ? 'active' : ''}`}
          aria-current={activePage === 'range-lookup' ? 'page' : undefined}
          data-testid="link-range-lookup"
        >
          Range Lookup
        </Link>
        {/* ✅ زدنا هاد الرابط */}
        <Link
          href="/finder"
          className={`site-nav-link ${activePage === 'finder' ? 'active' : ''}`}
          aria-current={activePage === 'finder' ? 'page' : undefined}
          data-testid="link-hd-finder"
        >
          HD Finder
        </Link>
        <Link
          href="/self-test"
          className={`site-nav-link ${activePage === 'self-test' ? 'active' : ''}`}
          aria-current={activePage === 'self-test' ? 'page' : undefined}
          data-testid="link-self-test"
        >
          Self-test
        </Link>
      </nav>
      <div className="top-meta">{children}</div>
    </header>
  );
}

function getNextRange(
  endHex: string,
  batchSize: bigint,
  width: number,
): { startHex: string; endHex: string } | null {
  const end = parseRangeHex(endHex);
  if (end === null) return null;
  const nextStart = end + 1n;
  const maximumKey = PRIVATE_KEY_LIMIT - 1n;
  if (nextStart > maximumKey) return null;
  const nextEnd = nextStart + batchSize - 1n;
  return {
    startHex: formatRangeHex(nextStart, width),
    endHex: formatRangeHex(nextEnd > maximumKey ? maximumKey : nextEnd, width),
  };
}

function saveRangeResumeSettings(settings: RangeResumeSettings): boolean {
  try {
    window.sessionStorage.setItem(
      RANGE_RESUME_STORAGE_KEY,
      JSON.stringify(settings),
    );
    return true;
  } catch {
    try {
      window.sessionStorage.removeItem(RANGE_RESUME_STORAGE_KEY);
    } catch {
      // Storage is unavailable; the caller reports that auto-resume could not be saved.
    }
    return false;
  }
}

function clearRangeResumeSettings(): boolean {
  try {
    window.sessionStorage.removeItem(RANGE_RESUME_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function Home() {
  // ... (الكود ديال Home كما هو، ما بدلناش فيه والو)
  // هاد الجزء طويل، ولكن مامسحناش منو والو، غير كوبي الكود الأصلي اللي عندك.
  // ...
  return (
    <div className="app-shell">
      {/* ... */}
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  const isHome = location === '/';
  const isBitcoinPuzzle = location === '/bitcoin-puzzle';
  const isPuzzleAddressLookup = location === '/puzzle-address-lookup';
  const isBitcoinBalance = location === '/balance-check';
  const isBitcoinRangeLookup = location === '/range-lookup';
  const isFinder = location === '/finder'; // ✅ زدنا هادي
  const isSelfTest = location === '/self-test';

  return (
    <RoutedErrorBoundary>
      <div hidden={!isHome} data-testid="preserved-generator-page">
        <Home />
      </div>
      <div hidden={!isBitcoinPuzzle} className="app-shell">
        <SiteHeader activePage="puzzle">
          <span>LOCAL PUZZLE INDEX</span>
        </SiteHeader>
        <BitcoinPuzzlePage active={isBitcoinPuzzle} />
      </div>
      <div hidden={!isPuzzleAddressLookup} className="app-shell">
        <SiteHeader activePage="puzzle">
          <span>PUZZLE ADDRESS LOOKUP</span>
        </SiteHeader>
        <BitcoinPuzzleAddressLookupPage active={isPuzzleAddressLookup} />
      </div>
      <div hidden={!isBitcoinBalance} className="app-shell">
        <SiteHeader activePage="balance">
          <span>BULK BALANCE CHECK</span>
        </SiteHeader>
        <BitcoinBalancePage active={isBitcoinBalance} />
      </div>
      <div hidden={!isBitcoinRangeLookup} className="app-shell">
        <SiteHeader activePage="range-lookup">
          <span>LOCAL RANGE LOOKUP</span>
        </SiteHeader>
        <BitcoinRangeLookupPage active={isBitcoinRangeLookup} />
      </div>
      {/* ✅ زدنا هاد البلوك */}
      <div hidden={!isFinder} className="app-shell">
        <SiteHeader activePage="finder">
          <span>HD ADDRESS FINDER</span>
        </SiteHeader>
        <FinderPage />
      </div>
      <div hidden={!isSelfTest} className="app-shell">
        <SiteHeader activePage="self-test">
          <span>LOCAL DIAGNOSTICS</span>
        </SiteHeader>
        <SelfTestPage />
      </div>
      {/* ✅ زدنا !isFinder فـ الشرط */}
      {!isHome && !isBitcoinPuzzle && !isPuzzleAddressLookup && !isBitcoinBalance && !isBitcoinRangeLookup && !isFinder && !isSelfTest && (
        <Switch>
          <Route component={NotFound} />
        </Switch>
      )}
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
