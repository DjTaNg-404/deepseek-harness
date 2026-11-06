import { describe, expect, it } from 'vitest'
import { resolveRouteModels, type RouteCatalogRequest } from '../src/catalog.ts'

/**
 * Resolve one hand-declared route whose single fact under test is supplied.
 * An unknown provider keeps the installed catalog out of the answer, so each
 * case sees only what it declared.
 * @param extra - route-level overrides, typically `models` or the default.
 * @returns the materialized route catalog.
 */
const route = (extra: Partial<RouteCatalogRequest>) => resolveRouteModels({
  provider: 'acme-gateway',
  api: 'openai-completions',
  baseURL: 'https://acme.test',
  models: [{ id: 'm' }],
  defaultInput: ['text'],
  defaultContextWindow: 1_000,
  defaultMaxTokens: 100,
  ...extra,
})

describe('route tool capability', () => {
  it('records only a capability the profile withheld', () => {
    // Absence is the capable answer, so a map full of `true` would be noise.
    expect(route({ models: [{ id: 'm' }] }).supportsTools.size).toBe(0)
    expect(route({ models: [{ id: 'm', supportsTools: false }] }).supportsTools.get('m')).toBe(false)
  })

  it('lets a route withhold tools from every model it does not exempt', () => {
    const catalog = route({
      models: [{ id: 'm' }, { id: 'n', supportsTools: true }],
      defaultSupportsTools: false,
    })
    // The route answers for the silent entry; the explicit `true` wins back.
    expect(catalog.supportsTools.get('m')).toBe(false)
    expect(catalog.supportsTools.has('n')).toBe(false)
  })

  it('keeps an undeclared route unchanged', () => {
    // The whole point of the default: an existing profile gains nothing.
    expect(route({}).supportsTools.size).toBe(0)
    expect(route({ defaultSupportsTools: true }).supportsTools.size).toBe(0)
  })
})
