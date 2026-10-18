<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { api, fmt } from './lib'
import { Plus, Search, X } from '@lucide/vue'
const props = defineProps({ page: String, data: Object, canEdit: {type:Boolean,default:true} })
const emit = defineEmits(['changed','notice'])
const config = {
  factories:{ columns:[['name','Factory'],['code','Code'],['description','Description']],fields:[['name','Factory name','text'],['code','Code','text'],['description','Description','text']] },
  locations:{ columns:[['name','Location'],['code','Code'],['factory_name','Factory'],['description','Description']],fields:[['factory_id','Factory','factories'],['name','Location name','text'],['code','Code','text'],['description','Description','text']] },
  production_lines:{ columns:[['name','Production line'],['code','Code'],['location_name','Location'],['factory_name','Factory']],fields:[['location_id','Location','locations'],['name','Line name','text'],['code','Code','text'],['description','Description','text']] },
  machines:{ columns:[['name','Machine'],['code','Code'],['enabled','Status'],['category','Stage'],['location_name','Location'],['production_line_name','Line'],['left_machine_ids','Left of machine'],['right_machine_ids','Right of machine']],fields:[['production_line_id','Production line','production_lines'],['name','Machine name','text'],['code','Code','text'],['category','Category','text'],['enabled','Machine enabled','checkbox'],['left_machine_ids','Machines on the left','machine_neighbors'],['right_machine_ids','Machines on the right','machine_neighbors'],['description','Description','text']] },
  metering:{ resource:'sensors',columns:[['name','Metering point'],['type','Utility'],['meter_role','Flow role'],['machine_name','Machine'],['location_name','Location'],['baseline','Configured baseline'],['enabled','Simulator']],fields:[['id','Meter ID','text'],['machine_id','Machine','machines'],['name','Metering point name','text'],['type','Utility type','category'],['meter_role','Flow role','meter_role'],['unit','Unit','text'],['baseline','Configured baseline','decimal'],['min_value','Minimum','decimal'],['max_value','Maximum','decimal'],['enabled','Enabled in simulator','checkbox']] }
}
const titles={factories:'Factories',locations:'Locations',production_lines:'Production lines',machines:'Machines',metering:'Metering'}
const schema=computed(()=>config[props.page]);const records=computed(()=>props.data?.[schema.value.resource||props.page]||[])
const search=ref(''),editing=ref(null),showDialog=ref(false),saving=ref(false),form=reactive({})
watch(()=>props.page,()=>{search.value='';showDialog.value=false})
const filtered=computed(()=>records.value.filter(row=>!search.value||JSON.stringify(row).toLowerCase().includes(search.value.toLowerCase())))
const peers=computed(()=>props.data?.machines?.filter(m=>m.production_line_id===Number(form.production_line_id)&&m.id!==editing.value?.id)||[])
function cell(row,key){ if(key==='enabled')return row.enabled?'Enabled':'Off';if(key==='baseline')return `${fmt(row.baseline)} ${row.unit}`;if(key.endsWith('_machine_ids'))return (row[key]||[]).map(id=>props.data?.machines?.find(m=>m.id===id)?.name||id).join(', ')||'—';return row[key]??'—' }
function open(row=null){editing.value=row;for(const key of Object.keys(form))delete form[key];for(const [key,,type] of schema.value.fields){form[key]=type==='machine_neighbors'?[...(row?.[key]||[])]:row?.[key]??(type==='checkbox'?props.page==='machines':key==='min_value'?0:key==='max_value'?200:type==='category'?'Electricity':type==='meter_role'?'consumption':'')}if(!row){for(const [key,,type] of schema.value.fields)if(props.data?.[type]?.length)form[key]=props.data[type][0].id}showDialog.value=true}
function chooseNeighbor(side,id,checked){const other=side==='left_machine_ids'?'right_machine_ids':'left_machine_ids';form[side]=checked?[...new Set([...form[side],id])]:form[side].filter(x=>x!==id);if(checked)form[other]=form[other].filter(x=>x!==id)}
function lineChanged(){form.left_machine_ids=[];form.right_machine_ids=[]}
async function save(){saving.value=true;const values={};for(const [key,,type] of schema.value.fields)values[key]=type==='machine_neighbors'?form[key]:['decimal','factories','locations','production_lines','machines'].includes(type)?Number(form[key]):type==='checkbox'?Boolean(form[key]):String(form[key]??'').trim();if(editing.value)values.id=editing.value.id;try{await api(`/api/master/${schema.value.resource||props.page}`,editing.value?'PUT':'POST',values);showDialog.value=false;emit('notice','Record saved');emit('changed')}catch(e){emit('notice',e.message,true)}finally{saving.value=false}}
async function remove(row){if(!confirm(`Delete ${row.name||row.id}? Items with related records cannot be deleted.`))return;try{await api(`/api/master/${schema.value.resource||props.page}`,'DELETE',{id:row.id});emit('notice','Record deleted');emit('changed')}catch(e){emit('notice',e.message,true)}}
</script>
<template>
  <section class="page">
    <div class="master-intro panel">
      <div>
        <span class="eyebrow">POSTGRESQL MASTER DATA</span>
        <h2>{{ titles[page] }}</h2>
        <p>
          Manage the factory hierarchy and configured metering limits. Simulated historical
          baselines are calculated separately.
        </p>
      </div>
      <button v-if="canEdit" class="button primary" @click="open()">
        <Plus class="inline-icon" :size="15" aria-hidden="true" /> Add record
      </button>
    </div>
    <div class="table-panel panel">
      <div class="table-tools">
        <label class="search"
          ><Search :size="16" aria-hidden="true" />
          <input
            v-model="search"
            type="search"
            placeholder="Search records"
            aria-label="Search records" /></label
        ><span>{{ filtered.length }} of {{ records.length }} records</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th v-for="[key, label] in schema.columns" :key="key">{{ label.toUpperCase() }}</th>
              <th v-if="canEdit">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filtered" :key="row.id">
              <td v-for="[key] in schema.columns" :key="key">
                <span v-if="key === 'enabled'" class="pill" :class="{ off: !row.enabled }">{{
                  cell(row, key)
                }}</span
                ><template v-else>{{ cell(row, key) }}</template>
              </td>
              <td v-if="canEdit">
                <div class="table-actions">
                  <button @click="open(row)">Edit</button
                  ><button class="delete" @click="remove(row)">Delete</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!filtered.length" class="table-empty">No matching records.</div>
    </div>
    <div v-if="showDialog" class="vue-modal-backdrop" @click.self="showDialog = false">
      <div
        class="vue-modal record-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="`${editing ? 'Edit' : 'Add'} ${titles[page]}`"
      >
        <form @submit.prevent="save">
          <div class="dialog-head">
            <div>
              <span class="eyebrow">MASTER DATA</span>
              <h2>
                {{ editing ? "Edit" : "Add" }}
                {{ page === "metering" ? "metering point" : titles[page] }}
              </h2>
            </div>
            <button
              type="button"
              class="icon-button"
              aria-label="Close"
              @click="showDialog = false"
            >
              <X :size="20" aria-hidden="true" />
            </button>
          </div>
          <div class="form-fields">
            <template v-for="[key, label, type] in schema.fields" :key="key"
              ><fieldset v-if="type === 'machine_neighbors'" class="neighbor-field">
                <legend>{{ label }}</legend>
                <div class="neighbor-options">
                  <label v-for="m in peers" :key="m.id"
                    ><input
                      type="checkbox"
                      :checked="form[key]?.includes(m.id)"
                      @change="chooseNeighbor(key, m.id, $event.target.checked)"
                    /><span>{{ m.name }}</span></label
                  ><span v-if="!peers.length" class="neighbor-empty"
                    >No other machines on this production line.</span
                  >
                </div>
              </fieldset>
              <label v-else-if="type === 'checkbox'" class="check"
                ><input v-model="form[key]" type="checkbox" />{{ label }}</label
              ><label v-else :class="{ wide: ['name', 'description', 'id'].includes(key) }"
                >{{ label
                }}<select v-if="type === 'category'" v-model="form[key]">
                  <option
                    v-for="name in [
                      'Electricity',
                      'Clean Water',
                      'Compressed Air',
                      'Natural Gas',
                      'Diesel',
                      'Chilled Water',
                      'Steam',
                      'Hot Water',
                    ]"
                    :key="name"
                    :value="name"
                  >
                    {{ name }}
                  </option></select
                ><select v-else-if="type === 'meter_role'" v-model="form[key]">
                  <option value="consumption">Consumption (end use or system input)</option>
                  <option value="supply">Supply (system output)</option></select
                ><select
                  v-else-if="data?.[type]"
                  v-model="form[key]"
                  @change="key === 'production_line_id' && lineChanged()"
                >
                  <option v-for="item in data[type]" :key="item.id" :value="item.id">
                    {{ item.name }}{{ item.location_name ? ` · ${item.location_name}` : "" }}
                  </option></select
                ><input
                  v-else
                  v-model="form[key]"
                  :type="type === 'decimal' ? 'number' : 'text'"
                  :step="type === 'decimal' ? 'any' : undefined"
                  :readonly="key === 'id' && !!editing"
                  :required="key !== 'description'" /></label
            ></template>
          </div>
          <div class="dialog-actions">
            <button type="button" class="button secondary" @click="showDialog = false">
              Cancel</button
            ><button class="button primary" :disabled="saving">
              {{ saving ? "Saving…" : "Save record" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>
