import 'server-only';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch + JSON with timeout, retries on 429/5xx/network errors, and Retry-After support. */
export async function fetchJson<T = unknown>(url: string, init: RequestInit & { retries?: number; timeoutMs?: number } = {}): Promise<T> {
  const { retries = 3, timeoutMs = 20_000, ...rest } = init;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...rest, signal: ctrl.signal, cache: 'no-store' });
      if (res.ok) return (await res.json()) as T;
      const body = (await res.text()).slice(0, 300);
      const retryable = res.status === 429 || res.status >= 500;
      lastErr = new HttpError(res.status, `HTTP ${res.status} from ${new URL(url).host}: ${body}`);
      if (!retryable || attempt === retries) throw lastErr;
      const ra = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 30_000) : 1000 * 2 ** attempt + Math.random() * 300);
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && !(e.status === 429 || e.status >= 500)) throw e;
      if (attempt === retries) throw e;
      await sleep(1000 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
