import { useRef, useState, type FormEvent } from 'react';
import './finder.css';

export default function FinderPage() {
  const [xpub, setXpub] = useState('');
  const [startIndex, setStartIndex] = useState('0');
  const [endIndex, setEndIndex] = useState('1000');
  const [startRange, setStartRange] = useState('0');
  const [endRange, setEndRange] = useState('0');
  const [targetAddress, setTargetAddress] = useState('');
  const [format, setFormat] = useState<'legacy' | 'segwit'>('legacy');
  const [status, setStatus] = useState('Ready');
  const [progress, setProgress] = useState<{ index: number; address: string; keysPerSecond: number } | null>(null);
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

    // هنا كنصيفطو الـ Range و الـ Format للـ Worker
    worker.postMessage({
      xpub,
      startIndex: Number(startIndex),
      endIndex: Number(endIndex),
      startRange: Number(startRange),
      endRange: Number(endRange),
      targetAddress,
      format,
    });
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
              <input type="number" min="0" step="1" value={startIndex} onChange={(e) => setStartIndex(e.target.value)} disabled={searching} required />
            </label>
            <label className="finder-field">
              <span>End index</span>
              <input type="number" min="0" step="1" value={endIndex} onChange={(e) => setEndIndex(e.target.value)} disabled={searching} required />
            </label>
          </div>

          <div className="finder-index-row">
            <label className="finder-field">
              <span>Start Range (optional)</span>
              <input type="number" min="0" step="1" value={startRange} onChange={(e) => setStartRange(e.target.value)} disabled={searching} placeholder="0" />
            </label>
            <label className="finder-field">
              <span>End Range (optional)</span>
              <input type="number" min="0" step="1" value={endRange} onChange={(e) => setEndRange(e.target.value)} disabled={searching} placeholder="0" />
            </label>
          </div>

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

          <label className="finder-field">
            <span>Address format</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as 'legacy' | 'segwit')} disabled={searching}>
              <option value="legacy">Legacy (1...)</option>
              <option value="segwit">Native SegWit (bc1q...)</option>
            </select>
          </label>

          <button className="primary-button" type="submit">
            {searching ? 'Stop search' : 'Find address index'}
          </button>
        </form>

        <div className="finder-status" role="status" aria-live="polite">
          <strong>{status}</strong>
          {progress && searching && (
            <span>
              Index {progress.index.toLocaleString()} · {progress.keysPerSecond.toLocaleString()} addresses/sec
            </span>
          )}
          {error && <p className="finder-error">{error}</p>}
        </div>

        {match && (
          <div className="finder-match">
            <div className="section-kicker">Address found</div>
            <p><strong>Index:</strong> {match.index.toLocaleString()}</p>
            <p className="finder-match-address">{match.address}</p>
            
            {match.privateKeyWif && (
              <div style={{ marginTop: '10px', padding: '15px', background: '#064e3b', border: '1px solid #22c55e', borderRadius: '8px' }}>
                <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold' }}>✅ Private Key (WIF):</p>
                <code style={{ wordBreak: 'break-all', color: 'white', fontSize: '14px' }}>{match.privateKeyWif}</code>
                <p style={{ margin: '15px 0 0 0', color: '#4ade80', fontWeight: 'bold' }}>Private Key (HEX):</p>
                <code style={{ wordBreak: 'break-all', color: 'white', fontSize: '14px' }}>{match.privateKeyHex}</code>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
              }
