<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { api, fmt } from './lib'
import { ArrowUpRight, MessageSquarePlus, MessageSquareText, Send, Sparkles, Trash2 } from '@lucide/vue'
const question=ref(''),messages=ref([]),busy=ref(false),list=ref(null)
const conversations=ref([]),activeId=ref(null),historyLoading=ref(true),opening=ref(false),historyError=ref('')
const suggestions=['What data is available for Raw Material Warehouse?','Which machine uses the most electricity?','Are any utilities above their baseline?']
function sourceFor(visual,message){return message.evidence?.find(e=>e.id===visual.query_id)}
function pointsFor(visual,message){const rows=sourceFor(visual,message)?.result?.rows||[];return rows.filter(r=>r[visual.y]!==null&&Number.isFinite(Number(r[visual.y]))).slice(0,visual.kind==='bar'?18:60)}
function maxFor(points,key){return Math.max(1,...points.map(p=>Number(p[key])))*1.12}
async function refreshConversations(){const result=await api('/api/ai/conversations');conversations.value=result.conversations}
async function openConversation(id){if(busy.value||opening.value)return;opening.value=true;historyError.value='';try{const result=await api(`/api/ai/conversations/${id}`);activeId.value=id;messages.value=result.messages;question.value='';await nextTick();list.value?.scrollTo({top:list.value.scrollHeight})}catch(e){historyError.value=`Could not open chat: ${e.message}`}finally{opening.value=false}}
function startNewChat(){if(busy.value||opening.value)return;activeId.value=null;messages.value=[];question.value='';historyError.value=''}
async function deleteConversation(id){if(busy.value||opening.value||!window.confirm('Delete this chat?'))return;try{await api(`/api/ai/conversations/${id}`,'DELETE');conversations.value=conversations.value.filter(chat=>chat.id!==id);if(activeId.value===id){startNewChat();if(conversations.value.length)await openConversation(conversations.value[0].id)}}catch(e){historyError.value=`Could not delete chat: ${e.message}`}}
async function send(value=question.value){
  const text=value.trim()
  if(!text||busy.value||opening.value||historyLoading.value)return
  const conversationId=activeId.value||crypto.randomUUID()
  activeId.value=conversationId
  messages.value.push({role:'user',text})
  question.value=''
  const pending={role:'assistant',text:'Checking the utility data…',pending:true}
  messages.value.push(pending)
  busy.value=true
  try{
    const result=await api('/api/ai/chat','POST',{question:text,conversation_id:conversationId})
    Object.assign(pending,{text:result.answer,html:result.answer_html,evidence:result.evidence||[],visuals:result.visuals||[],pending:false})
  }catch(e){
    Object.assign(pending,{text:`I could not answer this question: ${e.message}`,failed:true,pending:false})
  }finally{
    busy.value=false
    try{await refreshConversations()}catch(e){historyError.value=`Could not refresh chat history: ${e.message}`}
    await nextTick()
    list.value?.scrollTo({top:list.value.scrollHeight,behavior:'smooth'})
  }
}
onMounted(async()=>{try{await refreshConversations();if(conversations.value.length)await openConversation(conversations.value[0].id)}catch(e){historyError.value=`Could not load chat history: ${e.message}`}finally{historyLoading.value=false}})
</script>
<template>
  <section class="page ai-page">
    <div class="ai-intro panel">
      <div>
        <span class="eyebrow">UTILITY COPILOT</span>
        <h2>Ask about factory metering</h2>
        <p>
          Answers use bounded, read-only queries against PostgreSQL master data and ClickHouse
          telemetry.
        </p>
      </div>
      <a href="#app_settings" class="button secondary"
        >AI settings <ArrowUpRight class="inline-icon" :size="14" aria-hidden="true"
      /></a>
    </div>
    <div class="ai-workspace">
      <aside class="ai-history panel" aria-label="Chat history">
        <button class="ai-new-chat" type="button" :disabled="busy || opening || historyLoading" @click="startNewChat">
          <MessageSquarePlus :size="18" aria-hidden="true" />New chat
        </button>
        <div class="ai-history-heading">Recent chats</div>
        <div class="ai-history-list">
          <p v-if="historyLoading" class="ai-history-empty">Loading chats…</p>
          <p v-else-if="!conversations.length" class="ai-history-empty">No saved chats yet.</p>
          <div
            v-for="chat in conversations"
            :key="chat.id"
            class="ai-history-item"
            :class="{ active: activeId === chat.id }"
          >
            <button
              class="ai-history-open"
              type="button"
              :disabled="busy || opening"
              :aria-current="activeId === chat.id ? 'true' : undefined"
              :title="chat.title"
              @click="openConversation(chat.id)"
            >
              <MessageSquareText :size="16" aria-hidden="true" />
              <span>{{ chat.title }}</span>
            </button>
            <button
              class="ai-history-delete"
              type="button"
              :disabled="busy || opening"
              :aria-label="`Delete chat: ${chat.title}`"
              :title="`Delete chat: ${chat.title}`"
              @click="deleteConversation(chat.id)"
            >
              <Trash2 :size="15" aria-hidden="true" />
            </button>
          </div>
        </div>
        <p v-if="historyError" class="ai-history-error" role="alert">{{ historyError }}</p>
      </aside>
      <div class="ai-shell panel">
        <div ref="list" class="ai-messages">
          <div v-if="opening" class="ai-welcome"><p>Loading chat…</p></div>
          <div v-else-if="!messages.length" class="ai-welcome">
            <div class="ai-orb"><Sparkles :size="28" aria-hidden="true" /></div>
            <h3>Explore utility data</h3>
            <p>Ask about meter readings, factory areas, machine use, and reporting coverage.</p>
            <div class="ai-suggestions">
              <button v-for="s in suggestions" :key="s" @click="send(s)">{{ s }}</button>
            </div>
          </div>
          <article
            v-for="(m, i) in messages"
            :key="i"
            class="ai-message"
            :class="[m.role, { pending: m.pending, failed: m.failed }]"
          >
            <div class="ai-message-label">{{ m.role === "user" ? "YOU" : "UTILITY AI" }}</div>
            <div
              v-if="m.html && m.role === 'assistant'"
              class="ai-message-text"
              v-html="m.html"
            ></div>
            <div v-else class="ai-message-text">{{ m.text }}</div>
            <section v-for="(visual, j) in m.visuals || []" :key="j" class="ai-visual">
              <h4>{{ visual.title }}</h4>
              <template v-if="sourceFor(visual, m)"
                ><div v-if="visual.kind === 'table'" class="ai-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th v-for="column in sourceFor(visual, m).result.columns" :key="column">
                          {{ column }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="(row, k) in sourceFor(visual, m).result.rows.slice(0, 20)"
                        :key="k"
                      >
                        <td v-for="column in sourceFor(visual, m).result.columns" :key="column">
                          {{ row[column] ?? "—" }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <svg v-else viewBox="0 0 700 250" role="img" :aria-label="visual.title">
                  <g v-for="fraction in [0, 0.25, 0.5, 0.75, 1]" :key="fraction">
                    <line
                      x1="52"
                      :y1="205 - fraction * 170"
                      x2="680"
                      :y2="205 - fraction * 170"
                      class="trend-gridline"
                    />
                    <text x="45" :y="209 - fraction * 170" text-anchor="end" class="trend-label">
                      {{ fmt(maxFor(pointsFor(visual, m), visual.y) * fraction) }}
                    </text>
                  </g>
                  <template v-if="visual.kind === 'bar'">
                    <rect
                      v-for="(p, k) in pointsFor(visual, m)"
                      :key="k"
                      :x="58 + (k * 610) / pointsFor(visual, m).length"
                      :y="
                        205 - (Number(p[visual.y]) / maxFor(pointsFor(visual, m), visual.y)) * 170
                      "
                      :width="Math.max(3, 610 / pointsFor(visual, m).length - 5)"
                      :height="(Number(p[visual.y]) / maxFor(pointsFor(visual, m), visual.y)) * 170"
                      rx="3"
                      class="report-value-bar"
                    />
                  </template>
                  <polyline
                    v-else
                    :points="
                      pointsFor(visual, m)
                        .map(
                          (p, k) =>
                            `${58 + (k * 610) / Math.max(1, pointsFor(visual, m).length - 1)},${205 - (Number(p[visual.y]) / maxFor(pointsFor(visual, m), visual.y)) * 170}`,
                        )
                        .join(' ')
                    "
                    class="trend-line"
                  />
                  <text x="680" y="24" text-anchor="end" class="trend-unit">
                    {{ visual.unit }}
                  </text></svg
                ><small
                  >{{ visual.query_id }} · {{ sourceFor(visual, m).database }} ·
                  {{ sourceFor(visual, m).result.rows.length }} rows</small
                ></template
              >
            </section>
            <details v-if="m.evidence?.length" class="ai-evidence">
              <summary>View {{ m.evidence.length }} data queries</summary>
              <div v-for="e in m.evidence" :key="e.id" class="ai-query">
                <strong>{{ e.id }} · {{ e.database }} · {{ e.result.row_count }} rows</strong>
                <pre>{{ e.sql }}</pre>
              </div>
            </details>
          </article>
        </div>
        <form class="ai-composer" @submit.prevent="send()">
          <label for="ai-question" class="sr-only">Ask a utility question</label
          ><textarea
            id="ai-question"
            v-model="question"
            rows="2"
            maxlength="2000"
            placeholder="Ask a question about utility metering…"
            required
            @keydown.enter.exact.prevent="send()"
          ></textarea
          ><button class="button primary" :disabled="busy || opening || historyLoading">
            {{ busy ? "Thinking…" : "Send" }}
            <Send v-if="!busy" class="inline-icon" :size="14" aria-hidden="true" />
          </button>
        </form>
        <div class="ai-disclosure">
          The configured AI service receives your question, the approved table catalog, and query
          results. It cannot control factory equipment.
        </div>
      </div>
    </div>
  </section>
</template>
