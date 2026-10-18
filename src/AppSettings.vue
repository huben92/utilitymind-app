<script setup>
import { reactive, ref, onMounted } from 'vue'
import { api } from './lib'
const form=reactive({api_url:'',model:'',api_key:'',clear_api_key:false}),hasKey=ref(false),status=ref(''),busy=ref(false)
async function load(){status.value='Loading settings…';try{const result=await api('/api/ai/settings');form.api_url=result.api_url||'';form.model=result.model||'';hasKey.value=result.has_api_key;status.value=form.api_url?'Connection settings loaded.':'Enter a service URL and model to enable chat.'}catch(e){status.value=`Settings unavailable: ${e.message}`}}
async function save(){busy.value=true;status.value='Saving…';try{const result=await api('/api/ai/settings','POST',{...form});hasKey.value=result.has_api_key;form.api_key='';form.clear_api_key=false;status.value='AI settings saved.'}catch(e){status.value=`Could not save: ${e.message}`}finally{busy.value=false}}
async function test(){busy.value=true;status.value='Contacting the saved AI service…';try{await api('/api/ai/settings/test','POST',{});status.value='Connection works. You can use Chat with AI.'}catch(e){status.value=`Connection failed: ${e.message}`}finally{busy.value=false}}
onMounted(load)
</script>
<template>
  <section class="page settings-page">
    <div class="settings-intro panel">
      <span class="eyebrow">APPLICATION CONFIGURATION</span>
      <h2>AI connection</h2>
      <p>
        Connect an OpenAI-compatible chat-completions API. The browser sends your key to this
        dashboard once; the key is encrypted before it is stored in PostgreSQL and is never returned
        to the browser.
      </p>
    </div>
    <form class="settings-form panel" @submit.prevent="save">
      <label
        >AI API URL<input
          v-model="form.api_url"
          type="url"
          placeholder="https://provider.example/v1/chat/completions"
          maxlength="500"
          required
        /><small
          >Full HTTPS endpoint ending in /chat/completions. Local HTTP endpoints are
          supported.</small
        ></label
      ><label
        >Model name<input
          v-model="form.model"
          type="text"
          placeholder="Model identifier from your provider"
          maxlength="120"
          required /></label
      ><label
        >API key<input
          v-model="form.api_key"
          type="password"
          placeholder="Enter a key to save or replace it"
          autocomplete="new-password"
        /><small>{{
          hasKey
            ? "A key is saved. Leave this blank to keep it."
            : "No key saved. Local services may not require one."
        }}</small></label
      ><label class="settings-check"
        ><input v-model="form.clear_api_key" type="checkbox" /> Remove the saved API key</label
      >
      <div class="settings-actions">
        <button class="button primary" :disabled="busy">Save AI settings</button
        ><button type="button" class="button secondary" :disabled="busy" @click="test">
          Test connection</button
        ><span role="status">{{ status }}</span>
      </div>
    </form>
    <div class="settings-note panel">
      <strong>Data access</strong>
      <p>
        Chat can read factory master data and ClickHouse telemetry through bounded queries. Actual
        production, shift attendance, tariffs, and verified anomalies are not connected yet.
      </p>
    </div>
  </section>
</template>
