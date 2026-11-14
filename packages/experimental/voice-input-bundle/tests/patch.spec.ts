/** The optional bundle mounts each plugin after everything it consumes. */
import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import { expect, it } from 'vitest'

/**
 * Parse the patch text after dropping the loader's `!!js` tag, which plain YAML rejects.
 * @param text - patch file contents.
 * @returns the decoded document.
 */
function decode(text: string): unknown {
  return load(text.replace(/!!js\s+/g, ''))
}

/** One loader entry the patch inserts. */
interface Entry {
  readonly id: string
  readonly name: string
}

/**
 * Read the single insert list this bundle ships.
 * @returns entry ids and package names in mount order.
 */
function entries(): readonly Entry[] {
  const path = new URL('../cordis.patch.yml', import.meta.url)
  const parsed: unknown = decode(readFileSync(path, 'utf8'))
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new Error('the patch must be one insert document')
  const documents: readonly unknown[] = parsed
  const document = documents[0]
  if (typeof document !== 'object' || document === null || !('insert' in document)) throw new Error('the document must insert')
  const insert: unknown = document.insert
  if (!Array.isArray(insert)) throw new Error('insert must be a list')
  const list: readonly unknown[] = insert
  return list.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('id' in entry) || !('name' in entry)) throw new Error('each entry needs an id and a name')
    const id: unknown = entry.id
    const name: unknown = entry.name
    if (typeof id !== 'string' || typeof name !== 'string') throw new Error('id and name must be strings')
    return { id, name }
  })
}

it('mounts services before providers and providers before their consumers', () => {
  const mounted = entries()
  const order = new Map(mounted.map((entry, index) => [entry.id, index]))
  const before = (earlier: string, later: string): void => {
    const left = order.get(earlier), right = order.get(later)
    expect(left, earlier).toBeTypeOf('number')
    expect(right, later).toBeTypeOf('number')
    expect(left!).toBeLessThan(right!)
  }
  before('speech-to-text', 'speech-to-text-deepseek')
  before('speech-to-text-deepseek', 'speech-to-text-auto')
  before('speech-synthesis', 'speech-synthesis-deepseek')
  before('speech-synthesis-deepseek', 'api-speech-to-text')
  before('ui-voice-input', 'ui-read-aloud')
})

it('declares every mounted plugin as a bundle dependency', () => {
  const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  if (typeof manifest !== 'object' || manifest === null || !('dependencies' in manifest)) throw new Error('the manifest needs dependencies')
  const dependencies: unknown = manifest.dependencies
  if (typeof dependencies !== 'object' || dependencies === null) throw new Error('dependencies must be an object')
  for (const entry of entries()) {
    expect(Object.hasOwn(dependencies, entry.name), entry.name).toBe(true)
  }
})
