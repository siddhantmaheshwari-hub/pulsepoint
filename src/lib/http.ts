import 'server-only';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class DeadlineError extends Error {}

/** Wait before the next retry, or give up if the wait would cross the deadline. */
async function backoff(ms: number, deadline: number | undefined, lastErr: unknown) {
  if (deadline !== undefined && Date.now() + ms + 2_000 > deadline) throw lastErr;
  await sleep(ms);
}

/**
 * fetch + JSON with timeout, retries on 429/5xx/network errors, and Retry-After support.
 * `deadline` (epoch ms) is a hard stop: each attempt's timeout is capped by it and no retry starts past it,
 * so a slow or overloaded API can't push a run beyond the serverless function limit.
 */
export async function fetchJson<T = unknown>(url: string, init: RequestInit & { retries?: number; timeoutMs?: number; deadline?: number } = {}): Promise<T> {
  const { retries = 3, timeoutMs = 20_000, deadline, ...rest } = init;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const left = deadline === undefined ? Infinity : deadline - Date.now();
    if (left < 2_000) throw lastErr ?? new DeadlineError(`Time budget exhausted before calling ${new URL(url).host}`);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, left));
    try {
      const res = await fetch(url, { ...rest, signal: ctrl.signal, cache: 'no-store' });
      if (res.ok) return (await res.json()) as T;
      const body = (await res.text()).slice(0, 300);
      const retryable = res.status === 429 || res.status >= 500;
      lastErr = new HttpError(res.status, `HTTP ${res.status} from ${new URL(url).host}: ${body}`);
      if (!retryable || attempt === retries) throw lastErr;
      console.warn(`[http] retrying ${new URL(url).host}: HTTP ${res.status} (attempt ${attempt + 1} of ${retries + 1})`);
      const ra = Number(res.headers.get('retry-after'));
      await backoff(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 30_000) : 1000 * 2 ** attempt + Math.random() * 300, deadline, lastErr);
    } catch (caught) {
      if (caught === lastErr && caught instanceof HttpError) throw caught; // retry budget or deadline exhausted above
      // An API that accepts the request but never answers trips the abort timer; say so plainly.
      const e = ctrl.signal.aborted ? Object.assign(new Error(`No response from ${new URL(url).host} within ${Math.round(Math.min(timeoutMs, left) / 1000)} s`), { name: 'TimeoutError' }) : caught;
      lastErr = e;
      if (e instanceof HttpError && !(e.status === 429 || e.status >= 500)) throw e;
      if (attempt === retries) throw e;
      console.warn(`[http] retrying ${new URL(url).host}: ${(e as Error).message.slice(0, 120)} (attempt ${attempt + 1} of ${retries + 1})`);
      await backoff(1000 * 2 ** attempt, deadline, e);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
