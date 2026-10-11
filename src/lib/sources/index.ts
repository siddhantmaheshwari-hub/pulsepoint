import 'server-only';
import type { SourceId } from '../types';
import { gitHub } from './github';
import { hackerNews } from './hackernews';
import { stackOverflow } from './stackoverflow';
import type { SourceAdapter } from './types';

export const ADAPTERS: Record<SourceId, SourceAdapter> = { hackernews: hackerNews, stackoverflow: stackOverflow, github: gitHub };
