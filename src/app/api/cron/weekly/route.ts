import { handleCron } from '@/lib/cron';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
// Friday 02:30 UTC (08:00 IST): final collection pass, then the Friday Morning Brief.
export function GET(req: Request) { return handleCron(req, 'cron_weekly', 'full'); }
