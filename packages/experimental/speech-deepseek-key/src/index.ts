/**
 * Shared credential resolution for the experimental DeepSeek speech providers. Each provider maps
 * a problem to its own failure type, so the message names the credential without the readers of one
 * provider depending on the error class of the other.
 * @module @deepseek-ai/dsh-experimental-speech-deepseek-key
 */
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'

/** Why a key could not be used. */
export type SpeechKeyProblem = 'missing' | 'blank' | 'unsafe'

/** One resolution attempt: a usable key, or the problem and the remedy to report. */
export type SpeechKeyResolution =
  | { readonly ok: true; readonly key: string }
  | { readonly ok: false; readonly problem: SpeechKeyProblem; readonly message: string }

/**
 * Resolve the DeepSeek key an inline value or credential reference supplies.
 * @param ctx - context providing the optional credentials and launch-environment services.
 * @param literal - configured inline key that overrides the credential reference.
 * @param reference - credential name resolved when no inline key is configured.
 * @returns a usable key, or the problem with an operator-facing remedy.
 */
export async function resolveSpeechKey(
  ctx: Context, literal: string | undefined, reference: string,
): Promise<SpeechKeyResolution> {
  if (literal !== undefined) return check(literal, reference)
  const credentials = ctx.get('credentials')
  const raw = credentials === undefined
    ? launchEnvironmentOf(ctx).get(reference)?.value
    : (await credentials.resolve(credentialRef(reference)))?.value
  if (raw === undefined) {
    return { ok: false, problem: 'missing', message: `no DeepSeek API key is configured for ${reference}; set the credential it names or give this provider a literal key` }
  }
  return check(raw, reference)
}

/**
 * @param raw - resolved credential value.
 * @param reference - credential name reported to the operator.
 * @returns the key when no Authorization header rejects it.
 */
function check(raw: string, reference: string): SpeechKeyResolution {
  const key = raw.trim()
  if (key.length === 0) {
    return { ok: false, problem: 'blank', message: `the DeepSeek API key resolved from ${reference} is blank; set ${reference} to the raw key` }
  }
  if (/[\u0000-\u001f\u007f]/.test(key)) {
    return { ok: false, problem: 'unsafe', message: `the DeepSeek API key resolved from ${reference} contains characters no Authorization header can carry; set ${reference} to the raw key alone` }
  }
  return { ok: true, key }
}
