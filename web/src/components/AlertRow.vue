<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatAge, formatTime, formatValue } from '../duration'
import { hostOf, isSuppressed, startOf, type Row } from '../group'
import { dateLocale, t, tr } from '../i18n'
import { commonLabels, renderLink, silenceURL } from '../links'
import type { Alert, UIConfig, ViewState } from '../types'

const props = defineProps<{ row: Row; view: ViewState; cfg: UIConfig; now: number }>()
const emit = defineEmits<{ update: [patch: Partial<ViewState>] }>()

const HOSTS_SHOWN = 3
const open = ref(false)
const labelsOpen = ref(new Set<string>())

const r = computed(() => props.row)
const problems = computed(() => [...new Set(r.value.alerts.map((a) => a.problem))])
const promLinks = computed(() => r.value.alerts.find((a) => a.promLinks.length)?.promLinks ?? [])
const silenceAll = computed(() => silenceURL(props.cfg.alertmanagerURL, commonLabels(r.value.alerts)))
const suppressed = computed(() => r.value.alerts.filter(isSuppressed).length)
const single = computed(() => r.value.count === 1)
const hostsBrief = computed(() => {
  const h = r.value.hosts
  return h.length <= HOSTS_SHOWN ? h.join(', ') : `${h.slice(0, HOSTS_SHOWN).join(', ')} +${h.length - HOSTS_SHOWN}`
})
const fullTime = (ms: number) => new Date(ms).toLocaleString(dateLocale())
const ageTitle = computed(() =>
  r.value.count === 1
    ? t('row.started', { time: fullTime(r.value.newest) })
    : t('row.range', { newest: fullTime(r.value.newest), oldest: fullTime(r.value.oldest) }),
)

const hide = () => emit('update', { hiddenProblems: [...new Set([...props.view.hiddenProblems, ...problems.value])] })

function toggleLabels(fp: string) {
  const s = new Set(labelsOpen.value)
  s.has(fp) ? s.delete(fp) : s.add(fp)
  labelsOpen.value = s
}
const describe = (a: Alert) => a.annotations.name || hostOf(a, props.cfg) || a.alertname
const extraLinks = (a: Alert) => props.cfg.links.map((l) => ({ name: tr(l.name), url: renderLink(l.url, a.labels) }))
</script>

<template>
  <div :class="['row', { fresh: r.fresh, open }]">
    <div class="row-main" @click="open = !open">
      <span class="age" :title="ageTitle">{{ formatAge(now - r.newest) }}</span>
      <span class="title">{{ r.title }}</span>
      <span v-if="r.count > 1" class="n">{{ r.count }}</span>
      <span v-if="suppressed" class="badge" :title="$t('row.silenced')">🔕 {{ suppressed }}</span>
      <span class="hosts">{{ single ? describe(r.alerts[0]) : hostsBrief }}</span>
      <span class="links" @click.stop>
        <a v-for="l in promLinks" :key="l.name" :href="l.url" target="_blank" rel="noopener">{{ l.name }}</a>
        <a :href="silenceAll" target="_blank" rel="noopener">{{ single ? $t('row.silence') : $t('row.silenceAll') }}</a>
        <button class="link" :title="$t('row.hideTitle')" @click="hide">{{ $t('row.hide') }}</button>
      </span>
    </div>
    <div v-if="open" class="details">
      <div v-for="a in r.alerts" :key="a.fingerprint" class="alert">
        <div class="alert-line">
          <span class="time" :title="fullTime(startOf(a))">{{ formatTime(startOf(a), now) }}</span>
          <span class="what">
            <span v-if="r.title !== a.alertname" class="name muted">{{ a.alertname }}</span>
            <span class="desc">{{ describe(a) }}</span>
          </span>
          <span v-if="a.annotations.value" class="value" :title="a.annotations.value">{{ formatValue(a.annotations.value) }}</span>
          <span v-if="isSuppressed(a)" class="badge">🔕</span>
          <span class="links">
            <a v-for="l in a.promLinks" :key="l.name" :href="l.url" target="_blank" rel="noopener">{{ l.name }}</a>
            <a :href="silenceURL(cfg.alertmanagerURL, a.labels)" target="_blank" rel="noopener">{{ $t('row.silence') }}</a>
            <a v-for="l in extraLinks(a)" :key="l.name" :href="l.url" target="_blank" rel="noopener">{{ l.name }}</a>
            <button class="link" @click="toggleLabels(a.fingerprint)">{{ $t('row.labels') }}</button>
          </span>
        </div>
        <dl v-if="labelsOpen.has(a.fingerprint)" class="labels">
          <template v-for="(v, k) in a.labels" :key="k">
            <dt>{{ k }}</dt>
            <dd>{{ v }}</dd>
          </template>
        </dl>
      </div>
    </div>
  </div>
</template>
