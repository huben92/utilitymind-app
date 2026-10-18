<script setup>
defineProps({ range: String, start: String, end: String, loading: Boolean, error: String })
const emit = defineEmits(['update:range', 'update:start', 'update:end', 'apply'])
const options = [
  ['60m', 'Last 60 minutes'], ['today', 'Today'], ['week', 'This week'],
  ['month', 'This month'], ['last_month', 'Last month'],
  ['3m', 'Last 3 months'], ['custom', 'Custom date range'],
]
</script>

<template>
  <div class="chart-range-controls">
    <label class="chart-range-select"
      >Chart range
      <select
        :value="range"
        aria-label="Chart range"
        @change="emit('update:range', $event.target.value)"
      >
        <option v-for="[value, label] in options" :key="value" :value="value">{{ label }}</option>
      </select>
    </label>
    <div v-if="range === 'custom'" class="chart-custom-dates">
      <label
        >From
        <input
          type="date"
          :value="start"
          aria-label="Custom start date"
          @input="emit('update:start', $event.target.value)"
      /></label>
      <label
        >Through
        <input
          type="date"
          :value="end"
          aria-label="Custom end date"
          @input="emit('update:end', $event.target.value)"
      /></label>
      <button class="button secondary" type="button" :disabled="loading" @click="emit('apply')">
        Apply
      </button>
    </div>
    <span v-if="loading" class="chart-range-state" role="status">Loading chart…</span>
    <span v-if="error" class="chart-range-error" role="alert">{{ error }}</span>
    <span class="chart-timezone">Dates use factory time (WIB)</span>
  </div>
</template>
