<script setup>
import { computed, ref, watch } from 'vue'
import { api, defaultPeriod, reportFmt } from './lib'
import { Download } from '@lucide/vue'
const props=defineProps({page:String,data:Object})
const kind=computed(()=>props.page==='daily_report'?'daily':'monthly')
const period=ref(defaultPeriod(kind.value)),factory=ref(''),report=ref(null),status=ref(''),selectedUtility=ref(0),loading=ref(false)
let generation=0
const query=computed(()=>{const p=new URLSearchParams({period:period.value});if(factory.value)p.set('factory_id',factory.value);return p.toString()})
const selected=computed(()=>report.value?.utilities?.[Number(selectedUtility.value)])
const bars=computed(()=>{const points=selected.value?.trend||[],values=points.map(p=>p.value).filter(v=>v!==null),max=Math.max(1,...values)*1.12,w=610/Math.max(1,points.length),gap=Math.min(7,w*.18);return {points,max,bars:points.map((p,i)=>({x:55+i*w+gap/2,w:Math.max(2,w-gap),y:p.value==null?193:195-p.value/max*155,h:p.value==null?2:p.value/max*155,missing:p.value==null})),hasValues:values.length>0}})
async function load(){const current=++generation;report.value=null;if(!period.value){status.value='Choose a reporting period.';return}loading.value=true;status.value='Calculating report from ClickHouse telemetry…';try{const result=await api(`/api/reports/${kind.value}?${query.value}`);if(current===generation){report.value=result;selectedUtility.value=0;status.value=result.samples?'Report ready. PDF uses fresh data when downloaded.':'No readings in this period. The report documents metering gaps and unavailable KPIs.'}}catch(e){if(current===generation)status.value=`Report unavailable: ${e.message}`}finally{if(current===generation)loading.value=false}}
watch(kind,()=>{period.value=defaultPeriod(kind.value);factory.value=''})
watch([kind,period,factory],load,{immediate:true})
</script>
<template>
  <section class="page report-page">
    <div class="report-toolbar panel">
      <div>
        <span class="eyebrow">UTILITY OPERATIONS REPORT</span>
        <h2>{{ kind === "daily" ? "Daily Report" : "Monthly Report" }}</h2>
        <p>Observed utility use, machine hotspots, and metering quality for the selected period.</p>
      </div>
      <div class="report-controls">
        <label
          >Period<input
            v-model="period"
            :type="kind === 'daily' ? 'date' : 'month'"
            :max="defaultPeriod(kind)"
            aria-label="Report period" /></label
        ><label
          >Factory<select v-model="factory" aria-label="Report factory">
            <option value="">All factories</option>
            <option v-for="f in data?.factories || []" :key="f.id" :value="f.id">
              {{ f.name }}
            </option>
          </select></label
        ><button class="button secondary" :disabled="loading" @click="load">Update</button
        ><a
          v-if="report"
          class="button primary"
          :href="`/api/reports/${kind}/pdf?${query}`"
          download
          ><Download class="inline-icon" :size="15" aria-hidden="true" /> Download PDF</a
        >
      </div>
    </div>
    <div class="report-status" role="status">{{ status }}</div>
    <template v-if="report"
      ><div class="report-meta">
        <span
          >{{ kind === "daily" ? "DAY" : "MONTH" }} · {{ report.label
          }}{{ report.partial ? " · IN PROGRESS" : "" }}</span
        ><span>{{ report.data_origin?.toUpperCase() }} TELEMETRY</span
        ><span
          >THROUGH
          {{
            new Date(report.period_end).toLocaleString(undefined, {
              timeZone: "Asia/Jakarta",
              dateStyle: "medium",
              timeStyle: "short",
            })
          }}
          WIB</span
        >
      </div>
      <div class="summary-grid report-summary grid gap-4">
        <article
          v-for="[label, value, note] in [
            ['Utility groups', report.utilities.length, 'Current catalog in this report'],
            [
              'Reporting meters',
              `${report.reporting_meters} / ${report.meter_count}`,
              'Points with at least one reading',
            ],
            [
              'Sample coverage',
              `${reportFmt(report.coverage_pct)}%`,
              'Across current metering catalog',
            ],
            ['Readings', reportFmt(report.samples), 'ClickHouse samples in period'],
          ]"
          :key="label"
          class="summary-card"
        >
          <span>{{ label }}</span
          ><strong>{{ value }}</strong
          ><small>{{ note }}</small>
        </article>
      </div>
      <div class="report-layout grid gap-4">
        <section class="panel">
          <div class="panel-head">
            <div>
              <span class="eyebrow">OBSERVED QUANTITIES</span>
              <h2>Utility ledger</h2>
              <p>Totals only cover reported intervals. Different units are not added together.</p>
            </div>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>UTILITY</th>
                  <th>OBSERVED TOTAL</th>
                  <th>COVERAGE</th>
                  <th>BASELINE USE*</th>
                  <th>METERS</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="g in report.utilities" :key="g.category">
                  <td>
                    {{ g.category }} <small>{{ g.rate_unit }}</small>
                  </td>
                  <td>
                    <strong>{{
                      g.observed_total == null
                        ? "N/A"
                        : `${reportFmt(g.observed_total)} ${g.quantity_unit}`
                    }}</strong>
                  </td>
                  <td>{{ reportFmt(g.coverage_pct) }}%</td>
                  <td>
                    {{ g.utilization_pct == null ? "N/A" : `${reportFmt(g.utilization_pct)}%` }}
                  </td>
                  <td>{{ g.reporting_meters }} / {{ g.meter_count }}</td>
                </tr>
                <tr v-if="!report.utilities.length">
                  <td colspan="5">No metering points in the selected factory.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="report-footnote">
            *Observed quantity / current configured baseline during covered time. Indicative only;
            production-adjusted targets are not available.
          </p>
        </section>
        <section class="panel report-trend-panel">
          <div class="panel-head">
            <div>
              <span class="eyebrow">TIME PROFILE</span>
              <h2>Usage trend</h2>
              <p>
                Observed {{ selected?.quantity_unit || selected?.rate_unit }} by local
                {{ kind === "daily" ? "hour" : "day" }}. Gaps are unmeasured.
              </p>
            </div>
            <select v-model="selectedUtility" aria-label="Utility shown in trend">
              <option v-for="(g, i) in report.utilities" :key="g.category" :value="i">
                {{ g.category }} · {{ g.quantity_unit || g.rate_unit }}
              </option>
            </select>
          </div>
          <div class="report-trend-canvas">
            <svg
              viewBox="0 0 700 230"
              preserveAspectRatio="none"
              role="img"
              aria-label="Observed utility quantity by reporting interval"
            >
              <g v-for="fraction in [0, 0.25, 0.5, 0.75, 1]" :key="fraction">
                <line
                  x1="55"
                  :y1="195 - fraction * 155"
                  x2="680"
                  :y2="195 - fraction * 155"
                  class="trend-gridline"
                />
                <text x="48" :y="199 - fraction * 155" text-anchor="end" class="trend-label">
                  {{ reportFmt(bars.max * fraction) }}
                </text>
              </g>
              <rect
                v-for="(bar, i) in bars.bars"
                :key="i"
                :x="bar.x"
                :y="bar.y"
                :width="bar.w"
                :height="bar.h"
                :class="bar.missing ? 'report-missing-bar' : 'report-value-bar'"
                rx="2"
              />
              <text x="680" y="24" text-anchor="end" class="trend-unit">
                {{ selected?.quantity_unit || selected?.rate_unit }}
              </text>
            </svg>
            <div v-if="!bars.hasValues" class="chart-empty">No metering in this period.</div>
          </div>
          <div v-if="bars.points.length" class="report-trend-times">
            <span>{{ bars.points[0].bucket }}</span
            ><span>{{ bars.points[Math.floor((bars.points.length - 1) / 2)].bucket }}</span
            ><span>{{ bars.points.at(-1).bucket }}</span>
          </div>
        </section>
      </div>
      <div class="report-layout grid gap-4">
        <section class="panel">
          <div class="panel-head">
            <div>
              <span class="eyebrow">REVIEW ITEMS</span>
              <h2>Operational review</h2>
              <p>Screening observations for a utility manager to check.</p>
            </div>
          </div>
          <div class="report-list">
            <div v-for="(item, i) in report.review_items" :key="i" class="report-list-item">
              <i>!</i>
              <p>{{ item }}</p>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <div>
              <span class="eyebrow">EVIDENCE LIMITS</span>
              <h2>Unavailable KPIs</h2>
              <p>These require additional production, shift, or tariff data.</p>
            </div>
          </div>
          <div class="report-list">
            <div v-for="(item, i) in report.unavailable" :key="i" class="report-list-item muted">
              <i>—</i>
              <p>{{ item }}</p>
            </div>
          </div>
        </section>
      </div>
      <section class="panel report-table-panel">
        <div class="panel-head">
          <div>
            <span class="eyebrow">MACHINE CONTRIBUTION</span>
            <h2>Highest observed machine per utility</h2>
          </div>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>UTILITY</th>
                <th>MACHINE</th>
                <th>OBSERVED TOTAL</th>
                <th>SHARE OF REPORTED USE</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="g in report.utilities.filter((g) => g.machines?.length)" :key="g.category">
                <td>{{ g.category }}</td>
                <td>
                  {{ g.machines[0].name }} <small>{{ g.machines[0].location }}</small>
                </td>
                <td>{{ reportFmt(g.machines[0].total) }} {{ g.quantity_unit }}</td>
                <td>
                  {{
                    g.observed_total
                      ? `${reportFmt((g.machines[0].total / g.observed_total) * 100)}%`
                      : "N/A"
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="panel report-table-panel">
        <div class="panel-head">
          <div>
            <span class="eyebrow">DATA QUALITY</span>
            <h2>Metering coverage</h2>
          </div>
        </div>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>METERING POINT</th>
                <th>UTILITY</th>
                <th>MACHINE</th>
                <th>COVERAGE</th>
                <th>READINGS</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in report.meter_quality" :key="m.id">
                <td>{{ m.name }}</td>
                <td>{{ m.type }}</td>
                <td>{{ m.machine_name }}</td>
                <td>{{ reportFmt(m.coverage_pct) }}%</td>
                <td>{{ reportFmt(m.samples) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <div class="report-method">
        <strong>Method and provenance</strong>
        <p>{{ report.method }}</p>
        <p>
          ClickHouse telemetry joined with current PostgreSQL master data. This report is advisory
          and does not command the production process.
        </p>
      </div>
    </template>
  </section>
</template>
