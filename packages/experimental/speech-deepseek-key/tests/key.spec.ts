/** Shared credential resolution: literal override, environment fallback, and rejected values. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { resolveSpeechKey } from '../src/index.ts'

afterEach(() => { delete process.env.DSH_SPEECH_TEST_KEY })

it('prefers the literal key and trims it', async () => {
  expect(await resolveSpeechKey(new Context(), '  sk-literal  ', 'DSH_SPEECH_TEST_KEY')).toEqual({ ok: true, key: 'sk-literal' })
})

it('reads the launch environment when no literal key is configured', async () => {
  process.env.DSH_SPEECH_TEST_KEY = 'sk-env'
  expect(await resolveSpeechKey(new Context(), undefined, 'DSH_SPEECH_TEST_KEY')).toEqual({ ok: true, key: 'sk-env' })
})

it('names the reference when no key is configured', async () => {
  const resolution = await resolveSpeechKey(new Context(), undefined, 'DSH_SPEECH_TEST_KEY')
  expect(resolution).toMatchObject({ ok: false, problem: 'missing' })
  expect(resolution.ok ? '' : resolution.message).toContain('DSH_SPEECH_TEST_KEY')
})

it.each([
  ['   ', 'blank'],
  ['sk-key\nInjected: value', 'unsafe'],
] as const)('rejects unusable value %j as %s', async (literal, problem) => {
  expect(await resolveSpeechKey(new Context(), literal, 'DSH_SPEECH_TEST_KEY')).toMatchObject({ ok: false, problem })
})

it('prefers the credentials service over the launch environment', async () => {
  process.env.DSH_SPEECH_TEST_KEY = 'sk-env'
  const ctx = new Context()
  ctx.provide('credentials', { resolve: async () => ({ value: 'sk-file', source: 'file' }) })
  expect(await resolveSpeechKey(ctx, undefined, 'DSH_SPEECH_TEST_KEY')).toEqual({ ok: true, key: 'sk-file' })
})
