// ─── Pick-Ban WebSocket Room ──────────────────────────────────────────────────
// Broadcast-only: clients connect to receive state-change notifications.
// All pick-ban actions go through HTTP; the WS just signals "re-fetch now".

interface Client {
  ws: { send: (data: string) => void }
}

const clientsBySession = new Map<number, Set<Client>>()
const clientById       = new Map<string, { client: Client; sessionId: number }>()
const WS_ID            = Symbol('pbWsId')

function getRaw(ws: object): object {
  return (ws as any).raw ?? ws
}

function getClients(sessionId: number): Set<Client> {
  if (!clientsBySession.has(sessionId)) clientsBySession.set(sessionId, new Set())
  return clientsBySession.get(sessionId)!
}

export function onPickBanWsOpen(
  ws: { send: (data: string) => void },
  sessionId: number
): void {
  const raw  = getRaw(ws as object)
  const wsId = crypto.randomUUID();
  (raw as any)[WS_ID] = wsId

  const client: Client = { ws }
  getClients(sessionId).add(client)
  clientById.set(wsId, { client, sessionId })

  // Immediately notify the new client so it syncs without waiting for the next event
  try { ws.send(JSON.stringify({ type: 'pickban_updated' })) } catch { /* disconnected */ }
}

export function onPickBanWsClose(ws: object): void {
  const wsId = (getRaw(ws) as any)[WS_ID] as string | undefined
  if (!wsId) return

  const entry = clientById.get(wsId)
  if (!entry) return

  getClients(entry.sessionId).delete(entry.client)
  clientById.delete(wsId)
}

export function broadcastPickBanUpdate(sessionId: number): void {
  const msg     = JSON.stringify({ type: 'pickban_updated' })
  const clients = getClients(sessionId)
  clients.forEach(client => {
    try { client.ws.send(msg) } catch { clients.delete(client) }
  })
}
