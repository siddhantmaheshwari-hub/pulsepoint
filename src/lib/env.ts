import 'server-only';

const REQUIRED = ['DATABASE_URL', 'GEMINI_API_KEY', 'CRON_SECRET'] as const;

export function missingEnv(): string[] {
  return REQUIRED.filter((k) => !process.env[k]);
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const env = {
  get databaseUrl() { return req('DATABASE_URL'); },
  get geminiKey() { return req('GEMINI_API_KEY'); },
  get geminiModel() { return process.env.GEMINI_MODEL || 'gemini-3.8-flash'; },
  get geminiMinIntervalMs() { return Number(process.env.GEMINI_MIN_INTERVAL_MS ?? 4000); },
  get cronSecret() { return process.env.CRON_SECRET ?? ''; },
  get stackExchangeKey() { return process.env.STACKEXCHANGE_KEY || null; },
  get githubToken() { return process.env.GITHUB_TOKEN || null; },
  get tzOffsetMinutes() { return Number(process.env.REPORT_TZ_OFFSET_MINUTES ?? 330); },
  get budgetMs() { return Math.min(Number(process.env.PIPELINE_BUDGET_MS ?? 240_000), 280_000); },
  get slackWebhook() { return process.env.SLACK_WEBHOOK_URL || null; },
  get appUrl() { return process.env.APP_URL || ''; },
};
