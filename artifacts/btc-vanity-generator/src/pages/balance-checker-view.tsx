import { useId, type ChangeEvent, type RefObject } from 'react';
import {
  Activity,
  Camera,
  Check,
  CircleAlert,
  Copy,
  Download,
  FileUp,
  LockKeyhole,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Square,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import './balance-checker-view.css';

export type BalanceRow = {
  address: string;
  confirmedSats: number | null;
  unconfirmedSats: number | null;
  totalSats: number | null;
  txCount: number | null;
  checkedAt: number | null;
  error?: string;
};

export type BalanceCheckerViewProps = {
  addressText: string;
  maxAddresses: number;
  onAddressTextChange: (value: string) => void;
  onFileSelect: (file: File) => void;
  selectedFileName: string;
  onCheck: () => void;
  onStop: () => void;
  onClear: () => void;
  checking: boolean;
  progress: { completed: number; total: number; queued: number; retrying: number };
  rows: BalanceRow[];
  totalRows: number;
  resultPage: number;
  resultPageCount: number;
  onResultPageChange: (page: number) => void;
  totalSats: number;
  btcPriceUsd: number | null;
  notice: string;
  noticeTone: 'info' | 'error' | 'success';
  autoRefresh: boolean;
  onAutoRefreshChange: (value: boolean) => void;
  autoRefreshStatus: string;
  onCopyAddress: (address: string) => void;
  scannerOpen: boolean;
  scannerSupported: boolean;
  scannerError: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  onStartScan: () => void;
  onStopScan: () => void;
  onExport: (format: 'csv' | 'txt') => void;
};

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function formatBtc(sats: number | null): string {
  if (sats === null || !Number.isFinite(sats)) return '—';
  return `${(sats / 100_000_000).toFixed(8)} BTC`;
}

function formatUsd(sats: number | null, price: number | null): string {
  if (sats === null || price === null || !Number.isFinite(price)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format((sats / 100_000_000) * price);
}

function formatCheckedAt(timestamp: number | null): string {
  if (timestamp === null || !Number.isFinite(timestamp)) return '—';
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp);
}

export default function BalanceCheckerView({
  addressText,
  maxAddresses,
  onAddressTextChange,
  onFileSelect,
  selectedFileName,
  onCheck,
  onStop,
  onClear,
  checking,
  progress,
  rows,
  totalRows,
  resultPage,
  resultPageCount,
  onResultPageChange,
  totalSats,
  btcPriceUsd,
  notice,
  noticeTone,
  autoRefresh,
  onAutoRefreshChange,
  autoRefreshStatus,
  onCopyAddress,
  scannerOpen,
  scannerSupported,
  scannerError,
  videoRef,
  onStartScan,
  onStopScan,
  onExport,
}: BalanceCheckerViewProps) {
  const fileInputId = useId();
  const progressPercent =
    progress.total > 0
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : 0;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) onFileSelect(file);
    event.currentTarget.value = '';
  };

  return (
    <main className="balance-page" data-testid="page-balance-checker">
      <div className="balance-content">
        <section className="balance-intro" aria-labelledby="balance-title">
          <div className="balance-eyebrow"><span>UTILITY 02</span> · ON-CHAIN LOOKUP</div>
          <div className="balance-title-row">
            <div>
              <h1 id="balance-title">Balance checker<span>.</span></h1>
              <p>Inspect public Bitcoin addresses. Nothing asks for, or needs, a private key.</p>
            </div>
            <div className="balance-privacy-stamp" aria-label="Public addresses only">
              <ShieldCheck aria-hidden="true" />
              <span>PUBLIC DATA<br /><strong>ONLY</strong></span>
            </div>
          </div>
        </section>

        <section className="balance-workspace" aria-label="Address lookup controls">
          <div className="balance-panel balance-input-panel">
            <div className="balance-panel-heading">
              <div className="balance-step">01</div>
              <div>
                <h2>Addresses to inspect</h2>
                <p>Up to {maxAddresses} unique valid addresses per batch. Paste one per line or import text/CSV.</p>
              </div>
              <span className="balance-input-count" data-testid="text-address-input-count">
                {numberFormat.format(addressText.split(/\r?\n/).filter((line) => line.trim()).length)} input lines · {maxAddresses} max
              </span>
            </div>

            <label className="balance-sr-only" htmlFor="balance-addresses">Bitcoin addresses</label>
            <textarea
              id="balance-addresses"
              className="balance-address-input"
              data-testid="input-balance-addresses"
              value={addressText}
              onChange={(event) => onAddressTextChange(event.currentTarget.value)}
              placeholder={'Paste Bitcoin addresses here…\nOne address per line'}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-describedby="balance-input-hint"
            />
            <div className="balance-input-foot">
              <p id="balance-input-hint">Only public addresses are sent to mempool.space. No API key is needed; public rate limits can slow large batches. Never paste a seed phrase or private key.</p>
              <input
                id={fileInputId}
                className="balance-file-input"
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                onChange={handleFileChange}
                data-testid="input-address-file"
                aria-label="Choose a text or CSV address file"
              />
              <label className="balance-file-button" htmlFor={fileInputId} data-testid="button-select-address-file">
                <FileUp aria-hidden="true" />
                <span>{selectedFileName || 'Choose file'}</span>
              </label>
            </div>

            <div className="balance-primary-actions">
              {checking ? (
                <button className="balance-button balance-button-stop" type="button" onClick={onStop} data-testid="button-stop-check">
                  <Square aria-hidden="true" /> Stop lookup
                </button>
              ) : (
                <button className="balance-button balance-button-primary" type="button" onClick={onCheck} data-testid="button-check-balances">
                  <Activity aria-hidden="true" /> Check balances
                </button>
              )}
              <button className="balance-button balance-button-quiet" type="button" onClick={onClear} data-testid="button-clear-addresses">
                <Trash2 aria-hidden="true" /> Clear
              </button>
              <button
                className={`balance-button balance-button-quiet balance-scan-trigger${scannerOpen ? ' is-open' : ''}`}
                type="button"
                onClick={scannerOpen ? onStopScan : onStartScan}
                disabled={!scannerSupported && !scannerOpen}
                data-testid="button-toggle-scanner"
                aria-expanded={scannerOpen}
              >
                {scannerOpen ? <X aria-hidden="true" /> : <Camera aria-hidden="true" />}
                {scannerOpen ? 'Close scanner' : 'Scan QR'}
              </button>
            </div>

            {scannerOpen && (
              <section className="balance-scanner" aria-label="Camera address scanner" data-testid="region-address-scanner">
                <div className="balance-scanner-top">
                  <div><ScanLine aria-hidden="true" /><strong>Camera scanner</strong></div>
                  <button type="button" className="balance-icon-button" onClick={onStopScan} aria-label="Stop camera scanner" data-testid="button-stop-scanner">
                    <X aria-hidden="true" />
                  </button>
                </div>
                {scannerSupported ? (
                  <video ref={videoRef} className="balance-video" autoPlay muted playsInline data-testid="video-address-scanner" aria-label="Live camera preview" />
                ) : (
                  <div className="balance-scanner-unavailable" data-testid="status-scanner-unsupported">
                    Camera scanning is not available in this browser.
                  </div>
                )}
                {scannerError && <p className="balance-scanner-error" role="alert" data-testid="status-scanner-error">{scannerError}</p>}
                <p className="balance-scanner-caption">Point the camera at a Bitcoin address QR code.</p>
              </section>
            )}
            {!scannerSupported && scannerError && !scannerOpen && (
              <p className="balance-scanner-error" role="status" data-testid="status-scanner-support">{scannerError}</p>
            )}
          </div>

          <aside className="balance-side-column" aria-label="Lookup status and options">
            <section className="balance-panel balance-total-card" data-testid="card-total-balance">
              <div className="balance-total-label"><Wallet aria-hidden="true" /> AGGREGATE BALANCE</div>
              <div className="balance-total-btc" data-testid="text-total-btc">{formatBtc(totalSats)}</div>
              <div className="balance-total-usd" data-testid="text-total-usd">{formatUsd(totalSats, btcPriceUsd)}</div>
              <div className="balance-total-rule" />
              <div className="balance-total-foot">
                <span>Addresses checked</span>
                <strong data-testid="text-checked-count">{numberFormat.format(progress.completed)}</strong>
              </div>
            </section>

            <section className="balance-panel balance-progress-panel" aria-label="Lookup progress">
              <div className="balance-mini-heading">
                <span className="balance-section-index">02</span>
                <h2>Lookup status</h2>
                <span className={`balance-state ${checking ? 'is-running' : ''}`} data-testid="status-lookup">
                  <i />{checking ? 'RUNNING' : rows.length ? 'UPDATED' : 'READY'}
                </span>
              </div>
              <div className="balance-progress-count">
                <strong data-testid="text-progress-count">{numberFormat.format(progress.completed)}</strong>
                <span> / {numberFormat.format(progress.total)} completed</span>
              </div>
              <div
                className="balance-progress-track"
                role="progressbar"
                aria-label="Addresses checked"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={Math.min(progress.completed, progress.total)}
                data-testid="progress-addresses"
              >
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="balance-queue-stats">
                <span><i className="queue-dot" />Queued <b data-testid="text-queued-count">{numberFormat.format(progress.queued)}</b></span>
                <span><i className="retry-dot" />Retrying <b data-testid="text-retrying-count">{numberFormat.format(progress.retrying)}</b></span>
              </div>
            </section>

            <section className="balance-panel balance-refresh-panel">
              <div className="balance-refresh-copy">
                <div className="balance-refresh-icon"><RefreshCw aria-hidden="true" /></div>
                <div>
                  <h2>Auto-refresh</h2>
                  <p data-testid="status-auto-refresh">{autoRefreshStatus || (autoRefresh ? 'Enabled' : 'Paused')}</p>
                </div>
              </div>
              <label className="balance-switch" data-testid="control-auto-refresh">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(event) => onAutoRefreshChange(event.currentTarget.checked)}
                  aria-label="Enable automatic balance refresh"
                  data-testid="input-auto-refresh"
                />
                <span className="balance-switch-track" aria-hidden="true"><i /></span>
              </label>
            </section>
          </aside>
        </section>

        {notice && (
          <div className={`balance-notice tone-${noticeTone}`} role={noticeTone === 'error' ? 'alert' : 'status'} data-testid="status-balance-notice">
            {noticeTone === 'error' ? <CircleAlert aria-hidden="true" /> : noticeTone === 'success' ? <Check aria-hidden="true" /> : <Activity aria-hidden="true" />}
            <span>{notice}</span>
          </div>
        )}

        <section className="balance-panel balance-results-panel" aria-labelledby="results-title">
          <div className="balance-results-heading">
            <div className="balance-results-title">
              <div className="balance-step">03</div>
              <div>
                <h2 id="results-title">Address results</h2>
                <p data-testid="text-result-count">{totalRows === 1 ? '1 address' : `${numberFormat.format(totalRows)} addresses`} · public on-chain data</p>
              </div>
            </div>
            <div className="balance-export-actions" role="group" aria-label="Export addresses">
              <span>EXPORT ADDRESSES</span>
              <button type="button" onClick={() => onExport('csv')} data-testid="button-export-csv"><Download aria-hidden="true" /> CSV</button>
              <button type="button" onClick={() => onExport('txt')} data-testid="button-export-txt"><Download aria-hidden="true" /> TXT</button>
            </div>
          </div>

          <div className="balance-table-wrap" data-testid="region-balance-results">
            <table className="balance-table">
              <thead>
                <tr>
                  <th scope="col">Address</th>
                  <th scope="col">Confirmed</th>
                  <th scope="col">Unconfirmed</th>
                  <th scope="col">Total balance</th>
                  <th scope="col">Transactions</th>
                  <th scope="col">Checked</th>
                  <th scope="col"><span className="balance-sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="balance-empty-state" data-testid="empty-balance-results">
                        <div className="balance-empty-mark"><Wallet aria-hidden="true" /></div>
                        <strong>No addresses checked yet</strong>
                        <span>Add public addresses above, then run a lookup to see balances here.</span>
                      </div>
                    </td>
                  </tr>
                ) : rows.map((row, index) => (
                  <tr key={`${row.address}-${index}`} data-testid={`row-balance-${index}`}>
                    <td className="balance-address-cell">
                      <code title={row.address}>{row.address}</code>
                      {row.error && <span className="balance-row-error" data-testid={`status-row-error-${index}`}><CircleAlert aria-hidden="true" />{row.error}</span>}
                    </td>
                    <td><span className="balance-cell-value">{formatBtc(row.confirmedSats)}</span></td>
                    <td><span className="balance-cell-value">{formatBtc(row.unconfirmedSats)}</span></td>
                    <td>
                      <span className="balance-cell-value balance-strong">{formatBtc(row.totalSats)}</span>
                      <span className="balance-cell-sub">{formatUsd(row.totalSats, btcPriceUsd)}</span>
                    </td>
                    <td>{row.txCount === null ? '—' : numberFormat.format(row.txCount)}</td>
                    <td>{formatCheckedAt(row.checkedAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="balance-copy-button"
                        onClick={() => onCopyAddress(row.address)}
                        aria-label={`Copy address ${row.address}`}
                        title="Copy address"
                        data-testid={`button-copy-address-${index}`}
                      ><Copy aria-hidden="true" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {resultPageCount > 1 && (
            <nav className="balance-pagination" aria-label="Address results pages" data-testid="nav-result-pagination">
              <button
                type="button"
                className="balance-page-button"
                onClick={() => onResultPageChange(resultPage - 1)}
                disabled={resultPage <= 1}
                aria-label="Go to previous results page"
                data-testid="button-results-previous"
              >
                Previous
              </button>
              <span className="balance-page-indicator" aria-live="polite" data-testid="text-results-page">
                Page <strong>{numberFormat.format(resultPage)}</strong> of {numberFormat.format(resultPageCount)}
              </span>
              <button
                type="button"
                className="balance-page-button"
                onClick={() => onResultPageChange(resultPage + 1)}
                disabled={resultPage >= resultPageCount}
                aria-label="Go to next results page"
                data-testid="button-results-next"
              >
                Next
              </button>
            </nav>
          )}
          <div className="balance-table-footer">
            <span><LockKeyhole aria-hidden="true" /> Balance lookups use public addresses only.</span>
            <span data-testid="text-results-total">{totalRows ? `${numberFormat.format(totalRows)} ${totalRows === 1 ? 'result' : 'results'}` : 'Waiting for lookup'}</span>
          </div>
        </section>

        <footer className="balance-footer">
          <span><ShieldCheck aria-hidden="true" /> Your private keys never leave this browser.</span>
          <span>Balances are informational and may change as the network updates.</span>
        </footer>
      </div>
    </main>
  );
}
