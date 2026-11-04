<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { dateLocale, LOCALES, locale, setLocale } from '../i18n'
import type { UIConfig, ViewState } from '../types'
import { sameView, viewTitle } from '../views'

type Theme = 'system' | 'light' | 'dark'
const THEME_KEY = 'alertboard.theme'
const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }

interface Actions {
  select(name: string): void
  save(): void
  saveAs(name: string): void
  rename(from: string, to: string): void
  remove(name: string): void
}

const props = defineProps<{
  views: ViewState[]
  view: ViewState
  cfg: UIConfig
  actions: Actions
  fetchedAt?: string
  loading: boolean
}>()
defineEmits<{ refresh: [] }>()

const theme = ref<Theme>((localStorage.getItem(THEME_KEY) as Theme) || 'system')
watchEffect(() => {
  if (theme.value === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme.value
  localStorage.setItem(THEME_KEY, theme.value)
})

const nextLocale = () => setLocale(LOCALES[(LOCALES.indexOf(locale()) + 1) % LOCALES.length])

const saved = computed(() => props.views.find((v) => v.name === props.view.name))
const modified = computed(() => !saved.value || !sameView(saved.value, props.view))

const editing = ref<{ mode: 'saveAs' | 'rename'; value: string } | null>(null)
function submit() {
  const e = editing.value
  const name = e?.value.trim()
  if (e && name) {
    if (e.mode === 'saveAs') props.actions.saveAs(name)
    else props.actions.rename(props.view.name, name)
  }
  editing.value = null
}
</script>

<template>
  <header class="header">
    <nav class="tabs">
      <button
        v-for="v in views"
        :key="v.name"
        :class="['tab', { active: v.name === view.name }]"
        @click="actions.select(v.name)"
      >
        {{ viewTitle(v.name, cfg) }}<span v-if="v.name === view.name && modified" class="dot" :title="$t('header.unsaved')">•</span>
      </button>
      <span v-if="!saved" class="tab active">{{ view.name ? viewTitle(view.name, cfg) : $t('header.unnamed') }}<span class="dot">•</span></span>

      <form v-if="editing" class="tab-edit" @submit.prevent="submit">
        <input
          v-model="editing.value"
          v-focus
          :placeholder="editing.mode === 'saveAs' ? $t('header.newViewName') : $t('header.newName')"
          @keydown.esc="editing = null"
        />
        <button type="submit">{{ $t('header.ok') }}</button>
      </form>
      <span v-else class="tab-actions">
        <button v-if="modified" class="link" :title="$t('header.saveTitle')" @click="actions.save()">{{ $t('header.save') }}</button>
        <button class="link" @click="editing = { mode: 'saveAs', value: '' }">{{ $t('header.newView') }}</button>
        <template v-if="saved">
          <button class="link" :title="$t('header.rename')" @click="editing = { mode: 'rename', value: viewTitle(view.name, cfg) }">✎</button>
          <button v-if="views.length > 1" class="link" :title="$t('header.remove')" @click="actions.remove(view.name)">✕</button>
        </template>
      </span>
    </nav>
    <div class="header-right">
      <button class="link updated" :title="$t('header.refresh')" @click="$emit('refresh')">
        <span :class="{ spin: loading }">⟳</span>
        {{ fetchedAt ? new Date(fetchedAt).toLocaleTimeString(dateLocale()) : '—' }}
      </button>
      <button class="link" :title="$t('header.theme')" @click="theme = NEXT_THEME[theme]">{{ $t(`header.themes.${theme}`) }}</button>
      <button class="link" :title="$t('header.language')" @click="nextLocale">{{ locale().toUpperCase() }}</button>
    </div>
  </header>
</template>

<script lang="ts">
export default {
  directives: { focus: { mounted: (el: HTMLElement) => el.focus() } },
}
</script>
