import { useState, type FormEvent } from 'react';
import { searchHDAddresses, type AddressFormat } from '@/lib/bitcoin';

import './finder.css';

export default function FinderPage() {
  const [xpub, setXpub] = useState('');
  const [startIndex, setStartIndex] = useState('0');
  const [endIndex, setEndIndex] = useState('1000');
  const [targetAddress, setTargetAddress] = useState('');
  const [format, setFormat] = useState<AddressFormat>('legacy');
  const [status, setStatus] = useState('Ready');
  const [progress, setProgress] = useState<{ index: number; speed: number } | null>(null);
  const [match, setMatch] = useState<{ index: number; address: string; privateKeyWif?: string; privateKeyHex?: string } | null>(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searching) return;

    setSearching(true);
    setStatus('Searching...');
    setError('');
    setMatch(null);
    setProgress(null);

    try {
      const found = await searchHDAddresses(
        xpub,
        Number(startIndex),
        Number(endIndex),
        targetAddress,
        format,
        (index, _addr, speed) => setProgress({ index, speed }),
        (result) => setMatch(result)
      );
      
      if (!found) {
        setStatus('Search complete — no match found');
      } else {
        setStatus('Match found!');
      }
    } catch (searchError) {
      setStatus('Search could not start');
      setError(searchError instanceof Error ? searchError.message : 'An unexpected error occurred.');
    } finally {
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
            <select 
              value={format} 
              onChange={(e) => setFormat(e.target.value as AddressFormat)}
              disabled={searching}
              style={{ padding: '10px', background: '#111113', color: 'white', border: '1px solid #333', borderRadius: '5px' }}
            >
              <option value="legacy">Legacy (1...)</option>
              <option value="segwit">Native SegWit (bc1q...)</option>
            </select>
          </label>

          <button className="primary-button" type="submit" disabled={searching}>
            {searching ? 'Searching...' : 'Find address index'}
          </button>
        </form>

        <div className="finder-status" role="status" aria-live="polite">
          <strong>{status}</strong>
          {progress && searching && (
            <span>
              Index {progress.index.toLocaleString()} · {progress.speed.toLocaleString()} addresses/sec
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
              <div style={{ marginTop: '10px', padding: '10px', background: '#064e3b', border: '1px solid #22c55e', borderRadius: '5px' }}>
                <p style={{ margin: 0, color: '#4ade80' }}><strong>Private Key (WIF):</strong></p>
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
