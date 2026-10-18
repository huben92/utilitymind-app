<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import RateChart from './RateChart.vue'
import ChartRangeControls from './ChartRangeControls.vue'
import { useChartRange } from './useChartRange'
import { api, fmt, statusText } from './lib'
import { ArrowLeft, ArrowUpRight, X } from '@lucide/vue'
const props = defineProps({ category: String, detail: Object })
const meters = computed(() => props.detail?.machines?.flatMap(m => m.meters) || [])
const live = computed(() => meters.value.filter(m => m.status === 'live' && m.reading))
const usage = computed(() => live.value.reduce((n,m) => n + Number(m.reading.value),0))
const expectedMeters = computed(() => meters.value.filter(m => m.enabled))
const hasHistory = computed(() => expectedMeters.value.length > 0 && expectedMeters.value.every(m => m.historical_baseline))
const configuredBaseline = computed(() => expectedMeters.value.reduce((n,m) => n + Number(m.baseline || 0),0))
const baseline = computed(() => hasHistory.value
  ? expectedMeters.value.reduce((n,m) => n + Number(m.historical_baseline.expected),0)
  : live.value.reduce((n,m) => n + Number(m.baseline),0))
const maximum = computed(() => expectedMeters.value.reduce((n,m) => n + Number(m.max_value),0))
const chartRange = useChartRange(computed(() => props.category))
const chartSource = computed(() => chartRange.range.value === '60m' ? props.detail : chartRange.window.value)
const palette = ['#56cfb3','#438de8','#9a84f2','#e89966','#dd6cab','#66c5df','#d3be58','#ea777d']
const shares = computed(() => (props.detail?.machines || []).map(machine => ({ id:machine.id, name:machine.name, value:machine.meters.filter(m => m.status==='live' && m.reading).reduce((sum,m)=>sum+Math.max(0,Number(m.reading.value)||0),0), live:machine.meters.some(m=>m.status==='live'&&m.reading) })).filter(m=>m.live).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name)))
const totalShare = computed(() => shares.value.reduce((n,m)=>n+m.value,0))
const donut = computed(() => { let offset=0; return shares.value.map((m,i)=>{const percent=totalShare.value?m.value/totalShare.value*100:0;const row={...m,percent,color:palette[i%palette.length],offset};offset+=percent;return row}) })
const selectedId=ref(null), trend=ref(null), error=ref('')
const selected = computed(() => props.detail?.machines?.find(m=>m.id===selectedId.value))
const selectedLive = computed(() => selected.value?.meters?.filter(m=>m.status==='live'&&m.reading)||[])
const selectedExpected = computed(() => { const meters = selected.value?.meters?.filter(m=>m.enabled)||[]; return meters.length && meters.every(m=>m.historical_baseline) ? meters.reduce((sum,m)=>sum+Number(m.historical_baseline.expected),0) : null })
const selectedConfigured = computed(() => { const meters = selected.value?.meters?.filter(m=>m.enabled)||[]; return meters.length ? meters.reduce((sum,m)=>sum+Number(m.baseline),0) : null })
const selectedMaximum = computed(() => { const meters = selected.value?.meters?.filter(m=>m.enabled)||[]; return meters.length ? meters.reduce((sum,m)=>sum+Number(m.max_value),0) : null })
let generation=0
async function fetchTrend(){ if(!selectedId.value)return; const id=selectedId.value, current=++generation; try{const result=await api(`/api/machine/${id}/trend?category=${encodeURIComponent(props.category)}`);if(current===generation)trend.value=result}catch(e){if(current===generation)error.value=e.message} }
function openMachine(id){selectedId.value=id;trend.value=null;error.value='';fetchTrend()}
function closeMachine(){selectedId.value=null;trend.value=null;generation++}
watch(()=>props.category,closeMachine)
const timer=setInterval(()=>{if(selectedId.value)fetchTrend()},2000)
onUnmounted(()=>clearInterval(timer))
const gaugeTicks=[0,25,50,75,100].map(value=>{const a=(135+value*2.7)*Math.PI/180;return {value,x1:110+79*Math.cos(a),y1:100+79*Math.sin(a),x2:110+88*Math.cos(a),y2:100+88*Math.sin(a),tx:110+93*Math.cos(a),ty:104+93*Math.sin(a)}})
function gauge(machine){const reporting=machine.meters.filter(m=>m.status==='live'&&m.reading),current=reporting.reduce((n,m)=>n+Number(m.reading.value),0),target=reporting.reduce((n,m)=>n+Number(m.historical_baseline?.expected??m.baseline),0),percent=target?current/target*100:0,fill=reporting.length?Math.max(0,Math.min(100,percent)):0,a=(135+fill*2.7)*Math.PI/180;return {reporting,current,target,percent,fill,needleX:110+49*Math.cos(a),needleY:100+49*Math.sin(a)}}
const feed = computed(()=>[...(props.detail?.events||[])].reverse())
</script>
<template>
  <section class="page category-page">
    <a href="#overview" class="detail-back"
      ><ArrowLeft class="inline-icon" :size="16" aria-hidden="true" /> Back to overview</a
    >
    <div class="detail-hero panel">
      <div>
        <span class="eyebrow">LIVE CATEGORY METERING</span>
        <h2>{{ category }}</h2>
        <p>
          Current rate, configured baseline, simulated historical baseline, and operational maximum.
        </p>
      </div>
      <div class="detail-hero-stats">
        <div>
          <span>CURRENT USAGE</span
          ><strong>{{ live.length ? `${fmt(usage)} ${detail?.unit}` : "—" }}</strong>
        </div>
        <div>
          <span>CONFIGURED BASELINE</span
          ><strong>{{
            expectedMeters.length ? `${fmt(configuredBaseline)} ${detail?.unit}` : "—"
          }}</strong>
        </div>
        <div>
          <span>HISTORICAL BASELINE · SIMULATED</span
          ><strong>{{ hasHistory ? `${fmt(baseline)} ${detail?.unit}` : "—" }}</strong>
        </div>
        <div>
          <span>OPERATIONAL MAXIMUM</span
          ><strong>{{ expectedMeters.length ? `${fmt(maximum)} ${detail?.unit}` : "—" }}</strong>
        </div>
        <div>
          <span>REPORTING</span><strong>{{ live.length }} / {{ meters.length }}</strong>
        </div>
      </div>
    </div>
    <div class="detail-trio grid gap-4">
      <section class="panel trend-panel">
        <div class="panel-head">
          <div>
            <span class="eyebrow">UTILITY RATE HISTORY</span>
            <h2>Live rate trend</h2>
            <p>
              Observed rates are averaged within each chart interval, then summed across meters.
              Historical rates match the same time-of-week slots.
            </p>
          </div>
          <span class="detail-refresh">LIVE READINGS UPDATE EVERY 2 SECONDS</span>
        </div>
        <ChartRangeControls
          v-model:range="chartRange.range.value"
          v-model:start="chartRange.customStart.value"
          v-model:end="chartRange.customEnd.value"
          :loading="chartRange.loading.value"
          :error="chartRange.error.value"
          @apply="chartRange.applyCustom"
        />
        <div
          v-if="chartRange.range.value !== '60m' && !chartRange.window.value"
          class="chart-range-placeholder"
        >
          {{
            chartRange.range.value === "custom"
              ? "Choose dates and select Apply."
              : chartRange.loading.value
                ? "Loading selected range…"
                : "Select a range to load its readings."
          }}
        </div>
        <RateChart
          v-else
          :series="
            chartRange.range.value === '60m'
              ? detail?.series || []
              : chartSource?.series?.[category] || []
          "
          :baseline-series="
            chartRange.range.value === '60m'
              ? detail?.historical_baseline_series || []
              : chartSource?.historical_baseline_series?.[category] || []
          "
          :baseline="expectedMeters.length ? configuredBaseline : null"
          :maximum="expectedMeters.length ? maximum : null"
          :unit="detail?.unit || ''"
          :updated-at="chartSource?.updated_at"
          :window-start="chartRange.window.value?.window_start"
          :window-end="chartRange.window.value?.window_end"
          :interval-seconds="chartRange.window.value?.interval_seconds || 60"
        />
      </section>
      <section class="panel share-panel">
        <div class="panel-head">
          <div>
            <span class="eyebrow">LIVE UTILITY SHARE</span>
            <h2>Which machine uses the most?</h2>
            <p>
              Each slice shows a machine's share of the current live rate. Off machines are
              excluded.
            </p>
          </div>
        </div>
        <div class="share-body">
          <div class="share-graphic">
            <svg
              viewBox="0 0 300 300"
              role="img"
              :aria-label="
                totalShare
                  ? `Top machine ${shares[0]?.name}, ${Math.round((shares[0]?.value / totalShare) * 100)} percent`
                  : 'No live machine usage'
              "
            >
              <circle cx="150" cy="150" r="96" fill="none" stroke="#2a414d" stroke-width="62" />
              <circle
                v-for="s in donut"
                :key="s.id"
                cx="150"
                cy="150"
                r="96"
                fill="none"
                :stroke="s.color"
                stroke-width="62"
                pathLength="100"
                :stroke-dasharray="`${Math.max(0, s.percent - 0.45)} 100`"
                :stroke-dashoffset="-s.offset"
                transform="rotate(-90 150 150)"
              />
              <text x="150" y="145" text-anchor="middle" class="share-center-caption">
                TOP MACHINE
              </text>
              <text x="150" y="177" text-anchor="middle" class="share-center-value">
                {{ totalShare ? `${Math.round((shares[0].value / totalShare) * 100)}%` : "—" }}
              </text>
            </svg>
          </div>
          <div class="share-ranking">
            <div v-for="(s, i) in donut" :key="s.id" class="share-row">
              <span class="share-rank">{{ i + 1 }}</span
              ><i class="share-swatch" :style="{ background: s.color }"></i>
              <div class="share-machine">
                <strong>{{ s.name }}</strong>
                <div class="share-bar">
                  <span :style="{ width: `${s.percent}%`, background: s.color }"></span>
                </div>
              </div>
              <span class="share-rate">{{ fmt(s.value) }} {{ detail?.unit }}</span
              ><b>{{ Math.round(s.percent) }}%</b>
            </div>
            <div v-if="!donut.length" class="share-no-machines">
              No live machine usage to compare.
            </div>
          </div>
        </div>
      </section>
      <section class="panel live-feed-panel">
        <div class="feed-head">
          <div>
            <span class="eyebrow">MQTT → CLICKHOUSE</span>
            <h2>Live reading feed</h2>
            <p>Newest meter readings appear at the bottom.</p>
          </div>
          <span class="feed-state" :class="{ off: !live.length }">{{
            live.length ? "LIVE" : "NO LIVE METERING"
          }}</span>
        </div>
        <div class="live-feed" role="log">
          <div v-if="!feed.length" class="feed-empty">Waiting for readings in this category.</div>
          <div v-for="event in feed" :key="event.id" class="feed-item">
            <time>{{ new Date(event.observed_at).toLocaleTimeString() }}</time>
            <div>
              <strong>{{ event.machine_name }}</strong
              ><span
                >reported <b>{{ fmt(event.value) }} {{ detail?.unit }}</b></span
              >
            </div>
            <i></i>
          </div>
        </div>
        <div class="feed-footer">
          <span class="signal-dot"></span>{{ live.length }} metering points reporting
        </div>
      </section>
    </div>
    <div class="gauge-heading">
      <span class="eyebrow">MACHINE PERFORMANCE</span>
      <h2>Every machine at a glance</h2>
      <p>Click a machine to inspect its live rate trend.</p>
    </div>
    <div class="gauge-grid grid gap-4">
      <article
        v-for="machine in detail?.machines || []"
        :key="machine.id"
        class="gauge-card panel"
        :class="{
          off: machine.status !== 'live',
          'over-baseline':
            gauge(machine).current > gauge(machine).target && gauge(machine).target > 0,
        }"
        role="button"
        tabindex="0"
        :aria-label="`View ${category} trend for ${machine.name}`"
        @click="openMachine(machine.id)"
        @keydown.enter="openMachine(machine.id)"
        @keydown.space.prevent="openMachine(machine.id)"
      >
        <div class="gauge-top">
          <div>
            <strong>{{ machine.name }}</strong
            ><small>{{ machine.location_name }} · {{ machine.code }}</small>
          </div>
          <span class="state-tag" :class="{ off: machine.status !== 'live' }"
            ><i></i
            >{{
              machine.status === "live" ? "Live" : machine.meters.length ? "Off" : "No meter"
            }}</span
          >
        </div>
        <div class="gauge-visual">
          <svg
            viewBox="0 0 220 205"
            role="img"
            :aria-label="`${machine.name}: ${fmt(gauge(machine).percent)} percent of baseline`"
          >
            <path class="gauge-track" d="M57 153 A75 75 0 1 1 163 153" pathLength="100" />
            <path
              class="gauge-fill"
              d="M57 153 A75 75 0 1 1 163 153"
              pathLength="100"
              :stroke-dasharray="`${gauge(machine).fill} 100`"
            />
            <g v-for="tick in gaugeTicks" :key="tick.value">
              <line class="gauge-tick" :x1="tick.x1" :y1="tick.y1" :x2="tick.x2" :y2="tick.y2" />
              <text class="gauge-tick-label" :x="tick.tx" :y="tick.ty" text-anchor="middle">
                {{ tick.value }}
              </text>
            </g>
            <template v-if="gauge(machine).reporting.length">
              <line
                class="gauge-needle"
                x1="110"
                y1="100"
                :x2="gauge(machine).needleX"
                :y2="gauge(machine).needleY"
              />
              <circle class="gauge-hub" cx="110" cy="100" r="5" />
            </template>
          </svg>
          <div class="gauge-center">
            <strong>{{
              gauge(machine).reporting.length && gauge(machine).target
                ? `${fmt(gauge(machine).percent)}%`
                : "—"
            }}</strong
            ><span>OF BASELINE</span>
          </div>
        </div>
        <div class="gauge-reading">
          <strong
            >{{ gauge(machine).reporting.length ? fmt(gauge(machine).current) : "—" }}
            <small
              >/ {{ gauge(machine).reporting.length ? fmt(gauge(machine).target) : "—" }}
              {{ detail?.unit }}</small
            ></strong
          ><span>{{ gauge(machine).reporting.length }} / {{ machine.meters.length }} live</span>
        </div>
        <div class="gauge-meters">
          <div v-for="meter in machine.meters" :key="meter.id">
            <span>{{ meter.name }}</span
            ><strong>{{
              meter.status === "live" && meter.reading
                ? `${fmt(meter.reading.value)} ${meter.unit}`
                : statusText(meter)
            }}</strong>
          </div>
          <div v-if="!machine.meters.length">No metering assigned</div>
        </div>
        <div class="gauge-open-hint">
          View live trend <ArrowUpRight class="inline-icon" :size="14" aria-hidden="true" />
        </div>
      </article>
    </div>
    <div v-if="selected" class="vue-modal-backdrop" @click.self="closeMachine">
      <div
        class="machine-dialog vue-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="`${selected.name} live trend`"
      >
        <div class="dialog-head">
          <div>
            <span class="eyebrow">MACHINE LIVE TREND</span>
            <h2>{{ selected.name }}</h2>
            <p>{{ category }} · {{ selected.location_name }} · {{ selected.code }}</p>
          </div>
          <button class="icon-button" aria-label="Close machine trend" @click="closeMachine">
            <X :size="20" aria-hidden="true" />
          </button>
        </div>
        <div class="machine-dialog-stats">
          <div>
            <span>CURRENT RATE</span
            ><strong>{{
              selectedLive.length
                ? `${fmt(selectedLive.reduce((n, m) => n + Number(m.reading.value), 0))} ${detail?.unit}`
                : "—"
            }}</strong>
          </div>
          <div>
            <span>CONFIGURED BASELINE</span
            ><strong>{{
              selectedConfigured !== null ? `${fmt(selectedConfigured)} ${detail?.unit}` : "—"
            }}</strong>
          </div>
          <div>
            <span>HISTORICAL BASELINE · SIMULATED</span
            ><strong>{{
              selectedExpected !== null ? `${fmt(selectedExpected)} ${detail?.unit}` : "—"
            }}</strong>
          </div>
          <div>
            <span>MAXIMUM</span
            ><strong>{{
              selectedMaximum !== null ? `${fmt(selectedMaximum)} ${detail?.unit}` : "—"
            }}</strong>
          </div>
          <div>
            <span>STATUS</span><strong>{{ selected.status }}</strong>
          </div>
        </div>
        <div class="machine-trend-heading">
          <div>
            <span class="eyebrow">LAST 60 MINUTES</span>
            <h3>Utility flow rate</h3>
            <p>One-minute average across this machine's metering points. Gaps mean no readings.</p>
          </div>
          <span class="detail-refresh">UPDATES EVERY 2 SECONDS</span>
        </div>
        <p v-if="error" class="error-banner">{{ error }}</p>
        <RateChart
          :series="trend?.series || []"
          :baseline-series="trend?.historical_baseline_series || []"
          :baseline="selectedConfigured"
          :maximum="selectedMaximum"
          :unit="detail?.unit || ''"
          :updated-at="trend?.updated_at"
        />
      </div>
    </div>
  </section>
</template>
