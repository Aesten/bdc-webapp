import { useRef, useState } from 'react'
import { playersApi, type Player } from '@/api/players'
import { cn } from '@/lib/utils'
import { Loader2, X, FileUp } from 'lucide-react'
import { CLASSES, type ClassKey, ClassBadge } from './shared'
import { useToast } from '@/context/ToastContext'

export default function ImportModal({ slug, onImported, onClose }: {
  slug: string; onImported: (players: Player[]) => void; onClose: () => void
}) {
  const { toast } = useToast()
  const [mode,    setMode]    = useState<'json' | 'csv'>('json')
  const [text,    setText]    = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Array<{ name: string; classes: ClassKey[] }>>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const cls = 'w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 transition-colors'

  function parse(raw: string, fmt: 'json' | 'csv') {
    setError(''); setPreview([])
    if (!raw.trim()) return
    try {
      if (fmt === 'json') {
        const arr = JSON.parse(raw)
        if (!Array.isArray(arr)) throw new Error('Expected a JSON array')
        const parsed = arr.map((item: { name?: string; classes?: string[] }, i: number) => {
          if (!item.name) throw new Error(`Item ${i}: missing "name"`)
          const classes = (item.classes ?? []).map((c: string) => c.toLowerCase()).filter((c): c is ClassKey => CLASSES.includes(c as ClassKey))
          return { name: String(item.name), classes }
        })
        setPreview(parsed)
      } else {
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
        const parsed = lines.map((line, i) => {
          const [name, inf, arc, cav] = line.split(',').map(s => s.trim())
          if (!name) throw new Error(`Line ${i + 1}: missing name`)
          const classes: ClassKey[] = []
          if (inf?.toLowerCase() === 'x') classes.push('inf')
          if (arc?.toLowerCase() === 'x') classes.push('arc')
          if (cav?.toLowerCase() === 'x') classes.push('cav')
          return { name, classes }
        })
        setPreview(parsed)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Parse error')
    }
  }

  function handleTextChange(val: string) { setText(val); parse(val, mode) }
  function handleModeChange(m: 'json' | 'csv') { setMode(m); parse(text, m) }

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const content = e.target?.result as string
      const fmt = file.name.endsWith('.csv') ? 'csv' : 'json'
      setMode(fmt)
      setText(content)
      parse(content, fmt)
    }
    reader.readAsText(file)
  }

  async function submit() {
    if (!preview.length) return
    setLoading(true); setError('')
    try {
      const res = await playersApi.bulkAdd(slug, preview.map(p => ({ name: p.name, classes: p.classes.join(',') })))
      onImported(res.players)
      toast(`${res.players.length} players imported`)
      onClose()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Import failed') }
    finally { setLoading(false) }
  }

  const mouseDownOnBackdrop = useRef(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => { if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <p className="text-base font-semibold text-zinc-100">Bulk import players</p>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-auto p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-1 bg-zinc-900 rounded-xl">
              {(['json', 'csv'] as const).map(m => (
                <button key={m} onClick={() => handleModeChange(m)}
                  className={cn('px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                    mode === m ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300')}>
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
            <button onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors">
              <FileUp className="w-3.5 h-3.5" /> Load file
            </button>
            <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>

          <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
            <p className="text-xs font-mono text-zinc-500 mb-1">Format</p>
            {mode === 'json'
              ? <code className="text-sm text-zinc-400">{`[{"name": "player1", "classes": ["inf", "cav"]}]`}</code>
              : <code className="text-sm text-zinc-400">name, is_inf, is_arc, is_cav<br/>player1, x, , x</code>
            }
          </div>

          <textarea value={text} onChange={e => handleTextChange(e.target.value)}
            rows={8} placeholder={mode === 'json' ? '[{"name": "...", "classes": [...]}]' : 'player1, x, , x'}
            className={cls + ' resize-none font-mono text-xs'} />

          {error && <p className="text-sm text-red-400">{error}</p>}

          {preview.length > 0 && (
            <div>
              <p className="text-sm font-mono text-zinc-500 mb-2">{preview.length} players to import</p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {preview.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-zinc-900">
                    <span className="text-sm text-zinc-200 flex-1 truncate">{p.name}</span>
                    <div className="flex gap-1">{p.classes.map(c => <ClassBadge key={c} cls={c} />)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-zinc-800 flex gap-2">
          <button onClick={submit} disabled={loading || !preview.length || !!error}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-colors disabled:opacity-40">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Import {preview.length > 0 ? `${preview.length} players` : ''}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  )
}
