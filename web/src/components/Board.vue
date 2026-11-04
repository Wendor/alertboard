<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { fetchAlerts } from '../api'
import { buildSections, filterAlerts } from '../group'
import { dateLocale } from '../i18n'
import { buildHistogram } from '../timeline'
import type { AlertsResponse, UIConfig, ViewState } from '../types'
import { fromHash, loadActive, loadViews, saveActive, saveViews, toHash } from '../views'
import AlertList from './AlertList.vue'
import AppHeader from './AppHeader.vue'
import Timeline from './Timeline.vue'
import Toolbar from './Toolbar.vue'

const POLL_MS = 30_000

const props = defineProps<{ cfg: UIConfig }>()

const savedViews = ref<ViewState[]>(loadViews(props.cfg))
const view = ref<ViewState>(
  fromHash(location.hash, props.cfg) ??
    savedViews.value.find((v) => v.name === loadActive()) ??
    savedViews.value[0],
)
const data = shallowRef<AlertsResponse | null>(null)
const error = ref('')
const loading = ref(false)
const now = ref(Date.now())

async function refresh() {
  loading.value = true
  try {
    data.value = await fetchAlerts()
    error.value = ''
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
    now.value = Date.now()
  }
}

let timer = 0
const onHash = () => {
  const v = fromHash(location.hash, props.cfg)
  if (v) view.value = v
}
onMounted(() => {
  refresh()
  timer = window.setInterval(refresh, POLL_MS)
  addEventListener('hashchange', onHash)
})
onUnmounted(() => {
  clearInterval(timer)
  removeEventListener('hashchange', onHash)
})

watch(view, (v) => history.replaceState(null, '', toHash(v)), { deep: true, immediate: true })

const update = (patch: Partial<ViewState>) => (view.value = { ...view.value, ...patch })

function persist(next: ViewState[], active: string) {
  savedViews.value = next
  saveViews(next)
  saveActive(active)
}
const clean = (v: ViewState): ViewState => ({ ...v, timeFilter: undefined })

const viewActions = {
  select(name: string) {
    const v = savedViews.value.find((x) => x.name === name)
    if (v) {
      view.value = clean(v)
      saveActive(name)
    }
  },
  save() {
    const v = clean(view.value)
    const exists = savedViews.value.some((x) => x.name === v.name)
    persist(exists ? savedViews.value.map((x) => (x.name === v.name ? v : x)) : [...savedViews.value, v], v.name)
  },
  saveAs(name: string) {
    const v = { ...clean(view.value), name }
    persist([...savedViews.value.filter((x) => x.name !== name), v], name)
    view.value = { ...view.value, name }
  },
  rename(from: string, to: string) {
    persist(savedViews.value.map((x) => (x.name === from ? { ...x, name: to } : x)), to)
    if (view.value.name === from) view.value = { ...view.value, name: to }
  },
  remove(name: string) {
    const next = savedViews.value.filter((x) => x.name !== name)
    if (!next.length) return
    persist(next, next[0].name)
    if (view.value.name === name) view.value = clean(next[0])
  },
}

const alerts = computed(() => data.value?.alerts ?? [])
const forTimeline = computed(() => filterAlerts(alerts.value, view.value, props.cfg, { ignoreTime: true }))
const visible = computed(() => filterAlerts(alerts.value, view.value, props.cfg))
const histogram = computed(() => buildHistogram(forTimeline.value, view.value.range, now.value))
const grouped = computed(() => buildSections(visible.value, view.value, props.cfg, now.value))
</script>

<template>
  <div class="app">
    <AppHeader
      :views="savedViews"
      :cfg="cfg"
      :view="view"
      :actions="viewActions"
      :fetched-at="data?.fetchedAt"
      :loading="loading"
      @refresh="refresh"
    />
    <div v-if="error" class="banner error">
      {{ $t('board.amDown', { error }) }}
      <template v-if="data">{{ $t('board.staleData', { time: new Date(data.fetchedAt).toLocaleTimeString(dateLocale()) }) }}</template>
    </div>
    <Toolbar :alerts="alerts" :view="view" :cfg="cfg" @update="update" />
    <Timeline :histogram="histogram" :view="view" :now="now" @update="update" />
    <AlertList
      v-if="data"
      :sections="grouped.sections"
      :stale="grouped.stale"
      :view="view"
      :cfg="cfg"
      :now="now"
      :total="visible.length"
      @update="update"
    />
    <div v-else-if="!error" class="loading">{{ $t('board.loading') }}</div>
  </div>
</template>
