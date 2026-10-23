/** Serves a web dashboard for health status, documentation, and API exploration. */

export function renderDashboardHtml(apiKeysCount: number): string {
  const apiKeyNotice = apiKeysCount > 0
    ? `<span class="badge badge-warning">${apiKeysCount} key configured</span>`
    : `<span class="badge badge-neutral">No API key required (open)</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DeepSeek Web API</title>
  <style>
    :root {
      --bg: #0f172a; --card-bg: #1e293b; --border: #334155; --text: #f8fafc;
      --text-muted: #94a3b8; --accent: #38bdf8; --accent-hover: #0284c7;
      --success: #22c55e; --warning: #f59e0b; --code-bg: #090d16;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font-family: var(--font-sans); line-height: 1.6; padding: 2rem 1rem; }
    .container { max-width: 900px; margin: 0 auto; }
    header { margin-bottom: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; }
    .brand-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    h1 { font-size: 1.875rem; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 0.75rem; }
    .pulse-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--success); box-shadow: 0 0 10px var(--success); display: inline-block; }
    p.desc { color: var(--text-muted); margin-top: 0.5rem; font-size: 1rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.25rem; }
    .card-title { font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.5rem; font-weight: 600; }
    .card-value { font-size: 1.25rem; font-weight: 600; color: #ffffff; }
    .badge { display: inline-block; font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 9999px; font-weight: 500; margin-top: 0.4rem; }
    .badge-success { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid #22c55e; }
    .badge-warning { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; }
    .badge-neutral { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid #64748b; }
    section { background: var(--card-bg); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 2rem; }
    section h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; color: var(--accent); }
    .endpoints-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .endpoint-item { display: flex; align-items: center; justify-content: space-between; background: var(--code-bg); padding: 0.75rem 1rem; border-radius: 0.5rem; border: 1px solid var(--border); font-family: var(--font-mono); font-size: 0.875rem; flex-wrap: wrap; gap: 0.5rem; }
    .method { font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; }
    .method-get { background: #0369a1; color: #bae6fd; }
    .method-post { background: #15803d; color: #bbf7d0; }
    .console-controls { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; align-items: center; }
    button { background: var(--accent); color: #0f172a; border: none; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; font-size: 0.875rem; }
    button:hover { background: var(--accent-hover); }
    input[type="text"] { background: var(--code-bg); border: 1px solid var(--border); color: #ffffff; padding: 0.5rem 0.75rem; border-radius: 0.5rem; font-family: var(--font-mono); font-size: 0.875rem; flex: 1; min-width: 200px; }
    pre { background: var(--code-bg); color: #e2e8f0; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; font-family: var(--font-mono); font-size: 0.85rem; border: 1px solid var(--border); max-height: 350px; }
    .guide-code { margin-top: 0.75rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand-row">
        <h1><span class="pulse-dot"></span> deepseek-web-api</h1>
        <span class="badge badge-success">Port 3000 Active</span>
      </div>
      <p class="desc">Unofficial OpenAI-compatible API proxy for authenticated DeepSeek Web sessions with file upload support.</p>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-title">Server Status</div>
        <div class="card-value">Online</div>
        <span class="badge badge-success">0.0.0.0:3000</span>
      </div>
      <div class="card">
        <div class="card-title">Security & Auth</div>
        <div class="card-value">${apiKeysCount > 0 ? "Protected" : "Open"}</div>
        ${apiKeyNotice}
      </div>
      <div class="card">
        <div class="card-title">Direct File Upload</div>
        <div class="card-value">Enabled</div>
        <span class="badge badge-success">chat.deepseek.com direct</span>
      </div>
    </div>

    <section>
      <h2>Available Endpoints</h2>
      <div class="endpoints-list">
        <div class="endpoint-item">
          <div><span class="method method-get">GET</span> <span>/health</span></div>
          <span style="color: var(--text-muted)">Service health probe</span>
        </div>
        <div class="endpoint-item">
          <div><span class="method method-get">GET</span> <span>/v1/models</span></div>
          <span style="color: var(--text-muted)">OpenAI-compatible models catalog</span>
        </div>
        <div class="endpoint-item">
          <div><span class="method method-post">POST</span> <span>/v1/files</span></div>
          <span style="color: var(--text-muted)">Upload documents/images directly to DeepSeek Web</span>
        </div>
        <div class="endpoint-item">
          <div><span class="method method-post">POST</span> <span>/v1/chat/completions</span></div>
          <span style="color: var(--text-muted)">Chat completions with thinking & ref_file_ids</span>
        </div>
        <div class="endpoint-item">
          <div><span class="method method-post">POST</span> <span>/v1/responses</span></div>
          <span style="color: var(--text-muted)">OpenAI Responses API specification</span>
        </div>
      </div>
    </section>

    <section>
      <h2>Interactive API Console & File Upload</h2>
      <div class="console-controls">
        <button id="btnHealth" type="button">Test /health</button>
        <button id="btnModels" type="button">Test /v1/models</button>
        <button id="btnChat" type="button">Test Chat Completion</button>
        <input id="apiKeyInput" type="text" placeholder="API Key (optional, defaults to data/.api-key if known)">
      </div>
      <div style="margin: 0.75rem 0 1rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
        <input id="filePicker" type="file" style="background: var(--code-bg); color: var(--text); padding: 0.4rem; border-radius: 0.5rem; border: 1px solid var(--border);">
        <button id="btnUpload" type="button" style="background: #22c55e; color: #0f172a;">Upload to DeepSeek</button>
        <span id="uploadedFileBadge" style="font-size: 0.85rem; color: var(--text-muted);">No file attached</span>
      </div>
      <pre id="outputLog">Click a button above or pick a file to upload directly to chat.deepseek.com.</pre>
    </section>

    <section>
      <h2>File Upload API Usage</h2>
      <p style="color: var(--text-muted); font-size: 0.9rem;">
        You can upload files via standard <code>POST /v1/files</code> or pass files directly inside <code>POST /v1/chat/completions</code>:
      </p>
      <pre class="guide-code"># 1. Upload a file directly:
curl -X POST http://localhost:3000/v1/files \\
  -H "Authorization: Bearer sk-ds-..." \\
  -F "file=@document.pdf"

# 2. Ask DeepSeek to analyze the file:
curl -X POST http://localhost:3000/v1/chat/completions \\
  -H "Authorization: Bearer sk-ds-..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "Analyze this file"}],
    "ref_file_ids": ["file-8bbdc584-9894-4f99-bf46-018d57311779"]
  }'</pre>
    </section>
  </div>

  <script>
    const output = document.getElementById("outputLog");
    const keyInput = document.getElementById("apiKeyInput");
    const filePicker = document.getElementById("filePicker");
    const badge = document.getElementById("uploadedFileBadge");
    let currentFileId = null;

    function getHeaders(isJson = true) {
      const headers = { "Accept": "application/json" };
      if (isJson) headers["Content-Type"] = "application/json";
      const key = keyInput.value.trim();
      if (key) headers["Authorization"] = key.startsWith("Bearer ") ? key : "Bearer " + key;
      return headers;
    }

    async function probe(url, options = {}) {
      output.textContent = "Requesting " + url + "...";
      try {
        const res = await fetch(url, options);
        const json = await res.json();
        output.textContent = "HTTP " + res.status + " " + res.statusText + "\\n" + JSON.stringify(json, null, 2);
      } catch (err) {
        output.textContent = "Error: " + (err && err.message ? err.message : String(err));
      }
    }

    document.getElementById("btnHealth").addEventListener("click", () => probe("/health", { headers: getHeaders() }));
    document.getElementById("btnModels").addEventListener("click", () => probe("/v1/models", { headers: getHeaders() }));

    document.getElementById("btnUpload").addEventListener("click", async () => {
      const file = filePicker.files && filePicker.files[0];
      if (!file) {
        output.textContent = "Please select a file first using the file picker.";
        return;
      }
      output.textContent = "Uploading " + file.name + " (" + file.size + " bytes) directly to chat.deepseek.com...";
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/v1/files", {
          method: "POST",
          headers: getHeaders(false),
          body: formData,
        });
        const json = await res.json();
        if (json && json.id) {
          currentFileId = json.id;
          badge.textContent = "Attached: " + json.filename + " (" + json.id + ")";
          badge.style.color = "#4ade80";
        }
        output.textContent = "Upload result:\\n" + JSON.stringify(json, null, 2);
      } catch (err) {
        output.textContent = "Upload error: " + (err && err.message ? err.message : String(err));
      }
    });

    document.getElementById("btnChat").addEventListener("click", () => {
      const payload = {
        model: "deepseek-chat",
        messages: [{
          role: "user",
          content: currentFileId
            ? "Please analyze the uploaded file and summarize its main points."
            : "Hello from DeepSeek Web API!"
        }],
      };
      if (currentFileId) payload.ref_file_ids = [currentFileId];
      probe("/v1/chat/completions", {
        method: "POST",
        headers: getHeaders(true),
        body: JSON.stringify(payload),
      });
    });
  </script>
</body>
</html>`;
}
