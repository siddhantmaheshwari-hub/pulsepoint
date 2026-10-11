import { NextResponse, type NextRequest } from 'next/server';

/**
 * HTTP Basic auth for the whole dashboard (single-user tool for Sumit).
 * Cron endpoints are excluded here and verify CRON_SECRET themselves.
 * If no password is configured, read-only GETs are allowed but every mutation is refused.
 */
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  const user = process.env.DASHBOARD_USER || 'sumit';
  const isMutation = req.method !== 'GET' && req.method !== 'HEAD';

  if (!password) {
    if (isMutation) return new NextResponse('Set DASHBOARD_PASSWORD to enable changes.', { status: 403 });
    return NextResponse.next();
  }
  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    try {
      const [u, ...rest] = atob(header.slice(6)).split(':');
      if (timingSafeEqual(u, user) && timingSafeEqual(rest.join(':'), password)) return NextResponse.next();
    } catch { /* fall through */ }
  }
  return new NextResponse('Authentication required', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Developer Community Pulse"' } });
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron).*)'] };
