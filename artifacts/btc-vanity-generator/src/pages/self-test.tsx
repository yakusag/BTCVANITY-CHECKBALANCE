import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  deriveBitcoinAddress,
  parsePrivateKeyHex,
} from '@/lib/bitcoin';

type SelfTestResult = {
  passed: boolean;
  addressPassed: boolean;
  address: string;
  expectedAddress: string;
  wifPassed: boolean;
  error?: string;
};

const EXPECTED_ADDRESS = '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH';
const EXPECTED_WIF = 'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn';

export default function SelfTestPage() {
  const [result, setResult] = useState<SelfTestResult | null>(null);

  function runSelfTest() {
    try {
      const testVector = deriveBitcoinAddress(
        parsePrivateKeyHex('1'),
        'legacy',
      );
      const addressPassed = testVector.address === EXPECTED_ADDRESS;
      const wifPassed = testVector.privateKeyWif === EXPECTED_WIF;

      setResult({
        passed: addressPassed && wifPassed,
        addressPassed,
        address: testVector.address,
        expectedAddress: EXPECTED_ADDRESS,
        wifPassed,
      });
    } catch (error) {
      setResult({
        passed: false,
        addressPassed: false,
        address: 'Unavailable',
        expectedAddress: EXPECTED_ADDRESS,
        wifPassed: false,
        error: error instanceof Error ? error.message : 'Unexpected error.',
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
            <div
              className={`self-test-details ${result.passed ? 'is-passed' : 'is-failed'}`}
              data-testid="panel-self-test-result"
            >
              <div className="self-test-summary" role="status" data-testid="status-self-test">
                <span className="self-test-badge">{result.passed ? 'PASS' : 'FAIL'}</span>
                <span>{result.passed ? 'All checks match the known test vector.' : 'One or more checks need attention.'}</span>
              </div>
              {result.error ? (
                <p className="self-test-error">{result.error}</p>
              ) : (
                <>
                  <div className="self-test-check">
                    <div className="self-test-check-heading">
                      <strong>Bitcoin address</strong>
                      <span className="self-test-check-status">{result.addressPassed ? 'PASS' : 'FAIL'}</span>
                    </div>
                    <dl className="self-test-values">
                      <div><dt>Actual</dt><dd>{result.address}</dd></div>
                      <div><dt>Expected</dt><dd>{result.expectedAddress}</dd></div>
                    </dl>
                  </div>
                  <div className="self-test-check">
                    <div className="self-test-check-heading">
                      <strong>WIF conversion</strong>
                      <span className="self-test-check-status">{result.wifPassed ? 'PASS' : 'FAIL'}</span>
                    </div>
                    <p className="self-test-wif-note">
                      {result.wifPassed ? 'Generated value matches the expected test vector.' : 'Generated value does not match the expected test vector.'}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
