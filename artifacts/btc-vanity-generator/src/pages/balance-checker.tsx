import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import BalanceCheckerView, {
  type BalanceRow,
} from './balance-checker-view';
import { isValidMainnetBitcoinAddress } from '@/lib/bitcoin';

const MEMPOOL_API = 'https://mempool.space/api';
const ADDRESS_STORAGE_KEY = 'vanity-btc:balance-checker:addresses:v1';
const AUTO_REFRESH_STORAGE_KEY = 'vanity-btc:balance-checker:auto-refresh:v1';
const AUTO_REFRESH_INTERVAL_MS = 20 * 60 * 1000;
const MAX_ADDRESSES = 465;
const MAX_AUTO_REFRESH_ADDRESSES = 20;
const REQUEST_CONCURRENCY = 8;
const MAX_RETRIES = 4;
const PAGE_SIZE = 100;

type ExplorerStats = {
  funded_txo_sum?: unknown;
  spent_txo_sum?: unknown;
  tx_count?: unknown;
};

type ExplorerAddressResponse = {
  chain_stats?: ExplorerStats;
  mempool_stats?: ExplorerStats;
};

class PermanentLookupError extends Error {}

type ParsedAddresses = {
  addresses: string[];
  invalidCount: number;
  duplicateCount: number;
  excessCount: number;
};

type Progress = {
  completed: number;
  total: number;
  queued: number;
  retrying: number;
};

type BarcodeResult = { rawValue?: string };

type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<BarcodeResult[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

function readSavedAddresses(): string[] {
  try {
    const raw = window.localStorage.getItem(ADDRESS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (value): value is string =>
          typeof value === 'string' && isValidMainnetBitcoinAddress(value),
      )
      .slice(0, MAX_ADDRESSES);
  } catch {
    return [];
  }
}

function readAutoRefreshPreference(): boolean {
  try {
    return window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function normalizeAddressCell(line: string): string {
  let candidate = line.trim().split(/[,\t;]/, 1)[0]?.trim() ?? '';
  candidate = candidate.replace(/^["']|["']$/g, '');
  if (/^address$/i.test(candidate)) return '';
  if (/^bitcoin:/i.test(candidate)) {
    candidate = candidate.replace(/^bitcoin:/i, '').split('?', 1)[0];
    candidate = candidate.replace(/^\/\//, '');
  }
  candidate = candidate.trim();
  return /^BC1/i.test(candidate) ? candidate.toLowerCase() : candidate;
}

function parseAddressText(text: string): ParsedAddresses {
  const addresses: string[] = [];
  const seen = new Set<string>();
  let invalidCount = 0;
  let duplicateCount = 0;
  let excessCount = 0;

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const address = normalizeAddressCell(line);
    if (!address && /^address$/i.test(line.trim().replace(/^["']|["']$/g, ''))) {
      continue;
    }
    if (!address || !isValidMainnetBitcoinAddress(address)) {
      invalidCount += 1;
      continue;
    }
    const key = address.toLowerCase();
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    if (addresses.length >= MAX_ADDRESSES) {
      excessCount += 1;
      continue;
    }
    addresses.push(address);
  }

  return { addresses, invalidCount, duplicateCount, excessCount };
}

function netBalanceSats(stats: ExplorerStats | undefined, name: string): number {
  const funded = stats?.funded_txo_sum;
  const spent = stats?.spent_txo_sum;
  if (
    typeof funded !== 'number' ||
    !Number.isSafeInteger(funded) ||
    typeof spent !== 'number' ||
    !Number.isSafeInteger(spent)
  ) {
    throw new Error(`The explorer returned invalid ${name} balance data.`);
  }
  return funded - spent;
}

function transactionCount(stats: ExplorerStats | undefined, name: string): number {
  const count = stats?.tx_count;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    throw new Error(`The explorer returned an invalid ${name} transaction count.`);
  }
  return count;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 5 * 60 * 1000);
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) {
      return Math.min(Math.max(0, date - Date.now()), 5 * 60 * 1000);
    }
  }
  return Math.min(1000 * 2 ** attempt, 60_000);
}

function waitForRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('The lookup was stopped.', 'AbortError'));
      return;
    }

    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('The lookup was stopped.', 'AbortError'));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchAddressBalance(
  address: string,
  signal: AbortSignal,
  onRetryChange: (difference: number) => void,
  getPauseUntil: () => number,
  setPauseUntil: (timestamp: number) => void,
): Promise<BalanceRow> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const pause = getPauseUntil() - Date.now();
    if (pause > 0) await waitForRetry(pause, signal);

    try {
      const response = await fetch(
        `${MEMPOOL_API}/address/${encodeURIComponent(address)}`,
        { signal, headers: { Accept: 'application/json' } },
      );

      if (response.status === 429 || response.status >= 500) {
        if (attempt >= MAX_RETRIES) {
          throw new Error(
            response.status === 429
              ? 'The public explorer is rate-limiting requests. Try again later.'
              : `The public explorer is temporarily unavailable (HTTP ${response.status}).`,
          );
        }
        const delay = retryDelay(response, attempt);
        if (response.status === 429) {
          setPauseUntil(Math.max(getPauseUntil(), Date.now() + delay));
        }
        onRetryChange(1);
        try {
          await waitForRetry(delay, signal);
        } finally {
          onRetryChange(-1);
        }
        continue;
      }

      if (!response.ok) {
        throw new PermanentLookupError(
          `The public explorer returned HTTP ${response.status}.`,
        );
      }

      const payload = (await response.json()) as ExplorerAddressResponse;
      const confirmedSats = netBalanceSats(payload.chain_stats, 'confirmed');
      const unconfirmedSats = netBalanceSats(payload.mempool_stats, 'unconfirmed');
      const txCount =
        transactionCount(payload.chain_stats, 'confirmed') +
        transactionCount(payload.mempool_stats, 'mempool');

      return {
        address,
        confirmedSats,
        unconfirmedSats,
        totalSats: confirmedSats + unconfirmedSats,
        txCount,
        checkedAt: Date.now(),
      };
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw error;
      }
      if (error instanceof PermanentLookupError) throw error;
      if (attempt >= MAX_RETRIES) {
        throw error instanceof Error ? error : new Error('Address lookup failed.');
      }
      onRetryChange(1);
      try {
        await waitForRetry(Math.min(700 * 2 ** attempt, 10_000), signal);
      } finally {
        onRetryChange(-1);
      }
    }
  }

  throw new Error('Address lookup failed after retries.');
}

function formatRefreshTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

function extractQrAddress(value: string): string | null {
  let candidate = value.trim();
  if (/^bitcoin:/i.test(candidate)) {
    candidate = candidate.replace(/^bitcoin:/i, '').split('?', 1)[0];
    candidate = candidate.replace(/^\/\//, '');
  }
  return isValidMainnetBitcoinAddress(candidate) ? normalizeAddressCell(candidate) : null;
}

export default function BalanceCheckerPage({ active }: { active: boolean }) {
  const [addressText, setAddressText] = useState(() =>
    readSavedAddresses().join('\n'),
  );
  const [selectedFileName, setSelectedFileName] = useState('');
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [totalSats, setTotalSats] = useState(0);
  const [progress, setProgress] = useState<Progress>({
    completed: 0,
    total: 0,
    queued: 0,
    retrying: 0,
  });
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] =
    useState<'info' | 'error' | 'success'>('info');
  const [autoRefresh, setAutoRefresh] = useState(readAutoRefreshPreference);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [btcPriceUsd, setBtcPriceUsd] = useState<number | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerSupported, setScannerSupported] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [resultPage, setResultPage] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const rowsByAddressRef = useRef<Map<string, BalanceRow>>(new Map());
  const checkedAddressesRef = useRef<string[]>([]);
  const checkingRef = useRef(false);
  const lookupFunctionRef = useRef<
    (addresses: string[], isRefresh: boolean) => Promise<void>
  >(async () => undefined);
  const fileReadSequenceRef = useRef(0);

  const resultPageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visibleRows = rows.slice(
    resultPage * PAGE_SIZE,
    (resultPage + 1) * PAGE_SIZE,
  );

  const stopScanner = useCallback(() => {
    setScannerOpen(false);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    const detector = (
      window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;
    setScannerSupported(
      Boolean(
        detector &&
          navigator.mediaDevices &&
          typeof navigator.mediaDevices.getUserMedia === 'function',
      ),
    );
  }, []);

  useEffect(() => {
    if (!scannerOpen || !active) return;
    let stopped = false;
    let timer = 0;
    const detectorConstructor = (
      window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;

    const scan = async () => {
      if (
        !detectorConstructor ||
        !navigator.mediaDevices?.getUserMedia ||
        !videoRef.current
      ) {
        setScannerError('Camera QR scanning is not supported by this browser.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new detectorConstructor({ formats: ['qr_code'] });

        const inspectFrame = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            const address = results
              .map((result) =>
                typeof result.rawValue === 'string'
                  ? extractQrAddress(result.rawValue)
                  : null,
              )
              .find((value): value is string => value !== null);
            if (address) {
              setAddressText((previous) =>
                previous.trim() ? `${previous.trim()}\n${address}` : address,
              );
              setSelectedFileName('');
              setNotice('A valid Bitcoin address was added from the QR code.');
              setNoticeTone('success');
              stopScanner();
              return;
            }
          } catch {
            setScannerError('Could not read a QR code from the camera image.');
          }
          if (!stopped) timer = window.setTimeout(inspectFrame, 220);
        };

        setScannerError('');
        void inspectFrame();
      } catch (error) {
        setScannerError(
          error instanceof Error
            ? `Camera could not start: ${error.message}`
            : 'Camera access was denied or unavailable.',
        );
      }
    };

    void scan();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [active, scannerOpen, stopScanner]);

  useEffect(() => {
    if (!active) return;
    document.title = 'Bitcoin Balance Checker | Vanity / BTC';
    let alive = true;

    const loadPrice = async () => {
      try {
        const response = await fetch(`${MEMPOOL_API}/v1/prices`);
        if (!response.ok) throw new Error('BTC price unavailable.');
        const data = (await response.json()) as { USD?: unknown };
        if (alive && typeof data.USD === 'number' && Number.isFinite(data.USD)) {
          setBtcPriceUsd(data.USD);
        }
      } catch {
        if (alive) setBtcPriceUsd(null);
      }
    };

    void loadPrice();
    const interval = window.setInterval(loadPrice, 60_000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [active]);

  const runLookup = useCallback(
    async (addresses: string[], isRefresh: boolean, details = '') => {
      if (checkingRef.current || addresses.length === 0) return;
      const controller = new AbortController();
      controllerRef.current = controller;
      checkingRef.current = true;
      setChecking(true);
      setNotice(
        `${isRefresh ? 'Refreshing' : 'Checking'} ${addresses.length.toLocaleString()} addresses ${isRefresh ? 'from the saved list' : 'directly with mempool.space'}…${details ? ` ${details}` : ''}`,
      );
      setNoticeTone('info');
      setProgress({
        completed: 0,
        total: addresses.length,
        queued: addresses.length,
        retrying: 0,
      });

      if (!isRefresh) {
        rowsByAddressRef.current = new Map();
        setRows([]);
        setTotalSats(0);
        setResultPage(0);
        setLastCheckedAt(null);
        checkedAddressesRef.current = addresses;
      }

      let nextIndex = 0;
      let completed = 0;
      let retrying = 0;
      let aggregate = isRefresh
        ? Array.from(rowsByAddressRef.current.values()).reduce(
            (sum, row) => sum + (row.totalSats ?? 0),
            0,
          )
        : 0;
      let pauseUntil = 0;

      const updateProgress = () => {
        setProgress({
          completed,
          total: addresses.length,
          queued: Math.max(0, addresses.length - completed),
          retrying,
        });
      };

      const workers = Array.from(
        { length: Math.min(REQUEST_CONCURRENCY, addresses.length) },
        async () => {
          while (!controller.signal.aborted) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= addresses.length) return;
            const address = addresses[index];
            try {
              const row = await fetchAddressBalance(
                address,
                controller.signal,
                (difference) => {
                  retrying = Math.max(0, retrying + difference);
                  updateProgress();
                },
                () => pauseUntil,
                (timestamp) => {
                  pauseUntil = Math.max(pauseUntil, timestamp);
                },
              );
              const previous = rowsByAddressRef.current.get(address);
              if (previous) aggregate -= previous.totalSats ?? 0;
              aggregate += row.totalSats ?? 0;
              rowsByAddressRef.current.set(address, row);
            } catch (error) {
              if (controller.signal.aborted) return;
              const message =
                error instanceof Error ? error.message : 'Address lookup failed.';
              const previous = rowsByAddressRef.current.get(address);
              rowsByAddressRef.current.set(
                address,
                isRefresh && previous
                  ? { ...previous, error: `Refresh failed: ${message}` }
                  : {
                      address,
                      confirmedSats: null,
                      unconfirmedSats: null,
                      totalSats: null,
                      txCount: null,
                      checkedAt: Date.now(),
                      error: message,
                    },
              );
            }

            completed += 1;
            updateProgress();
            setRows(Array.from(rowsByAddressRef.current.values()));
            setTotalSats(aggregate);
          }
        },
      );

      try {
        await Promise.all(workers);
      } finally {
        checkingRef.current = false;
        controllerRef.current = null;
        setChecking(false);
        setRows(Array.from(rowsByAddressRef.current.values()));
        setTotalSats(aggregate);
        setProgress({
          completed,
          total: addresses.length,
          queued: Math.max(0, addresses.length - completed),
          retrying: 0,
        });

        if (controller.signal.aborted) {
          setNotice(
            `Lookup stopped after ${completed.toLocaleString()} of ${addresses.length.toLocaleString()} addresses.`,
          );
          setNoticeTone('info');
        } else {
          const failed = Array.from(rowsByAddressRef.current.values()).filter(
            (row) => row.error,
          ).length;
          setLastCheckedAt(Date.now());
          setNotice(
            failed
              ? `Finished with ${failed.toLocaleString()} lookup errors. Retry later if the explorer is rate-limiting.${details ? ` ${details}` : ''}`
              : `Finished checking ${addresses.length.toLocaleString()} addresses.${details ? ` ${details}` : ''}`,
          );
          setNoticeTone(failed ? 'error' : 'success');
        }
      }
    },
    [],
  );
  lookupFunctionRef.current = runLookup;

  useEffect(() => {
    if (
      !active ||
      !autoRefresh ||
      lastCheckedAt === null ||
      checkedAddressesRef.current.length === 0 ||
      checkedAddressesRef.current.length > MAX_AUTO_REFRESH_ADDRESSES
    ) return;
    const dueAt = lastCheckedAt + AUTO_REFRESH_INTERVAL_MS;
    const timer = window.setTimeout(() => {
      if (
        !checkingRef.current &&
        checkedAddressesRef.current.length > 0 &&
        checkedAddressesRef.current.length <= MAX_AUTO_REFRESH_ADDRESSES
      ) {
        void lookupFunctionRef.current(checkedAddressesRef.current, true);
      }
    }, Math.max(0, dueAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [active, autoRefresh, lastCheckedAt]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        AUTO_REFRESH_STORAGE_KEY,
        autoRefresh ? 'true' : 'false',
      );
    } catch {
      // The preference remains active for this page visit if storage is blocked.
    }
  }, [autoRefresh]);

  const handleCheck = useCallback(async () => {
    if (checkingRef.current) return;
    const parsed = parseAddressText(addressText);
    if (parsed.addresses.length === 0) {
      setNotice(
        'Enter at least one valid mainnet Bitcoin address. Private keys and seed phrases are not accepted.',
      );
      setNoticeTone('error');
      return;
    }

    let storageWarning = '';
    try {
      window.localStorage.setItem(
        ADDRESS_STORAGE_KEY,
        JSON.stringify(parsed.addresses),
      );
    } catch {
      storageWarning =
        'The list was too large for local browser storage, but it will still be checked in this session.';
    }

    const details = [
      parsed.invalidCount > 0
        ? `${parsed.invalidCount.toLocaleString()} invalid line${parsed.invalidCount === 1 ? '' : 's'} skipped.`
        : '',
      parsed.duplicateCount > 0
        ? `${parsed.duplicateCount.toLocaleString()} duplicate address${parsed.duplicateCount === 1 ? '' : 'es'} skipped.`
        : '',
      parsed.excessCount > 0
        ? `${parsed.excessCount.toLocaleString()} additional valid address${parsed.excessCount === 1 ? '' : 'es'} skipped; this tool checks up to ${MAX_ADDRESSES} unique addresses per batch. Check the remainder separately.`
        : '',
      storageWarning,
    ]
      .filter(Boolean)
      .join(' ');
    await runLookup(parsed.addresses, false, details);
  }, [addressText, runLookup]);

  const handleFileSelect = useCallback(async (file: File) => {
    const sequence = fileReadSequenceRef.current + 1;
    fileReadSequenceRef.current = sequence;
    setSelectedFileName(file.name);
    setNotice(`Reading ${file.name} in this browser…`);
    setNoticeTone('info');
    try {
      const text = await file.text();
      if (fileReadSequenceRef.current !== sequence) return;
      setAddressText(text);
      setNotice(`${file.name} is ready. Review the addresses, then check them.`);
      setNoticeTone('success');
    } catch {
      if (fileReadSequenceRef.current !== sequence) return;
      setSelectedFileName('');
      setNotice('Could not read that file. Choose a plain text or CSV file.');
      setNoticeTone('error');
    }
  }, []);

  const handleStop = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const handleClear = useCallback(() => {
    controllerRef.current?.abort();
    stopScanner();
    fileReadSequenceRef.current += 1;
    setSelectedFileName('');
    setAddressText('');
    setRows([]);
    setTotalSats(0);
    setProgress({ completed: 0, total: 0, queued: 0, retrying: 0 });
    setResultPage(0);
    checkedAddressesRef.current = [];
    rowsByAddressRef.current = new Map();
    setLastCheckedAt(null);
    setNotice('');
    try {
      window.localStorage.removeItem(ADDRESS_STORAGE_KEY);
    } catch {
      setNotice('This browser did not allow the saved address list to be cleared.');
      setNoticeTone('error');
    }
  }, [stopScanner]);

  const handleCopyAddress = useCallback(async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setNotice('Bitcoin address copied.');
      setNoticeTone('success');
    } catch {
      setNotice('Clipboard access is unavailable in this browser.');
      setNoticeTone('error');
    }
  }, []);

  const handleExport = useCallback(
    (format: 'csv' | 'txt') => {
      const addresses =
        checkedAddressesRef.current.length > 0
          ? checkedAddressesRef.current
          : parseAddressText(addressText).addresses;
      if (addresses.length === 0) {
        setNotice('There are no valid addresses to export.');
        setNoticeTone('error');
        return;
      }
      const content =
        format === 'csv'
          ? `\uFEFF${addresses
              .map((address) => `"${address.replace(/"/g, '""')}"`)
              .join('\r\n')}`
          : `${addresses.join('\n')}\n`;
      const file = new Blob([content], {
        type:
          format === 'csv'
            ? 'text/csv;charset=utf-8;'
            : 'text/plain;charset=utf-8;',
      });
      const fileUrl = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = `bitcoin-addresses-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 0);
      setNotice(
        `Downloaded ${addresses.length.toLocaleString()} Bitcoin addresses only. No candidates or private keys were included.`,
      );
      setNoticeTone('success');
    },
    [addressText],
  );

  const handleStartScan = useCallback(() => {
    setScannerError('');
    setScannerOpen(true);
  }, []);

  const handleStopScan = useCallback(() => {
    stopScanner();
  }, [stopScanner]);

  const handleAutoRefreshChange = useCallback((enabled: boolean) => {
    setAutoRefresh(enabled);
  }, []);

  const handleAddressTextChange = useCallback((value: string) => {
    setSelectedFileName('');
    setAddressText(value);
  }, []);

  const autoRefreshStatus = !autoRefresh
    ? 'Paused'
    : checkedAddressesRef.current.length > MAX_AUTO_REFRESH_ADDRESSES
      ? `Limited to ${MAX_AUTO_REFRESH_ADDRESSES} addresses; this checked list has ${checkedAddressesRef.current.length.toLocaleString()}.`
    : lastCheckedAt === null
      ? `Every 20 min after the first check · up to ${MAX_AUTO_REFRESH_ADDRESSES} addresses`
      : `Every 20 min for all checked addresses · next ${formatRefreshTime(lastCheckedAt + AUTO_REFRESH_INTERVAL_MS)}`;

  return (
    <BalanceCheckerView
      addressText={addressText}
      maxAddresses={MAX_ADDRESSES}
      onAddressTextChange={handleAddressTextChange}
      onFileSelect={(file) => void handleFileSelect(file)}
      selectedFileName={selectedFileName}
      onCheck={() => void handleCheck()}
      onStop={handleStop}
      onClear={handleClear}
      checking={checking}
      progress={progress}
      rows={visibleRows}
      totalRows={rows.length}
      resultPage={resultPage}
      resultPageCount={resultPageCount}
      onResultPageChange={setResultPage}
      totalSats={totalSats}
      btcPriceUsd={btcPriceUsd}
      notice={notice}
      noticeTone={noticeTone}
      autoRefresh={autoRefresh}
      onAutoRefreshChange={handleAutoRefreshChange}
      autoRefreshStatus={autoRefreshStatus}
      onCopyAddress={(address) => void handleCopyAddress(address)}
      scannerOpen={scannerOpen}
      scannerSupported={scannerSupported}
      scannerError={scannerError}
      videoRef={videoRef}
      onStartScan={handleStartScan}
      onStopScan={handleStopScan}
      onExport={handleExport}
    />
  );
}
