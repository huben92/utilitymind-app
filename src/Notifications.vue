<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { api, fmt } from './lib'
import { ArrowUpRight } from '@lucide/vue'
const props=defineProps({active:Boolean,canManage:{type:Boolean,default:true}})
const emit=defineEmits(['changed','notice'])
const result=ref(null),filter=ref('open'),error=ref(''),resolving=ref(null),note=ref(''),busy=ref(false)
const open=a=>!a.resolved_at&&!a.review_status
const rows=computed(()=>(result.value?.alerts||[]).filter(a=>filter.value==='open'?open(a):!open(a)))
const types={machine_off_question:'Machine may be off',machine_on_question:'Machine may be running',metering_check:'Check metering',prolonged_maximum:'Sustained maximum',maximum:'Maximum',baseline:'Baseline',historical_high:'Above historical range',historical_low:'Below historical range'}
const message=a=>a.alert_type==='machine_off_question'?'All enabled metering points reported zero continuously for at least 1 minute. Is this machine off?':a.alert_type==='machine_on_question'?'Positive metering was detected while this machine is disabled in master data. Is it running again?':a.alert_type==='metering_check'?'Some metering points reported zero for at least 1 minute while other metering on this machine remained positive. Please check the metering.':a.alert_type==='prolonged_maximum'?'Reading stayed above the operational maximum for at least 1 minute.':a.alert_type==='historical_high'?`Reading is above the simulated historical range for this time of week. Expected ${fmt(a.baseline)} ${a.unit}.`:a.alert_type==='historical_low'?`Reading is below the simulated historical range for this time of week. Expected ${fmt(a.baseline)} ${a.unit}.`:`Reading exceeded the configured ${types[a.alert_type]?.toLowerCase()||'threshold'}.`
const time=value=>new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})+' WIB'
async function load(){if(!props.active)return;try{result.value=await api('/api/notifications');error.value=''}catch(e){error.value=e.message}}
watch(()=>props.active,active=>{if(active)load()},{immediate:true});const timer=setInterval(load,5000);onUnmounted(()=>clearInterval(timer))
async function action(id,kind,description=''){busy.value=true;try{await api(`/api/notifications/${id}/action`,'POST',{action:kind,note:description});resolving.value=null;note.value='';await load();emit('changed');emit('notice',kind==='ignore'?'Notification ignored':kind==='resolve'?'Notification resolved':'Machine status updated')}catch(e){emit('notice',e.message,true)}finally{busy.value=false}}
</script>
<template>
  <section class="page alerts-page">
    <div class="alerts-intro panel">
      <div>
        <span class="eyebrow">UTILITY METERING</span>
        <h2>Notifications</h2>
        <p>
          Review configured limits, simulated historical deviations, and patterns that may indicate
          a machine stopped or restarted. Confirming machine state updates its master-data status; a
          reading alone never changes it.
        </p>
      </div>
      <span class="detail-refresh">UPDATES EVERY 5 SECONDS</span>
    </div>
    <div class="alerts-toolbar">
      <div>
        <strong>{{ result?.open_count ?? "—" }} open notifications</strong
        ><span role="status">{{
          error
            ? `Could not load notifications: ${error}`
            : `${rows.length} ${filter === "open" ? "currently open" : "handled or ended"}`
        }}</span>
      </div>
      <div class="alert-filters" aria-label="Notification status">
        <button :class="{ selected: filter === 'open' }" @click="filter = 'open'">Open</button
        ><button :class="{ selected: filter === 'resolved' }" @click="filter = 'resolved'">
          History
        </button>
      </div>
    </div>
    <div class="alert-list">
      <article
        v-for="a in rows"
        :key="a.id"
        class="alert-card panel"
        :class="[
          open(a) ? 'open' : 'resolved',
          a.alert_type === 'prolonged_maximum'
            ? 'sustained'
            : a.alert_type === 'maximum'
              ? 'maximum'
              : a.alert_type.startsWith('historical_')
                ? 'historical'
                : a.alert_type.includes('machine') || a.alert_type === 'metering_check'
                  ? 'machine-alert'
                  : 'baseline',
        ]"
      >
        <div class="alert-card-head">
          <span class="alert-state" :class="open(a) ? 'open' : 'resolved'">{{
            (
              a.review_status?.replaceAll("_", " ") ||
              (a.resolved_at ? "Condition ended" : types[a.alert_type] || "Alert")
            ).toUpperCase()
          }}</span
          ><time>{{ time(a.started_at) }}</time>
        </div>
        <div class="alert-card-body">
          <div>
            <h3>
              {{ a.machine_name
              }}{{
                ["machine_off_question", "machine_on_question", "metering_check"].includes(
                  a.alert_type,
                )
                  ? ""
                  : ` · ${a.sensor_name}`
              }}
            </h3>
            <p>{{ a.location_name }} · {{ message(a) }}</p>
          </div>
          <strong
            v-if="
              !['machine_off_question', 'machine_on_question', 'metering_check'].includes(
                a.alert_type,
              )
            "
            class="alert-peak"
            >{{ a.alert_type === "historical_low" ? "Lowest" : "Peak" }} {{ fmt(a.peak_value) }} /
            {{ fmt(a.threshold_value ?? a.baseline) }} {{ a.unit }}</strong
          >
        </div>
        <div class="alert-card-detail">
          <span>{{ a.sensor_name || "—" }}</span
          ><span>Last observed {{ time(a.last_seen_at) }}</span
          ><span v-if="a.review_note">Note: {{ a.review_note }}</span>
        </div>
        <div v-if="open(a) && canManage" class="alert-actions">
          <button
            v-if="a.alert_type === 'machine_off_question'"
            :disabled="busy"
            @click="action(a.id, 'confirm_off')"
          >
            Yes, machine is off</button
          ><button
            v-else-if="a.alert_type === 'machine_on_question'"
            :disabled="busy"
            @click="action(a.id, 'confirm_on')"
          >
            Yes, machine is on</button
          ><button
            v-else
            :disabled="busy"
            @click="
              resolving = a.id;
              note = '';
            "
          >
            Resolve</button
          ><button class="secondary" :disabled="busy" @click="action(a.id, 'ignore')">
            Ignore
          </button>
        </div>
        <a
          :href="
            ['machine_off_question', 'machine_on_question', 'metering_check'].includes(a.alert_type)
              ? '#machines'
              : `#category/${encodeURIComponent(a.utility_type)}`
          "
          >View {{ a.utility_type || "machine master data" }}
          <ArrowUpRight class="inline-icon" :size="14" aria-hidden="true"
        /></a>
      </article>
      <div v-if="!rows.length" class="alert-empty panel">
        {{
          filter === "open"
            ? "No open notifications."
            : "No handled or ended notifications in recent history."
        }}
      </div>
    </div>
    <p class="alerts-note">
      A missing reading is not treated as zero. Zero and sustained-maximum checks require one minute
      of continuous fresh readings. Historical ranges use synthetic, time-matched data and are
      prompts for review, not confirmed fault diagnoses.
    </p>
    <div v-if="resolving !== null" class="vue-modal-backdrop" @click.self="resolving = null">
      <form
        class="vue-modal record-modal"
        role="dialog"
        aria-modal="true"
        @submit.prevent="action(resolving, 'resolve', note.trim())"
      >
        <h2>Resolve notification</h2>
        <p>Describe what you checked or corrected.</p>
        <label
          >Resolution note<textarea v-model="note" rows="4" maxlength="1000" required></textarea>
        </label>
        <div class="dialog-actions">
          <button type="button" class="button secondary" @click="resolving = null">Cancel</button
          ><button class="button primary" :disabled="busy">Resolve</button>
        </div>
      </form>
    </div>
  </section>
</template>
