/** Server-side Gradio queue transport for our own free ZeroGPU Space. */
export async function requestZeroGpu(url: URL, key: string, input: unknown, signal: AbortSignal): Promise<unknown> {
  const token = process.env.AGRICHAT_HF_TOKEN;
  if (!token?.startsWith('hf_')) throw new Error('AgriChat free GPU account token is not configured correctly.');
  if (!url.hostname.endsWith('.hf.space') || url.pathname !== '/gradio_api/call/diagnose') {
    throw new Error('AgriChat free GPU endpoint is not configured correctly.');
  }
  const headers = { Authorization: `Bearer ${token}`, 'X-AgriChat-Key': key, 'Content-Type': 'application/json' };
  const options = { headers, signal, cache: 'no-store' as const, redirect: 'error' as const };
  const started = await fetch(url, { ...options, method: 'POST', body: JSON.stringify({ data: [input] }) });
  checkStatus(started);
  const job = await started.json();
  if (typeof job.event_id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(job.event_id)) {
    throw new Error('AgriChat free GPU returned an invalid job.');
  }
  const response = await fetch(`${url.href}/${job.event_id}`, options);
  checkStatus(response);
  return readGradioResult(response, signal);
}

function checkStatus(response: Response) {
  if (response.status === 401 || response.status === 403) throw new Error('AgriChat free GPU authentication is not configured correctly.');
  if (response.status === 402 || response.status === 429) throw new Error('AgriChat free GPU allowance is unavailable or exhausted. No paid upgrade was started.');
  if (!response.ok) throw new Error('AgriChat free GPU is busy or starting. Please retry shortly.');
}

export async function readGradioResult(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new Error('AgriChat free GPU returned no result.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let bytes = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 100000) throw new Error('AgriChat free GPU returned an oversized result.');
      buffer += decoder.decode(value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const event = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const lines = event.split(/\r?\n/);
        const kind = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (kind === 'error') {
          if (/quota|exceed|allowance|gpu.*limit/i.test(data)) throw new Error('AgriChat free daily GPU allowance is exhausted. Please retry after it resets; no payment is required.');
          throw new Error('AgriChat free GPU could not complete this report. Please retry.');
        }
        if (kind === 'complete') {
          let result: unknown;
          try { result = JSON.parse(data); }
          catch { throw new Error('AgriChat free GPU returned an invalid result.'); }
          if (!Array.isArray(result) || result.length !== 1) throw new Error('AgriChat free GPU returned an invalid result.');
          return result[0];
        }
      }
    }
    throw new Error('AgriChat free GPU stopped before the report was complete.');
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
