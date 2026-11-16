/**
 * Update an asset's metadata (alt and focal point; tags, title,
 * description as those land).
 *
 * Single responsibility: merge a metadata patch into the manifest the
 * selector names — the default manifest, or a locale (or theme) override
 * manifest — validate, persist, record history. Doesn't touch bytes,
 * doesn't enumerate paths, doesn't scan refs.
 *
 * On an override manifest (design-media.md M4) a field present in the
 * patch is that language's own value; `null` removes the field, so the
 * language falls back to the default. The file is created on the first
 * edit (metadata only, no bytes) and deleted once it says nothing.
 *
 * Three-state alt semantics (per design-media.md):
 *   - patch.alt === undefined  → leave alt unchanged (caller didn't send it)
 *   - patch.alt === "string"   → meaningful description
 *   - patch.alt === ""         → intentionally decorative
 *   - patch.alt === null       → not set (resolver falls back to '')
 *
 * The discriminator is `'alt' in patch` vs `patch.alt`. JS-level distinct
 * meaning of "absent" vs "explicit null". The HTTP layer translates
 * between JSON's `null` (explicit) and field-not-present (absent) so the
 * three-state contract survives the wire.
 */
import type { ContentRoot } from '../content-root.js'
import type { HistoryProvider } from '../history.js'
import { recordWrite, type WrittenItem } from '../history-recorder.js'
import type { Selector } from '../schema/dimensions.js'
import type { AssetManifest, LocaleOverrideManifest } from '../schema/types.js'
import type { StorageProvider } from '../types.js'
import { rmIgnoreMissing } from '../providers/_rm-ignore-missing.js'
import { manifestPath, readManifest, writeLocaleManifest, writeManifest } from './manifest.js'
import { localeManifestVariantFor } from './manifest-locale.js'
import { overrideHasContent } from './locale-manifest-fields.js'
import { AssetStorageError } from './errors.js'

/**
 * Patch shape — every field optional; only present fields are applied.
 * Undefined = "don't change," explicit `null` = "set to null state."
 */
interface AssetMetadataPatch {
  /** Three-state alt (string | "" | null). Absent in patch = unchanged. */
  alt?: string | null
  /**
   * Focal point in normalized coordinates (0–1). Two-state:
   *   - `{ x, y }` → set it
   *   - `null`     → clear (manifest field becomes absent, falls back
   *                  to center at render time)
   *   - omitted    → unchanged
   */
  focalPoint?: { x: number; y: number } | null
  // Future: tags, title, description, uploadedBy
}

export interface UpdateAssetMetadataInput {
  storage: StorageProvider
  assetsRoot: string
  assetName: string
  patch: AssetMetadataPatch
  /**
   * Which manifest to patch. Null or omitted = the default manifest;
   * a selector = that locale (or theme) override manifest.
   */
  selector?: Selector | null
  history?: HistoryProvider
  contentRoot?: ContentRoot
  author?: string
}

/**
 * Apply a metadata patch to the asset's default manifest. Throws:
 *   - `AssetManifestNotFoundError` — asset doesn't exist
 *   - `AssetStorageError` — manifest write failed
 *
 * Returns the updated manifest so callers can re-summarize for the
 * client without an extra round-trip.
 */
export async function updateAssetMetadata(input: UpdateAssetMetadataInput): Promise<AssetManifest> {
  // Read the default first even for an override: it's the 404 when the asset doesn't exist.
  const current = await readManifest(input.storage, input.assetsRoot, input.assetName)
  if (input.selector) {
    await updateOverrideMetadata(input, input.selector)
    return current
  }

  // Apply patch: only fields explicitly present in the patch object
  // overwrite the manifest. Each new metadata field adds one
  // `'field' in input.patch` clause here.
  const next: AssetManifest = { ...current }
  if ('alt' in input.patch) {
    next.alt = input.patch.alt ?? null
  }
  if ('focalPoint' in input.patch) {
    const fp = input.patch.focalPoint
    if (fp === null) {
      // Clear → remove the field so the manifest serializes without it.
      delete next.focalPoint
    } else if (fp !== undefined) {
      assertFocalPointInRange(fp)
      next.focalPoint = { x: fp.x, y: fp.y }
    }
  }

  // Short-circuit no-op patches: identical manifest = identical history
  // entry, but the recorder doesn't dedup entries that produce the same
  // snapshot, so we'd accumulate empty revisions. Skip if nothing changed.
  if (sameManifest(current, next)) return current

  const path = `${input.assetsRoot}/${manifestPath(next.name)}`
  const serialized = `${JSON.stringify(next, null, 2)}\n`

  await recordMetadataWrite(input, [{ path, content: serialized }])

  try {
    await writeManifest(input.storage, input.assetsRoot, next)
  } catch (err) {
    throw new AssetStorageError('write', path, err)
  }
  return next
}

