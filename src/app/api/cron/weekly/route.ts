import { handleCron } from '@/lib/cron';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
// Friday 00:30 UTC (06:00 IST): final collection pass, then the Friday Morning Brief, then the brief email.
export function GET(req: Request) { return handleCron(req, 'cron_weekly', 'full'); }
