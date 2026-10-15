import { useEffect } from 'react';
import { ArrowUpRight, Bitcoin, ExternalLink } from 'lucide-react';
import './bitcoin-puzzle.css';

const PUZZLE_URL = 'https://privatekeyfinder.io/bitcoin-puzzle';

export default function BitcoinPuzzlePage({ active }: { active: boolean }) {
  useEffect(() => {
    if (active) document.title = 'Bitcoin Puzzle | Vanity / BTC';
  }, [active]);

  return (
    <main className="puzzle-ref-page" data-testid="page-bitcoin-puzzle">
      <section className="puzzle-ref-intro" aria-labelledby="puzzle-ref-title">
        <div className="puzzle-ref-kicker">
          <Bitcoin aria-hidden="true" />
          Public puzzle reference
        </div>
        <h1 id="puzzle-ref-title">Bitcoin Puzzle Challenge</h1>
        <p>
          Open the published Bitcoin puzzle listing hosted by PrivateKeyFinder.
        </p>
      </section>

      <section className="puzzle-ref-card" aria-labelledby="puzzle-ref-card-title">
        <div className="puzzle-ref-card-icon" aria-hidden="true">
          <ExternalLink />
        </div>
        <div>
          <p className="puzzle-ref-label">THIRD-PARTY WEBSITE</p>
          <h2 id="puzzle-ref-card-title">PrivateKeyFinder</h2>
          <p className="puzzle-ref-copy">
            View the challenge details on the original site. It opens in a new
            tab; this app does not run key searches or check wallet balances.
          </p>
          <a
            className="puzzle-ref-link"
            href={PUZZLE_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-external-bitcoin-puzzle"
          >
            Open Bitcoin Puzzle
            <ArrowUpRight aria-hidden="true" />
          </a>
          <p className="puzzle-ref-note">
            External link: privatekeyfinder.io
          </p>
        </div>
      </section>
    </main>
  );
}
