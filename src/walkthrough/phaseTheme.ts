import type { CSSProperties } from 'react'

export type PhaseFamily =
  | 'input'
  | 'state'
  | 'attention'
  | 'transform'
  | 'output'
  | 'neutral'

type PhaseCssVars = CSSProperties & Record<`--phase-${string}`, string>

export interface PhaseTheme {
  family: PhaseFamily
  cssVars: PhaseCssVars
}

const phaseFamilyByGroupId: Record<string, PhaseFamily> = {
  tokenize: 'input',
  'token-embedding': 'input',
  'position-embedding': 'input',
  'embed-add-norm': 'state',
  qkv: 'attention',
  'attention-scores': 'attention',
  'attention-softmax': 'attention',
  'weighted-values': 'attention',
  'attn-out': 'attention',
  mlp: 'transform',
  'lm-head': 'output',
  probabilities: 'output',
  sample: 'output',
  'append-or-stop': 'output',
}

const phaseVarsByFamily: Record<PhaseFamily, PhaseCssVars> = {
  input: {
    '--phase-accent': '#7cc7ff',
    '--phase-accent-soft': 'rgba(124, 199, 255, 0.58)',
    '--phase-accent-muted': 'rgba(124, 199, 255, 0.36)',
    '--phase-accent-wash': 'rgba(124, 199, 255, 0.12)',
    '--phase-accent-hover': 'rgba(124, 199, 255, 0.18)',
    '--phase-rail': 'rgba(124, 199, 255, 0.88)',
  },
  state: {
    '--phase-accent': '#aab8d6',
    '--phase-accent-soft': 'rgba(170, 184, 214, 0.58)',
    '--phase-accent-muted': 'rgba(170, 184, 214, 0.34)',
    '--phase-accent-wash': 'rgba(170, 184, 214, 0.1)',
    '--phase-accent-hover': 'rgba(170, 184, 214, 0.16)',
    '--phase-rail': 'rgba(170, 184, 214, 0.82)',
  },
  attention: {
    '--phase-accent': '#70d6a5',
    '--phase-accent-soft': 'rgba(112, 214, 165, 0.58)',
    '--phase-accent-muted': 'rgba(112, 214, 165, 0.34)',
    '--phase-accent-wash': 'rgba(112, 214, 165, 0.11)',
    '--phase-accent-hover': 'rgba(112, 214, 165, 0.17)',
    '--phase-rail': 'rgba(112, 214, 165, 0.86)',
  },
  transform: {
    '--phase-accent': '#f0c46b',
    '--phase-accent-soft': 'rgba(240, 196, 107, 0.58)',
    '--phase-accent-muted': 'rgba(240, 196, 107, 0.34)',
    '--phase-accent-wash': 'rgba(240, 196, 107, 0.11)',
    '--phase-accent-hover': 'rgba(240, 196, 107, 0.17)',
    '--phase-rail': 'rgba(240, 196, 107, 0.86)',
  },
  output: {
    '--phase-accent': '#ff9a76',
    '--phase-accent-soft': 'rgba(255, 154, 118, 0.58)',
    '--phase-accent-muted': 'rgba(255, 154, 118, 0.34)',
    '--phase-accent-wash': 'rgba(255, 154, 118, 0.11)',
    '--phase-accent-hover': 'rgba(255, 154, 118, 0.17)',
    '--phase-rail': 'rgba(255, 154, 118, 0.86)',
  },
  neutral: {
    '--phase-accent': '#9aafc4',
    '--phase-accent-soft': 'rgba(154, 175, 196, 0.56)',
    '--phase-accent-muted': 'rgba(154, 175, 196, 0.32)',
    '--phase-accent-wash': 'rgba(154, 175, 196, 0.1)',
    '--phase-accent-hover': 'rgba(154, 175, 196, 0.16)',
    '--phase-rail': 'rgba(154, 175, 196, 0.8)',
  },
}

export function getPhaseTheme(groupId: string): PhaseTheme {
  const family = phaseFamilyByGroupId[groupId] ?? 'neutral'
  return {
    family,
    cssVars: phaseVarsByFamily[family],
  }
}
