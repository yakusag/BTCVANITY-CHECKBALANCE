from pathlib import Path
import subprocess
import sys

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse

app = FastAPI()
PROJECT_ROOT = Path(__file__).resolve().parent.parent
PLUTUS_DIR = PROJECT_ROOT / "plutus"
PLUTUS_SCRIPT = PLUTUS_DIR / "plutus.py"

PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Plutus Self-Test</title>
  <style>
    :root { color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; padding: 32px 20px; background: #111713; color: #e4eee7; }
    main { width: min(760px, 100%); margin: 8vh auto 0; }
    .eyebrow { color: #83d6a2; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; }
    h1 { margin: 12px 0 8px; font: 600 34px/1.15 ui-sans-serif, system-ui, sans-serif; }
    p { color: #aab8af; line-height: 1.6; }
    button { margin: 18px 0 14px; padding: 11px 18px; border: 0; border-radius: 5px; background: #a7edbe; color: #102016; font: 700 14px ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
    button:disabled { cursor: wait; opacity: .55; }
    pre { min-height: 220px; max-height: 55vh; overflow: auto; margin: 0; padding: 18px; border: 1px solid #34443a; border-radius: 5px; background: #090d0a; color: #b8e9c6; white-space: pre-wrap; overflow-wrap: anywhere; }
    #status { min-height: 24px; color: #83d6a2; font-size: 13px; }
    @media (max-width: 520px) { body { padding: 22px 15px; } main { margin-top: 5vh; } h1 { font-size: 28px; } }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">Plutus · Local diagnostics</div>
    <h1>Self-test</h1>
    <p>This page runs the built-in test only and shows its output below.</p>
    <button id="start" type="button">Run self-test</button>
    <div id="status" role="status" aria-live="polite"></div>
    <pre id="output">Ready.</pre>
  </main>
  <script>
    const button = document.getElementById('start');
    const status = document.getElementById('status');
    const output = document.getElementById('output');

    button.addEventListener('click', async () => {
      button.disabled = true;
      status.textContent = 'Running test...';
      output.textContent = '';
      try {
        const response = await fetch('/api/self-test', { method: 'POST' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Request failed');
        output.textContent = result.output || '(No output)';
        status.textContent = result.passed ? 'Self-test passed.' : `Self-test failed (exit ${result.returncode}).`;
      } catch (error) {
        status.textContent = 'Could not run the self-test.';
        output.textContent = String(error);
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>"""


@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return PAGE


@app.post("/api/self-test")
def run_self_test() -> dict[str, object]:
    try:
        result = subprocess.run(
            [sys.executable, str(PLUTUS_SCRIPT), "test"],
            cwd=PLUTUS_DIR,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise HTTPException(status_code=504, detail="Self-test timed out.") from error
    except OSError as error:
        raise HTTPException(status_code=500, detail="Could not start the self-test.") from error

    return {
        "passed": result.returncode == 0,
        "returncode": result.returncode,
        "output": result.stdout + result.stderr,
    }