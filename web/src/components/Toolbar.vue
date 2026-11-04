<script setup lang="ts">
import { computed, ref } from 'vue'
import { groupKeyTitle, groupKeys, groupOf, groupTitle, isSuppressed, problemTitle } from '../group'
import { parseQuery } from '../query'
import { type Alert, type GroupKey, type UIConfig, type ViewState } from '../types'

const props = defineProps<{ alerts: Alert[]; view: ViewState; cfg: UIConfig }>()
const emit = defineEmits<{ update: [patch: Partial<ViewState>] }>()

const STALE_OPTIONS = ['1d', '3d', '7d', '14d', '30d']
const open = ref(false)

const errors = computed(() => parseQuery(props.view.query).errors)

const groupCounts = computed(() => {
  const m = new Map<string, number>(props.cfg.groups.map((g) => [g.name, 0]))
  for (const a of props.alerts) {
    if (!props.view.showSilenced && isSuppressed(a)) continue
    const g = groupOf(a, props.cfg)
    m.set(g, (m.get(g) ?? 0) + 1)
  }
  return [...m]
})
const silenced = computed(() => props.alerts.filter(isSuppressed).length)
const staleOptions = computed(() => [...new Set([...STALE_OPTIONS, props.view.staleAfter])])
const activeFilters = computed(
  () =>
    props.view.hiddenGroups.length +
    props.view.hiddenProblems.length +
    (props.view.showSilenced ? 1 : 0) +
    (props.view.collapseStale ? 0 : 1),
)

function toggleGroup(g: string) {
  const hg = props.view.hiddenGroups
  emit('update', { hiddenGroups: hg.includes(g) ? hg.filter((x) => x !== g) : [...hg, g] })
}

function setGroupBy(i: 0 | 1, k: string) {
  const next: [GroupKey, GroupKey] = [...props.view.groupBy]
  next[i] = k as GroupKey
  emit('update', { groupBy: next })
}
</script>

<template>
  <section class="toolbar">
    <div class="search-row">
      <input
        :class="['search', { invalid: errors.length }]"
        type="search"
        :placeholder="$t('toolbar.search')"
        :value="view.query"
        :title="errors.join('\n')"
        @input="emit('update', { query: ($event.target as HTMLInputElement).value })"
      />
      <button :class="['filters-toggle', { on: open }]" @click="open = !open">⛃ {{ activeFilters || '' }}</button>
    </div>
    <div :class="['filters', { open }]">
      <div class="group-by">
        <label v-for="i in [0, 1] as const" :key="i">
          {{ i === 0 ? $t('toolbar.groupBy') : $t('toolbar.then') }}
          <select :value="view.groupBy[i]" @change="setGroupBy(i, ($event.target as HTMLSelectElement).value)">
            <option v-for="k in groupKeys(cfg)" :key="k" :value="k">{{ groupKeyTitle(k, cfg) }}</option>
          </select>
        </label>
      </div>
      <div class="chips">
        <button
          v-for="[g, count] in groupCounts"
          :key="g"
          :class="['chip', { on: !view.hiddenGroups.includes(g) }]"
          @click="toggleGroup(g)"
        >
          {{ groupTitle(g, cfg) }} <span class="n">{{ count }}</span>
        </button>
      </div>
      <div class="chips">
        <button :class="['chip', { on: view.showSilenced }]" @click="emit('update', { showSilenced: !view.showSilenced })">
          {{ $t('toolbar.showSilenced') }} <span class="n">{{ silenced }}</span>
        </button>
        <span :class="['chip', { on: view.collapseStale }]">
          <button class="bare" @click="emit('update', { collapseStale: !view.collapseStale })">{{ $t('toolbar.collapseOlder') }}</button>
          <select
            class="bare"
            :value="view.staleAfter"
            @change="emit('update', { staleAfter: ($event.target as HTMLSelectElement).value, collapseStale: true })"
          >
            <option v-for="s in staleOptions" :key="s" :value="s">{{ s }}</option>
          </select>
        </span>
        <button
          v-for="p in view.hiddenProblems"
          :key="p"
          class="chip hidden-problem"
          :title="$t('toolbar.showAgain')"
          @click="emit('update', { hiddenProblems: view.hiddenProblems.filter((x) => x !== p) })"
        >
          {{ $t('toolbar.hidden', { p: problemTitle(p, cfg) }) }} ✕
        </button>
      </div>
    </div>
  </section>
</template>
