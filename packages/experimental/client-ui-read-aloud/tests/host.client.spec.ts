/** The client-only package still ships a loadable Host marker. */
import { expect, it } from 'vitest'
import { apply } from '../src/index.ts'

it('exposes a no-op host entry', () => {
  const outcome = apply()
  expect(outcome).toBeUndefined()
})
