<script setup lang="ts">
/**
 * Three-state alt editor — used in the asset detail pane and reusable
 * elsewhere (future: picker reference-options panel).
 *
 * Three states surfaced as two affordances:
 *   - text input — meaningful description
 *   - "Decorative" checkbox — alt = "" (skipped by screen readers)
 *
 * Combined behavior:
 *   - decorative checked + any input  → '' (decorative)
 *   - decorative unchecked + non-empty → trimmed string
 *   - decorative unchecked + empty    → null (not set)
 *
 * Commits on blur of the text input or change of the checkbox. The
 * server PATCH is non-blocking; the parent decides whether to refresh
 * the asset list. We emit `update` with the new value and let the
 * parent persist — keeps this component pure-presentation.
 *
 * With `language` set (a language other than the default is active,
 * design-media.md M4), `modelValue` is that language's own alt and
 * `null` means it has none: the field shows the default alt greyed,
 * until "Copy … to edit" or the Decorative box gives it its own.
 */
import { computed, nextTick, ref, useId, watch } from 'vue'

const props = defineProps<{
  /** Current alt value from the asset's manifest. Three-state. */
  modelValue: string | null
  /** Set while a language other than the default is active. */
  language?: {
    /** The active language's name ("French"). */
    name: string
    /** The default language's name ("English"). */
    defaultName: string
    /** The default alt the language falls back to. */
    fallback: string | null
  } | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
}>()

/** Set by "Copy … to edit": the field is editable before the language has an alt of its own. */
const copying = ref(false)
const inputId = useId()
const input = ref<HTMLInputElement | null>(null)
/** The language has no alt of its own and the author hasn't started one. */
const usingDefault = computed(() => !!props.language && props.modelValue === null && !copying.value)

// Local edit state mirrors the prop — committed values flow back via emit.
const text = ref(props.modelValue && props.modelValue.length > 0 ? props.modelValue : '')
const decorative = ref(props.modelValue === '')

watch(
  () => [props.modelValue, props.language?.name] as const,
  ([newValue]) => {
    text.value = newValue && newValue.length > 0 ? newValue : ''
    decorative.value = newValue === ''
    copying.value = false
  },
)

const stateLabel = computed(() => {
  if (decorative.value) return 'Decorative — skipped by screen readers'
  if (usingDefault.value) return props.language?.fallback === null ? 'Not set — admin will warn' : ''
  if (text.value.length === 0) return 'Not set — admin will warn'
  return ''
})

/** What the input shows: the default alt, greyed, while the language falls back to it. */
const shownText = computed(() => (usingDefault.value ? (props.language?.fallback ?? '') : text.value))

async function copyDefault(): Promise<void> {
  text.value = props.language?.fallback ?? ''
  copying.value = true
  await nextTick()
  input.value?.focus()
}

function clearLanguage(): void {
  emit('update:modelValue', null)
}

function commitText(event: Event): void {
  if (usingDefault.value) return
  const v = (event.target as HTMLInputElement).value.trim()
  text.value = v
  if (decorative.value) return // decorative wins
  emit('update:modelValue', v === '' ? null : v)
}

function toggleDecorative(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked
  decorative.value = checked
  if (checked) {
    emit('update:modelValue', '')
  } else {
    // Toggling off: revert to whatever the input holds.
    emit('update:modelValue', text.value === '' ? null : text.value)
  }
}
</script>

<template>
  <div class="alt-editor" data-testid="alt-editor">
    <label v-if="language" class="alt-language" :for="inputId" data-testid="alt-editor-language">
      Alt text ({{ language.name }})
    </label>
    <input
      :id="inputId"
      ref="input"
      type="text"
      class="alt-input"
      placeholder="Describe the image (alt text for accessibility)"
      :value="shownText"
      :disabled="decorative || usingDefault"
      data-testid="alt-editor-input"
      @blur="commitText" />
    <div v-if="usingDefault && language" class="alt-fallback">
      <span v-if="language.fallback !== null" data-testid="alt-editor-fallback">Using {{ language.defaultName }}</span>
      <button
        v-if="language.fallback"
        type="button"
        class="alt-link"
        data-testid="alt-editor-copy-default"
        @click="copyDefault">
        Copy {{ language.defaultName }} to edit
      </button>
    </div>
    <button
      v-else-if="language && modelValue !== null"
      type="button"
      class="alt-link"
      data-testid="alt-editor-clear-language"
      @click="clearLanguage">
      Clear {{ language.name }} alt (use {{ language.defaultName }})
    </button>
    <label class="alt-decorative">
      <input
        type="checkbox"
        :checked="decorative"
        data-testid="alt-editor-decorative"
        @change="toggleDecorative" />
      Decorative
    </label>
    <p v-if="stateLabel" class="alt-state" data-testid="alt-editor-state">{{ stateLabel }}</p>
  </div>
</template>

<style scoped>
.alt-editor {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.alt-input {
  font: inherit;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-input-border);
  border-radius: 4px;
  background: var(--color-input-bg);
  color: var(--color-fg);
}

.alt-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.alt-language {
  font-size: 0.75rem;
  color: var(--color-muted);
}

.alt-fallback {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-muted);
}

.alt-link {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 0.75rem;
  color: var(--color-primary);
  text-decoration: underline;
  cursor: pointer;
}

.alt-decorative {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  color: var(--color-muted);
}

.alt-state {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-muted);
  font-style: italic;
}
</style>
