<script setup>
import { computed } from 'vue'
import RateChart from './RateChart.vue'
import ChartRangeControls from './ChartRangeControls.vue'
import { useChartRange } from './useChartRange'
import { fmt, statusText } from './lib'
import { ArrowUpRight, Droplets, Flame, Fuel, Gauge, Snowflake, Wind, Zap } from '@lucide/vue'
const props = defineProps({ data: Object, trends: Object })
const sensors = computed(() => props.data?.sensors || [])
const machines = computed(() => props.data?.machines || [])
const live = computed(() => sensors.value.filter(s => s.status === 'live'))
const chartRange = useChartRange()
const categories = computed(() => [...new Set(sensors.value.filter(s => s.meter_role !== 'supply').map(s => s.type))].map(type => {
  const group = sensors.value.filter(s => s.type === type && s.meter_role !== 'supply'), reporting = group.filter(s => s.status === 'live')
  const expectedMeters = group.filter(s => s.enabled)
  const hasHistory = expectedMeters.length > 0 && expectedMeters.every(s => s.historical_baseline)
  const usage = reporting.reduce((n,s) => n + Number(s.reading?.value || 0), 0)
  const baseline = hasHistory ? expectedMeters.reduce((n,s) => n + Number(s.historical_baseline.expected), 0)
    : reporting.reduce((n,s) => n + Number(s.baseline || 0), 0)
  const configuredBaseline = expectedMeters.reduce((n,s) => n + Number(s.baseline || 0), 0)
  const maximum = expectedMeters.reduce((n,s) => n + Number(s.max_value || 0), 0)
  const scale = Math.max(1, maximum * 1.15, baseline * 1.05,
    configuredBaseline * 1.05, usage * 1.08)
  const pct = n => `${Math.min(100,Math.max(0,n / scale * 100)).toFixed(2)}%`
  const source = chartRange.range.value === '60m' ? props.trends : chartRange.window.value
  return { type, group, reporting, usage, baseline, configuredBaseline, maximum, hasHistory, unit: group[0]?.unit || '', pct, atMax: expectedMeters.length > 0 && reporting.length === expectedMeters.length && usage >= maximum, series: source?.series?.[type] || [], baselineSeries: source?.historical_baseline_series?.[type] || [] }
}))
const newest = computed(() => live.value.map(s => s.reading?.observed_at).filter(Boolean).sort().at(-1))
const featured = computed(() => machines.value.filter(m => m.sensors?.length).slice(0,7))
const icons = { Electricity: Zap, 'Compressed Air': Wind, 'Clean Water': Droplets, 'Natural Gas': Flame, Diesel: Fuel, 'Chilled Water': Snowflake, 'Steam/Hot Water': Flame }
const simulatorUrl = import.meta.env.VITE_SIMULATOR_URL ?? (import.meta.env.BASE_URL === '/dashboard/' ? 'http://127.0.0.1:8766/' : '')
</script>
<template>
  <section class="page">
    <div class="hero !hidden">
      <div>
        <span class="eyebrow">LIVE FACTORY TELEMETRY</span>
        <h2>A clearer view of every utility.</h2>
        <p>
          Readings arrive through MQTT, are stored in ClickHouse, and are paired with PostgreSQL
          master data.
        </p>
        <div class="hero-bottom">
          <span class="signal-dot"></span
          ><span>{{
            newest ? `${live.length} meters reporting live` : "Waiting for fresh telemetry"
          }}</span
          ><span class="hero-separator">·</span
          ><span>{{ newest ? `Latest ${new Date(newest).toLocaleTimeString()}` : "—" }}</span>
        </div>
      </div>
      <div class="hero-graphic" aria-hidden="true">
        <div class="ring ring-a"></div>
        <div class="ring ring-b"></div>
        <div class="ring ring-c"></div>
        <div class="ring-center"><Zap :size="42" aria-hidden="true" /></div>
      </div>
    </div>
    <div v-if="data?.metering_alert_count" class="plan-alert-banner">
      <strong>{{ data.metering_alert_count }} open notifications</strong
      ><span>Review metering thresholds and machine-state questions.</span
      ><a href="#notifications"
        >Review notifications <ArrowUpRight class="inline-icon" :size="14" aria-hidden="true"
      /></a>
    </div>
    <section class="utility-summary !px-0 -mt-10 !pb-0 !mb-4">
      <div class="section-head !hidden">
        <div>
          <span class="eyebrow">LIVE UTILITY SUMMARY</span>
          <h2>Current use by category</h2>
          <p>
            Compare observed rates with the configured baseline, and
            operational maximum.
          </p>
        </div>
        <span class="small-note">LIVE READINGS REFRESH EVERY 5 SECONDS</span>
      </div>
      <!-- <ChartRangeControls
        v-model:range="chartRange.range.value"
        v-model:start="chartRange.customStart.value"
        v-model:end="chartRange.customEnd.value"
        :loading="chartRange.loading.value"
        :error="chartRange.error.value"
        @apply="chartRange.applyCustom"
      /> -->
      <div class="utility-chart-key">
        <span class="key-current">Observed</span><span class="key-config">Configured baseline</span
        ><span class="key-history">Historical baseline</span
        ><span class="key-maximum">Maximum</span>
      </div>
      <div class="category-grid grid gap-3">
        <a
          v-for="c in categories"
          :key="c.type"
          class="category-card utility-card"
          :class="{ 'is-max': c.atMax, 'is-off': !c.reporting.length }"
          :href="`#category/${encodeURIComponent(c.type)}`"
          ><div class="category-top">
            <div class="category-title">
              <span class="category-icon"
                ><component :is="icons[c.type] || Gauge" :size="20" aria-hidden="true" /></span
              >{{ c.type }}
            </div>
            <span class="category-count">{{ c.reporting.length }} / {{ c.group.length }} LIVE</span>
          </div>
          <div class="utility-reading">
            <strong>{{ c.reporting.length ? fmt(c.usage) : "—" }}</strong
            ><span> {{ c.unit }}</span>
          </div>
          <div class="utility-threshold-values">
            <span>Configured {{ fmt(c.configuredBaseline) }} {{ c.unit }}</span
            ><span>Historical {{ c.hasHistory ? fmt(c.baseline) : "—" }} {{ c.unit }}</span
            ><span>Max {{ c.maximum ? fmt(c.maximum) : "—" }} {{ c.unit }}</span>
          </div>
          <div
            class="utility-tank"
            role="img"
            :aria-label="`${c.type}: current ${fmt(c.usage)} ${c.unit}, configured baseline ${fmt(c.configuredBaseline)}, historical baseline ${fmt(c.baseline)}, maximum ${fmt(c.maximum)}`"
          >
            <div
              class="utility-level-fill"
              :style="{ height: c.reporting.length ? c.pct(c.usage) : '0%' }"
            ></div>
            <div
              v-if="c.maximum > 0"
              class="utility-limit utility-limit-max"
              :style="{ bottom: c.pct(c.maximum) }"
            >
              <span>MAX</span>
            </div>
            <div
              v-if="c.hasHistory || c.reporting.length"
              class="utility-limit utility-limit-baseline"
              :style="{ bottom: c.pct(c.baseline) }"
            >
              <span>HISTORY</span>
            </div>
            <div
              class="utility-limit utility-limit-configured"
              :style="{ bottom: c.pct(c.configuredBaseline) }"
            >
              <span>CONFIG</span>
            </div>
          </div>
          <div class="utility-level-caption">
            {{
              !c.reporting.length
                ? "No live reading"
                : c.atMax
                  ? "At or above maximum"
                  : `${fmt((c.usage / Math.max(c.maximum, 1)) * 100)}% of maximum`
            }}
          </div>
          <div class="utility-trend">
            <div class="utility-trend-head">
              <strong>{{
                chartRange.range.value === "60m"
                  ? "Last 60 mins"
                  : chartRange.range.value === "custom"
                    ? "Custom dates"
                    : chartRange.range.value === "3m"
                      ? "Last 3 months"
                      : chartRange.range.value.replace("_", " ")
              }}</strong
              ><span>RATE TREND</span>
            </div>
            <RateChart
              compact
              :series="c.series"
              :baseline-series="c.baselineSeries"
              :baseline="c.configuredBaseline"
              :maximum="c.maximum"
              :unit="c.unit"
              :updated-at="
                chartRange.range.value === '60m'
                  ? trends?.updated_at
                  : chartRange.window.value?.updated_at
              "
              :window-start="chartRange.window.value?.window_start"
              :window-end="chartRange.window.value?.window_end"
              :interval-seconds="chartRange.window.value?.interval_seconds || 60"
            />
          </div>
          <span class="category-open"
            >View live detail
            <ArrowUpRight class="inline-icon" :size="14" aria-hidden="true" /></span
        ></a>
      </div>
    </section>

    <div class="summary-grid grid gap-4 !mb-4">
      <article
        v-for="[label, value, note] in [
          [
            'Live machines',
            `${machines.filter((m) => m.status === 'live').length} / ${machines.length}`,
            'Reporting fresh telemetry',
          ],
          [
            'Enabled metering',
            `${sensors.filter((s) => s.enabled).length} / ${sensors.length}`,
            'Metering points publishing to MQTT',
          ],
          ['Metered categories', categories.length, 'Utilities tracked across the plant'],
          ['Data readings', fmt(data?.telemetry_count || 0), 'Stored metering data'],
        ]"
        :key="label"
        class="summary-card"
      >
        <span>{{ label }}</span
        ><strong>{{ value }}</strong
        ><small>{{ note }}</small>
      </article>
    </div>

    <div class="lower-grid grid gap-4 !hidden">
      <section class="panel">
        <div class="panel-head">
          <div>
            <span class="eyebrow">PRODUCTION FLOW</span>
            <h2>Equipment at a glance</h2>
          </div>
          <a href="#map" class="text-link"
            >Open location map <ArrowUpRight class="inline-icon" :size="14" aria-hidden="true"
          /></a>
        </div>
        <div class="equipment-list">
          <div v-for="m in featured" :key="m.id" class="equipment-row">
            <div>
              <strong>{{ m.name }}</strong
              ><small>{{ m.category }} · {{ m.location_name }}</small>
            </div>
            <div>
              <div v-for="s in m.sensors" :key="s.id">
                <b v-if="s.status === 'live'"
                  >{{ fmt(s.reading.value) }} / {{ fmt(s.baseline) }} {{ s.unit }}</b
                ><span v-else class="state-tag off"><i></i>{{ statusText(s) }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section class="panel pipeline-panel">
        <div class="panel-head">
          <div>
            <span class="eyebrow">DATA PIPELINE</span>
            <h2>Stream health</h2>
          </div>
        </div>
        <div
          v-for="[label, value] in [
            ['MQTT subscriber', data?.ingest?.connected ? 'Connected' : 'Disconnected'],
            [
              'Last ingested message',
              data?.ingest?.last_message
                ? new Date(data.ingest.last_message).toLocaleTimeString()
                : '—',
            ],
            [
              'PostgreSQL master records',
              (data?.factories?.length || 0) +
                (data?.locations?.length || 0) +
                (data?.production_lines?.length || 0) +
                machines.length +
                sensors.length,
            ],
            ['ClickHouse rows', fmt(data?.telemetry_count || 0)],
          ]"
          :key="label"
          class="pipeline-line"
        >
          <span>{{ label }}</span
          ><strong>{{ value }}</strong>
        </div>
        <div v-if="simulatorUrl" class="sim-control">
          <div>
            <strong>MQTT Metering Simulator</strong
            ><small>Control the readings shown on this dashboard</small>
          </div>
          <a class="button secondary" :href="simulatorUrl"
            >Open simulator <ArrowUpRight class="inline-icon" :size="14" aria-hidden="true"
          /></a>
        </div>
      </section>
    </div>
  </section>
</template>
