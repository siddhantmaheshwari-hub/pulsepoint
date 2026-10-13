import 'server-only';
import { cookies } from 'next/headers';
import { env } from './env';
import { parseTeam, VOTER_COOKIE } from './votes';

/** The team list and the voter remembered in this browser (null until they pick a name, or if they left the team). */
export async function getVoting(): Promise<{ team: string[]; voter: string | null }> {
  const team = parseTeam(env.teamMembers);
  const v = (await cookies()).get(VOTER_COOKIE)?.value;
  return { team, voter: v && team.includes(v) ? v : null };
}
