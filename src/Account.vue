<script setup>
import { reactive, ref } from 'vue'
import { api } from './lib'
const props = defineProps({ user: Object })
const form=reactive({current_password:'',new_password:'',confirm:''})
const status=ref(''),busy=ref(false)
async function save(){
  if(form.new_password!==form.confirm){status.value='New passwords do not match.';return}
  busy.value=true;status.value='Saving…'
  try{await api('/api/auth/change-password','POST',{current_password:form.current_password,new_password:form.new_password});form.current_password='';form.new_password='';form.confirm='';status.value='Password changed. Other sessions have been signed out.'}
  catch(e){status.value=e.message}finally{busy.value=false}
}
</script>
<template>
  <section class="page">
    <div class="settings-intro panel">
      <span class="eyebrow">ACCOUNT</span>
      <h2>{{ user.username }}</h2>
      <p>Role: {{ user.role.replaceAll("_", " ") }}. Change your password below.</p>
    </div>
    <form class="settings-form panel" @submit.prevent="save">
      <label
        >Current password<input
          v-model="form.current_password"
          type="password"
          autocomplete="current-password"
          required /></label
      ><label
        >New password<input
          v-model="form.new_password"
          type="password"
          autocomplete="new-password"
          minlength="12"
          maxlength="128"
          required
        /><small>Use at least 12 characters.</small></label
      ><label
        >Confirm new password<input
          v-model="form.confirm"
          type="password"
          autocomplete="new-password"
          required
      /></label>
      <div class="settings-actions">
        <button class="button primary" :disabled="busy">Change password</button
        ><span role="status">{{ status }}</span>
      </div>
    </form>
  </section>
</template>
