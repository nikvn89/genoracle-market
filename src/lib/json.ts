/**
 * Decode a contract view result into a plain object.
 *
 * GenLayer views on this contract return `str`, and the value reaches the
 * client in one of two shapes: the JSON text itself, or that text wrapped in a
 * second JSON string layer. Both have to work, and neither may alter the
 * content in between.
 *
 * The previous implementation stripped a leading/trailing quote and then ran
 * `.replace(/\\"/g, '"')` before `JSON.parse`. That un-escaped every `\"`
 * inside the payload, which is exactly the escaping that makes a quote legal
 * inside a JSON string -- so any market question or `resolution_quote`
 * containing a double quote produced invalid JSON, `JSON.parse` threw, and the
 * caller silently received its empty fallback. Since `get_all_markets` returns
 * every market in one string, one such market blanked the entire list.
 *
 * Parsing the layers instead of rewriting the text handles both shapes and
 * leaves the payload untouched. Covered by `json.test.ts`.
 */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof value !== 'string') return value as T

  try {
    const decoded = JSON.parse(value)
    // A view declared `-> str` can arrive double-encoded; unwrap one layer.
    return (typeof decoded === 'string' ? JSON.parse(decoded) : decoded) as T
  } catch {
    return fallback
  }
}
