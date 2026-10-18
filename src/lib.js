export const fmt = value => Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })
export const reportFmt = value => value == null ? 'N/A' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })
export const statusText = meter => meter?.status === 'live' ? 'Live' : meter?.status === 'stale' ? 'Stale' : 'Off'
let csrfToken = null
export function setCsrfToken(value) { csrfToken = value || null }
export async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' }
  if (!['GET','HEAD','OPTIONS'].includes(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken
  const response = await fetch(path, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' })
  let result
  try { result = await response.json() } catch { throw new Error(`Request failed (${response.status})`) }
  if (!response.ok) {
    if (response.status === 401 && !['/api/auth/login','/api/auth/me'].includes(path)) window.dispatchEvent(new Event('auth-required'))
    throw new Error(result.error || `Request failed (${response.status})`)
  }
  return result
}
export function defaultPeriod(kind) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}${kind === 'daily' ? `-${parts.day}` : ''}`
}
export function mapLayout(machines) {
  const byId = new Map(machines.map(machine => [machine.id, machine]))
  const incoming = new Map(machines.map(machine => [machine.id, 0]))
  const levels = new Map(machines.map(machine => [machine.id, 1]))
  const edges = []
  for (const machine of machines) for (const rightId of machine.right_machine_ids || []) {
    if (!byId.has(rightId)) continue
    edges.push([machine.id, rightId]); incoming.set(rightId, incoming.get(rightId) + 1)
  }
  const connected = new Set(edges.flat())
  const pending = machines.filter(machine => connected.has(machine.id) && incoming.get(machine.id) === 0)
  for (let index = 0; index < pending.length; index++) {
    const machine = pending[index]
    for (const [leftId, rightId] of edges) {
      if (leftId !== machine.id) continue
      levels.set(rightId, Math.max(levels.get(rightId), levels.get(leftId) + 1))
      incoming.set(rightId, incoming.get(rightId) - 1)
      if (incoming.get(rightId) === 0) pending.push(byId.get(rightId))
    }
  }
  const columns = []
  for (const machine of machines.filter(machine => connected.has(machine.id))) (columns[levels.get(machine.id) - 1] ??= []).push(machine)
  const unconnected = machines.filter(machine => !connected.has(machine.id))
  if (unconnected.length) columns.push(unconnected)
  return { columns, edges }
}
