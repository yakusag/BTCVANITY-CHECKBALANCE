import { useEffect } from 'react';
import {
  ArrowUpRight,
  Bitcoin,
  Check,
  CircleAlert,
  ExternalLink,
  Layers3,
} from 'lucide-react';
import './bitcoin-puzzle.css';

const PUZZLE_URL = 'https://privatekeyfinder.io/bitcoin-puzzle';

const puzzleStats = [
  { label: 'Total puzzles', value: '160', icon: Layers3, tone: 'orange' },
  { label: 'Solved', value: '83', icon: Check, tone: 'green' },
  { label: 'Unsolved', value: '77', icon: CircleAlert, tone: 'blue' },
] as const;

export default function BitcoinPuzzlePage({ active }: { active: boolean }) {
  useEffect(() => {
    if (active) document.title = 'Bitcoin Puzzle | Vanity / BTC';
  }, [active]);

  return (
    <main className="puzzle-ref-page" data-testid="page-bitcoin-puzzle">
      <section className="puzzle-ref-intro" aria-labelledby="puzzle-ref-title">
        <div className="puzzle-ref-kicker">
          <Bitcoin aria-hidden="true" />
          Public challenge index
        </div>
        <h1 id="puzzle-ref-title">Bitcoin Puzzle Challenge</h1>
        <p>
          A quick overview of the public Bitcoin puzzle challenge. The source
          site hosts the current puzzle entries and progress.
        </p>
      </section>

      <section className="puzzle-ref-stats" aria-label="Puzzle counts reported by the source">
        {puzzleStats.map(({ label, value, icon: Icon, tone }) => (
          <article className="puzzle-ref-stat" key={label}>
            <div className={`puzzle-ref-stat-icon is-${tone}`}>
              <Icon aria-hidden="true" />
            </div>
            <div>
              <p>{label}</p>
              <strong>{value}</strong>
            </div>
          </article>
        ))}
      </section>

      <section className="puzzle-ref-board" aria-labelledby="puzzle-ref-board-title">
        <div className="puzzle-ref-board-head">
          <div>
            <p className="puzzle-ref-label">PUZZLE INDEX</p>
            <h2 id="puzzle-ref-board-title">Explore the challenge list</h2>
          </div>
          <span className="puzzle-ref-source-badge">
            <span aria-hidden="true" />
            Source-hosted
          </span>
        </div>
        <p className="puzzle-ref-copy">
          The listing and its addresses, ranges, and status are maintained on
          PrivateKeyFinder. Open the source for the latest entries.
        </p>
        <div className="puzzle-ref-columns" aria-hidden="true">
          <span>Puzzle details</span>
          <span>Status</span>
          <span>Source</span>
        </div>
        <div className="puzzle-ref-source-card">
          <div className="puzzle-ref-card-icon" aria-hidden="true">
            <ExternalLink />
          </div>
          <div className="puzzle-ref-source-copy">
            <h3>View the live Bitcoin puzzle index</h3>
            <p>
              This page is a visual overview only; it does not search key
              ranges or check wallet balances.
            </p>
          </div>
          <a
            className="puzzle-ref-link"
            href={PUZZLE_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-external-bitcoin-puzzle"
          >
            Open source
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
        <p className="puzzle-ref-note">
          Counts shown above are a snapshot from PrivateKeyFinder and may change.
        </p>
      </section>
    </main>
  );
}
