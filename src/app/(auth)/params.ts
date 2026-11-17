// Helper for reading ?query=values in pages.
export type SearchParams = Promise<Record<string, string | string[] | undefined>>

export function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}
