import { useEffect, useRef, useCallback, useState } from 'react'

declare const __WS_ORIGIN__: string

export interface WsMessage {
  type: string
  payload: unknown
}

interface UseWsOptions {
  sessionId: number
  token: string | null
  path?: string         // WS path segment, defaults to 'auction'
  onMessage: (msg: WsMessage) => void
  onOpen?: () => void   // called on every (re)connect — use for state resync
  enabled?: boolean
}

type WsStatus = 'connecting' | 'open' | 'closed' | 'error'

export function useWs({ sessionId, token, path = 'auction', onMessage, onOpen, enabled = true }: UseWsOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  const onOpenRef = useRef(onOpen)
  const [status, setStatus] = useState<WsStatus>('closed')
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // Keep callbacks ref-stable without re-connecting on every render
  onMessageRef.current = onMessage
  onOpenRef.current = onOpen

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return

    const origin = __WS_ORIGIN__ || ((window.location.protocol === 'https:' ? 'wss' : 'ws') + '://' + window.location.host)
    const url = token
      ? `${origin}/ws/${path}/${sessionId}?token=${encodeURIComponent(token)}`
      : `${origin}/ws/${path}/${sessionId}`

    setStatus('connecting')
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      setStatus('open')
      onOpenRef.current?.()
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage
        onMessageRef.current(msg)
      } catch {
        console.warn('[ws] invalid message', event.data)
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setStatus('closed')
      // Reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      if (mountedRef.current) setStatus('error')
    }
  }, [sessionId, token, path, enabled])

  const send = useCallback((msg: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    if (enabled) connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      const ws = wsRef.current
      wsRef.current = null
      if (ws) {
        if (ws.readyState === WebSocket.CONNECTING) {
          // Defer close until connected to avoid the "closed before established" warning
          ws.onopen = () => ws.close()
          ws.onerror = null
          ws.onmessage = null
          ws.onclose = null
        } else {
          ws.close()
        }
      }
    }
  }, [connect, enabled])

  return { status, send }
}