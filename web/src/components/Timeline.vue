<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatTime } from '../duration'
import type { Histogram } from '../timeline'
import { RANGES, type ViewState } from '../types'

const props = defineProps<{ histogram: Histogram; view: ViewState; now: number }>()
const emit = defineEmits<{ update: [patch: Partial<ViewState>] }>()

const drag = ref<{ a: number; b: number } | null>(null)
const LABELS = 4

const selected = computed(() => {
  if (drag.value) return [Math.min(drag.value.a, drag.value.b), Math.max(drag.value.a, drag.value.b)]
  const tf = props.view.timeFilter
  if (!tf) return null
  const idx = props.histogram.buckets.map((b, i) => (b.from < tf.to && b.to > tf.from ? i : -1)).filter((i) => i >= 0)
  return idx.length ? [idx[0], idx[idx.length - 1]] : null
})

const labels = computed(() => {
  const b = props.histogram.buckets
  const step = Math.max(1, Math.floor(b.length / LABELS))
  return b.map((x, i) => (i % step === 0 ? formatTime(x.from, props.now) : ''))
})

function start(i: number, e: PointerEvent) {
  drag.value = { a: i, b: i }
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
}
function move(i: number) {
  if (drag.value) drag.value = { ...drag.value, b: i }
}
function end() {
  if (!drag.value) return
  const lo = Math.min(drag.value.a, drag.value.b)
  const hi = Math.max(drag.value.a, drag.value.b)
  drag.value = null
  const b = props.histogram.buckets
  emit('update', { timeFilter: { from: b[lo].from, to: b[hi].to } })
}
const clear = () => emit('update', { timeFilter: undefined })

const height = (count: number) => (count ? 10 + (90 * count) / Math.max(1, props.histogram.max) : 0)
</script>

<template>
  <section class="timeline" @pointerup="end" @pointerleave="end">
    <div class="timeline-head">
      <span class="muted">{{ $t('timeline.starts') }}</span>
      <span v-if="histogram.older" class="muted">{{ $t('timeline.older', { n: histogram.older }) }}</span>
      <span v-if="view.timeFilter" class="time-filter">
        {{ formatTime(view.timeFilter.from, now) }} – {{ formatTime(view.timeFilter.to, now) }}
        <button class="link" :title="$t('timeline.clear')" @click="clear">✕</button>
      </span>
      <span class="ranges">
        <button
          v-for="r in RANGES"
          :key="r"
          :class="['link', { active: view.range === r }]"
          @click="emit('update', { range: r, timeFilter: undefined })"
        >
          {{ r }}
        </button>
      </span>
    </div>
    <div class="bars">
      <div
        v-for="(b, i) in histogram.buckets"
        :key="b.from"
        :class="['bar', { sel: selected && i >= selected[0] && i <= selected[1] }]"
        :title="`${formatTime(b.from, now)} – ${formatTime(b.to, now)}: ${b.count}`"
        @pointerdown.prevent="start(i, $event)"
        @pointerenter="move(i)"
      >
        <i :style="{ height: height(b.count) + '%' }" />
      </div>
    </div>
    <div class="axis">
      <span v-for="(l, i) in labels" :key="i">{{ l }}</span>
    </div>
  </section>
</template>
