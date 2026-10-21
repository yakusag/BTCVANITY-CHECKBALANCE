from pathlib import Path
import subprocess
import sys
import asyncio
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# تفعيل CORS باش Vercel توصل مع Termux
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# الكود هنا كيقلب على plutus.py أوتوماتيكيا فـ نفس المجلد أو فـ مجلد plutus
BASE_DIR = Path(__file__).resolve().parent
if (BASE_DIR / "plutus.py").exists():
    PLUTUS_SCRIPT = BASE_DIR / "plutus.py"
    PLUTUS_CWD = BASE_DIR
else:
    PLUTUS_SCRIPT = BASE_DIR / "plutus" / "plutus.py"
    PLUTUS_CWD = BASE_DIR / "plutus"

PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Plutus Live Search</title>
  <style>
    :root { color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; padding: 32px 20px; background: #111713; color: #e4eee7; }
    main { width: min(900px, 100%); margin: 2vh auto 0; }
    .eyebrow { color: #83d6a2; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; }
    h1 { margin: 12px 0 8px; font: 600 34px/1.15 ui-sans-serif, system-ui, sans-serif; }
    p { color: #aab8af; line-height: 1.6; }
    button { margin: 18px 0 14px; padding: 11px 18px; border: 0; border-radius: 5px; background: #a7edbe; color: #102016; font: 700 14px ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
    button.stop-btn { background: #ff7b7b; color: #2a0000; margin-left: 10px; }
    button:disabled { cursor: wait; opacity: .55; }
    pre { min-height: 400px; max-height: 70vh; overflow: auto; margin: 0; padding: 18px; border: 1px solid #34443a; border-radius: 5px; background: #090d0a; color: #b8e9c6; white-space: pre-wrap; overflow-wrap: anywhere; }
    #status { min-height: 24px; color: #83d6a2; font-size: 13px; margin-bottom: 10px; }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">Plutus · Live Search</div>
    <h1>Default Search</h1>
    <p>This page runs the actual Plutus search. Output is shown in real-time.</p>
    
    <div>
        <button id="start" type="button">Start Search</button>
        <button id="stop" type="button" class="stop-btn" disabled>Stop Search</button>
    </div>
    
    <div id="status" role="status" aria-live="polite">Ready.</div>
    <pre id="output">Waiting to start...</pre>
  </main>
  <script>
    const startBtn = document.getElementById('start');
    const stopBtn = document.getElementById('stop');
    const status = document.getElementById('status');
    const output = document.getElementById('output');
    let eventSource = null;

    startBtn.addEventListener('click', () => {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      status.textContent = 'Running search...';
      output.textContent = ''; 
      
      eventSource = new EventSource('/api/stream-search');

      eventSource.onmessage = function(event) {
        output.textContent += event.data + "\\n";
        output.scrollTop = output.scrollHeight; 
      };

      eventSource.onerror = function() {
        eventSource.close();
        startBtn.disabled = false;
        stopBtn.disabled = true;
        status.textContent = 'Search stopped or connection lost.';
      };
    });

    stopBtn.addEventListener('click', () => {
      if (eventSource) { eventSource.close(); }
      startBtn.disabled = false;
      stopBtn.disabled = true;
      status.textContent = 'Search manually stopped.';
      fetch('/api/stop-search', { method: 'POST' });
    });
  </script>
</body>
</html>"""

current_process = None

@app.get("/", response_class=HTMLResponse)
def index() -> str:
    return PAGE

@app.get("/api/stream-search")
async def stream_search():
    global current_process
    
    if current_process and current_process.poll() is None:
        current_process.terminate()

    current_process = subprocess.Popen(
        [sys.executable, "-u", str(PLUTUS_SCRIPT)],
        cwd=PLUTUS_CWD,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    async def event_generator():
        for line in iter(current_process.stdout.readline, ''):
            if line:
                yield f"data: {line.strip()}\n\n"
            await asyncio.sleep(0.01)
            
        current_process.stdout.close()
        current_process.wait()

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/api/stop-search")
def stop_search():
    global current_process
    if current_process and current_process.poll() is None:
        current_process.terminate() 
        return {"status": "stopped"}
    return {"status": "no process running"}
