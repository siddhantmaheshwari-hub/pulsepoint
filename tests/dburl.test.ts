import { describe, expect, it } from 'vitest';
import { isLocalDatabase, normalizeDatabaseUrl } from '@/lib/dburl';

describe('normalizeDatabaseUrl', () => {
  it('drops channel_binding from Neon-style strings and keeps sslmode', () => {
    const out = normalizeDatabaseUrl('postgresql://u:p@ep-x-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
    expect(out).toBe('postgresql://u:p@ep-x-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require');
  });
  it('leaves plain URLs alone and detects local databases', () => {
    expect(normalizeDatabaseUrl('postgres://a:b@localhost:5432/db')).toBe('postgres://a:b@localhost:5432/db');
    expect(isLocalDatabase('postgres://a:b@localhost:5432/db')).toBe(true);
    expect(isLocalDatabase('postgresql://u:p@ep-x-pooler.neon.tech/neondb')).toBe(false);
  });
});
