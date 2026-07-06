import { describe, expect, test } from 'bun:test'
import { tokenizeJson, type JsonToken } from './jsonHighlight'

const join = (tokens: JsonToken[]) => tokens.map((t) => t.text).join('')
const typesOf = (tokens: JsonToken[], type: string) =>
  tokens.filter((t) => t.type === type).map((t) => t.text)

describe('tokenizeJson', () => {
  test('round-trips to the pretty-printed JSON', () => {
    const value = { a: 1, b: 'two', c: null, d: true, nested: { x: [1, 2] } }
    expect(join(tokenizeJson(value))).toBe(JSON.stringify(value, null, 2))
  })

  test('classifies keys, strings, numbers, booleans and null', () => {
    const tokens = tokenizeJson({ name: 'hi', count: -3.5, ok: false, missing: null })
    expect(typesOf(tokens, 'key')).toEqual(['"name"', '"count"', '"ok"', '"missing"'])
    expect(typesOf(tokens, 'string')).toEqual(['"hi"'])
    expect(typesOf(tokens, 'number')).toEqual(['-3.5'])
    expect(typesOf(tokens, 'boolean')).toEqual(['false'])
    expect(typesOf(tokens, 'null')).toEqual(['null'])
  })

  test('keeps the colon separate from the key', () => {
    const tokens = tokenizeJson({ a: 1 })
    expect(tokens.some((t) => t.type === 'punctuation' && t.text.includes(':'))).toBe(true)
    expect(tokens.some((t) => t.type === 'key' && t.text === '"a"')).toBe(true)
  })

  test('does not treat numeric-looking string content as a number', () => {
    const tokens = tokenizeJson('42')
    expect(tokens).toEqual([{ text: '"42"', type: 'string' }])
  })

  test('falls back to a plain token when the value is not JSON-serializable', () => {
    const tokens = tokenizeJson(undefined)
    expect(tokens).toEqual([{ text: 'undefined', type: 'plain' }])
  })
})
