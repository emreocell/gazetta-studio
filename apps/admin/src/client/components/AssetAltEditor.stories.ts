/**
 * Stories for AssetAltEditor — three-state v-model pattern.
 *
 * Validates: form-interaction stories where the component's local
 * state tracks the prop via `watch(() => props.modelValue, ...)`.
 * Storybook's controls let the author flip between the three states
 * (`null` / `""` / `"text"`) to confirm the input + checkbox stay
 * in sync.
 */
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import AssetAltEditor from './AssetAltEditor.vue'

const meta: Meta<typeof AssetAltEditor> = {
  title: 'Asset / AltEditor',
  component: AssetAltEditor,
  argTypes: {
    modelValue: {
      control: 'select',
      options: [null, '', 'Mountain sunset at dusk'],
      description: 'Three-state alt: null (not set), "" (decorative), or text (meaningful)',
    },
    'onUpdate:modelValue': { action: 'update:modelValue' },
  },
}

export default meta

type Story = StoryObj<typeof AssetAltEditor>

/**
 * Not-set state — input is empty, decorative is unchecked. The
 * status line shows "Not set — admin will warn." Most common state
 * for newly-uploaded assets that the author hasn't annotated yet.
 */
export const NotSet: Story = {
  args: { modelValue: null },
}

/**
 * Meaningful description — the WCAG-recommended state for content
 * images. Input is populated, decorative is unchecked, status line
 * is empty.
 */
export const Meaningful: Story = {
  args: { modelValue: 'Mountain sunset at dusk' },
}

/**
 * Decorative state — empty string. Checkbox is checked, input is
 * disabled, status line shows "Decorative — skipped by screen
 * readers." Used for purely-presentational images (background
 * patterns, dividers).
 */
export const Decorative: Story = {
  args: { modelValue: '' },
}

/**
 * Long-text edge case — confirms the input does not break layout when
 * the alt text approaches the WAI-ARIA-recommended 125-character
 * upper bound. The author is encouraged to keep it shorter, but the
 * editor allows long text.
 */
export const LongText: Story = {
  args: {
    modelValue:
      'A panoramic landscape photograph at dusk showing rolling hills, a setting sun, and a distant village with smoke rising from chimneys, taken at golden hour with warm tones',
  },
}

/*
 * Alt text per language — design-media.md "State tables", "Alt text per
 * language, in the detail pane (cut 3, M4)". English is the default
 * language and French the active one. The "Default language active" row
 * is the stories above; "Suggest with French active" fills the French
 * alt in AssetDetail (tests/AssetDetail.test.ts) and shows here as
 * `FrenchOwnAlt`.
 */
const french = { name: 'French', defaultName: 'English', fallback: 'Mountain sunset at dusk' }

/** French, no French alt: the English alt greyed, "Using English", "Copy English to edit". */
export const FrenchFallback: Story = {
  args: { modelValue: null, language: french },
}

/** French, own alt: the field is editable, with "Clear French alt (use English)". */
export const FrenchOwnAlt: Story = {
  args: { modelValue: 'Coucher de soleil sur la montagne', language: french },
}

/** French, decorative: the same checkbox as the default language, saved for French only. */
export const FrenchDecorative: Story = {
  args: { modelValue: '', language: french },
}

/** No alt in any language: "Not set — admin will warn", nothing to copy. */
export const NoAltAnyLanguage: Story = {
  args: { modelValue: null, language: { ...french, fallback: null } },
}
