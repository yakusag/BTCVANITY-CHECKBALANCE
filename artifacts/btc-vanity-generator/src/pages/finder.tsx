import { useRef, useState, type FormEvent } from 'react';
import './finder.css';

export default function FinderPage() {
  const [startHex, setStartHex] = useState('1');
  const [endHex, setEndHex] = useState('FFFFF');
  const [targetAddress, setTargetAddress] = useState('');
  const [status, setStatus] = useState('Ready');
  const [progress, setProgress] = useState<{ index: string; address: string; keysPerSecond: number } | null>(null);
  const [match, setMatch] = useState<any>(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searching) {
      workerRef.current?.terminate();
      setSearching(false);
      setStatus('Search stopped');
      return;
    }

    setSearching(true);
    setStatus('Searching...');
    setError('');
    setMatch(null);
    setProgress(null);

    const worker = new Worker(new URL('../lib/finder.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const message = event.data;
      if (message.type === 'progress') {
        setProgress({ index: message.index, address: message.address, keysPerSecond: message.keysPerSecond });
      } else if (message.type === 'found') {
        setMatch(message.result);
        setStatus('Match found!');
        setSearching(false);
        worker.terminate();
      } else if (message.type === 'exhausted') {
        setStatus('Search complete — no match found');
        setSearching(false);
        worker.terminate();
      } else if (message.type === 'error') {
        setError(message.message);
        setStatus('Search could not start');
        setSearching(false);
        worker.terminate();
      }
    };

    worker.postMessage({
      startHex,
      endHex,
      targetAddress,
    });
  }

  return (
    <main className="page-wrap finder-page">
      <section className="intro">
        <div className="eyebrow">BITCOIN ADDRESS FINDER (BRUTE FORCE)</div>
        <h1>Find Private Key by Address</h1>
        <p className="intro-copy">
          Search a specific range of private keys to find the matching address.
        </p>
      </section>

      <section className="panel finder-panel" aria-label="Address finder">
        <form className="finder-form" onSubmit={handleSearch}>
          <label className="finder-field">
            <span>Address to find</span>
            <input
              autoComplete="off"
              spellCheck={false}
              value={targetAddress}
              onChange={(event) => setTargetAddress(event.target.value)}
              placeholder="1... or bc1q..."
              disabled={searching}
              required
            />
          </label>

          <div className="finder-index-row">
            <label className="finder-field">
              <span>Start Key (Hex)</span>
              <input type="text" value={startHex} onChange={(e) => setStartHex(e.target.value)} disabled={searching} required />
            </label>
            <label className="finder-field">
              <span>End Key (Hex)</span>
              <input type="text" value={endHex} onChange={(e) => setEndHex(e.target.value)} disabled={searching} required />
            </label>
          </div>

          <button className="primary-button" type="submit">
            {searching ? 'Stop search' : 'Start Search'}
          </button>
        </form>

        <div className="finder-status" role="status" aria-live="polite">
          <strong>{status}</strong>
          {progress && searching && (
            <span>
              Key: {progress.index} · {progress.keysPerSecond.toLocaleString()} keys/sec
            </span>
          )}
          {error && <p className="finder-error">{error}</p>}
        </div>

        {match && (
          <div className="finder-match">
            <div className="section-kicker">✅ Found!</div>
            <p><strong>Address:</strong> {match.address}</p>
            <p><strong>Private Key (Hex):</strong> {match.privateKeyHex}</p>
            <p><strong>Private Key (WIF):</strong> {match.privateKeyWif}</p>
          </div>
        )}
      </section>
    </main>
  );
}
