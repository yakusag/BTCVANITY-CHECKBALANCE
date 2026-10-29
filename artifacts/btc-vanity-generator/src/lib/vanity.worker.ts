/// <reference lib="webworker" />

import {
  deriveBitcoinAddress,
  deriveBitcoinAddressOnly,
  PRIVATE_KEY_LIMIT,
  privateKeyFromRangeValue,
  randomPrivateKey,
} from "./bitcoin";
import {
  CANDIDATE_BATCH_SIZE,
  MAX_RECORDED_RANGE_CANDIDATES,
  type CandidateRecord,
  type WorkerRequest,
  type WorkerResponse,
} from "./vanity-protocol";

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

let stopRequested = false;
let running = false;

function matches(
  address: string,
  prefix: string,
  suffix: string,
  targetAddress: string,
): boolean {
  if (targetAddress) return address === targetAddress;
  return address.startsWith(prefix) && address.endsWith(suffix);
}

function parseRangeValue(value: string | undefined, label: string): bigint {
  const normalized = (value ?? "").trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{1,64}$/.test(normalized)) {
    throw new Error(`${label} must be a hexadecimal value with 1 to 64 characters.`);
  }
  const parsed = BigInt(`0x${normalized}`);
  if (parsed < 1n || parsed >= PRIVATE_KEY_LIMIT) {
    throw new Error(`${label} is outside the valid Bitcoin private-key range.`);
  }
  return parsed;
}

worker.onmessage = (event) => {
  if (event.data.type === "stop") {
    stopRequested = true;
    return;
  }
  if (running) return;

  const options = event.data;
  const startedAt = performance.now();
  stopRequested = false;
  running = true;

  void (async () => {
    let attempts = 0;
    let start = 0n;
    let end = 0n;
    let cursor = 0n;
    let pendingCandidates: CandidateRecord[] = [];

    try {
      if (options.mode === "range") {
        start = parseRangeValue(options.startHex, "Start of range");
        end = parseRangeValue(options.endHex, "End of range");
        if (start > end) throw new Error("Range start > end");
        cursor = start;
      }

      const rangeSize = options.mode === "range" ? end - start + 1n : 0n;
      const candidateLimit = options.candidateLimit ?? MAX_RECORDED_RANGE_CANDIDATES;
      let lastReportAt = 0;

      const flushCandidates = () => {
        if (pendingCandidates.length === 0) return;
        worker.postMessage({ type: "candidates", candidates: pendingCandidates });
        pendingCandidates = [];
      };

      // هادي هي الحلقة اللي زدنا فيها السرعة
      while (!stopRequested) {
        // زدنا العدد من 500 لـ 5000 باش نرفعو السرعة
        for (let count = 0; count < 5000 && !stopRequested; count += 1) {
          if (options.mode === "range" && cursor > end) {
            flushCandidates();
            worker.postMessage({ type: "exhausted", attempts, elapsedMs: Math.max(1, performance.now() - startedAt) });
            return;
          }

          const key = options.mode === "range" ? privateKeyFromRangeValue(cursor++) : randomPrivateKey();
          
          // هنا كنحسبو غير الـ Address (باش نسرعو)، وملي نلقاو التطابق كنحسبو الـ WIF
          const address = deriveBitcoinAddressOnly(key, options.format);
          attempts += 1;

          // إلا كنا فـ Range mode وكنحتاجو الداتا ديال الـ WIF
          if (options.mode === "range") {
            const result = deriveBitcoinAddress(key, options.format);
            pendingCandidates.push({
              index: (options.candidateOffset ?? 0) + attempts,
              address,
              privateKeyWif: result.privateKeyWif,
              rangeStartHex: start.toString(16),
              rangeEndHex: end.toString(16),
            });
            // زدنا الـ Batch باش نقللو الـ postMessage
            if (pendingCandidates.length >= 1000) {
              flushCandidates();
            }
          }

          if (!options.generateOnly && matches(address, options.prefix, options.suffix, options.targetAddress ?? "")) {
            flushCandidates();
            const result = deriveBitcoinAddress(key, options.format);
            worker.postMessage({
              type: "found",
              attempts,
              elapsedMs: Math.max(1, performance.now() - startedAt),
              result,
            });
            return;
          }

          if (options.mode === "range" && attempts >= candidateLimit && cursor <= end) {
            flushCandidates();
            worker.postMessage({ type: "history-limit", attempts, elapsedMs: Math.max(1, performance.now() - startedAt), limit: MAX_RECORDED_RANGE_CANDIDATES });
            return;
          }
        }

        const now = performance.now();
        if (now - lastReportAt >= 200) {
          const percent = options.mode === "range" ? Math.min(100, Number(((cursor - start) * 1_000_000n) / rangeSize) / 10_000) : null;
          worker.postMessage({ type: "progress", attempts, elapsedMs: Math.max(1, performance.now() - startedAt), percent });
          lastReportAt = now;
        }

        // هادي هي اللي كتخلي المتصفح يتنفس، ولكن كنعطيو وقت أقل
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      flushCandidates();
      worker.postMessage({ type: "stopped", attempts, elapsedMs: Math.max(1, performance.now() - startedAt) });
    } catch (error) {
      worker.postMessage({ type: "error", message: error instanceof Error ? error.message : "Search failed." });
    } finally {
      running = false;
    }
  })();
};
