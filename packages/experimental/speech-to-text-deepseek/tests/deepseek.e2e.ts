/** Real DeepSeek ASR round trip; skipped without DEEPSEEK_API_KEY. */
import { expect, it } from 'vitest'
import { transcribeDeepSeekAsr, DEEPSEEK_ASR_MAX_AUDIO_BYTES, DEEPSEEK_ASR_PATH } from '@deepseek-ai/dsh-experimental-speech-to-text-deepseek'

const apiKey = process.env.DEEPSEEK_API_KEY
const run = apiKey === undefined || apiKey.length === 0 ? it.skip : it

/**
 * Build one canonical 16 kHz mono 16-bit PCM WAV of a sine tone.
 * @param seconds - duration to encode.
 * @param frequency - tone frequency.
 * @returns complete WAV bytes.
 */
function tone(seconds: number, frequency: number): Uint8Array {
  const rate = 16_000, samples = rate * seconds
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index)
  }
  ascii(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  ascii(36, 'data'); view.setUint32(40, samples * 2, true)
  for (let index = 0; index < samples; index += 1) {
    view.setInt16(44 + index * 2, Math.round(Math.sin((2 * Math.PI * frequency * index) / rate) * 8000), true)
  }
  return bytes
}

run('transcribes one complete recording through the documented endpoint', async () => {
  const transcript = await transcribeDeepSeekAsr({
    endpoint: `https://api.deepseek.com${DEEPSEEK_ASR_PATH}`,
    resolveApiKey: async () => apiKey,
    timeoutMs: 60_000,
    maxAudioBytes: DEEPSEEK_ASR_MAX_AUDIO_BYTES,
  }, { audio: tone(1, 440), signal: new AbortController().signal })
  expect(typeof transcript.text).toBe('string')
  expect(transcript.audioSeconds).toBeGreaterThan(0.5)
  expect(transcript.inferenceSeconds).toBeGreaterThan(0)
}, 120_000)
