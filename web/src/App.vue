<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchConfig } from './api'
import Board from './components/Board.vue'
import type { UIConfig } from './types'

const cfg = ref<UIConfig | null>(null)
const error = ref('')

onMounted(() => {
  fetchConfig().then(
    (c) => (cfg.value = c),
    (e: Error) => (error.value = e.message),
  )
})
</script>

<template>
  <div v-if="error" class="banner error">{{ $t('app.configError', { error }) }}</div>
  <Board v-else-if="cfg" :cfg="cfg" />
  <div v-else class="loading">{{ $t('app.loading') }}</div>
</template>
