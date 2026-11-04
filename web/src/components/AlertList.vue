<script setup lang="ts">
import { ref } from 'vue'
import type { Section } from '../group'
import type { UIConfig, ViewState } from '../types'
import AlertRow from './AlertRow.vue'

defineProps<{
  sections: Section[]
  stale: Section[]
  view: ViewState
  cfg: UIConfig
  now: number
  total: number
}>()
const emit = defineEmits<{ update: [patch: Partial<ViewState>] }>()

const collapsed = ref(new Set<string>())
const staleOpen = ref(false)
function toggle(key: string) {
  const s = new Set(collapsed.value)
  s.has(key) ? s.delete(key) : s.add(key)
  collapsed.value = s
}
const sum = (s: Section[]) => s.reduce((n, x) => n + x.count, 0)
</script>

<template>
  <main class="list">
    <div v-if="total === 0" class="empty">{{ $t('list.empty') }}</div>
    <section v-for="s in sections" :key="s.key" class="section">
      <h3 class="section-head" @click="toggle(s.key)">
        <span>{{ s.title }}</span><span class="n">{{ s.count }}</span>
        <span class="chev">{{ collapsed.has(s.key) ? '▸' : '▾' }}</span>
      </h3>
      <template v-if="!collapsed.has(s.key)">
        <AlertRow
          v-for="r in s.rows"
          :key="r.key"
          :row="r"
          :view="view"
          :cfg="cfg"
          :now="now"
          @update="(p) => emit('update', p)"
        />
      </template>
    </section>

    <section v-if="stale.length" class="section stale">
      <h3 class="section-head" @click="staleOpen = !staleOpen">
        <span>{{ $t('list.stale', { d: view.staleAfter }) }}</span><span class="n">{{ sum(stale) }}</span>
        <span class="chev">{{ staleOpen ? '▾' : '▸' }}</span>
      </h3>
      <template v-if="staleOpen">
        <template v-for="s in stale" :key="s.key">
          <div class="sub-head">{{ s.title }} <span class="n">{{ s.count }}</span></div>
          <AlertRow
            v-for="r in s.rows"
            :key="r.key"
            :row="r"
            :view="view"
            :cfg="cfg"
            :now="now"
            @update="(p) => emit('update', p)"
          />
        </template>
      </template>
    </section>
  </main>
</template>
