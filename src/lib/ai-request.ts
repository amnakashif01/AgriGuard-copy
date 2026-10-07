/** Bound a model request and abort the provider call when its time budget expires. */
export async function withAiDeadline<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs = 60000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('AI analysis is taking longer than expected. Your saved record is safe; please retry.'));
    }, timeoutMs);
  });
  try { return await Promise.race([run(controller.signal), deadline]); }
  finally { clearTimeout(timer!); }
}
