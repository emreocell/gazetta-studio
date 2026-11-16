/**
 * The two halves of a locale (or theme) override manifest: the fields
 * that describe its own bytes, and everything else (alt, focal point,
 * title, description and future metadata).
 *
 * Byte ingest and override removal own the byte half; the metadata
 * patch owns the rest. Each writer merges into the manifest instead of
 * replacing it, so neither erases the other's fields (design-media.md M4).
 */

/** Fields that describe an override's own bytes. Present together or not at all. */
export const LOCALE_BYTE_FIELDS = ['hash', 'size', 'mime', 'width', 'height', 'variants', 'variantsStatus'] as const

/** Fields every manifest carries, which say nothing about the override. */
const IDENTITY_FIELDS = new Set(['version', 'name'])

/** A copy of `manifest` without its byte fields. */
export function withoutByteFields<M extends object>(manifest: M): Partial<M> {
  const out = { ...manifest } as Record<string, unknown>
  for (const field of LOCALE_BYTE_FIELDS) delete out[field]
  return out as Partial<M>
}

/**
 * True when the override still says something: its own bytes, or any
 * metadata field. An override that says nothing is deleted rather than
 * kept as an empty file.
 */
export function overrideHasContent(manifest: object): boolean {
  return Object.entries(manifest).some(([key, value]) => !IDENTITY_FIELDS.has(key) && value !== undefined)
}
