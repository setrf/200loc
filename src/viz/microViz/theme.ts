import type { CSSProperties } from 'react'
import { Vec4 } from '../../vendor/llmVizOriginal/utils/vector'

type SceneCssVars = Record<`--scene-viz-${string}`, string>

export interface MicroVizTheme {
  id: string
  host: {
    cssVars: SceneCssVars
  }
  typography: {
    fontAtlasSrc: string
    fontDefSrc: string
    fontFaceName: string
    scale: {
      xs: number
      sm: number
      md: number
      lg: number
      xl: number
    }
  }
  scene: {
    overlayText: Vec4
    debugText: Vec4
    blockInfoText: Vec4
    blockInfoBackground: Vec4
    sectionLabelText: Vec4
    sectionLabelLine: Vec4
    modelCardBorder: Vec4
    modelCardBackground: Vec4
    modelCardText: Vec4
    modelCardMutedText: Vec4
    modelCardDivider: Vec4
    blocks: {
      weights: Vec4
      intermediates: Vec4
      aggregates: Vec4
      textureNegative: Vec4
      textureZero: Vec4
      gridMinor: Vec4
      gridMajor: Vec4
      gridEdge: Vec4
    }
    arrows: {
      weights: Vec4
      data: Vec4
    }
    dimStyles: {
      time: Vec4
      head: Vec4
      channel: Vec4
      token: Vec4
      tokenIndex: Vec4
      vocab: Vec4
      weights: Vec4
      intermediates: Vec4
      aggregates: Vec4
    }
  }
  emphasis: {
    baseOpacity: number
    emphasisOpacity: number
    focusOpacity: number
    baseHighlight: number
    emphasisHighlight: number
    focusHighlight: number
    arrowIdleOpacity: number
    arrowActiveBoost: number
  }
}

function color(hex: string, alpha = 1) {
  return Vec4.fromHexColor(hex, alpha)
}

export const siteMicroVizTheme: MicroVizTheme = {
  id: 'site-dark',
  host: {
    cssVars: {
      '--scene-viz-viewport-bg':
        'radial-gradient(circle at 20% 12%, rgba(111, 134, 182, 0.18), transparent 32%), linear-gradient(180deg, #111720 0%, #0b1017 100%)',
      '--scene-viz-viewport-border': 'rgba(157, 170, 186, 0.18)',
      '--scene-viz-viewport-shadow':
        'inset 0 0 0 1px rgba(255, 255, 255, 0.02), inset 0 -42px 80px rgba(5, 8, 12, 0.34)',
      '--scene-viz-canvas-inset': 'rgba(195, 206, 219, 0.11)',
      '--scene-viz-canvas-glow': 'rgba(0, 0, 0, 0.36)',
      '--scene-viz-hint-bg': 'rgba(12, 17, 24, 0.82)',
      '--scene-viz-hint-border': 'rgba(157, 170, 186, 0.16)',
      '--scene-viz-hint-text': '#b3becb',
      '--scene-viz-loading-bg': 'rgba(12, 17, 24, 0.88)',
      '--scene-viz-loading-border': 'rgba(157, 170, 186, 0.16)',
      '--scene-viz-loading-text': '#d7e0ea',
      '--scene-viz-fallback-edge': 'rgba(112, 188, 152, 0.34)',
      '--scene-viz-fallback-edge-active': 'rgba(127, 212, 172, 0.95)',
      '--scene-viz-fallback-node-side': 'rgba(81, 98, 158, 0.42)',
      '--scene-viz-fallback-node-side-stroke': 'rgba(115, 130, 168, 0.28)',
      '--scene-viz-fallback-node-top': 'rgba(107, 125, 184, 0.84)',
      '--scene-viz-fallback-node-top-stroke': 'rgba(126, 142, 186, 0.34)',
      '--scene-viz-fallback-node-front': 'rgba(89, 151, 126, 0.76)',
      '--scene-viz-fallback-node-front-stroke': 'rgba(116, 171, 145, 0.28)',
      '--scene-viz-fallback-node-active-top': 'rgba(125, 210, 172, 0.88)',
      '--scene-viz-fallback-node-active-front': 'rgba(93, 183, 144, 0.92)',
      '--scene-viz-fallback-node-label': '#d9e3ed',
    },
  },
  typography: {
    fontAtlasSrc: 'fonts/microviz-geist-mono-atlas.png',
    fontDefSrc: 'fonts/microviz-geist-mono.json',
    fontFaceName: 'GeistMono-Medium',
    scale: {
      xs: 12,
      sm: 12,
      md: 12,
      lg: 12,
      xl: 12,
    },
  },
  scene: {
    overlayText: color('#e5edf6', 0.96),
    debugText: color('#e5edf6', 0.94),
    blockInfoText: color('#f7fbff', 0.98),
    blockInfoBackground: color('#08111c', 0.96),
    sectionLabelText: color('#d4dee9', 0.96),
    sectionLabelLine: color('#95a6bd', 0.74),
    modelCardBorder: color('#90a4ee', 0.96),
    modelCardBackground: color('#101a29', 0.88),
    modelCardText: color('#eef4fb', 0.98),
    modelCardMutedText: color('#b3c1d0', 0.96),
    modelCardDivider: color('#8da0b8', 0.46),
    blocks: {
      weights: color('#5f72ce'),
      intermediates: color('#5f9d86'),
      aggregates: color('#b68a54'),
      textureNegative: color('#16212d'),
      textureZero: color('#45515d'),
      gridMinor: color('#49586c'),
      gridMajor: color('#748396'),
      gridEdge: color('#d9e3ed'),
    },
    arrows: {
      weights: color('#7386dc'),
      data: color('#70bc98'),
    },
    dimStyles: {
      time: color('#59a0b2'),
      head: color('#ba74b1'),
      channel: color('#d15d9b'),
      token: color('#70bc98'),
      tokenIndex: color('#506d8f'),
      vocab: color('#8b67b4'),
      weights: color('#7386dc'),
      intermediates: color('#70bc98'),
      aggregates: color('#d1a96f'),
    },
  },
  emphasis: {
    baseOpacity: 0.84,
    emphasisOpacity: 0.9,
    focusOpacity: 1,
    baseHighlight: 0.16,
    emphasisHighlight: 0.4,
    focusHighlight: 0.88,
    arrowIdleOpacity: 0.62,
    arrowActiveBoost: 1.12,
  },
}

export function getCurrentMicroVizTheme() {
  return siteMicroVizTheme
}

export function microVizCssVariables(theme: MicroVizTheme): CSSProperties {
  return theme.host.cssVars as CSSProperties
}