/**
 * Patch the override manifest `selector` names. Byte fields it already
 * holds are kept as they are; only metadata fields change.
 */
async function updateOverrideMetadata(input: UpdateAssetMetadataInput, selector: Selector): Promise<void> {
  // Embedded and downloadable overrides share one shape; font overrides
  // add characters rather than metadata, so alt editing doesn't apply.
  const existing = await localeManifestVariantFor('embedded').read(
    input.storage,
    input.assetsRoot,
    input.assetName,
    selector,
  )
  const current: LocaleOverrideManifest = existing ?? { version: 1, name: input.assetName }
  const next: Record<string, unknown> = { ...current }

  if ('alt' in input.patch) {
    if (input.patch.alt === null || input.patch.alt === undefined) delete next.alt
    else next.alt = input.patch.alt
  }
  if ('focalPoint' in input.patch) {
    const fp = input.patch.focalPoint
    if (fp === null) delete next.focalPoint
    else if (fp !== undefined) {
      assertFocalPointInRange(fp)
      next.focalPoint = { x: fp.x, y: fp.y }
    }
  }

  const keep = overrideHasContent(next)
  if (existing === null && !keep) return
  if (existing !== null && keep && sameOverride(existing, next)) return

  const path = `${input.assetsRoot}/${manifestPath(input.assetName, selector)}`
  const serialized = keep ? `${JSON.stringify(next, null, 2)}\n` : null
  await recordMetadataWrite(input, [{ path, content: serialized }])

  if (keep) {
    await writeLocaleManifest(input.storage, input.assetsRoot, input.assetName, selector, next)
    return
  }
  try {
    await rmIgnoreMissing(input.storage, path)
  } catch (err) {
    throw new AssetStorageError('delete', path, err)
  }
}

/** Record history BEFORE the write, so a first-time baseline scan captures the pre-op state. */
async function recordMetadataWrite(input: UpdateAssetMetadataInput, items: WrittenItem[]): Promise<void> {
  if (!input.history) return
  if (!input.contentRoot) {
    throw new Error('updateAssetMetadata: history requires contentRoot')
  }
  await recordWrite({
    history: input.history,
    contentRoot: input.contentRoot,
    operation: 'save',
    author: input.author,
    items,
    message: `Update metadata for ${input.assetName}`,
  })
}

/**
 * Out-of-range input is a programmer error at this layer — the route
 * validator rejects it first. Throw rather than silently clamp.
 */
function assertFocalPointInRange(fp: { x: number; y: number }): void {
  if (fp.x < 0 || fp.x > 1 || fp.y < 0 || fp.y > 1) {
    throw new Error(`Focal point out of range: x=${fp.x}, y=${fp.y} (must be 0–1)`)
  }
}

function sameOverride(a: LocaleOverrideManifest, b: Record<string, unknown>): boolean {
  return a.alt === b.alt && sameFocalPoint(a.focalPoint, b.focalPoint as { x: number; y: number } | undefined)
}

function sameManifest(a: AssetManifest, b: AssetManifest): boolean {
  // Cheap deep-equal for the fields a metadata patch can change. Avoids
  // a full JSON.stringify compare for the hot no-op path.
  if (a.alt !== b.alt) return false
  return sameFocalPoint(a.focalPoint, b.focalPoint)
}

function sameFocalPoint(a: { x: number; y: number } | undefined, b: { x: number; y: number } | undefined): boolean {
  if (a === undefined && b === undefined) return true
  if (a === undefined || b === undefined) return false
  return a.x === b.x && a.y === b.y
}
