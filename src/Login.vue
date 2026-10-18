<script setup>
import { reactive } from 'vue'
import { ArrowUpRight } from '@lucide/vue'
defineProps({ busy: Boolean, error: String })
const emit = defineEmits(['submit'])
const form = reactive({ username: '', password: '' })
</script>

<template>
  <main class="login-page min-h-screen grid place-items-center p-4">
    <form class="login-card panel w-full" @submit.prevent="emit('submit', { ...form })">
      <div class="login-brand">
        <span class="brand-mark">W<ArrowUpRight :size="11" aria-hidden="true" /></span>
        <div><strong>UTILITYMIND</strong><small>OPERATIONS INTELLIGENCE</small></div>
      </div>
      <span class="eyebrow">SECURE DASHBOARD ACCESS</span>
      <h1>Sign in</h1>
      <p>Use your assigned account to view factory utility data.</p>
      <label
        >Username<input
          v-model="form.username"
          type="text"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          maxlength="50"
          required
          autofocus
      /></label>
      <label
        >Password<input
          v-model="form.password"
          type="password"
          autocomplete="current-password"
          required
      /></label>
      <div v-if="error" class="login-error" role="alert">{{ error }}</div>
      <button class="button primary w-full" :disabled="busy">
        {{ busy ? "Signing in…" : "Sign in" }}
      </button>
      <small class="login-foot">Factory utility monitoring · local pilot</small>
    </form>
  </main>
</template>
