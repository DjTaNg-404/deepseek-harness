/** Real DeepSeek TTS round trip; skipped without DEEPSEEK_API_KEY. */
import { expect, it } from 'vitest'
import { DEEPSEEK_TTS_PATH, finalizeWave, synthesizeDeepSeekTts } from '@deepseek-ai/dsh-experimental-speech-synthesis-deepseek'

const apiKey = process.env.DEEPSEEK_API_KEY
const run = apiKey === undefined || apiKey.length === 0 ? it.skip : it

run('returns a browser-playable WAV for one short text', async () => {
  const audio = await synthesizeDeepSeekTts({
    endpoint: `https://api.deepseek.com${DEEPSEEK_TTS_PATH}`,
    resolveApiKey: async () => apiKey,
    timeoutMs: 120_000,
  }, { text: '你好', voiceId: 'stella' }, new AbortController().signal)
  expect(audio.mimeType).toContain('audio')
  expect(audio.audio.byteLength).toBeGreaterThan(44)
  const header = new TextDecoder().decode(audio.audio.subarray(0, 4))
  expect(header).toBe('RIFF')
  // The provider must have replaced the streaming placeholder size with the real one.
  const view = new DataView(audio.audio.buffer, audio.audio.byteOffset, audio.audio.byteLength)
  expect(view.getUint32(4, true)).toBe(audio.audio.byteLength - 8)
  expect(finalizeWave(audio.audio)).toBe(audio.audio)
}, 180_000)
