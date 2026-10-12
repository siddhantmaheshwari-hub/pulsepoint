import 'server-only';
import { env } from './env';
import { fetchJson } from './http';

let lastCall = 0;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** Call Gemini Flash with a JSON response schema. Returns parsed JSON (still untrusted — validate with zod). */
export async function geminiJson(opts: { system: string; user: string; schema: object; temperature?: number; deadline?: number }): Promise<unknown> {
  const wait = lastCall + env.geminiMinIntervalMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent`;
  const res = await fetchJson<GeminiResponse>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.user }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: opts.schema, temperature: opts.temperature ?? 0.1 },
    }),
    timeoutMs: 40_000, // healthy calls take 10–15 s; stalled requests (seen live) are cut off and retried
    retries: 3,
    deadline: opts.deadline,
  });
  if (res.promptFeedback?.blockReason) throw new Error(`Gemini blocked prompt: ${res.promptFeedback.blockReason}`);
  const text = res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error(`Gemini returned no content (finishReason=${res.candidates?.[0]?.finishReason ?? 'unknown'})`);
  return parseModelJson(text);
}

export function parseModelJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned malformed JSON: ${cleaned.slice(0, 120)}`);
  }
}
