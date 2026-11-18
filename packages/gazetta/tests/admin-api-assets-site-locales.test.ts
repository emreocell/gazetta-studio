/**
 * The asset routes that write or remove a language's own file
 * (PATCH `?locale=`, POST and DELETE `/locale-bytes?locale=`) refuse a
 * language the site doesn't list, and lowercase the code they accept: the
 * resolver reads only `hero.<lowercase code>.*` for a listed language, so
 * anything else would be a file no page uses.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import type { Hono } from 'hono'
import { createAdminApp } from '../src/admin-api/index.js'
import { createSourceContext } from '../src/admin-api/source-context.js'
import { ErrorResponseSchema } from '../src/admin-api/schemas/error.js'
import type { SiteManifest } from '../src/types.js'
import type { ValidationScanner } from '../src/validation/scanner.js'
import { memoryStorage, type MemoryStorage } from './_helpers/memory-storage.js'

let app: Hono
let storage: MemoryStorage

function buildApp(locales: SiteManifest['locales'], existing?: MemoryStorage) {
  storage = existing ?? memoryStorage()
  const targetConfigs = {
    local: { storage, type: 'esi' as const, environment: 'local' as const, editable: true },
  }
  const source = createSourceContext({
    storage,
    siteDir: '',
    projectSiteDir: '/test-project',
    manifest: { name: 'test-site', ...(locales ? { locales } : {}), targets: targetConfigs },
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
}

async function jpegForm(): Promise<FormData> {
  const bytes = await sharp({
    create: { width: 16, height: 12, channels: 3, background: { r: 128, g: 128, b: 128 } },
  })
    .jpeg()
    .toBuffer()
  const form = new FormData()
  form.set('file', new File([new Uint8Array(bytes)], 'hero.jpg', { type: 'image/jpeg' }))
  return form
}

async function uploadHero() {
  const form = await jpegForm()
  form.set('name', 'hero')
  const res = await app.request('/api/v1/assets', { method: 'POST', body: form })
  expect(res.status).toBe(201)
}

async function postBytes(query: string) {
  return app.request(`/api/v1/assets/hero/locale-bytes${query}`, { method: 'POST', body: await jpegForm() })
}

function deleteBytes(query: string) {
  return app.request(`/api/v1/assets/hero/locale-bytes${query}`, { method: 'DELETE' })
}

function patchAlt(query: string) {
  return app.request(`/api/v1/assets/hero${query}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ alt: 'x' }),
  })
}

/** Every stored asset path other than the default manifest and its bytes. */
function languageFiles(): string[] {
  return [...storage.dump().keys()].filter(p => p.startsWith('assets/') && /\.(fr|de)\b/i.test(p))
}

async function expectUnlisted(res: Response, code: string) {
  expect(res.status).toBe(400)
  expect(res.headers.get('content-type')).toBe('application/problem+json')
  expect(ErrorResponseSchema.parse(await res.json())).toMatchObject({
    code: 'BAD_REQUEST',
    detail: `Locale ${code} is not one of the site's languages: en, fr`,
  })
}

describe('a site that lists English and French', () => {
  beforeEach(async () => {
    buildApp({ default: 'en', supported: ['en', 'fr'] })
    await uploadHero()
  })

  it('PATCH ?locale=de answers 400 naming the site languages and writes nothing', async () => {
    await expectUnlisted(await patchAlt('?locale=de'), 'de')
    expect(languageFiles()).toEqual([])
  })

  it('POST locale-bytes ?locale=de answers 400 naming the site languages and writes nothing', async () => {
    await expectUnlisted(await postBytes('?locale=de'), 'de')
    expect(languageFiles()).toEqual([])
  })

  it('POST locale-bytes ?locale=de&theme=dark answers 400 too', async () => {
    await expectUnlisted(await postBytes('?locale=de&theme=dark'), 'de')
    expect(languageFiles()).toEqual([])
  })

  it('DELETE locale-bytes ?locale=de answers 404 when there is no such override', async () => {
    const res = await deleteBytes('?locale=de')

    expect(res.status).toBe(404)
  })

  it('DELETE still removes an override whose language the site has since dropped', async () => {
    expect((await postBytes('?locale=fr')).status).toBe(201)
    buildApp({ default: 'en', supported: ['en'] }, storage)

    const res = await deleteBytes('?locale=fr')

    expect(res.status).toBe(204)
    expect(languageFiles()).toEqual([])
  })

  it('names the lowercase code when the unlisted one is typed in capitals', async () => {
    await expectUnlisted(await postBytes('?locale=DE'), 'de')
  })

  it('POST locale-bytes ?locale=FR writes the lowercase files', async () => {
    const res = await postBytes('?locale=FR')

    expect(res.status).toBe(201)
    const { bytesPath } = (await res.json()) as { bytesPath: string }
    expect(bytesPath).toMatch(/\.fr\.jpg$/)
    const files = languageFiles()
    expect(files.some(p => p.endsWith('hero.asset.fr.json'))).toBe(true)
    expect(files.filter(p => p.includes('.FR'))).toEqual([])
  })

  it('DELETE locale-bytes ?locale=FR removes the lowercase override', async () => {
    expect((await postBytes('?locale=fr')).status).toBe(201)

    const res = await deleteBytes('?locale=FR')

    expect(res.status).toBe(204)
    expect(languageFiles()).toEqual([])
  })

  it('DELETE locale-bytes ?locale=FR still removes an override stored with a capital code', async () => {
    expect((await postBytes('?locale=fr')).status).toBe(201)
    // What the route wrote before it lowercased the code.
    const legacy = new Map<string, Uint8Array>()
    for (const [path, bytes] of storage.dump()) {
      if (path.startsWith('assets/') && /\.fr\./.test(path)) {
        storage.seedBytes({ [path.replace(/\.fr\./, '.FR.')]: bytes })
        legacy.set(path, bytes)
      }
    }
    for (const path of legacy.keys()) await storage.rm(path)
    expect(languageFiles().length).toBeGreaterThan(0)
    expect(languageFiles().every(p => p.includes('.FR.'))).toBe(true)

    const res = await deleteBytes('?locale=FR')

    expect(res.status).toBe(204)
    expect(languageFiles()).toEqual([])
  })

  it('still accepts a listed language on PATCH', async () => {
    expect((await patchAlt('?locale=fr')).status).toBe(200)
  })
})

describe('a site that lists no languages', () => {
  beforeEach(async () => {
    buildApp(undefined)
    await uploadHero()
  })

  it('accepts any valid code on PATCH and POST locale-bytes', async () => {
    expect((await patchAlt('?locale=de')).status).toBe(200)
    expect((await postBytes('?locale=de')).status).toBe(201)
  })
})

describe('a site whose default language is not in its supported list', () => {
  it('still accepts the default language', async () => {
    buildApp({ default: 'fr', supported: ['en'] })
    await uploadHero()

    expect((await patchAlt('?locale=fr')).status).toBe(200)
    expect((await postBytes('?locale=fr')).status).toBe(201)
  })

  it('names the default language too when it refuses another one', async () => {
    buildApp({ default: 'fr', supported: ['en'] })
    await uploadHero()

    const res = await patchAlt('?locale=de')

    expect(res.status).toBe(400)
    expect(ErrorResponseSchema.parse(await res.json()).detail).toBe(
      "Locale de is not one of the site's languages: fr, en",
    )
  })
})
