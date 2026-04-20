import { TextAlignHoriz, TextAlignVert } from "../Annotations";
import type { IGptModelLayout } from "../GptModelLayout";
import { measureTextWidth, writeTextToBuffer } from "../render/fontRender";
import { addLine } from "../render/lineRender";
import type { IRenderState } from "../render/modelRender";
import { addQuad } from "../render/triRender";
import { lerp } from "@llmviz/utils/math";
import { Mat4f } from "@llmviz/utils/matrix";
import { Vec3, Vec4 } from "@llmviz/utils/vector";
import { getCurrentMicroVizTheme, type MicroVizTheme } from "../../../../viz/microViz/theme";

export function resolveSectionLabelOpacity(value: number) {
    if (value <= 0.01) {
        return 0;
    }
    return Math.max(0, Math.min(1, value));
}

export function resolveSectionHeadIndex(
    block: IGptModelLayout["blocks"][number],
    preferredHeadIndex: number | null = null,
) {
    if (
        preferredHeadIndex != null &&
        preferredHeadIndex >= 0 &&
        preferredHeadIndex < block.heads.length
    ) {
        return preferredHeadIndex;
    }

    let bestIndex = 0;
    let bestVisibility = -Infinity;

    block.heads.forEach((head, idx) => {
        let visibility =
            head.headLabel.visible +
            head.qLabel.visible +
            head.kLabel.visible +
            head.vLabel.visible +
            head.mtxLabel.visible +
            head.vectorLabel.visible;

        if (visibility > bestVisibility || (visibility === bestVisibility && idx > bestIndex)) {
            bestVisibility = visibility;
            bestIndex = idx;
        }
    });

    return bestIndex;
}

export interface BlockLabelSemantics {
    activeHeadIndex?: number | null;
    theme?: MicroVizTheme;
}

export function drawBlockLabels(
    state: IRenderState,
    layout: IGptModelLayout,
    semantics: BlockLabelSemantics = {},
) {
    let theme = semantics.theme ?? getCurrentMicroVizTheme();
    let scale = theme.typography.scale;

    // probably should limit this to specific blocks (defined by walkthrough)
    // can configure this on the blocks themselves, or the layout object
    // either way, this runs after the walkthrough, for positioning, and the walkthrough
    // needs to configure this is some way

    let baseColor = theme.scene.sectionLabelText;

    {
        let color = baseColor.mul(resolveSectionLabelOpacity(layout.embedLabel.visible));
        let tl = new Vec3(layout.tokEmbedObj.x - layout.margin * 2, layout.tokEmbedObj.y, 0);
        let br = new Vec3(layout.tokEmbedObj.x - layout.margin * 2, layout.tokEmbedObj.y + layout.tokEmbedObj.dy, 0);
        drawSectionLabel(state, "Embedding", tl, br, { color, fontSize: scale.xs, pad: 5, theme });
    }

    let transformerIdx = 0;
    for (let block of layout.blocks) {
        let blockTop = block.ln1.lnResid.y - layout.margin / 2;
        let blockBottom = block.mlpResult.y + block.mlpResult.dy + layout.margin / 2;
        let mlpLeft = block.mlpProjBias.x - layout.margin * 3;
        let headLeft = block.projBias.x - layout.margin;
        let attnLabelLeft = headLeft - layout.margin * 3;
        let attnLeft = lerp(headLeft, mlpLeft, 0.6);

        let attnProjTop = block.attnOut.y - layout.margin / 2;
        let attnProjBot = block.attnOut.y + block.attnOut.dy + layout.margin / 2;
        let mlpTop = block.mlpFcBias.y - layout.margin / 2;

        let blockLeft = mlpLeft - layout.margin * 6;

        {
                let color = baseColor.mul(resolveSectionLabelOpacity(block.mlpResidual.opacity * block.transformerLabel.visible));
            let tl = new Vec3(blockLeft, blockTop, 0);
            let br = new Vec3(blockLeft, blockBottom, 0);
            drawSectionLabel(state, `Transformer ${transformerIdx}`, tl, br, { color, fontSize: scale.xl, pad: 10, theme });
        }

        {
            let color = baseColor.mul(resolveSectionLabelOpacity(block.attnResidual.opacity * block.selfAttendLabel.visible));
            let tl = new Vec3(attnLeft, blockTop, 0);
            let br = new Vec3(attnLeft, attnProjBot, 0);
            drawSectionLabel(state, `Self-attention`, tl, br, { color, fontSize: scale.lg, pad: 9, theme });
        }

        {
            let color = baseColor.mul(resolveSectionLabelOpacity(block.mlpAct.opacity * block.mlpLabel.visible));
            let tl = new Vec3(mlpLeft, mlpTop, 0);
            let br = new Vec3(mlpLeft, blockBottom, 0);
            drawSectionLabel(state, `MLP`, tl, br, { color, fontSize: scale.lg, pad: 9, theme });
        }

        {
            let color = baseColor.mul(resolveSectionLabelOpacity(block.attnOut.opacity * block.projLabel.visible));
            let tl = new Vec3(attnLabelLeft, attnProjTop, 0);
            let br = new Vec3(attnLabelLeft, attnProjBot, 0);
            drawSectionLabel(state, `Projection`, tl, br, { color, fontSize: scale.md, pad: 8, theme });
        }

        let closestHeadIdx = resolveSectionHeadIndex(block, semantics.activeHeadIndex ?? null);
        let head = block.heads[closestHeadIdx];

        if (head) {
            {
                let color = baseColor.mul(resolveSectionLabelOpacity(head.attnMtx.opacity * head.headLabel.visible));
                let tl = new Vec3(attnLabelLeft, head.vBlock.y, head.vBlock.z + head.vBlock.dz / 2);
                let br = new Vec3(attnLabelLeft, head.qBlock.y + head.qBlock.dy, head.qBlock.z + head.qBlock.dz / 2);
                if (head.qBlock.y !== head.vBlock.y) {
                    tl = new Vec3(attnLabelLeft, head.vBlock.y, head.vOutBlock.z + head.vOutBlock.dz / 2);
                    br = new Vec3(attnLabelLeft, head.vOutBlock.y + head.vOutBlock.dy, head.vOutBlock.z + head.vOutBlock.dz / 2);
                }

                drawSectionLabel(state, `Head ${closestHeadIdx}`, tl, br, { color, fontSize: scale.sm, pad: 7, theme });
            }


            {
                let color = baseColor.mul(resolveSectionLabelOpacity(head.qBlock.opacity * head.qLabel.visible));
                let tl = new Vec3(headLeft, head.qBlock.y, head.qBlock.z + head.qBlock.dz / 2);
                let br = new Vec3(headLeft, head.qBlock.y + head.qBlock.dy, head.qBlock.z + head.qBlock.dz / 2);
                drawSectionLabel(state, `Q`, tl, br, { color, fontSize: scale.xs, pad: 5, theme });
            }

            {
                let color = baseColor.mul(resolveSectionLabelOpacity(head.kBlock.opacity * head.kLabel.visible));
                let tl = new Vec3(headLeft, head.kBlock.y, head.kBlock.z + head.kBlock.dz / 2);
                let br = new Vec3(headLeft, head.kBlock.y + head.kBlock.dy, head.kBlock.z + head.kBlock.dz / 2);
                drawSectionLabel(state, `K`, tl, br, { color, fontSize: scale.xs, pad: 5, theme });
            }

            {
                let color = baseColor.mul(resolveSectionLabelOpacity(head.vBlock.opacity * head.vLabel.visible));
                let tl = new Vec3(headLeft, head.vBlock.y, head.vBlock.z + head.vBlock.dz / 2);
                let br = new Vec3(headLeft, head.vBlock.y + head.vBlock.dy, head.vBlock.z + head.vBlock.dz / 2);
                drawSectionLabel(state, `V`, tl, br, { color, fontSize: scale.xs, pad: 5, theme });
            }
        }

        transformerIdx++;
    }

}

