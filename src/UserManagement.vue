<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api } from './lib'
import { Plus, X } from '@lucide/vue'
const props=defineProps({currentUser:Object})
const users=ref([]),factories=ref([]),status=ref(''),busy=ref(false),editing=ref(null),show=ref(false),created=ref(null)
const form=reactive({username:'',role:'viewer',factory_id:'',enabled:true,password:''})
const roles=[['super_admin','Super admin'],['admin','Admin'],['factory_admin','Factory admin'],['viewer','Viewer']]
async function load(){try{const response=await api('/api/users');users.value=response.users;factories.value=response.factories||[];status.value=`${users.value.length} ${users.value.length===1?'user':'users'}`}catch(e){status.value=e.message}}
function open(user=null){editing.value=user;form.username=user?.username||'';form.role=user?.role||'viewer';form.factory_id=user?.factory_id||factories.value[0]?.id||'';form.enabled=user?.enabled??true;form.password='';show.value=true;created.value=null}
function generate(){const bytes=crypto.getRandomValues(new Uint8Array(24));const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';form.password=Array.from(bytes,b=>alphabet[b%alphabet.length]).join('')}
async function save(){busy.value=true;try{const factory_id=form.role==='factory_admin'?Number(form.factory_id):null;if(editing.value){const update={role:form.role,factory_id,enabled:form.enabled};if(form.password)update.password=form.password;await api(`/api/users/${editing.value.id}`,'PATCH',update);if(form.password)created.value={username:form.username,password:form.password};else show.value=false}else{const password=form.password;await api('/api/users','POST',{username:form.username,role:form.role,factory_id,password});created.value={username:form.username,password}}await load();status.value='User saved'}catch(e){status.value=e.message}finally{busy.value=false}}
async function remove(user){if(!confirm(`Delete ${user.username}? This removes the account and signs it out.`))return;busy.value=true;try{await api(`/api/users/${user.id}`,'DELETE');await load();status.value='User deleted'}catch(e){status.value=e.message}finally{busy.value=false}}
async function copyPassword(){try{await navigator.clipboard.writeText(created.value.password);status.value='Password copied'}catch{status.value='Select and copy the password shown below.'}}
onMounted(load)
</script>
<template>
  <section class="page">
    <div class="master-intro panel">
      <div>
        <span class="eyebrow">ACCESS CONTROL</span>
        <h2>User management</h2>
        <p>
          Only super admins can create users, change roles, reset passwords, or remove accounts.
        </p>
      </div>
      <button class="button primary" @click="open()">
        <Plus class="inline-icon" :size="15" aria-hidden="true" /> Add user
      </button>
    </div>
    <div class="role-summary">
      <div class="panel">
        <strong>Super admin</strong>
        <p>Full access, including users and AI settings.</p>
      </div>
      <div class="panel">
        <strong>Admin</strong>
        <p>Can manage data and notifications across all factories.</p>
      </div>
      <div class="panel">
        <strong>Factory admin</strong>
        <p>Can manage only the assigned factory and its data.</p>
      </div>
      <div class="panel">
        <strong>Viewer</strong>
        <p>Can view dashboard data, reports, and AI answers.</p>
      </div>
    </div>
    <div class="table-panel panel">
      <div class="table-tools">
        <strong>Accounts</strong><span role="status">{{ status }}</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>USERNAME</th>
              <th>ROLE</th>
              <th>STATUS</th>
              <th>CREATED</th>
              <th>LAST LOGIN</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>{{ user.username }}{{ user.id === currentUser.id ? " (you)" : "" }}</td>
              <td>{{ user.role.replaceAll("_", " ") }}<small v-if="user.factory_id"> · {{ factories.find(factory=>factory.id===user.factory_id)?.name||'Factory '+user.factory_id }}</small></td>
              <td>
                <span class="pill" :class="{ off: !user.enabled }">{{
                  user.enabled ? "Enabled" : "Disabled"
                }}</span>
              </td>
              <td>{{ new Date(user.created_at).toLocaleDateString() }}</td>
              <td>
                {{ user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never" }}
              </td>
              <td>
                <div class="table-actions">
                  <button @click="open(user)">Edit</button
                  ><button
                    class="delete"
                    :disabled="user.id === currentUser.id"
                    @click="remove(user)"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div v-if="show" class="vue-modal-backdrop" @click.self="show = false">
      <div
        class="vue-modal record-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="editing ? 'Edit user' : 'Add user'"
      >
        <template v-if="created"
          ><div class="dialog-head">
            <div>
              <span class="eyebrow">USER SAVED</span>
              <h2>Share these credentials</h2>
            </div>
            <button class="icon-button" aria-label="Close" @click="show = false">
              <X :size="20" aria-hidden="true" />
            </button>
          </div>
          <p>
            The password is shown only now. Give it to {{ created.username }} through a channel you
            trust.
          </p>
          <label>Username<input :value="created.username" readonly /></label
          ><label>Password<input :value="created.password" readonly /></label>
          <div class="dialog-actions">
            <button class="button secondary" @click="copyPassword">Copy password</button
            ><button class="button primary" @click="show = false">Done</button>
          </div></template
        >
        <form v-else @submit.prevent="save">
          <div class="dialog-head">
            <div>
              <span class="eyebrow">USER MANAGEMENT</span>
              <h2>{{ editing ? "Edit user" : "Add user" }}</h2>
            </div>
            <button type="button" class="icon-button" aria-label="Close" @click="show = false">
              <X :size="20" aria-hidden="true" />
            </button>
          </div>
          <div class="user-form-fields">
            <label
              >Username<input
                v-model="form.username"
                type="text"
                autocomplete="off"
                maxlength="50"
                :readonly="!!editing"
                required /></label
            ><label
              >Role<select v-model="form.role" :disabled="editing?.id === currentUser.id">
                <option v-for="[value, label] in roles" :key="value" :value="value">
                  {{ label }}
                </option>
              </select></label
            ><label v-if="form.role==='factory_admin'"
              >Factory<select v-model="form.factory_id" required>
                <option v-for="factory in factories" :key="factory.id" :value="factory.id">{{ factory.name }}</option>
              </select></label
            ><label v-if="editing" class="user-checkbox"
              ><input
                v-model="form.enabled"
                type="checkbox"
                :disabled="editing.id === currentUser.id"
              />
              Account enabled</label
            ><label
              >{{ editing ? "New password (optional)" : "Initial password" }}
              <div class="password-row">
                <input
                  v-model="form.password"
                  type="password"
                  autocomplete="off"
                  minlength="12"
                  maxlength="128"
                  :required="!editing"
                /><button type="button" class="button secondary" @click="generate">Generate</button>
              </div>
              <small>At least 12 characters. Copy it after saving.</small></label
            >
          </div>
          <div class="dialog-actions">
            <button type="button" class="button secondary" @click="show = false">Cancel</button
            ><button class="button primary" :disabled="busy">
              {{ busy ? "Saving…" : "Save user" }}
            </button>
          </div>
          <p v-if="status && !status.includes('users')" class="user-form-status" role="status">
            {{ status }}
          </p>
        </form>
      </div>
    </div>
  </section>
</template>
