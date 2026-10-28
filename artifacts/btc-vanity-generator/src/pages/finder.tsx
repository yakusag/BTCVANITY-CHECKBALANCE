import { useRef, useState, type FormEvent } from 'react';
import {
  findHdAddressByXpub,
  type HdAddressMatch,
  type HdAddressProgress,
} from '@/lib/hd-address-finder';

import './finder.css';

export default function FinderPage() {
  const [xpub, setXpub] = useState('');
  const [startIndex, setStartIndex] = useState('0');
  const [endIndex, setEndIndex] = useState('1000');
  const [targetAddress, setTargetAddress] = useState('');
  const [status, setStatus] = useState('Ready');
  const [progress, setProgress] = useState<HdAddressProgress | null>(null);
  const [match, setMatch] = useState<HdAddressMatch | null>(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const abortController = useRef<AbortController | null>(null);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searching) {
      abortController.current?.abort();
      return;
    }

    const controller = new AbortController();
    abortController.current = controller;
    setSearching(true);
    setStatus('Searching...');
    setError('');
    setMatch(null);
    setProgress(null);

    try {
      const result = await findHdAddressByXpub({
        xpub,
        startIndex: Number(startIndex),
        endIndex: Number(endIndex),
        targetAddress,
        signal: controller.signal,
        onProgress: setProgress,
      });
      setMatch(result);
      setStatus(result ? `Match found at index ${result.index}` : 'Search complete — no match found');
    } catch (searchError) {
      if (controller.signal.aborted) {
        setStatus('Search stopped');
      } else {
        setStatus('Search could not start');
        setError(
          searchError instanceof Error
            ? searchError.message
            : 'An unexpected error occurred.',
        );
      }
    } finally {
      abortController.current = null;
      setSearching(false);
    }
  }

  return (
    <main className="page-wrap finder-page">
      <section className="intro">
        <div className="eyebrow">BIP32 ADDRESS INDEX</div>
        <h1>Find an address in your xpub/xprv</h1>
        <p className="intro-copy">
          Check a limited range of addresses derived from a master key. Your key stays in this browser.
        </p>
      </section>

      <section className="panel finder-panel" aria-label="HD address finder">
        <form className="finder-form" onSubmit={handleSearch}>
          <label className="finder-field">
            <span>Extended Public/Private Key (xpub/xprv)</span>
            <input
              autoComplete="off"
              spellCheck={false}
              value={xpub}
              onChange={(event) => setXpub(event.target.value)}
              placeholder="xpub... or xprv..."
              disabled={searching}
              required
            />
          </label>

          <div className="finder-index-row">
            <label className="finder-field">
              <span>Start index</span>
              <input
                type="number"
                min="0"
                step="1"
                value={startIndex}
                onChange={(event) => setStartIndex(event.target.value)}
                disabled={searching}
                required
              />
            </label>
            <label className="finder-field">
              <span>End index</span>
              <input
                type="number"
                min="0"
                step="1"
                value={endIndex}
                onChange={(event) => setEndIndex(event.target.value)}
                disabled={searching}
                required
              />
            </label>
          </div>

          <label className="finder-field">
            <span>Legacy address to find</span>
            <input
              autoComplete="off"
              spellCheck={false}
              value={targetAddress}
              onChange={(event) => setTargetAddress(event.target.value)}
              placeholder="1..."
              disabled={searching}
              required
            />
          </label>

          <p className="finder-note">
            Searches the path <code>m/0/0/index</code>. If you use an xprv (private key), the app will display the private key (WIF) if it finds a match.
          </p>

          <button className="primary-button" type="submit">
            {searching ? 'Stop search' : 'Find address index'}
          </button>
        </form>

        <div className="finder-status" role="status" aria-live="polite">
          <strong>{status}</strong>
          {progress && searching && (
            <span>
              Index {progress.index.toLocaleString()} ·{' '}
              {progress.keysPerSecond.toLocaleString()} addresses/sec
            </span>
          )}
          {error && <p className="finder-error">{error}</p>}
        </div>

        {match && (
          <div className="finder-match">
            <div className="section-kicker">Address found</div>
            <p>
              <strong>Index:</strong> {match.index.toLocaleString()}
            </p>
            <p className="finder-match-address">{match.address}</p>
            
            {match.privateKeyWif && (
              <div style={{ marginTop: '10px', padding: '10px', background: '#064e3b', border: '1px solid #22c55e', borderRadius: '5px' }}>
                <p style={{ margin: 0, color: '#4ade80' }}><strong>✅ Private Key (WIF):</strong></p>
                <code style={{ wordBreak: 'break-all', color: 'white' }}>{match.privateKeyWif}</code>
                
                <p style={{ margin: '10px 0 0 0', color: '#4ade80' }}><strong>Private Key (HEX):</strong></p>
                <code style={{ wordBreak: 'break-all', color: 'white' }}>{match.privateKeyHex}</code>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
  }
