<script setup>
import { computed } from 'vue'
import { fmt } from './lib'

const props = defineProps({
  series: { type: Array, default: () => [] },
  baselineSeries: { type: Array, default: () => [] },
  baseline: { type: Number, default: null },
  maximum: { type: Number, default: null },
  unit: { type: String, default: '' },
  updatedAt: { type: String, default: '' },
  windowStart: { type: String, default: '' },
  windowEnd: { type: String, default: '' },
  intervalSeconds: { type: Number, default: 60 },
  compact: Boolean,
})

const chart = computed(() => {
  const liveEnd = Math.floor(new Date(props.updatedAt || Date.now()).getTime() / 60000) * 60000
  const start = props.windowStart ? new Date(props.windowStart).getTime() : liveEnd - 59 * 60000
  const end = props.windowEnd ? new Date(props.windowEnd).getTime() : liveEnd + 60000
  const step = Math.max(60000, props.intervalSeconds * 1000)
  const count = Math.max(1, Math.ceil((end - start) / step))
  function slots(series) {
    const points = Array(count).fill(null)
    for (const point of series || []) {
      const index = Math.floor((new Date(point.minute).getTime() - start) / step)
      if (index >= 0 && index < count) points[index] = Number(point.value)
    }
    return points
  }
  const readings = slots(props.series)
  const history = slots(props.baselineSeries)
  const values = readings.filter(value => value !== null)
  const scale = Math.max(1, props.baseline ?? 0, props.maximum ?? 0,
    ...values, ...history.filter(value => value !== null)) * 1.12
  const x = index => props.compact ? 4 + index * 292 / Math.max(1,count - 1)
    : 52 + index * 828 / Math.max(1,count - 1)
  const y = value => props.compact ? 80 - value / scale * 68 : 224 - value / scale * 185
  function segments(points) {
    const result = []; let segment = []
    points.forEach((value, index) => {
      if (value === null) {
        if (segment.length) result.push(segment)
        segment = []
      } else segment.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`)
    })
    if (segment.length) result.push(segment)
    return result
  }
  const duration = end - start
  const time = value => new Date(value).toLocaleString(undefined, duration > 36 * 3600000
    ? { timeZone: 'Asia/Jakarta', month: 'short', day: 'numeric' }
    : { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' })
  return { values, scale, y, currentSegments: segments(readings),
    baselineSegments: segments(history), hasHistory: history.some(value => value !== null),
    start: time(start), middle: time(start + duration / 2),
    end: time(props.windowEnd ? end : liveEnd) }
})
</script>

<template>
  <template v-if="compact">
    <div class="utility-spark-wrap">
      <svg
        class="utility-spark"
        viewBox="0 0 300 90"
        preserveAspectRatio="none"
        role="img"
        :aria-label="`Observed rate, configured baseline, historical baseline, and maximum in ${unit}`"
      >
        <line
          v-if="maximum !== null"
          class="utility-spark-maximum"
          x1="4"
          :y1="chart.y(maximum)"
          x2="296"
          :y2="chart.y(maximum)"
        />
        <line
          v-if="baseline !== null"
          class="utility-spark-target"
          x1="4"
          :y1="chart.y(baseline)"
          x2="296"
          :y2="chart.y(baseline)"
        />
        <template v-for="(part, i) in chart.currentSegments" :key="`current-${i}`">
          <polyline v-if="part.length > 1" class="utility-spark-line" :points="part.join(' ')" />
          <circle
            v-else
            class="utility-spark-dot"
            :cx="part[0].split(',')[0]"
            :cy="part[0].split(',')[1]"
            r="3"
          />
        </template>
        <template v-for="(part, i) in chart.baselineSegments" :key="`baseline-${i}`">
          <polyline v-if="part.length > 1" class="utility-spark-history" :points="part.join(' ')" />
        </template>
      </svg>
      <span v-if="!chart.values.length" class="utility-spark-empty">No readings in this range</span>
    </div>
    <div class="utility-trend-times">
      <span>{{ chart.start }}</span
      ><span>{{ chart.end }}</span>
    </div>
  </template>
  <template v-else>
    <div class="trend-canvas">
      <svg
        viewBox="0 0 900 270"
        preserveAspectRatio="none"
        role="img"
        :aria-label="`Observed rate, configured baseline, historical baseline, and maximum in ${unit}`"
      >
        <g v-for="fraction in [0, 0.25, 0.5, 0.75, 1]" :key="fraction">
          <line
            x1="52"
            :y1="chart.y(chart.scale * fraction)"
            x2="880"
            :y2="chart.y(chart.scale * fraction)"
            class="trend-gridline"
          />
          <text
            x="43"
            :y="chart.y(chart.scale * fraction) + 4"
            text-anchor="end"
            class="trend-label"
          >
            {{ fmt(chart.scale * fraction) }}
          </text>
        </g>
        <line
          v-if="maximum !== null"
          x1="52"
          :y1="chart.y(maximum)"
          x2="880"
          :y2="chart.y(maximum)"
          class="trend-maximum"
        />
        <line
          v-if="baseline !== null"
          x1="52"
          :y1="chart.y(baseline)"
          x2="880"
          :y2="chart.y(baseline)"
          class="trend-target"
        />
        <template v-for="(part, i) in chart.currentSegments" :key="i">
          <polyline v-if="part.length > 1" class="trend-line" :points="part.join(' ')" />
          <circle
            v-else
            class="trend-dot"
            :cx="part[0].split(',')[0]"
            :cy="part[0].split(',')[1]"
            r="4"
          />
        </template>
        <template v-for="(part, i) in chart.baselineSegments" :key="i">
          <polyline v-if="part.length > 1" class="trend-history" :points="part.join(' ')" />
        </template>
        <text x="880" y="22" text-anchor="end" class="trend-unit">{{ unit }}</text>
      </svg>
      <div v-if="!chart.values.length" class="chart-empty">No readings in this range.</div>
    </div>
    <div class="trend-times">
      <span>{{ chart.start }}</span
      ><span>{{ chart.middle }}</span
      ><span>{{ chart.end }}</span>
    </div>
    <div class="trend-legend">
      <i></i> Current / observed rate <span class="trend-baseline-mark"></span> Configured baseline
      <span class="trend-history-mark"></span> Simulated historical baseline
      <span class="trend-max-mark"></span> Maximum
    </div>
  </template>
</template>
