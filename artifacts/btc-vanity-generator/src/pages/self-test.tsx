import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  deriveBitcoinAddress,
  parsePrivateKeyHex,
} from '@/lib/bitcoin';

type SelfTestResult = {
  passed: boolean;
  message: string;
};

export default function SelfTestPage() {
  const [result, setResult] = useState<SelfTestResult | null>(null);

  function runSelfTest() {
    try {
      const testVector = deriveBitcoinAddress(
        parsePrivateKeyHex('1'),
        'legacy',
      );
      const addressPassed =
        testVector.address === '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH';
      const wifPassed =
        testVector.privateKeyWif ===
        'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn';

      setResult({
        passed: addressPassed && wifPassed,
        message: addressPassed && wifPassed
          ? 'Self-test passed: address and WIF match the known test vector.'
          : `Self-test failed: address ${addressPassed ? 'passed' : 'failed'}, WIF ${wifPassed ? 'passed' : 'failed'}.`,
      });
    } catch (error) {
      setResult({
        passed: false,
        message: `Self-test could not complete: ${error instanceof Error ? error.message : 'Unexpected error.'}`,
      });
    }
  }

  return (
    <main className="page-wrap">
      <section className="intro">
        <div className="eyebrow">Local diagnostics</div>
        <h1>Self-test</h1>
        <p className="intro-copy">
          Check the address and WIF conversion against a known test vector.
          This runs locally in your browser and does not search for keys.
        </p>
      </section>

      <section className="self-test-page" aria-label="Bitcoin conversion self-test">
        <div className="panel self-test-panel">
          <div className="section-kicker">
            <span className="step-number">01</span>
            Verify address conversion
          </div>
          <p className="subhead">
            The test compares the generated address and WIF with expected values.
          </p>
          <button
            className="small-button"
            type="button"
            onClick={runSelfTest}
            data-testid="button-run-self-test"
          >
            <ShieldCheck aria-hidden="true" /> Run self-test
          </button>
          {result && (
            <p
              className={`self-test-result ${result.passed ? 'is-passed' : 'is-failed'}`}
              role="status"
              data-testid="status-self-test"
            >
              {result.message}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
