/**
 * PATCH and GET /api/v1/assets/:name with `?locale=`: alt text edited in
 * the active language (design-media.md M4). A language other than the
 * site's default writes `{name}.asset.{locale}.json`; the default
 * language, or no `locale`, writes the default manifest as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hono } from 'hono'
import { createAdminApp } from '../src/admin-api/index.js'
import { createSourceContext } from '../src/admin-api/source-context.js'
import { ErrorResponseSchema } from '../src/admin-api/schemas/error.js'
import { AssetMetadataResponseSchema, AssetSummarySchema } from '../src/admin-api/schemas/assets.js'
import type { ValidationScanner } from '../src/validation/scanner.js'
import { memoryStorage, type MemoryStorage } from './_helpers/memory-storage.js'

let app: Hono
let storage: MemoryStorage

const DEFAULT_MANIFEST = {
  version: 1,
  name: 'hero',
  kind: 'embedded',
  source: 'internal',
  mime: 'image/jpeg',
  size: 10,
  hash: 'abc12345',
  width: 4,
  height: 4,
  variants: [],
  alt: 'Sunset',
  uploadedAt: '2026-05-03T00:00:00Z',
  uploadedBy: '',
}

beforeEach(() => {
  storage = memoryStorage()
  storage.seed({ 'assets/hero.asset.json': JSON.stringify(DEFAULT_MANIFEST) })
  const targetConfigs = {
    local: { storage, type: 'esi' as const, environment: 'local' as const, editable: true },
  }
  const source = createSourceContext({
    storage,
    siteDir: '',
    projectSiteDir: '/test-project',
    manifest: { name: 'test-site', locales: { default: 'en', supported: ['en', 'fr'] }, targets: targetConfigs },
  })
  const scanner = {
    scanAll: vi.fn().mockResolvedValue(undefined),
    rescan: vi.fn().mockResolvedValue(undefined),
    getIssues: vi.fn().mockReturnValue([]),
    subscribe: vi.fn().mockReturnValue(() => {}),
  } as unknown as ValidationScanner
  app = createAdminApp({
    source,
    siteDir: '/test-project',
    templatesDir: '/test-project/templates',
    targets: new Map([['local', storage]]),
    targetConfigs,
    disableCacheStatsLogger: true,
    validationScanner: scanner,
  })
})

function patch(query: string, body: unknown) {
  return app.request(`/api/v1/assets/hero${query}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  if (!(await storage.exists(path))) return null
  return JSON.parse(await storage.readFile(path)) as Record<string, unknown>
}

describe('PATCH /api/v1/assets/:name?locale=', () => {
  it('writes the French manifest and leaves the default alt unchanged', async () => {
    const res = await patch('?locale=fr', { alt: 'Coucher de soleil' })

    expect(res.status).toBe(200)
    const body = AssetMetadataResponseSchema.parse(await res.json())
    expect(body.manifest.alt).toBe('Sunset')
    expect(body.manifest.localeAlt).toEqual({ locale: 'fr', alt: 'Coucher de soleil' })
    expect(await readJson('assets/hero.asset.fr.json')).toEqual({ version: 1, name: 'hero', alt: 'Coucher de soleil' })
    expect((await readJson('assets/hero.asset.json'))?.alt).toBe('Sunset')
  })

  it.each([
    ['without a locale', ''],
    ['with the default locale', '?locale=en'],
    ['with the default locale in capitals', '?locale=EN'],
  ])('patches the default manifest %s', async (_label, query) => {
    const res = await patch(query, { alt: 'Dusk' })

    expect(res.status).toBe(200)
    const body = AssetMetadataResponseSchema.parse(await res.json())
    expect(body.manifest.alt).toBe('Dusk')
    expect(body.manifest.localeAlt).toBeUndefined()
    expect((await readJson('assets/hero.asset.json'))?.alt).toBe('Dusk')
    expect(await readJson('assets/hero.asset.fr.json')).toBeNull()
  })

  it('writes a capitalised language code to the lowercase file', async () => {
    expect((await patch('?locale=FR', { alt: 'Coucher' })).status).toBe(200)
    expect((await readJson('assets/hero.asset.fr.json'))?.alt).toBe('Coucher')
    expect(await readJson('assets/hero.asset.FR.json')).toBeNull()
  })

  it('alt: null clears the French alt, deletes the emptied file and reports the fallback', async () => {
    await patch('?locale=fr', { alt: 'Coucher' })

    const res = await patch('?locale=fr', { alt: null })

    expect(res.status).toBe(200)
    const body = AssetMetadataResponseSchema.parse(await res.json())
    expect(body.manifest.localeAlt).toEqual({ locale: 'fr', alt: null })
    expect(await readJson('assets/hero.asset.fr.json')).toBeNull()
    expect((await readJson('assets/hero.asset.json'))?.alt).toBe('Sunset')
  })

  it('answers 400 problem+json for an invalid locale and writes nothing', async () => {
    const res = await patch('?locale=NOT_A_LOCALE!', { alt: 'x' })

    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(ErrorResponseSchema.parse(await res.json()).code).toBe('BAD_REQUEST')
    expect((await readJson('assets/hero.asset.json'))?.alt).toBe('Sunset')
    expect([...storage.dump().keys()].filter(p => p.startsWith('assets/'))).toEqual(['assets/hero.asset.json'])
  })
})

describe('GET /api/v1/assets/:name?locale=', () => {
  it('reports the language alt, or null when it falls back', async () => {
    const before = AssetSummarySchema.parse(await (await app.request('/api/v1/assets/hero?locale=fr')).json())
    expect(before.localeAlt).toEqual({ locale: 'fr', alt: null })

    await patch('?locale=fr', { alt: '' })

    const after = AssetSummarySchema.parse(await (await app.request('/api/v1/assets/hero?locale=fr')).json())
    expect(after.localeAlt).toEqual({ locale: 'fr', alt: '' })
    expect(after.alt).toBe('Sunset')
  })

  it('answers 400 for an invalid locale', async () => {
    const res = await app.request('/api/v1/assets/hero?locale=xx_YY!')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/v1/assets/:name overrideBytesLocales', () => {
  it('lists a language with its own file, not one with only its own alt', async () => {
    await patch('?locale=fr', { alt: 'Coucher' })
    storage.seed({
      'assets/hero.asset.de.json': JSON.stringify({
        version: 1,
        name: 'hero',
        hash: 'def67890',
        size: 5,
        mime: 'image/jpeg',
        width: 4,
        height: 4,
        variants: [],
      }),
    })

    const summary = AssetSummarySchema.parse(await (await app.request('/api/v1/assets/hero')).json())

    expect(summary.overrideLocales).toEqual(['de', 'fr'])
    expect(summary.overrideBytesLocales).toEqual(['de'])
  })
})
