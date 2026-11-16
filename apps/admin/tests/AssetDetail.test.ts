import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AssetDetail from '../src/client/components/AssetDetail.vue'
import { useActiveTargetStore } from '../src/client/stores/activeTarget.js'
import { useAssetsListStore } from '../src/client/stores/assetsList.js'
import { useAssetsSelectionStore } from '../src/client/stores/assetsSelection.js'
import { useLocaleStore } from '../src/client/stores/locale.js'
import { useSiteStore } from '../src/client/stores/site.js'
import type { AssetSummary } from '../src/client/api/client.js'

function sample(overrides: Partial<AssetSummary> = {}): AssetSummary {
  return {
    name: 'hero',
    kind: 'embedded',
    mime: 'image/jpeg',
    size: 1000,
    hash: 'aaaaaaaa',
    width: 100,
    height: 100,
    alt: 'Mountain sunset',
    uploadedAt: '2026-04-22T12:00:00.000Z',
    overrideLocales: [],
    overrideThemes: [],
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('AssetDetail', () => {
  it('shows an empty state with nothing selected', () => {
    const wrapper = mount(AssetDetail)
    expect(wrapper.find('[data-testid="asset-detail-empty"]').exists()).toBe(true)
  })

  it('shows the selected asset with name and preview', () => {
    const list = useAssetsListStore()
    const selection = useAssetsSelectionStore()
    list.assets = [sample()]
    selection.select('hero')

    const wrapper = mount(AssetDetail)
    expect(wrapper.find('[data-testid="asset-detail-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="asset-detail-name"]').text()).toBe('hero')
    expect(wrapper.find('img').attributes('src')).toBe('/assets/hero-aaaaaaaa.jpg')
  })

  it('renders kind, mime, size in human-readable format', () => {
    const list = useAssetsListStore()
    const selection = useAssetsSelectionStore()
    list.assets = [sample({ size: 1024 * 1024 * 2 })]
    selection.select('hero')

    const wrapper = mount(AssetDetail)
    const text = wrapper.text()
    expect(text).toContain('embedded')
    expect(text).toContain('image/jpeg')
    expect(text).toContain('2.0 MB')
  })

  it('renders dimensions when both width and height are present', () => {
    const list = useAssetsListStore()
    const selection = useAssetsSelectionStore()
    list.assets = [sample({ width: 1920, height: 1080 })]
    selection.select('hero')

    const wrapper = mount(AssetDetail)
    expect(wrapper.text()).toContain('1920 × 1080')
  })

  it('omits dimensions row when width or height is null', () => {
    const list = useAssetsListStore()
    const selection = useAssetsSelectionStore()
    // Use a non-image (downloadable) so the focal editor — which also
    // renders an `×` in the x/y badge — isn't in the DOM. The dimensions
    // row has its own `Dimensions` label we check is absent.
    list.assets = [sample({ kind: 'downloadable', mime: 'application/pdf', width: null, height: null })]
    selection.select('hero')

    const wrapper = mount(AssetDetail)
    expect(wrapper.text()).not.toContain('Dimensions')
  })

  it('renders the alt editor for images with the current alt value', () => {
    const list = useAssetsListStore()
    const selection = useAssetsSelectionStore()
    list.assets = [sample({ alt: 'My great photo' })]
    selection.select('hero')

    const wrapper = mount(AssetDetail)
    const altInput = wrapper.find<HTMLInputElement>('[data-testid="alt-editor-input"]')
    expect(altInput.exists()).toBe(true)
    expect(altInput.element.value).toBe('My great photo')
  })

  it('renders the alt editor with checked decorative state when alt is empty string', () => {
    const list = useAssetsListStore()
    const selection = useAssetsSelectionStore()
    list.assets = [sample({ alt: '' })]
    selection.select('hero')

    const wrapper = mount(AssetDetail)
    const checkbox = wrapper.find<HTMLInputElement>('[data-testid="alt-editor-decorative"]')
    expect(checkbox.element.checked).toBe(true)
    expect(wrapper.find('[data-testid="alt-editor-state"]').text()).toContain('Decorative')
  })

  it('renders the alt editor with not-set state when alt is null', () => {
    const list = useAssetsListStore()
    const selection = useAssetsSelectionStore()
    list.assets = [sample({ alt: null })]
    selection.select('hero')

    const wrapper = mount(AssetDetail)
    expect(wrapper.find('[data-testid="alt-editor-state"]').text()).toContain('Not set')
  })

  it('shows read-only alt text for non-image assets (PDFs, fonts)', () => {
    const list = useAssetsListStore()
    const selection = useAssetsSelectionStore()
    list.assets = [sample({ kind: 'downloadable', mime: 'application/pdf', alt: 'A document' })]
    selection.select('hero')

    const wrapper = mount(AssetDetail)
    // No editor — non-images still use the read-only display.
    expect(wrapper.find('[data-testid="alt-editor"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('A document')
  })

  it('reverts to empty state when selection clears', async () => {
    const list = useAssetsListStore()
    const selection = useAssetsSelectionStore()
    list.assets = [sample()]
    selection.select('hero')

    const wrapper = mount(AssetDetail)
    expect(wrapper.find('[data-testid="asset-detail-empty"]').exists()).toBe(false)

    selection.clear()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="asset-detail-empty"]').exists()).toBe(true)
  })

  describe('focal point editor', () => {
    it('renders the focal point editor for images', () => {
      const list = useAssetsListStore()
      const selection = useAssetsSelectionStore()
      list.assets = [sample({ kind: 'embedded', mime: 'image/jpeg' })]
      selection.select('hero')

      const wrapper = mount(AssetDetail)
      expect(wrapper.find('[data-testid="focal-editor"]').exists()).toBe(true)
    })

    it('does not render the focal editor for non-image assets', () => {
      const list = useAssetsListStore()
      const selection = useAssetsSelectionStore()
      list.assets = [sample({ kind: 'downloadable', mime: 'application/pdf' })]
      selection.select('hero')

      const wrapper = mount(AssetDetail)
      expect(wrapper.find('[data-testid="focal-editor"]').exists()).toBe(false)
    })

    it('reflects the asset focalPoint in the editor', () => {
      const list = useAssetsListStore()
      const selection = useAssetsSelectionStore()
      list.assets = [sample({ kind: 'embedded', mime: 'image/jpeg', focalPoint: { x: 0.3, y: 0.6 } })]
      selection.select('hero')

      const wrapper = mount(AssetDetail)
      const xy = wrapper.find('[data-testid="focal-xy"]')
      expect(xy.text()).toBe('30% × 60%')
    })

    it('shows default-hint when asset has no focalPoint', () => {
      const list = useAssetsListStore()
      const selection = useAssetsSelectionStore()
      list.assets = [sample({ kind: 'embedded', mime: 'image/jpeg' })]
      selection.select('hero')

      const wrapper = mount(AssetDetail)
      expect(wrapper.find('[data-testid="focal-default-hint"]').exists()).toBe(true)
    })
  })

  describe('AI ✨ Suggest button', () => {
    it('hides the button when target altText.available is false', () => {
      const list = useAssetsListStore()
      const selection = useAssetsSelectionStore()
      const targets = useActiveTargetStore()
      targets.targets = [
        {
          name: 'local',
          environment: 'local',
          type: 'static',
          editable: true,
          altText: { available: false, auto: false },
        },
      ]
      targets.activeTargetName = 'local'
      list.assets = [sample()]
      selection.select('hero')

      const wrapper = mount(AssetDetail)
      expect(wrapper.find('[data-testid="asset-detail-suggest-alt"]').exists()).toBe(false)
    })

    it('shows the button when target altText.available is true', () => {
      const list = useAssetsListStore()
      const selection = useAssetsSelectionStore()
      const targets = useActiveTargetStore()
      targets.targets = [
        {
          name: 'local',
          environment: 'local',
          type: 'static',
          editable: true,
          altText: { available: true, auto: true },
        },
      ]
      targets.activeTargetName = 'local'
      list.assets = [sample()]
      selection.select('hero')

      const wrapper = mount(AssetDetail)
      expect(wrapper.find('[data-testid="asset-detail-suggest-alt"]').exists()).toBe(true)
    })

    it('shows the button regardless of auto flag (auto controls upload-time, not on-demand)', () => {
      const list = useAssetsListStore()
      const selection = useAssetsSelectionStore()
      const targets = useActiveTargetStore()
      targets.targets = [
        {
          name: 'local',
          environment: 'local',
          type: 'static',
          editable: true,
          altText: { available: true, auto: false },
        },
      ]
      targets.activeTargetName = 'local'
      list.assets = [sample()]
      selection.select('hero')

      const wrapper = mount(AssetDetail)
      expect(wrapper.find('[data-testid="asset-detail-suggest-alt"]').exists()).toBe(true)
    })

    it('hides the button for non-image assets even when AI is available', () => {
      const list = useAssetsListStore()
      const selection = useAssetsSelectionStore()
      const targets = useActiveTargetStore()
      targets.targets = [
        {
          name: 'local',
          environment: 'local',
          type: 'static',
          editable: true,
          altText: { available: true, auto: true },
        },
      ]
      targets.activeTargetName = 'local'
      list.assets = [sample({ kind: 'downloadable', mime: 'application/pdf' })]
      selection.select('hero')

      const wrapper = mount(AssetDetail)
      // The alt section is replaced by a plain text dd for non-images,
      // so the suggest button never gets rendered.
      expect(wrapper.find('[data-testid="asset-detail-suggest-alt"]').exists()).toBe(false)
    })
  })
})

describe('AssetDetail alt in the active language', () => {
  type Call = { url: string; method: string; body?: string }
  let calls: Call[]
  let restoreFetch: () => void

  function stubFetch(frenchAlt: string | null) {
    calls = []
    const original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const method = init?.method ?? 'GET'
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined })
      const json = (data: unknown) =>
        new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } })
      if (url.includes('/suggest-alt')) return json({ text: 'Coucher suggéré', refused: false, refusalReason: null })
      const locale = new URL(url, 'http://x').searchParams.get('locale')
      if (method === 'PATCH') {
        const alt = (JSON.parse(String(init?.body)) as { alt: string | null }).alt
        if (locale) frenchAlt = alt
        return json({ manifest: sample(locale ? { localeAlt: { locale, alt } } : { alt }) })
      }
      if (url.includes('/assets/hero')) return json(sample(locale ? { localeAlt: { locale, alt: frenchAlt } } : {}))
      return json([sample()])
    }) as typeof globalThis.fetch
    restoreFetch = () => {
      globalThis.fetch = original
    }
  }

  function setup(active: string, frenchAlt: string | null = null) {
    stubFetch(frenchAlt)
    const site = useSiteStore()
    site.manifest = {
      name: 'test',
      locales: { default: 'en', supported: ['en', 'fr'] },
    } as unknown as typeof site.manifest
    useLocaleStore().setLocale(active)
    const targets = useActiveTargetStore()
    targets.targets = [
      {
        name: 'local',
        environment: 'local',
        type: 'static',
        editable: true,
        altText: { available: true, auto: false },
      },
    ]
    targets.activeTargetName = 'local'
    useAssetsListStore().assets = [sample()]
    useAssetsSelectionStore().select('hero')
    return mount(AssetDetail)
  }

  const patches = () => calls.filter(c => c.method === 'PATCH')
  const localeOf = (c: Call) => new URL(c.url, 'http://x').searchParams.get('locale')

  afterEach(() => restoreFetch())

  it('with French active and no French alt, shows the default greyed with "Using English"', async () => {
    const wrapper = setup('fr', null)
    await flushPromises()
    expect(wrapper.find('[data-testid="alt-editor-language"]').text()).toBe('Alt text (French)')
    expect(wrapper.find<HTMLInputElement>('[data-testid="alt-editor-input"]').element.value).toBe('Mountain sunset')
    expect(wrapper.find('[data-testid="alt-editor-fallback"]').text()).toBe('Using English')
  })

  it('with a French alt, edits it and sends the alt with locale=fr', async () => {
    const wrapper = setup('fr', 'Coucher')
    await flushPromises()
    const input = wrapper.find<HTMLInputElement>('[data-testid="alt-editor-input"]')
    expect(input.element.value).toBe('Coucher')

    await input.setValue('Coucher de soleil')
    await input.trigger('blur')
    await flushPromises()

    expect(patches()).toHaveLength(1)
    expect(localeOf(patches()[0])).toBe('fr')
    expect(JSON.parse(patches()[0].body!)).toEqual({ alt: 'Coucher de soleil' })
  })

  it('accepting an AI suggestion with French active saves it as the French alt', async () => {
    const wrapper = setup('fr', null)
    await flushPromises()
    await wrapper.find('[data-testid="asset-detail-suggest-alt"]').trigger('click')
    await flushPromises()

    const suggest = calls.find(c => c.url.includes('/suggest-alt'))!
    expect(localeOf(suggest)).toBe('fr')
    expect(patches()).toHaveLength(1)
    expect(localeOf(patches()[0])).toBe('fr')
    expect(JSON.parse(patches()[0].body!)).toEqual({ alt: 'Coucher suggéré' })
    expect(wrapper.find<HTMLInputElement>('[data-testid="alt-editor-input"]').element.value).toBe('Coucher suggéré')
  })

  it('with the default language active, sends no locale and shows no language label', async () => {
    const wrapper = setup('en')
    await flushPromises()
    expect(wrapper.find('[data-testid="alt-editor-language"]').exists()).toBe(false)
    const input = wrapper.find<HTMLInputElement>('[data-testid="alt-editor-input"]')
    await input.setValue('Dusk')
    await input.trigger('blur')
    await flushPromises()

    expect(patches()).toHaveLength(1)
    expect(localeOf(patches()[0])).toBeNull()
    const reads = calls.filter(c => c.method === 'GET' && c.url.includes('/assets/hero'))
    expect(reads.length).toBeGreaterThan(0)
    expect(reads.every(c => localeOf(c) === null)).toBe(true)
  })
})
