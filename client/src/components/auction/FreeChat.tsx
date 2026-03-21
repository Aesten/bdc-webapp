import { useEffect, useRef, useState } from 'react'
import { Loader2, Users, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sessionsApi, type SessionChatMessage } from '@/api/sessions'
import { useAuth } from '@/context/AuthContext'

const ROLE_COLOR: Record<string, string> = {
  admin:      'text-red-400',
  host:       'text-blue-400',
  auctioneer: 'text-purple-400',
  captain:    'text-amber-400',
}

export default function FreeChat({ sessionId, messages, onLoad, className }: {
  sessionId:  number
  messages:   SessionChatMessage[]
  onLoad?:    () => void
  className?: string
}) {
  const [text,       setText]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const { user }  = useAuth()
  const canChat   = !!user && ['admin', 'host', 'auctioneer', 'captain'].includes(user.role)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  async function handleSend() {
    if (!text.trim()) return
    setSubmitting(true)
    try {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      await Promise.race([sessionsApi.chat(sessionId, text.trim()), timeout])
      setText(''); onLoad?.()
    } catch { /* ignore */ } finally { setSubmitting(false) }
  }

  return (
    <div className={cn('bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col overflow-hidden', className)}>
      <div className="px-4 py-2 border-b border-zinc-800 flex-shrink-0">
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
          <Users className="w-3 h-3" /> Chat
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-0">
        {messages.length === 0
          ? <p className="text-[11px] text-zinc-700 italic py-1 text-center">No messages yet</p>
          : messages.map(msg => (
              <div key={msg.id} className="text-xs leading-snug">
                <span className={cn('font-semibold mr-1.5', ROLE_COLOR[msg.author_role] ?? 'text-zinc-400')}>
                  {msg.author_name}
                </span>
                <span className="text-zinc-400 break-all">{msg.content}</span>
              </div>
            ))
        }
        <div ref={bottomRef} />
      </div>
      {canChat && (
        <div className="border-t border-zinc-800 flex items-center gap-1.5 p-2 flex-shrink-0">
          <input value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend() }}
            placeholder="Message…" maxLength={500}
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 min-w-0"
          />
          <button onClick={handleSend} disabled={submitting || !text.trim()}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40 flex-shrink-0">
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  )
}