export interface ILabelOpts {
    color: Vec4;
    fontSize: number;
    textAlign?: TextAlignHoriz;
    textAlignV?: TextAlignVert;
    pad?: number;
    inward?: Vec3;
    theme?: MicroVizTheme;
}

export function drawSectionLabel(state: IRenderState, text: string, tl: Vec3, br: Vec3, opts: ILabelOpts) {
    let theme = opts.theme ?? getCurrentMicroVizTheme();
    let mtx = new Mat4f();
    mtx[14] = (tl.z + br.z) / 2;

    let color = opts.color;
    let fontScale = opts.fontSize;
    let pad = opts.pad ?? 10;
    let inward = opts.inward ?? new Vec3(1, 0, 0);

    let textColor = color;
    let lineColor = theme.scene.sectionLabelLine.mul(Math.max(opts.color.w, 0.7));

    let tw = measureTextWidth(state.modelFontBuf, text, fontScale);
    let textX = inward.x >= 0 ? tl.x - tw - 2 * pad : tl.x + 2 * pad;
    let textY = (tl.y + br.y) / 2 - fontScale / 2;
    let shadowOffset = Math.max(0.55, fontScale * 0.05);

    let chipTl = new Vec3(textX - pad * 0.75, textY - fontScale * 0.22, mtx[14] - 0.01);
    let chipBr = new Vec3(textX + tw + pad * 0.75, textY + fontScale * 1.02, mtx[14] - 0.01);
    addQuad(
        state.triRender,
        chipTl,
        chipBr,
        theme.scene.blockInfoBackground.mul(Math.max(0.56, opts.color.w * 0.72)),
        undefined,
    );

    writeTextToBuffer(
        state.modelFontBuf,
        text,
        theme.scene.blockInfoBackground.mul(Math.max(0.88, opts.color.w * 0.92)),
        textX + shadowOffset,
        textY + shadowOffset,
        fontScale,
        mtx,
        theme.typography.fontFaceName,
    );

    writeTextToBuffer(
        state.modelFontBuf,
        text,
        textColor,
        textX,
        textY,
        fontScale,
        mtx,
        theme.typography.fontFaceName,
    );

    let p0 = new Vec3(tl.x, tl.y, (tl.z + br.z) / 2);
    let p1 = new Vec3(br.x, br.y, (tl.z + br.z) / 2);

    if (tl.z != br.z) {
        p0 = new Vec3(tl.x, (tl.y + br.y) / 2, tl.z);
        p1 = new Vec3(tl.x, (tl.y + br.y) / 2, br.z);
    }

    addLine(state.lineRender, 1.0, lineColor, p0.mulAdd(inward, -pad), p1.mulAdd(inward, -pad), undefined);

    addLine(state.lineRender, 1.0, lineColor, p0.mulAdd(inward, -pad), p0, undefined);
    addLine(state.lineRender, 1.0, lineColor, p1.mulAdd(inward, -pad), p1, undefined);

}
