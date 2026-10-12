// Shared URL state: ?report=<id>&compare=off. Preserved across navigation.
export type SP = Record<string, string | string[] | undefined>;
export function one(v: string | string[] | undefined): string | undefined { return Array.isArray(v) ? v[0] : v; }
export function compareOn(sp: SP) { return one(sp.compare) !== 'off'; }
