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


/** Retry one failed response inside a single deadline, without repeating quota,
 * configuration, safety-block or authentication failures. Healthy requests still
 * make exactly one provider call. No new deadline is granted to the retry. */
export async function withAiResponseRetry<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs = 60000): Promise<T> {
  const started = Date.now();
  return withAiDeadline(async signal => {
    try { return await run(signal); }
    catch (error) {
      signal.throwIfAborted();
      const message = error instanceof Error ? error.message : String(error);
      const status = Number((error as any)?.status || (error as any)?.statusCode || (error as any)?.code);
      if ([400, 401, 403, 404, 429].includes(status)
        || /429|quota|resource.exhausted|rate.limit|api.?key|unauthenticated|permission.denied|not.found|not.supported|invalid.argument|safety|blocked|abort|timed.out|taking longer/i.test(message)
        || Date.now() - started >= timeoutMs - 10000) throw error;
      // Network, transient provider and malformed structured-output failures get
      // one recovery attempt; the report image and detector evidence are unchanged.
      signal.throwIfAborted();
      return run(signal);
    }
  }, timeoutMs);
}
