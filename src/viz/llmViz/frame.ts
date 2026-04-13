import { rmsnorm } from '../../model/math'
import type { MatrixData, TokenStepTrace } from '../../model'
import type { PhaseDefinition } from '../../walkthrough/phases'
import type {
  AttentionGridOverlay,
  AttentionReadOverlay,
  ContextOverlaySlot,
  SceneFocusWindow,
  SceneModelData,
  TensorColorScale,
  TensorSurface,
  VectorStripOverlay,
  VizEdgeId,
  VizFrame,
  VizNodeId,
} from './types'

const headNodeIds: VizNodeId[] = [
  'attention-head-1',
  'attention-head-2',
  'attention-head-3',
  'attention-head-4',
]

export function buildContextSlots(
  contextTokens: string[],
  currentIndex: number,
  emphasis: Array<number | null | undefined>,
): ContextOverlaySlot[] {
  return contextTokens.map((token, index) => ({
    label: `p${index}:${token}`,
    emphasis: emphasis[index] ?? 0,
    isCurrent: index === currentIndex,
  }))
}

function dimensionLabels(count: number, prefix = 'd') {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`)
}

function sequentialBounds(values: readonly number[]) {
  const maxValue = Math.max(1e-6, ...values)
  return { minValue: 0, maxValue }
}

function divergingBounds(values: readonly number[]) {
  const maxAbs = Math.max(1e-6, ...values.map((value) => Math.abs(value)))
  return { minValue: -maxAbs, maxValue: maxAbs }
}

function createBounds(values: readonly number[], colorScale: TensorColorScale) {
  return colorScale === 'sequential'
    ? sequentialBounds(values)
    : divergingBounds(values)
}

export function buildWeightSurface(
  id: string,
  matrix: MatrixData,
  rowLabels: string[],
  colLabels: string[],
  options: {
    highlightedRows?: number[]
    highlightedCols?: number[]
    colorScale?: TensorColorScale
  } = {},
): TensorSurface {
  const colorScale = options.colorScale ?? 'diverging'
  const values = Array.from(matrix.data)
  const { minValue, maxValue } = createBounds(values, colorScale)

  return {
    id,
    label: id,
    rows: matrix.rows,
    cols: matrix.cols,
    data: values,
    rowLabels,
    colLabels,
    highlightedRows: options.highlightedRows ?? [],
    highlightedCols: options.highlightedCols ?? [],
    colorScale,
    minValue,
    maxValue,
  }
}

export function buildVectorSurface(
  id: string,
  label: string,
  values: readonly number[],
  options: {
    itemLabels?: string[]
    highlightedIndices?: number[]
    colorScale?: TensorColorScale
  } = {},
): VectorStripOverlay {
  const colorScale = options.colorScale ?? 'diverging'
  const { minValue, maxValue } = createBounds(values, colorScale)

  return {
    id,
    label,
    values: Array.from(values),
    itemLabels: options.itemLabels ?? dimensionLabels(values.length),
    highlightedIndices: options.highlightedIndices ?? [],
    colorScale,
    minValue,
    maxValue,
  }
}

export function buildAttentionSurface(
  headIndex: number,
  label: string,
  values: readonly number[],
  columnLabels: string[],
  colorScale: TensorColorScale,
): AttentionGridOverlay {
  const surface = {
    id: `${label}-h${headIndex + 1}`,
    label: `${label} h${headIndex + 1}`,
    rows: 1,
    cols: values.length,
    data: Array.from(values),
    rowLabels: [`q${headIndex + 1}`],
    colLabels: columnLabels,
    highlightedRows: [0],
    highlightedCols: [],
    colorScale,
    ...createBounds(values, colorScale),
  } satisfies TensorSurface

  return {
    headLabel: `H${headIndex + 1}`,
    surface,
    result: buildVectorSurface(
      `${label}-result-h${headIndex + 1}`,
      colorScale === 'sequential' ? 'weights' : 'scores',
      values,
      {
        itemLabels: columnLabels,
        highlightedIndices:
          values.length > 0 ? [values.indexOf(Math.max(...values))] : [],
        colorScale,
      },
    ),
  }
}

function getAverageAttention(trace: TokenStepTrace, count: number) {
  if (trace.heads.length === 0) {
    return Array.from({ length: count }, () => 0)
  }

  return Array.from({ length: count }, (_, index) => {
    const total = trace.heads.reduce(
      (sum, head) => sum + (head.weights[index] ?? 0),
      0,
    )
    return total / trace.heads.length
  })
}

function buildStrongestReads(
  trace: TokenStepTrace,
  contextTokens: string[],
): AttentionReadOverlay[] {
  return trace.heads.map((head, index) => {
    const strongestWeight = Math.max(0, ...head.weights)
    const strongestIndex =
      strongestWeight > 0 ? head.weights.indexOf(strongestWeight) : 0
    return {
      headId: headNodeIds[index] ?? 'attention-head-1',
      headLabel: `H${index + 1}`,
      targetLabel:
        contextTokens[strongestIndex] != null
          ? `p${strongestIndex}:${contextTokens[strongestIndex]}`
          : `p${strongestIndex}`,
      weight: strongestWeight,
      targetIndex: strongestIndex,
    }
  })
}

function buildTransitionLabel(
  trace: TokenStepTrace,
  tokenLabel: (tokenId: number) => string,
) {
  const current = tokenLabel(trace.tokenId)
  const sampled = tokenLabel(trace.sampledTokenId)
  return `p${trace.positionId}:${current} -> p${trace.positionId + 1}:${
    sampled === 'BOS' ? 'stop' : sampled
  }`
}

function buildEmphasisNodeIds(
  phase: PhaseDefinition,
  trace: TokenStepTrace,
): VizNodeId[] {
  const staticIds = [...phase.viz.emphasisNodeIds]
  if (
    phase.viz.overlayKind !== 'projection' &&
    phase.viz.overlayKind !== 'attention-scores' &&
    phase.viz.overlayKind !== 'attention-weights' &&
    phase.viz.overlayKind !== 'attention-mix'
  ) {
    return staticIds
  }

  const strongestHead = trace.heads
    .map((head, index) => ({
      nodeId: headNodeIds[index] ?? 'attention-head-1',
      strongest: Math.max(0, ...head.weights),
    }))
    .sort((left, right) => right.strongest - left.strongest)[0]

  return strongestHead ? [...staticIds, strongestHead.nodeId] : staticIds
}

function buildEmphasisEdgeIds(phase: PhaseDefinition): VizEdgeId[] {
  return [...phase.viz.emphasisEdgeIds]
}

function flattenHeadValues(trace: TokenStepTrace, key: 'q' | 'mixedValue') {
  return trace.heads.flatMap((head) => head[key])
}

function currentHeadCacheVector(
  trace: TokenStepTrace,
  key: 'kSlices' | 'vSlices',
) {
  return trace.heads.flatMap((head) => {
    const values = head[key][head[key].length - 1] ?? []
    return values
  })
}

function tokenRows(sceneModelData: SceneModelData, tokenLabel: (tokenId: number) => string) {
  return sceneModelData.vocab.map((_, tokenId) => tokenLabel(tokenId))
}

function buildContextWindow(
  trace: TokenStepTrace,
  contextTokens: string[],
): SceneFocusWindow {
  return {
    id: 'context-window',
    title: 'visible cache',
    subtitle: `Everything left of p${trace.positionId} is readable now.`,
    anchorNodeId: 'context',
    placement: 'below',
    surfaces: [],
    vectors: [],
    lookups: contextTokens.map((token, index) => ({
      label: `p${index}:${token}`,
      description:
        index === trace.positionId
          ? 'current slot being processed'
          : 'cached slot visible to attention',
    })),
    note: 'The current token and every earlier visible token become the readable context band.',
  }
}

export function buildTensorWindow(
  trace: TokenStepTrace,
  phase: PhaseDefinition,
  sceneModelData: SceneModelData,
  contextTokens: string[],
  tokenLabel: (tokenId: number) => string,
): SceneFocusWindow {
  const currentToken = tokenLabel(trace.tokenId)
  const currentSlotLabel = `p${trace.positionId}:${currentToken}`
  const slotLabels = contextTokens.map((token, index) => `p${index}:${token}`)
  const weightCols = dimensionLabels(sceneModelData.config.nEmbd)
  const visibleHeadDim = dimensionLabels(sceneModelData.config.headDim, 'h')
  const currentQ = flattenHeadValues(trace, 'q')
  const currentK = currentHeadCacheVector(trace, 'kSlices')
  const currentV = currentHeadCacheVector(trace, 'vSlices')
  const attnConcat = flattenHeadValues(trace, 'mixedValue')
  const attnInput = rmsnorm(trace.xAfterNorm)
  const mlpInput = rmsnorm(trace.xAfterAttnResidual)

  switch (phase.id) {
    case 'tokenize':
      return buildContextWindow(trace, contextTokens)
    case 'token-embedding':
      return {
        id: phase.viz.focusWindowId,
        title: 'wte',
        subtitle: `Lookup row ${currentToken} from the 27x16 token table.`,
        anchorNodeId: 'token-embedding',
        placement: 'right',
        surfaces: [
          buildWeightSurface(
            'wte',
            sceneModelData.weights.wte,
            tokenRows(sceneModelData, tokenLabel),
            weightCols,
            { highlightedRows: [trace.tokenId] },
          ),
        ],
        vectors: [
          buildVectorSurface('token-row', `row ${currentToken}`, trace.tokenEmbedding, {
            itemLabels: weightCols,
          }),
        ],
        lookups: [
          {
            label: currentSlotLabel,
            description: `The token id for ${currentToken} selects this highlighted row.`,
          },
        ],
      }
    case 'position-embedding':
      return {
        id: phase.viz.focusWindowId,
        title: 'wpe',
        subtitle: `Lookup row p${trace.positionId} from the 16x16 position table.`,
        anchorNodeId: 'position-embedding',
        placement: 'right',
        surfaces: [
          buildWeightSurface(
            'wpe',
            sceneModelData.weights.wpe,
            Array.from({ length: sceneModelData.config.blockSize }, (_, index) => `p${index}`),
            weightCols,
            { highlightedRows: [trace.positionId] },
          ),
        ],
        vectors: [
          buildVectorSurface(
            'position-row',
            `row p${trace.positionId}`,
            trace.positionEmbedding,
            {
              itemLabels: weightCols,
            },
          ),
        ],
        lookups: [
          {
            label: `p${trace.positionId}`,
            description: 'This row injects slot index information into the token state.',
          },
        ],
      }
    case 'embed-add-norm':
      return {
        id: phase.viz.focusWindowId,
        title: 'residual build',
        subtitle: 'Token row + position row -> summed state -> normalized state.',
        anchorNodeId: 'norm-1',
        placement: 'right',
        surfaces: [],
        vectors: [
          buildVectorSurface('token-vec', 'token vector', trace.tokenEmbedding, {
            itemLabels: weightCols,
          }),
          buildVectorSurface('position-vec', 'position vector', trace.positionEmbedding, {
            itemLabels: weightCols,
          }),
          buildVectorSurface('sum-vec', 'xAfterEmbed', trace.xAfterEmbed, {
            itemLabels: weightCols,
          }),
          buildVectorSurface('norm-vec', 'xAfterNorm', trace.xAfterNorm, {
            itemLabels: weightCols,
          }),
        ],
        note: 'This is the first full slot state the transformer can read from.',
      }
    case 'qkv':
      return {
        id: phase.viz.focusWindowId,
        title: 'q / k / v projections',
        subtitle: `The normalized slot ${currentSlotLabel} is multiplied by three 16x16 matrices.`,
        anchorNodeId: 'qkv',
        placement: 'below',
        surfaces: [
          buildWeightSurface(
            'attn_wq',
            sceneModelData.weights['layer0.attn_wq'],
            weightCols,
            weightCols,
          ),
          buildWeightSurface(
            'attn_wk',
            sceneModelData.weights['layer0.attn_wk'],
            weightCols,
            weightCols,
          ),
          buildWeightSurface(
            'attn_wv',
            sceneModelData.weights['layer0.attn_wv'],
            weightCols,
            weightCols,
          ),
        ],
        vectors: [],
        projection: {
          equation: 'x · Wq / x · Wk / x · Wv',
          input: buildVectorSurface('qkv-input', 'input', attnInput, {
            itemLabels: weightCols,
          }),
          outputs: [
            buildVectorSurface('q-out', 'q', currentQ, {
              itemLabels: weightCols,
            }),
            buildVectorSurface('k-out', 'k', currentK, {
              itemLabels: weightCols,
            }),
            buildVectorSurface('v-out', 'v', currentV, {
              itemLabels: weightCols,
            }),
          ],
        },
      }
    case 'attention-scores':
      return {
        id: phase.viz.focusWindowId,
        title: 'attention scores',
        subtitle: `${currentSlotLabel} compares its query against every visible key.`,
        anchorNodeId: 'attention-head-2',
        placement: 'below',
        surfaces: [],
        vectors: [],
        attention: trace.heads.map((head, headIndex) =>
          buildAttentionSurface(headIndex, 'scores', head.scores, slotLabels, 'diverging'),
        ),
      }
    case 'attention-softmax':
      return {
        id: phase.viz.focusWindowId,
        title: 'attention weights',
        subtitle: 'Softmax turns each score row into a probability distribution over visible slots.',
        anchorNodeId: 'attention-head-2',
        placement: 'below',
        surfaces: [],
        vectors: [],
        attention: trace.heads.map((head, headIndex) =>
          buildAttentionSurface(headIndex, 'weights', head.weights, slotLabels, 'sequential'),
        ),
      }
    case 'weighted-values':
      return {
        id: phase.viz.focusWindowId,
        title: 'value mixing',
        subtitle: 'Each head blends visible value slices into one returned vector.',
        anchorNodeId: 'attention-mix',
        placement: 'below',
        surfaces: [],
        vectors: [],
        attention: trace.heads.map((head, headIndex) => {
          const flattenedValues = head.vSlices.flat()
          const surface = {
            id: `values-h${headIndex + 1}`,
            label: `values h${headIndex + 1}`,
            rows: head.vSlices.length,
            cols: sceneModelData.config.headDim,
            data: flattenedValues,
            rowLabels: slotLabels.slice(0, head.vSlices.length),
            colLabels: visibleHeadDim,
            highlightedRows:
              head.weights.length > 0 ? [head.weights.indexOf(Math.max(...head.weights))] : [],
            highlightedCols: [],
            colorScale: 'diverging',
            ...createBounds(flattenedValues, 'diverging'),
          } satisfies TensorSurface

          return {
            headLabel: `H${headIndex + 1}`,
            surface,
            result: buildVectorSurface(
              `mixed-h${headIndex + 1}`,
              'mixed value',
              head.mixedValue,
              {
                itemLabels: visibleHeadDim,
              },
            ),
          }
        }),
      }
    case 'attn-out':
      return {
        id: phase.viz.focusWindowId,
        title: 'attention write-back',
        subtitle: 'Concatenate the four head reads, project them, then add the residual path back in.',
        anchorNodeId: 'residual-add-1',
        placement: 'right',
        surfaces: [
          buildWeightSurface(
            'attn_wo',
            sceneModelData.weights['layer0.attn_wo'],
            weightCols,
            weightCols,
          ),
        ],
        vectors: [
          buildVectorSurface('concat-heads', 'concat(heads)', attnConcat, {
            itemLabels: weightCols,
          }),
          buildVectorSurface('attn-output', 'attnOutput', trace.attnOutput, {
            itemLabels: weightCols,
          }),
          buildVectorSurface('attn-residual', 'xAfterAttnResidual', trace.xAfterAttnResidual, {
            itemLabels: weightCols,
          }),
        ],
      }
    case 'mlp':
      return {
        id: phase.viz.focusWindowId,
        title: 'mlp block',
        subtitle: 'Expand to 64 dimensions, keep positive activations, then project back to 16.',
        anchorNodeId: 'mlp',
        placement: 'below',
        surfaces: [
          buildWeightSurface(
            'mlp_fc1',
            sceneModelData.weights['layer0.mlp_fc1'],
            dimensionLabels(sceneModelData.weights['layer0.mlp_fc1'].rows),
            weightCols,
          ),
          buildWeightSurface(
            'mlp_fc2',
            sceneModelData.weights['layer0.mlp_fc2'],
            weightCols,
            dimensionLabels(sceneModelData.weights['layer0.mlp_fc2'].cols),
          ),
        ],
        vectors: [
          buildVectorSurface('mlp-input', 'mlp input', mlpInput, {
            itemLabels: weightCols,
          }),
          buildVectorSurface('mlp-hidden', 'hidden / ReLU', trace.mlpHidden, {
            itemLabels: dimensionLabels(trace.mlpHidden.length),
            colorScale: 'sequential',
          }),
          buildVectorSurface('mlp-output', 'mlp output', trace.mlpOutput, {
            itemLabels: weightCols,
          }),
          buildVectorSurface('mlp-residual', 'xAfterMlpResidual', trace.xAfterMlpResidual, {
            itemLabels: weightCols,
          }),
        ],
      }
    case 'lm-head':
      return {
        id: phase.viz.focusWindowId,
        title: 'lm_head',
        subtitle: 'Project the final slot state into one raw score per vocabulary token.',
        anchorNodeId: 'logits',
        placement: 'right',
        surfaces: [
          buildWeightSurface(
            'lm_head',
            sceneModelData.weights.lm_head,
            tokenRows(sceneModelData, tokenLabel),
            weightCols,
            {
              highlightedRows: trace.topCandidates.map((candidate) => candidate.tokenId),
            },
          ),
        ],
        vectors: [
          buildVectorSurface('residual-readout', 'readout input', trace.xAfterMlpResidual, {
            itemLabels: weightCols,
          }),
          buildVectorSurface('logits', 'logits', trace.logits, {
            itemLabels: tokenRows(sceneModelData, tokenLabel),
            highlightedIndices: trace.topCandidates.map((candidate) => candidate.tokenId),
          }),
        ],
      }
    case 'probabilities':
      return {
        id: phase.viz.focusWindowId,
        title: 'probabilities',
        subtitle: 'Temperature scaling and softmax convert logits into an explicit vocabulary distribution.',
        anchorNodeId: 'probabilities',
        placement: 'right',
        surfaces: [],
        vectors: [
          buildVectorSurface('probs', 'softmax(logits)', trace.probs, {
            itemLabels: tokenRows(sceneModelData, tokenLabel),
            highlightedIndices: trace.topCandidates.map((candidate) => candidate.tokenId),
            colorScale: 'sequential',
          }),
        ],
        note: `Top read right now: ${tokenLabel(trace.topCandidates[0]?.tokenId ?? trace.sampledTokenId)}.`,
      }
    case 'sample':
    case 'append-or-stop':
      return {
        id: phase.viz.focusWindowId,
        title: phase.id === 'sample' ? 'sample token' : 'append or stop',
        subtitle:
          tokenLabel(trace.sampledTokenId) === 'BOS'
            ? 'BOS ends generation for this tiny model.'
            : `${tokenLabel(trace.sampledTokenId)} becomes the next visible slot.`,
        anchorNodeId: 'sample',
        placement: 'right',
        surfaces: [],
        vectors: [
          buildVectorSurface('sample-probs', 'distribution', trace.probs, {
            itemLabels: tokenRows(sceneModelData, tokenLabel),
            highlightedIndices: [trace.sampledTokenId],
            colorScale: 'sequential',
          }),
        ],
        lookups: [
          {
            label: `picked ${tokenLabel(trace.sampledTokenId)}`,
            description:
              tokenLabel(trace.sampledTokenId) === 'BOS'
                ? 'Stop now.'
                : `Append to p${trace.positionId + 1} and run the loop again.`,
          },
        ],
      }
    default:
      return buildContextWindow(trace, contextTokens)
  }
}

export function buildVizFrame(
  trace: TokenStepTrace,
  phase: PhaseDefinition,
  sceneModelData: SceneModelData,
  contextTokens: string[],
  tokenLabel: (tokenId: number) => string,
): VizFrame {
  const currentToken = tokenLabel(trace.tokenId)
  const transitionLabel = buildTransitionLabel(trace, tokenLabel)
  const averageAttention = getAverageAttention(trace, contextTokens.length)
  const currentIndex = Math.min(
    trace.positionId,
    Math.max(0, contextTokens.length - 1),
  )
  const slots = buildContextSlots(contextTokens, currentIndex, averageAttention)
  const focusWindow = buildTensorWindow(
    trace,
    phase,
    sceneModelData,
    contextTokens,
    tokenLabel,
  )
  const baseFrame = {
    focusNodeId: phase.viz.focusNodeId,
    emphasisNodeIds: buildEmphasisNodeIds(phase, trace),
    emphasisEdgeIds: buildEmphasisEdgeIds(phase),
    cameraPoseId: phase.viz.cameraPoseId,
    currentSlotLabel: `p${trace.positionId}:${currentToken}`,
    transitionLabel,
  }

  switch (phase.viz.overlayKind) {
    case 'context-cache':
      return {
        ...baseFrame,
        overlay: {
          kind: 'context-cache',
          slots,
          focusWindow,
        },
      }
    case 'embedding-lookup':
      return {
        ...baseFrame,
        overlay: {
          kind: 'embedding-lookup',
          slots,
          focusWindow,
        },
      }
    case 'projection':
      return {
        ...baseFrame,
        overlay: {
          kind: 'projection',
          slots,
          attentionReads: buildStrongestReads(trace, contextTokens),
          focusWindow,
        },
      }
    case 'attention-scores':
      return {
        ...baseFrame,
        overlay: {
          kind: 'attention-scores',
          slots,
          attentionReads: buildStrongestReads(trace, contextTokens),
          focusWindow,
        },
      }
    case 'attention-weights':
      return {
        ...baseFrame,
        overlay: {
          kind: 'attention-weights',
          slots,
          attentionReads: buildStrongestReads(trace, contextTokens),
          focusWindow,
        },
      }
    case 'attention-mix':
      return {
        ...baseFrame,
        overlay: {
          kind: 'attention-mix',
          slots,
          attentionReads: buildStrongestReads(trace, contextTokens),
          focusWindow,
        },
      }
    case 'residual-update':
      return {
        ...baseFrame,
        overlay: {
          kind: 'residual-update',
          focusWindow,
        },
      }
    case 'mlp':
      return {
        ...baseFrame,
        overlay: {
          kind: 'mlp',
          focusWindow,
        },
      }
    case 'logits':
      return {
        ...baseFrame,
        overlay: {
          kind: 'logits',
          focusWindow,
        },
      }
    case 'sample':
      return {
        ...baseFrame,
        overlay: {
          kind: 'sample',
          focusWindow,
        },
      }
  }
}
