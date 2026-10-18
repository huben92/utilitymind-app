<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { X } from '@lucide/vue'
import RateChart from './RateChart.vue'
import { api, fmt, mapLayout, statusText } from './lib'

const props = defineProps({ data: Object })
const selected = ref(null)
const board = ref(null)
const lines = ref([])
const selectedMachineId = ref(null)
const machineDetail = ref(null)
const machineError = ref('')
const machineLoading = ref(false)
const closeButton = ref(null)
let requestSequence = 0
let lastTrigger = null
let refreshTimer
let activeRequest = null

watch(() => props.data?.locations, locations => {
  if (!locations?.some(location => location.id === selected.value)) selected.value = locations?.[0]?.id ?? null
}, { immediate: true })
const location = computed(() => props.data?.locations?.find(item => item.id === selected.value))
const layout = computed(() => mapLayout(props.data?.machines?.filter(machine => machine.location_id === selected.value) || []))
const selectedMachine = computed(() => machineDetail.value?.machine || props.data?.machines?.find(machine => machine.id === selectedMachineId.value))

async function draw() {
  await nextTick()
  const root = board.value
  if (!root) return
  const box = root.getBoundingClientRect()
  const nodes = new Map([...root.querySelectorAll('[data-machine-id]')].map(node => [Number(node.dataset.machineId), node]))
  lines.value = layout.value.edges.map(([from, to]) => {
    const a = nodes.get(from)?.getBoundingClientRect(), b = nodes.get(to)?.getBoundingClientRect()
    if (!a || !b) return null
    const x1 = a.right - box.left, y1 = a.top - box.top + a.height / 2
    const x2 = b.left - box.left, y2 = b.top - box.top + b.height / 2, mid = (x1 + x2) / 2
    return {
      d: `M ${x1} ${y1} H ${mid} V ${y2} H ${x2 - 5}`,
      arrow: `M ${x2 - 6} ${y2 - 4} L ${x2} ${y2} L ${x2 - 6} ${y2 + 4}`,
      color: nodes.get(from).classList.contains('off') || nodes.get(to).classList.contains('off') ? '#4f6570' : '#438f7b',
    }
  }).filter(Boolean)
}

async function fetchMachine() {
  const id = selectedMachineId.value
  if (!id || activeRequest?.id === id) return
  const sequence = ++requestSequence
  activeRequest = { id, sequence }
  try {
    const result = await api(`/api/machine/${id}/metering-trends`)
    if (sequence === requestSequence && selectedMachineId.value === id) {
      machineDetail.value = result
      machineError.value = ''
    }
  } catch (error) {
    if (sequence === requestSequence && selectedMachineId.value === id) machineError.value = error.message
  } finally {
    if (activeRequest?.sequence === sequence) activeRequest = null
    if (sequence === requestSequence) machineLoading.value = false
  }
}

async function openMachine(id, event) {
  lastTrigger = event?.currentTarget || null
  selectedMachineId.value = id
  machineDetail.value = null
  machineError.value = ''
  machineLoading.value = true
  fetchMachine()
  await nextTick()
  closeButton.value?.focus()
}

function closeMachine() {
  selectedMachineId.value = null
  machineDetail.value = null
  machineError.value = ''
  machineLoading.value = false
  requestSequence++
  activeRequest = null
  lastTrigger?.focus()
}

function onKeydown(event) { if (event.key === 'Escape' && selectedMachineId.value) closeMachine() }
watch([layout, selected], draw, { deep: true })
watch(selected, () => { if (selectedMachineId.value) closeMachine() })
onMounted(() => {
  draw()
  window.addEventListener('resize', draw)
  document.addEventListener('keydown', onKeydown)
  refreshTimer = setInterval(() => { if (selectedMachineId.value) fetchMachine() }, 2000)
})
onUnmounted(() => {
  window.removeEventListener('resize', draw)
  document.removeEventListener('keydown', onKeydown)
  clearInterval(refreshTimer)
  requestSequence++
})
</script>

