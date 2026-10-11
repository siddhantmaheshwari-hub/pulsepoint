import { handleCron } from '@/lib/cron';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
// Daily: collect new discussions and analyze them (spreads Gemini load across the week).
export function GET(req: Request) { return handleCron(req, 'cron_daily', 'collect'); }
