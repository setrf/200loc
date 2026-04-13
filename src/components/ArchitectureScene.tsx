import type { TokenStepTrace } from '../model'
import { LayerView } from '@llmviz/llm/LayerView'
import type { PhaseDefinition, LineRange } from '../walkthrough/phases'
import type { SceneModelData } from '../viz/llmViz/types'

interface ArchitectureSceneProps {
  trace: TokenStepTrace
  phase: PhaseDefinition
  contextTokens: string[]
  tokenLabel: (tokenId: number) => string
  sceneModelData: SceneModelData
  onFocusRanges: (ranges: LineRange[] | null) => void
}

const OriginalPhase = {
  Input_Detail_Embedding: 7,
  Input_Detail_LayerNorm: 8,
  Input_Detail_SelfAttention: 9,
  Input_Detail_Softmax: 10,
  Input_Detail_Projection: 11,
  Input_Detail_Mlp: 12,
  Input_Detail_Transformer: 13,
  Input_Detail_Output: 14,
} as const

function mapPhase(phaseId: string): number {
  switch (phaseId) {
    case 'tokenize':
    case 'token-embedding':
    case 'position-embedding':
      return OriginalPhase.Input_Detail_Embedding
    case 'embed-add-norm':
      return OriginalPhase.Input_Detail_LayerNorm
    case 'qkv':
    case 'attention-scores':
      return OriginalPhase.Input_Detail_SelfAttention
    case 'attention-softmax':
      return OriginalPhase.Input_Detail_Softmax
    case 'weighted-values':
    case 'attn-output-residual':
      return OriginalPhase.Input_Detail_Projection
    case 'mlp':
      return OriginalPhase.Input_Detail_Mlp
    case 'lm-head':
    case 'probabilities':
    case 'sample':
    case 'append-or-stop':
      return OriginalPhase.Input_Detail_Output
    default:
      return OriginalPhase.Input_Detail_Transformer
  }
}

export function ArchitectureScene({
  trace,
  phase,
  contextTokens,
  tokenLabel,
  sceneModelData,
  onFocusRanges,
}: ArchitectureSceneProps) {
  const currentToken = tokenLabel(trace.tokenId)
  const sampledToken = tokenLabel(trace.sampledTokenId)
  const mappedPhase = mapPhase(phase.id)

  return (
    <section
      className="scene-panel"
      aria-label="Architecture scene"
      onMouseEnter={() => onFocusRanges(phase.codeRanges)}
      onMouseLeave={() => onFocusRanges(null)}
    >
      <div className="scene-panel__header">
        <div>
          <p className="eyebrow">Original llm-viz</p>
          <h2>{phase.title}</h2>
        </div>
        <div className="scene-panel__meta">
          <span>{contextTokens.join(' · ')}</span>
          <span>
            p{trace.positionId}:{currentToken} → {sampledToken === 'BOS' ? 'stop' : sampledToken}
          </span>
          <span>
            {sceneModelData.config.nLayer} layer · {sceneModelData.config.nHead} heads
          </span>
        </div>
      </div>

      <div className="scene-panel__viewport" data-testid="scene-viewport">
        <LayerView
          className="llmviz-embed"
          externalPhase={mappedPhase}
          externalRunning={false}
          showSidebar={false}
          showToolbar={false}
        />
      </div>
    </section>
  )
}
