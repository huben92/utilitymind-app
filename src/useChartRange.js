import { computed, onUnmounted, ref, watch } from 'vue'
import { api } from './lib'

function factoryDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

export function useChartRange(category = null) {
  const range = ref('60m')
  const customStart = ref(factoryDate(new Date(Date.now() - 6 * 86400000)))
  const customEnd = ref(factoryDate(new Date()))
  const appliedCustom = ref(null)
  const result = ref(null)
  const loading = ref(false)
  const error = ref('')
  let generation = 0
  let fetchedAt = 0

  async function refresh(force = false) {
    if (range.value === '60m' || (range.value === 'custom' && !appliedCustom.value)) return
    if (!force && Date.now() - fetchedAt < 60000) return
    const current = ++generation
    const params = new URLSearchParams({ range: range.value })
    if (category?.value) params.set('category', category.value)
    if (range.value === 'custom') {
      params.set('start', appliedCustom.value.start)
      params.set('end', appliedCustom.value.end)
    }
    loading.value = true
    error.value = ''
    try {
      const response = await api(`/api/chart-trends?${params}`)
      if (current === generation) {
        result.value = response
        fetchedAt = Date.now()
      }
    } catch (cause) {
      if (current === generation) error.value = cause.message
    } finally {
      if (current === generation) loading.value = false
    }
  }

  function applyCustom() {
    if (!customStart.value || !customEnd.value || customEnd.value < customStart.value) {
      error.value = 'Choose a valid date range, with the end on or after the start.'
      return
    }
    appliedCustom.value = { start: customStart.value, end: customEnd.value }
    result.value = null
    fetchedAt = 0
    refresh(true)
  }

  watch(range, () => {
    generation++
    loading.value = false
    result.value = null
    error.value = ''
    fetchedAt = 0
    if (range.value !== 'custom' && range.value !== '60m') refresh(true)
  })
  if (category) watch(category, () => {
    generation++
    result.value = null
    fetchedAt = 0
    refresh(true)
  })
  const timer = setInterval(() => {
    if (range.value !== 'last_month') refresh()
  }, 60000)
  onUnmounted(() => { clearInterval(timer); generation++ })

  const window = computed(() => range.value === '60m' ? null : result.value)
  return { range, customStart, customEnd, result, window, loading, error,
           applyCustom, refresh }
}
