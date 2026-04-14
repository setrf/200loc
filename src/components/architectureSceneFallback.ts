import type { PhaseDefinition } from '../walkthrough/phases'
import { getCameraPose } from '../viz/llmViz/layout'
import type { CameraPose } from '../viz/llmViz/types'

// Match the main scene framing when WebGL falls back to the projected 2D view.
export function getFallbackCameraPoseForPhase(phase: PhaseDefinition): CameraPose {
  const basePose = getCameraPose(phase.viz.cameraPoseId)

  switch (phase.id) {
    case 'tokenize':
      return { ...basePose, panY: 18, scale: 0.94 }
    case 'token-embedding':
      return { ...basePose, panY: 56, scale: 0.96 }
    case 'position-embedding':
      return { ...basePose, panY: 72, scale: 0.98 }
    case 'embed-add-norm':
      return { ...getCameraPose('residual'), panY: -500, scale: 0.98 }
    case 'qkv':
      return { ...getCameraPose('attention'), panY: -288, scale: 0.96 }
    case 'attention-scores':
      return { ...getCameraPose('attention'), panY: -330, scale: 0.98 }
    case 'attention-softmax':
      return { ...getCameraPose('attention'), panY: -364, scale: 1.02 }
    case 'weighted-values':
      return { ...getCameraPose('attention'), panY: -392, scale: 1.03 }
    case 'attn-out':
      return { ...getCameraPose('residual'), panY: -612, scale: 1.03 }
    case 'mlp':
      return { ...getCameraPose('readout'), panY: -770, scale: 1.05 }
    case 'lm-head':
      return { ...getCameraPose('readout'), panY: -898, scale: 1.08 }
    case 'probabilities':
      return { ...getCameraPose('readout'), panY: -972, scale: 1.1 }
    case 'sample':
    case 'append-or-stop':
      return { ...getCameraPose('sample'), panY: -1054, scale: 1.13 }
    default:
      return basePose
  }
}
