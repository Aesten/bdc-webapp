import { Eye, EyeOff } from 'lucide-react'
import { type Captain } from '@/api/auctions'
import { type ClassKey } from '@/components/tournament/shared'
import CaptainSlot from './CaptainSlot'

const MAX_CAPTAINS = 8

export default function CaptainList({ captains, canManage, shownTokens, onToggleAllTokens, allTokensShown, onToggleOneToken, onAdd, onUpdate, onRemove, onGenToken, onRevokeToken }: {
  captains: Captain[]
  canManage: boolean
  shownTokens: Set<number>
  allTokensShown: boolean
  onToggleAllTokens: () => void
  onToggleOneToken: (id: number) => void
  onAdd: (data: { display_name: string; team_name?: string; budget: number; class: ClassKey | null }) => Promise<void>
  onUpdate: (id: number, data: { display_name?: string; team_name?: string | null; budget?: number; class?: ClassKey | null }) => Promise<void>
  onRemove: (id: number) => Promise<void>
  onGenToken: (id: number) => Promise<void>
  onRevokeToken: (id: number) => Promise<void>
}) {
  const captainsWithToken = captains.filter(c => c.token)
  const slots = Array.from({ length: MAX_CAPTAINS }, (_, i) => captains[i] as Captain | undefined)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          Captains — {captains.length}/{MAX_CAPTAINS}
        </p>
        {captainsWithToken.length > 0 && canManage && (
          <button onClick={onToggleAllTokens}
            className="text-zinc-600 hover:text-zinc-300 transition-colors p-0.5"
            title={allTokensShown ? 'Hide all tokens' : 'Show all tokens'}>
            {allTokensShown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        {slots.map((captain, i) => (
          <CaptainSlot
            key={captain?.id ?? `empty-${i}`}
            index={i}
            captain={captain}
            canManage={canManage}
            isAuctioneer={!canManage}  /* hides token row for auctioneer & captain */
            showToken={captain ? shownTokens.has(captain.id) : false}
            onToggleShow={() => captain && onToggleOneToken(captain.id)}
            onAdd={onAdd}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onGenToken={onGenToken}
            onRevokeToken={onRevokeToken}
          />
        ))}
      </div>
    </div>
  )
}
