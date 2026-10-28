import { describe, expect, it } from 'vitest'
import { parseRoute } from './router'

describe('parseRoute', () => {
  it.each([
    ['', { name: 'home', params: {} }],
    ['#/', { name: 'home', params: {} }],
    ['#/review', { name: 'review', params: {} }],
    ['#/review?deck=abc', { name: 'review', params: { deck: 'abc' } }],
    ['#/settings', { name: 'settings', params: {} }],
    ['#/import', { name: 'import', params: {} }],
    ['#/editor?deck=n5', { name: 'editor', params: { deck: 'n5' } }],
    ['#/nope', { name: 'home', params: {} }],
  ])('parses %s', (hash, expected) => {
    expect(parseRoute(hash)).toEqual(expected)
  })
})
