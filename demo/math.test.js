import assert from 'node:assert/strict'
import { it } from 'node:test'

import { add } from './math.js'

it('adds', () => {
  assert.equal(add(2, 2), 4)
})
