<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import Overview from './Overview.vue'
import CategoryDetail from './CategoryDetail.vue'
import MasterData from './MasterData.vue'
import LocationMap from './LocationMap.vue'
import Reports from './Reports.vue'
import Notifications from './Notifications.vue'
import AiChat from './AiChat.vue'
import AppSettings from './AppSettings.vue'
import Login from './Login.vue'
import Account from './Account.vue'
import UserManagement from './UserManagement.vue'
import { api, setCsrfToken } from './lib'
import { ArrowUpRight, Bell, CalendarDays, CalendarRange, Cog, EllipsisVertical, Factory, Gauge, LayoutDashboard, LogOut, Map, MapPin, Menu, Moon, Search, Settings, Sparkles, Sun, UserRound, Users, Workflow } from '@lucide/vue'
const titles={overview:'Factory utility overview',notifications:'Notifications',ai_chat:'Chat with AI',app_settings:'App Settings',users:'User management',account:'My account',map:'Location map',daily_report:'Daily Report',monthly_report:'Monthly Report',factories:'Factories',locations:'Locations',production_lines:'Production lines',machines:'Machines',metering:'Metering'}
const descriptions={overview:'Live usage against baseline across the production floor.',notifications:'Metering thresholds and machine-state questions.',ai_chat:'Ask evidence-based questions about the factory’s utility data.',app_settings:'Configure the AI service used by utility chat.',users:'Manage access to the utility dashboard.',account:'Update your account password.',map:'Machine status and utility readings in the production flow.',daily_report:'Observed utility use and operational evidence for a local calendar day.',monthly_report:'Observed utility use and operational evidence for a local calendar month.',factories:'Factory identity and operating sites.',locations:'Locations with their parent factory metadata.',production_lines:'Production lines with location and factory metadata.',machines:'Equipment, enabled status, and production-flow connections.',metering:'Utility type, machine relationship, baseline, and simulator status.'}
const auth=ref(null),authReady=ref(false),authBusy=ref(false),authError=ref('')
const theme=ref(document.documentElement.dataset.theme==='dark'?'dark':'light')
function toggleTheme(){theme.value=theme.value==='dark'?'light':'dark';document.documentElement.dataset.theme=theme.value;try{localStorage.setItem('wheelworks-theme',theme.value)}catch{}}
const groups = [
  { label: '', items: [
    ['overview', LayoutDashboard, 'Overview'],
    ['map', Map, 'Location map'],
    ['ai_chat', Sparkles, 'Chat with AI'],
    ['notifications', Bell, 'Notifications'],
  ] },
  { label: 'REPORTS', items: [
    ['daily_report', CalendarDays, 'Daily Report'],
    ['monthly_report', CalendarRange, 'Monthly Report'],
  ] },
  { label: 'MASTER DATA', items: [
    ['factories', Factory, 'Factories'],
    ['locations', MapPin, 'Locations'],
    ['production_lines', Workflow, 'Production lines'],
    ['machines', Cog, 'Machines'],
    ['metering', Gauge, 'Metering'],
  ] },
]
const visibleGroups=computed(()=>groups.map(group=>({ ...group, items:group.items.filter(item=>auth.value?.role!=='factory_admin'||item[0]!=='ai_chat') })))
const brandName=computed(()=>auth.value?.role==='factory_admin'?(data.value?.factories?.[0]?.name||'UTILITYMIND'):'UTILITYMIND')
const utilityItems=computed(()=>auth.value?.role==='super_admin'?[['app_settings',Settings,'App Settings'],['users',Users,'User management']]:[])
const known=new Set(Object.keys(titles))
const hash=ref(location.hash.slice(1)||'overview'),data=ref(null),trends=ref(null),detail=ref(null),error=ref(''),sidebar=ref(false),searchOpen=ref(false),search=ref(''),toast=ref(''),toastError=ref(false),userMenu=ref(false),userMenuWrap=ref(null)
const page=computed(()=>{const requested=hash.value.startsWith('category/')?'category':known.has(hash.value)?hash.value:'overview';return (['app_settings','users'].includes(requested)&&auth.value?.role!=='super_admin')||(requested==='ai_chat'&&auth.value?.role==='factory_admin')?'overview':requested})
const category=computed(()=>{try{return page.value==='category'?decodeURIComponent(hash.value.slice(9)):null}catch{return null}})
const reportPage=computed(()=>['daily_report','monthly_report'].includes(page.value))
const masterPage=computed(()=>['factories','locations','production_lines','machines','metering'].includes(page.value))
const title=computed(()=>page.value==='category'?`${category.value} metering`:titles[page.value])
const searchMatches=computed(()=>[...visibleGroups.value.flatMap(g=>g.items),...utilityItems.value,['account',UserRound,'Account']].filter(item=>item[2].toLowerCase().includes(search.value.toLowerCase())))
let dashboardBusy=false,trendBusy=false,detailBusy=false,toastTimer,dashboardTimer,detailTimer
function syncHash(){hash.value=location.hash.slice(1)||'overview';sidebar.value=false;searchOpen.value=false;userMenu.value=false;window.scrollTo(0,0)}
function closeUserMenuOutside(event){if(userMenu.value&&!userMenuWrap.value?.contains(event.target))userMenu.value=false}
function notify(message,isError=false){toast.value=message;toastError.value=isError;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.value='',3500)}
function goFirst(){if(searchMatches.value.length)location.hash=`#${searchMatches.value[0][0]}`}
function authExpired(){auth.value=null;data.value=null;detail.value=null;trends.value=null;setCsrfToken(null);authError.value='Your session ended. Please sign in again.'}
async function loadAuth(){try{const result=await api('/api/auth/me');auth.value=result.user;setCsrfToken(result.csrf_token);if(result.user)loadDashboard()}catch(e){authError.value=`Could not check login: ${e.message}`}finally{authReady.value=true}}
async function signIn(credentials){authBusy.value=true;authError.value='';try{const result=await api('/api/auth/login','POST',credentials);auth.value=result.user;setCsrfToken(result.csrf_token);location.hash='#overview';loadDashboard()}catch(e){authError.value=e.message}finally{authBusy.value=false}}
async function signOut(){userMenu.value=false;try{await api('/api/auth/logout','POST',{})}catch{}auth.value=null;data.value=null;detail.value=null;trends.value=null;setCsrfToken(null);location.hash='#overview'}
async function loadDashboard(){if(!auth.value||dashboardBusy)return;dashboardBusy=true;try{data.value=await api('/api/dashboard');error.value=data.value.ingest?.error||'';if(page.value==='overview')loadTrends()}catch(e){error.value=`Dashboard unavailable: ${e.message}`}finally{dashboardBusy=false}}
async function loadTrends(){if(!auth.value||trendBusy||page.value!=='overview')return;trendBusy=true;try{trends.value=await api('/api/overview/trends')}catch(e){notify(`Trends unavailable: ${e.message}`,true)}finally{trendBusy=false}}
async function loadDetail(){if(!auth.value||detailBusy||page.value!=='category'||!category.value)return;detailBusy=true;const requested=category.value;try{const result=await api(`/api/category/${encodeURIComponent(requested)}`);if(category.value===requested){detail.value=result;error.value=''}}catch(e){if(category.value===requested)error.value=`Category detail unavailable: ${e.message}`}finally{detailBusy=false}}
function keydown(e){if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchOpen.value=!searchOpen.value;userMenu.value=false;search.value=''}else if(e.key==='Escape'){searchOpen.value=false;sidebar.value=false;userMenu.value=false}}
watch(page,p=>{if(p==='overview')loadTrends();if(p==='category')loadDetail()})
watch(category,()=>{detail.value=null;if(category.value)loadDetail()})
onMounted(()=>{window.addEventListener('hashchange',syncHash);window.addEventListener('auth-required',authExpired);document.addEventListener('keydown',keydown);document.addEventListener('pointerdown',closeUserMenuOutside);loadAuth();dashboardTimer=setInterval(loadDashboard,5000);detailTimer=setInterval(loadDetail,2000)})
onUnmounted(()=>{window.removeEventListener('hashchange',syncHash);window.removeEventListener('auth-required',authExpired);document.removeEventListener('keydown',keydown);document.removeEventListener('pointerdown',closeUserMenuOutside);clearInterval(dashboardTimer);clearInterval(detailTimer);clearTimeout(toastTimer)})
</script>
<template>
  <div v-if="!authReady" class="auth-loading">Checking session…</div>
  <Login v-else-if="!auth" :busy="authBusy" :error="authError" @submit="signIn" />
  <div v-else class="shell vue-page min-h-screen dark:!bg-[#222] pr-3">
    <aside class="sidebar !bg-[#eee] dark:!bg-[#222] !border-none" :class="{ 'mobile-open': sidebar }">
      <a class="brand" href="#overview" :aria-label="`${brandName} overview`"
        ><span class="brand-mark !text-white">W<ArrowUpRight :size="11" aria-hidden="true" /></span
        ><span><strong>{{ brandName }}</strong><small>UTILITY INTELLIGENCE</small></span></a
      >
      <nav class="sidebar-nav" aria-label="Main navigation">
        <button
          type="button"
          class="bg-white border border-white dark:bg-[#252525] dark:border-[#333] hover:border-cyan-600 flex w-full rounded-full px-3 py-2 mb-3"
          @click="
            searchOpen = true;
            search = '';
            userMenu = false;
          "
        >
          <Search class="nav-icon mr-2 opacity-60" :size="18" aria-hidden="true" /><span>Search</span
          >
          <div class="border px-1 py-0.5 ml-auto leading-none rounded-md border-slate-300 dark:border-[#333]">⌘K</div>
        </button>

        <div v-for="group in visibleGroups" :key="group.label" class="sidebar-group">
          <div v-if="group.label" class="nav-label nav-sub">{{ group.label }}</div>
          <a
            v-for="[id, icon, label] in group.items"
            :key="id"
            :href="`#${id}`"
            :class="{ '!bg-cyan-700 dark:!bg-cyan-600 !text-white': page === id || (page === 'category' && id === 'overview') }"
            class="!py-0 !min-h-10"
            :aria-current="page === id ? 'page' : undefined"
            ><component :is="icon" class="nav-icon" :size="18" aria-hidden="true" /><span>{{
              label
            }}</span
            ><b
              v-if="id === 'notifications' && data?.metering_alert_count"
              class="alert-nav-count"
              >{{ data.metering_alert_count }}</b
            ></a
          >
        </div>
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-utility-links">
          <a
            v-for="[id, icon, label] in utilityItems"
            :key="id"
            :href="`#${id}`"
            :class="{ '!bg-cyan-700 dark:!bg-cyan-600 !text-white': page === id }"
            class="!py-0 !min-h-10"
            :aria-current="page === id ? 'page' : undefined"
            ><component :is="icon" class="nav-icon" :size="18" aria-hidden="true" /><span>{{
              label
            }}</span></a
          >
        </div>
        <button
          class="sidebar-theme-toggle"
          type="button"
          :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme"
        >
          <Sun v-if="theme === 'dark'" :size="18" aria-hidden="true" />
          <Moon v-else :size="18" aria-hidden="true" />
          <span>{{ theme === 'dark' ? 'Light' : 'Dark' }} mode</span>
        </button>
        <div ref="userMenuWrap" class="sidebar-user-wrap">
          <div
            v-if="userMenu"
            id="sidebar-user-menu"
            class="sidebar-user-menu"
            role="menu"
            aria-label="User menu"
          >
            <div class="sidebar-user-menu-heading">
              <span class="user-avatar"><UserRound :size="21" aria-hidden="true" /></span
              ><span
                ><strong>{{ auth.username }}</strong
                ><small>{{ auth.role.replaceAll("_", " ") }}</small></span
              >
            </div>
            <a href="#account" role="menuitem" @click="userMenu = false"
              ><UserRound :size="18" aria-hidden="true" />Account</a
            >
            <button type="button" role="menuitem" @click="signOut">
              <LogOut :size="18" aria-hidden="true" />Log out
            </button>
          </div>
          <button
            class="sidebar-user-trigger"
            type="button"
            aria-controls="sidebar-user-menu"
            :aria-expanded="userMenu"
            @click="userMenu = !userMenu"
          >
            <span class="user-avatar"><UserRound :size="21" aria-hidden="true" /></span
            ><span class="sidebar-user-copy"
              ><strong>{{ auth.username }}</strong
              ><small>{{ auth.role.replaceAll("_", " ") }}</small></span
            ><EllipsisVertical :size="19" aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
    <button
      v-if="sidebar"
      class="sidebar-backdrop"
      aria-label="Close navigation"
      @click="
        sidebar = false;
        userMenu = false;
      "
    ></button>
    <main class="min-w-0 bg-[#fff] dark:bg-[#111] rounded-2xl !mt-3 !mb-3">
      <header class="topbar !static !bg-transparent !border-0">
        <div class="topbar-leading min-w-0">
          <button
            class="menu-toggle"
            type="button"
            aria-label="Open navigation"
            :aria-expanded="sidebar"
            @click="sidebar = !sidebar"
          >
            <Menu :size="18" aria-hidden="true" />
          </button>
          <div class="breadcrumb">
            {{ brandName.toUpperCase() }} <span>/</span>
            <span>{{ (page === "category" ? category : titles[page]).toUpperCase() }}</span>
          </div>
        </div>
      </header>
      <div v-if="page !== 'category'" class="page-heading">
        <h1>{{ title }}</h1>
        <p>{{ descriptions[page] }}</p>
      </div>
      <div v-if="error" class="error-banner">{{ error }}</div>
      <Overview v-if="page === 'overview'" :data="data" :trends="trends" /><CategoryDetail
        v-else-if="page === 'category'"
        :key="category"
        :category="category"
        :detail="detail"
      /><LocationMap v-else-if="page === 'map'" :data="data" /><Reports
        v-else-if="reportPage"
        :page="page"
        :data="data"
      /><MasterData
        v-else-if="masterPage"
        :page="page"
        :data="data"
        :can-edit="auth.role !== 'viewer'"
        :can-add="auth.role !== 'viewer' && (auth.role !== 'factory_admin' || page !== 'factories')"
        @changed="loadDashboard"
        @notice="notify"
      /><AppSettings v-else-if="page === 'app_settings'" /><UserManagement
        v-else-if="page === 'users'"
        :current-user="auth"
      /><Account v-else-if="page === 'account'" :user="auth" />
      <div v-show="page === 'ai_chat'"><AiChat /></div>
      <Notifications
        v-if="page === 'notifications'"
        :active="true"
        :can-manage="auth.role !== 'viewer'"
        @changed="loadDashboard"
        @notice="notify"
      />
      <!-- <footer>
        WHEELWORKS · OPERATIONS PILOT <span>Simulated MQTT telemetry · local Docker stack</span>
      </footer> -->
    </main>
    <div v-if="searchOpen" class="vue-modal-backdrop" @click.self="searchOpen = false">
      <div class="vue-modal search-modal" role="dialog" aria-modal="true" aria-label="Search pages">
        <div class="nav-search-field">
          <Search :size="18" aria-hidden="true" /><input
            v-model="search"
            autofocus
            type="search"
            placeholder="Search dashboard pages…"
            @keydown.enter.prevent="goFirst"
          /><button @click="searchOpen = false">Esc</button>
        </div>
        <div class="nav-search-results">
          <a
            v-for="item in searchMatches"
            :key="item[0]"
            :href="`#${item[0]}`"
            @click="searchOpen = false"
            >{{ item[2] }}</a
          >
          <p v-if="!searchMatches.length">No matching pages.</p>
        </div>
      </div>
    </div>
    <div class="toast" :class="{ show: !!toast, error: toastError }" role="status">{{ toast }}</div>
  </div>
</template>