<template>
  <section class="page">
    <div class="map-toolbar panel">
      <div>
        <span class="eyebrow">PRODUCTION FLOW</span>
        <h2>{{ location?.name || "Location map" }}</h2>
        <p>
          Select a machine to inspect all of its live metering trends. Connections follow machine
          master data.
        </p>
      </div>
      <div class="map-toolbar-right">
        <label
          >Location
          <select v-model.number="selected" aria-label="Map location">
            <option v-for="item in data?.locations || []" :key="item.id" :value="item.id">
              {{ item.name }} · {{ item.factory_name }}
            </option>
          </select></label
        >
        <div class="legend">
          <span><i class="legend-live"></i>Live</span><span><i class="legend-off"></i>Off</span>
        </div>
      </div>
    </div>
    <div class="map-scroll overflow-auto">
      <div ref="board" class="map-board">
        <svg
          class="map-lines"
          :viewBox="`0 0 ${board?.scrollWidth || 1} ${board?.scrollHeight || 1}`"
          aria-hidden="true"
        >
          <g
            v-for="(line, index) in lines"
            :key="index"
            fill="none"
            :stroke="line.color"
            stroke-width="1.5"
            opacity=".8"
          >
            <path :d="line.d" />
            <path :d="line.arrow" />
          </g>
        </svg>
        <div
          class="map-columns"
          :style="{ '--map-column-count': Math.max(1, layout.columns.length) }"
        >
          <div v-for="(column, index) in layout.columns" :key="index" class="map-column">
            <div class="map-stage">
              {{ String(index + 1).padStart(2, "0") }} /
              {{ [...new Set(column.map((machine) => machine.category))].join(", ") }}
            </div>
            <button
              v-for="machine in column"
              :key="machine.id"
              type="button"
              class="machine-node"
              :class="{ off: machine.status !== 'live' }"
              :data-machine-id="machine.id"
              :aria-label="`View all metering trends for ${machine.name}`"
              @click="openMachine(machine.id, $event)"
            >
              <span class="node-top"
                ><span
                  ><strong>{{ machine.name }}</strong
                  ><small>{{ machine.code }}</small></span
                ><span class="state-tag" :class="{ off: machine.status !== 'live' }"><i></i></span
              ></span>
              <span class="node-readings"
                ><template v-if="machine.sensors.length"
                  ><template v-for="meter in machine.sensors" :key="meter.id"
                    ><span v-if="meter.status === 'live'"
                      >{{ meter.type }} {{ fmt(meter.reading.value) }} / {{ fmt(meter.baseline) }}
                      {{ meter.unit }}</span
                    ><em v-else>{{ meter.type }} · {{ statusText(meter) }}</em></template
                  ></template
                ><em v-else>No metering assigned</em></span
              >
            </button>
          </div>
          <div v-if="!layout.columns.length" class="map-empty">
            No machines are assigned to this location.
          </div>
        </div>
      </div>
    </div>
    <div class="map-footer">
      <span>FLOW START</span><span>CONNECTIONS FOLLOW MACHINE MASTER DATA</span
      ><span>FLOW END</span>
    </div>

    <div v-if="selectedMachineId" class="vue-modal-backdrop" @click.self="closeMachine">
      <div
        class="vue-modal map-machine-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="`${selectedMachine?.name || 'Machine'} metering trends`"
      >
        <div class="dialog-head">
          <div>
            <span class="eyebrow">LIVE MACHINE METERING</span>
            <h2>{{ selectedMachine?.name || "Machine" }}</h2>
            <p>
              {{ selectedMachine?.location_name }} · {{ selectedMachine?.code }} · Last 60 minutes
            </p>
          </div>
          <button
            ref="closeButton"
            type="button"
            class="icon-button"
            aria-label="Close machine metering"
            @click="closeMachine"
          >
            <X :size="20" aria-hidden="true" />
          </button>
        </div>
        <div class="map-dialog-intro">
          <span
            >Each meter has its own rate and unit. The dashed baseline comes from three months of
            simulated history for the same time of week.</span
          ><span>UPDATES EVERY 2 SECONDS</span>
        </div>
        <p v-if="machineError" class="error-banner" role="alert">{{ machineError }}</p>
        <div v-if="machineLoading && !machineDetail" class="map-dialog-empty">
          Loading metering history…
        </div>
        <div v-else-if="machineDetail && !machineDetail.meters.length" class="map-dialog-empty">
          No metering points are assigned to this machine.
        </div>
        <div v-else-if="machineDetail" class="map-meter-grid">
          <article
            v-for="meter in machineDetail.meters"
            :key="meter.id"
            class="map-meter-card panel"
          >
            <div class="map-meter-heading">
              <div>
                <span class="eyebrow">{{ meter.type }}</span>
                <h3>{{ meter.name }}</h3>
              </div>
              <span class="state-tag" :class="{ off: meter.status !== 'live' }"
                ><i></i
                >{{
                  meter.status === "live" ? "Live" : meter.status === "stale" ? "Stale" : "Off"
                }}</span
              >
            </div>
            <div class="map-meter-values">
              <div>
                <span>CURRENT RATE</span
                ><strong
                  >{{ meter.reading ? fmt(meter.reading.value) : "—" }} {{ meter.unit }}</strong
                >
              </div>
              <div>
                <span>HISTORICAL · SIMULATED</span
                ><strong
                  >{{ meter.historical_baseline ? fmt(meter.historical_baseline.expected) : "—" }}
                  {{ meter.unit }}</strong
                >
              </div>
              <div>
                <span>CONFIGURED BASELINE</span
                ><strong>{{ fmt(meter.baseline) }} {{ meter.unit }}</strong>
              </div>
              <div>
                <span>MAXIMUM</span><strong>{{ fmt(meter.max_value) }} {{ meter.unit }}</strong>
              </div>
            </div>
            <RateChart
              :series="meter.series"
              :baseline-series="meter.historical_baseline_series"
              :baseline="Number(meter.baseline)"
              :maximum="Number(meter.max_value)"
              :unit="meter.unit"
              :updated-at="machineDetail.updated_at"
            />
            <div class="map-meter-updated">
              {{
                meter.last_seen_at
                  ? `Last reading ${new Date(meter.last_seen_at).toLocaleTimeString()}`
                  : "No readings received"
              }}
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>
