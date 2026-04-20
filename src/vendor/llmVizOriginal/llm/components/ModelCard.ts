import { cameraToMatrixView } from "../Camera";
import { cellPosition } from "../GptModelLayout";
import type { IGptModelLayout } from "../GptModelLayout";
import type { IProgramState } from "../Program";
import { drawText, measureText, measureTextWidth, writeTextToBuffer } from "../render/fontRender";
import type { IFontOpts } from "../render/fontRender";
import { addLine, addLine2 as drawLine, drawLineSegs, makeLineOpts } from "../render/lineRender";
import type { ILineOpts } from "../render/lineRender";
import type { IRenderState } from "../render/modelRender";
import { addQuad } from "../render/triRender";
import { lerp } from "@llmviz/utils/math";
import { Mat4f } from "@llmviz/utils/matrix";
import { Dim, Vec3, Vec4 } from "@llmviz/utils/vector";
import { DimStyle, dimStyleColor } from "../walkthrough/WalkthroughTools";
import { lineHeight } from "./TextLayout";
import type { IColorMix } from "../Annotations";
import { clamp } from "@llmviz/utils/data";
import { getCurrentMicroVizTheme, type MicroVizTheme } from "../../../../viz/microViz/theme";

export interface IModelCardLayoutMetrics {
    tl: Vec3;
    br: Vec3;
    titleFontScale: number;
    paramLabelScale: number;
    paramValueScale: number;
    titleY: number;
    paramY: number;
}

export interface IModelCardVisibility {
    scale: number;
    opacity: number;
}

function themedFont(size: number, color: Vec4, mtx?: Mat4f, theme: MicroVizTheme = getCurrentMicroVizTheme()): IFontOpts {
    return {
        color,
        size,
        mtx,
        faceName: theme.typography.fontFaceName,
    };
}

function fitTextScale(textWidth: number, preferredScale: number, maxWidth: number, minScale: number) {
    if (textWidth <= 0 || maxWidth <= 0) {
        return preferredScale;
    }
    return clamp(preferredScale * (maxWidth / textWidth), minScale, preferredScale);
}

export function computeModelCardLayout(
    titleWidthAtUnitScale: number,
    paramLabelWidthAtUnitScale: number,
    paramValueWidthAtUnitScale: number,
    theme: MicroVizTheme = getCurrentMicroVizTheme(),
) : IModelCardLayoutMetrics {
    let scale = theme.typography.scale;
    const innerPaddingX = 8;
    const titleTopPadding = 4;
    const contentGap = 4;
    const bottomPadding = 5;

    const preferredTitleScale = scale.xl;
    const preferredParamLabelScale = scale.sm;
    const preferredParamValueScale = scale.md;

    const titleFillRatio = 0.94;
    const minTitleScale = scale.lg;
    const minParamLabelScale = scale.xs;
    const minParamValueScale = scale.sm;

    const minInnerWidth = 74;
    const maxInnerWidth = 102;

    const preferredTitleWidth = titleWidthAtUnitScale * preferredTitleScale;
    const preferredParamWidth =
        paramLabelWidthAtUnitScale * preferredParamLabelScale +
        paramValueWidthAtUnitScale * preferredParamValueScale;

    const innerWidth = clamp(
        Math.max(preferredTitleWidth, preferredParamWidth) + innerPaddingX * 2,
        minInnerWidth,
        maxInnerWidth,
    );
    const contentWidth = innerWidth - innerPaddingX * 2;

    const titleFontScale =
        titleWidthAtUnitScale > 0
            ? clamp((contentWidth * titleFillRatio) / titleWidthAtUnitScale, minTitleScale, preferredTitleScale)
            : preferredTitleScale;
    const paramLabelScale = fitTextScale(
        paramLabelWidthAtUnitScale * preferredParamLabelScale,
        preferredParamLabelScale,
        contentWidth,
        minParamLabelScale,
    );
    const paramValueScale = fitTextScale(
        paramValueWidthAtUnitScale * preferredParamValueScale,
        preferredParamValueScale,
        contentWidth,
        minParamValueScale,
    );

    const titleHeight = titleFontScale * 1.3;
    const paramHeight = Math.max(paramLabelScale, paramValueScale);
    const cardHeight = titleTopPadding + titleHeight + contentGap + paramHeight + bottomPadding;
    const halfWidth = innerWidth / 2;

    const tl = new Vec3(-halfWidth, -97, 0);
    const br = new Vec3(halfWidth, tl.y + cardHeight, 0);

    return {
        tl,
        br,
        titleFontScale,
        paramLabelScale,
        paramValueScale,
        titleY: tl.y + titleTopPadding,
        paramY: tl.y + titleTopPadding + titleHeight + contentGap,
    };
}

export function computeModelCardVisibility(currentZoom: number, referenceZoom: number) : IModelCardVisibility {
    return computeModelCardVisibilityFromDelta(currentZoom, referenceZoom, 0, 0);
}

export function computeModelCardVisibilityFromDelta(
    currentZoom: number,
    referenceZoom: number,
    centerDelta: number,
    angleDelta: number,
) : IModelCardVisibility {
    if (referenceZoom <= 0) {
        return { scale: 1.0, opacity: 1.0 };
    }

    let zoomRatio = clamp(currentZoom / referenceZoom, 0.0, 2.0);
    let zoomOpacity = clamp((zoomRatio - 0.56) / 0.3, 0.0, 1.0);
    let centerOpacity = clamp(1.0 - centerDelta / 48.0, 0.0, 1.0);
    let angleOpacity = clamp(1.0 - angleDelta / 18.0, 0.0, 1.0);
    let opacity = Math.min(zoomOpacity, centerOpacity, angleOpacity);
    let scale = lerp(0.84, 1.04, opacity);
    return { scale, opacity };
}

export function drawModelCard(
    state: IProgramState,
    layout: IGptModelLayout,
    title: string,
    offset: Vec3,
    theme: MicroVizTheme = getCurrentMicroVizTheme(),
) {
    let { render } = state;
    let { camPos } = cameraToMatrixView(state.camera);
    let dist = camPos.dist(new Vec3(0, 0, -30)); //.add(offset));

    let overviewPose = (layout as IGptModelLayout & { cameraPoses?: { overview?: { center: Vec3; angle: Vec3 } } }).cameraPoses?.overview;
    let centerDelta = overviewPose ? state.camera.center.dist(overviewPose.center) : 0;
    let angleDelta = overviewPose ? state.camera.angle.sub(overviewPose.angle).len() : 0;
    let visibility = computeModelCardVisibilityFromDelta(
        state.camera.angle.z,
        state.camera.zoomReference ?? state.camera.angle.z,
        centerDelta,
        angleDelta,
    );
    if (visibility.opacity <= 0.02) {
        return;
    }

    let nParamsText = `n_params = `;
    let weightCountText = numberToCommaSep(layout.weightCount);
    let cardLayout = computeModelCardLayout(
        measureTextWidth(render.modelFontBuf, title, 1),
        measureTextWidth(render.modelFontBuf, nParamsText, 1),
        measureTextWidth(render.modelFontBuf, weightCountText, 1),
        theme,
    );
    // Keep the card legible, but let it participate in scene zoom instead of
    // behaving like a fixed-size screen overlay. Scale around the card bottom
    // so it stays visually anchored above the model as zoom changes.
    let cameraScale = clamp(dist / 500.0, 1.0, 800.0);
    let scale = lerp(1.0, cameraScale, 0.35) * visibility.scale;
    let pivotY = cardLayout.br.y;
    let mtx = Mat4f.fromScaleTranslation(new Vec3(scale, scale, scale), new Vec3(0, pivotY, 0).add(offset))
        .mul(Mat4f.fromTranslation(new Vec3(0, -pivotY, 0)));

    let thick = 1.0 / 10.0 * scale;
    let borderColor = theme.scene.modelCardBorder.mul(visibility.opacity);
    let backgroundColor = theme.scene.modelCardBackground.mul(visibility.opacity);
    let titleColor = theme.scene.modelCardText.mul(visibility.opacity);
    let detailColor = theme.scene.modelCardMutedText.mul(visibility.opacity);
    let n = new Vec3(0, 0, 1);

    let lineOpts: ILineOpts = { color: borderColor, mtx, thick, n };

    let { tl, br } = cardLayout;
    drawLineRect(render, tl, br, lineOpts);

    addQuad(render.triRender, new Vec3(tl.x, tl.y, -0.1), new Vec3(br.x, br.y, -0.1), backgroundColor, mtx);

    let midX = (tl.x + br.x) / 2;
    let titleFontScale = cardLayout.titleFontScale;
    let titleW = measureTextWidth(render.modelFontBuf, title, titleFontScale);
    writeTextToBuffer(
        render.modelFontBuf,
        title,
        titleColor,
        midX - titleW / 2,
        cardLayout.titleY,
        titleFontScale,
        mtx,
        theme.typography.fontFaceName,
    );

    // layout.weightCount = 150000000000;

    let paramFontScale = cardLayout.paramLabelScale;
    let weightSize = cardLayout.paramValueScale;
    let weightTitleW = measureTextWidth(render.modelFontBuf, nParamsText, paramFontScale);
    let weightCountW = measureTextWidth(render.modelFontBuf, weightCountText, weightSize);
    // let infoText = "goal: sort 6 letters from { A, B, C } into ascending order";
    // writeTextToBuffer(render.modelFontBuf, infoText, titleColor, tl.x + 2, tl.y + paramHeight + 2, 4, mtx);

    let paramOff = cardLayout.paramY;
    let weightX = midX - (weightCountW + weightTitleW) / 2;

    writeTextToBuffer(
        render.modelFontBuf,
        nParamsText,
        detailColor,
        weightX,
        paramOff - paramFontScale / 2,
        paramFontScale,
        mtx,
        theme.typography.fontFaceName,
    );
    writeTextToBuffer(
        render.modelFontBuf,
        weightCountText,
        titleColor,
        weightX + weightTitleW,
        paramOff - weightSize / 2,
        weightSize,
        mtx,
        theme.typography.fontFaceName,
    );
    // addParam("C (channels) = ", C.toString(), dimStyleColor(DimStyle.C));
    // addParam("T (time) = ", T.toString(), dimStyleColor(DimStyle.T));
    // addParam("B (batches) = ", B.toString(), dimStyleColor(DimStyle.B));
    // paramOff = tl.y + 2;
    // paramLeft += 35;
    // addParam("n_vocab = ", vocabSize.toString(), dimStyleColor(DimStyle.n_vocab));
    // addParam("n_layers = ", nBlocks.toString(), dimStyleColor(DimStyle.n_layers));
    // addParam("n_heads = ", nHeads.toString(), dimStyleColor(DimStyle.n_heads));

    // function addParam(name: string, value: string, color: Vec4 = borderColor) {
    //     let y = paramOff;
    //     let w = measureTextWidth(render.modelFontBuf, name, paramFontScale);
    //     let numW = measureTextWidth(render.modelFontBuf, value, paramFontScale);
    //     let left = paramLeft;
    //     writeTextToBuffer(render.modelFontBuf, name, color,  left - w        , y, paramFontScale, mtx);
    //     writeTextToBuffer(render.modelFontBuf, value, color, left + maxLen * numWidth - numW, y, paramFontScale, mtx);
    //     paramOff += paramFontScale * paramLineHeight;
    // }

    // addLine(render.lineRender, thick, borderColor, new Vec3(tl.x, tl.y + paramHeight), new Vec3(br.x, tl.y + paramHeight), n, mtx);

    renderOutputAtBottom(state);

    renderInputAtTop(state);
}

export function sortABCInputTokenToString(a: number) {
    return String.fromCharCode('A'.charCodeAt(0) + a); // just A, B, C supported!
}

export interface IInputBoxOpts {
    tokMixes?: IColorMix | null;
    idxMixes?: IColorMix | null;
}

export function renderInputBoxes(state: IProgramState, layout: IGptModelLayout, tl: Vec3, br: Vec3, cellW: number, fontSize: number, lineOpts: ILineOpts, opts?: IInputBoxOpts) {
    let theme = getCurrentMicroVizTheme();
    let render = state.render;
    let { T } = layout.shape;
    let inCellH = br.y - tl.y;

    let tokTextOpts = themedFont(fontSize, theme.scene.modelCardText, lineOpts.mtx);
    let idxTextOpts = themedFont(fontSize * 0.6, theme.scene.modelCardMutedText, lineOpts.mtx);

    let dimmedTokTextOpts: IFontOpts = { ...tokTextOpts, color: tokTextOpts.color.mul(0.3) };
    let dimmedIdxTextOpts: IFontOpts = { ...idxTextOpts, color: idxTextOpts.color.mul(0.3) };

    drawLineRect(render, tl, br, lineOpts);

    let tokens = layout.model?.inputTokens.localBuffer;

    for (let i = 0; i < T; i++) {

        if (i > 0) {
            let lineX = tl.x + i * cellW;
            drawLine(render.lineRender, new Vec3(lineX, tl.y, 0), new Vec3(lineX, br.y, 0), lineOpts);
        }

        if (tokens && i < layout.model!.inputLen) {
            let cx = tl.x + (i + 0.5) * cellW;

            let tokOpts = { ...tokTextOpts, color: mixColorValues(opts?.tokMixes ?? null, tokTextOpts.color, i) };
            let tokIdxOpts = { ...idxTextOpts, color: mixColorValues(opts?.idxMixes ?? null, idxTextOpts.color, i) };
            let tokStr = sortABCInputTokenToString(tokens[i]);
            let tokW = measureText(render.modelFontBuf, tokStr, tokTextOpts);
            let idxW = measureText(render.modelFontBuf, tokens[i].toString(), idxTextOpts);
            let totalH = tokTextOpts.size + idxTextOpts.size;
            let top = tl.y + (inCellH - totalH) / 2;

            drawText(render.modelFontBuf, tokStr, cx - tokW / 2, top, tokOpts);
            drawText(render.modelFontBuf, tokens[i].toString(),  cx - idxW / 2, top + tokTextOpts.size, tokIdxOpts);
        }

    }
}

export interface IOutputBoxOpts {
    opacity?: number;
    boldLast?: boolean;
    tokMixes?: IColorMix | null;
}

export function renderOutputBoxes(state: IProgramState, layout: IGptModelLayout, tl: Vec3, br: Vec3, cellW: number, fontSize: number, lineOpts: ILineOpts, opts?: IOutputBoxOpts) {
    let theme = getCurrentMicroVizTheme();
    let render = state.render;
    let { T, vocabSize } = layout.shape;
    let outCellH = br.y - tl.y;

    let opacity = opts?.opacity ?? 1.0;
    let boldLast = opts?.boldLast ?? true;

    lineOpts = { ...lineOpts, color: lineOpts.color.mul(opacity ?? 1.0) };
    let tokTextOpts = themedFont(fontSize, theme.scene.modelCardText.mul(opacity), lineOpts.mtx);
    let idxTextOpts = themedFont(fontSize * 0.6, theme.scene.modelCardMutedText.mul(opacity), lineOpts.mtx);

    let dimmedTokTextOpts: IFontOpts = { ...tokTextOpts, color: tokTextOpts.color.mul(0.3) };
    let dimmedIdxTextOpts: IFontOpts = { ...idxTextOpts, color: idxTextOpts.color.mul(0.3) };

    drawLineRect(render, tl, br, lineOpts);

    let sortedOutput = layout.model?.sortedBuf;

    for (let i = 0; i < T; i++) {
        if (i > 0) {
            let lineX = tl.x + i * cellW;
            drawLine(render.lineRender, new Vec3(lineX, tl.y, 0), new Vec3(lineX, br.y, 0), lineOpts);
        }

        if (sortedOutput && i < layout.model!.inputLen) {
            let usedSoFar = 0.0;
            let cx = tl.x + (i + 0.5) * cellW;

            for (let j = 0; j < vocabSize; j++) {
                let tokIdx = sortedOutput[(i * vocabSize + j) * 2 + 0];
                let tokProb = sortedOutput[(i * vocabSize + j) * 2 + 1];

                let partTop = tl.y + usedSoFar * outCellH;
                let partH = tokProb * outCellH;

                let dimmed = i < layout.model!.inputLen - 1 || !boldLast;

                let color = mixColorValues(opts?.tokMixes ?? null, tokTextOpts.color, i);
                if (dimmed) {
                    color = color.mul(0.3);
                }

                let tokOpts = { ...tokTextOpts, color };
                let idxOpts = { ...idxTextOpts, color: color.mul(0.6) };

                let tokStr = sortABCInputTokenToString(tokIdx);
                let tokW = measureText(render.modelFontBuf, tokStr, tokOpts);
                let idxW = measureText(render.modelFontBuf, tokIdx.toString(), idxOpts);
                let textH = tokOpts.size + idxOpts.size;
                let top = partTop + (partH - textH) / 2;

                if (partH > textH) {
                    drawText(render.modelFontBuf, tokStr, cx - tokW / 2, top, tokOpts);
                    drawText(render.modelFontBuf, tokIdx.toString(),  cx - idxW / 2, top + tokOpts.size, idxOpts);
                }

                usedSoFar += tokProb;

                drawLine(render.lineRender, new Vec3(cx - cellW/2, partTop + partH, 0), new Vec3(cx + cellW/2, partTop + partH, 0), lineOpts);
                if (usedSoFar >= 1.0 - 1e-4) {
                    break;
                }
            }
        }
    }
}

export function mixColorValues(mixes: IColorMix | null, baseColor: Vec4, idx: number) {
    if (!mixes) {
        return baseColor;
    }
    let mix = mixes.mixes[idx] ?? 0.0;
    return Vec4.lerp(mixes.color1 ?? baseColor, mixes.color2, mix);
}

let _lineRectArr = new Float32Array(3 * 4);
export function drawLineRect(render: IRenderState, tl: Vec3, br: Vec3, opts: ILineOpts) {

    _lineRectArr[0] = tl.x;
    _lineRectArr[1] = tl.y;
    _lineRectArr[2] = 0;
    _lineRectArr[3] = br.x;
    _lineRectArr[4] = tl.y;
    _lineRectArr[5] = 0;
    _lineRectArr[6] = br.x;
    _lineRectArr[7] = br.y;
    _lineRectArr[8] = 0;
    _lineRectArr[9] = tl.x;
    _lineRectArr[10] = br.y;
    _lineRectArr[11] = 0;

    drawLineSegs(render.lineRender, _lineRectArr, makeLineOpts({ ...opts, closed: true }));
}

function numberToCommaSep(a: number) {
    let s = a.toString();
    let out = "";
    for (let i = 0; i < s.length; i++) {
        if (i > 0 && (s.length - i) % 3 == 0) {
            out += ",";
        }
        out += s[i];
    }
    return out;
}

function renderInputAtTop(state: IProgramState) {
    let theme = getCurrentMicroVizTheme();
    let layout = state.layout;
    let render = state.render;

    let inputTokBlk = layout.idxObj;

    let topMid = new Vec3(inputTokBlk.x + inputTokBlk.dx/2, inputTokBlk.y - layout.margin);

    let inCellH = 10;
    let inCellW = 6;

    let nCells = layout.shape.T;
    let tl = new Vec3(topMid.x - inCellW * nCells / 2, topMid.y - inCellH);
    let br = new Vec3(topMid.x + inCellW * nCells / 2, topMid.y);

    let outputOpacity = state.display.topOutputOpacity ?? 1.0;

    let lineOpts = makeLineOpts({ color: theme.scene.modelCardDivider, mtx: new Mat4f(), thick: 1.5 });
    let titleTextOpts = themedFont(1.9, theme.scene.modelCardMutedText, lineOpts.mtx);

    renderInputBoxes(state, layout, tl, br, inCellW, 4, lineOpts, { tokMixes: state.display.tokenColors, idxMixes: state.display.tokenIdxColors });

    let inputTitle = "Input";
    drawText(render.modelFontBuf, inputTitle, tl.x, tl.y - lineHeight(titleTextOpts), titleTextOpts);

    {
        let outCellH = 12;
        let outBr = new Vec3(br.x, tl.y - 4);
        let outTl = new Vec3(tl.x, outBr.y - outCellH);
        renderOutputBoxes(state, layout, outTl, outBr, inCellW, 4, lineOpts, { opacity: outputOpacity, boldLast: outputOpacity < 1.0, tokMixes: state.display.tokenOutputColors });

        let outputTitle = "Output";
        let outputTextOpts = { ...titleTextOpts, color: titleTextOpts.color.mul(outputOpacity) };
        drawText(render.modelFontBuf, outputTitle, outTl.x, outTl.y - lineHeight(titleTextOpts), outputTextOpts);
    }

    for (let i = 0; i < nCells; i++) {
        let mixes = state.display.tokenIdxColors;

        let lineOptsLocal = { ...lineOpts, color: mixColorValues(mixes, lineOpts.color, i) };

        let tx = tl.x + (i + 0.5) * inCellW;
        let ty = tl.y + layout.cell + inCellH;
        let bx = cellPosition(layout, inputTokBlk, Dim.X, i) + 0.5 * layout.cell;
        let by = inputTokBlk.y - 0.5 * layout.cell;

        let midY1 = lerp(by, ty, 1/6);
        let midY2 = lerp(by, ty, 3/4);

        drawLine(state.render.lineRender, new Vec3(bx, by), new Vec3(bx, midY1), lineOptsLocal);
        drawLine(state.render.lineRender, new Vec3(bx, midY1), new Vec3(tx, midY2), lineOptsLocal);
        drawLine(state.render.lineRender, new Vec3(tx, midY2), new Vec3(tx, ty), lineOptsLocal);

        let arrLen = 0.6;
        let arrowLeft = new Vec3(bx - arrLen, by - arrLen);
        let arrowRight = new Vec3(bx + arrLen, by - arrLen);
        drawLine(state.render.lineRender, arrowLeft, new Vec3(bx, by), lineOptsLocal);
        drawLine(state.render.lineRender, arrowRight, new Vec3(bx, by), lineOptsLocal);
    }
}

function renderOutputAtBottom(state: IProgramState) {
    let theme = getCurrentMicroVizTheme();
    let layout = state.layout;

    let softmax = layout.logitsSoftmax;


    let topMid = new Vec3(softmax.x + softmax.dx/2, softmax.y + softmax.dy + layout.margin);

    let outCellH = 10;
    let outCellW = 6;

    let nCells = layout.shape.T;
    let tl = new Vec3(topMid.x - outCellW * nCells / 2, topMid.y);
    let br = new Vec3(topMid.x + outCellW * nCells / 2, topMid.y + outCellH);

    let lineOpts = makeLineOpts({ color: theme.scene.modelCardDivider, mtx: new Mat4f(), thick: 1.5 });

    renderOutputBoxes(state, layout, tl, br, outCellW, 4, lineOpts, { boldLast: true, tokMixes: state.display.tokenOutputColors });

    for (let i = 0; i < nCells; i++) {
        let tx = cellPosition(layout, softmax, Dim.X, i) + 0.5 * layout.cell;
        let ty = softmax.y + softmax.dy + 0.5 * layout.cell;
        let bx = tl.x + (i + 0.5) * outCellW;
        let by = tl.y - layout.cell;

        let midY1 = lerp(ty, by, 1/6);
        let midY2 = lerp(ty, by, 3/4);

        drawLine(state.render.lineRender, new Vec3(tx, ty), new Vec3(tx, midY1), lineOpts);
        drawLine(state.render.lineRender, new Vec3(tx, midY1), new Vec3(bx, midY2), lineOpts);
        drawLine(state.render.lineRender, new Vec3(bx, midY2), new Vec3(bx, by), lineOpts);

        let arrLen = 0.6;
        let arrowLeft = new Vec3(bx - arrLen, by - arrLen);
        let arrowRight = new Vec3(bx + arrLen, by - arrLen);
        drawLine(state.render.lineRender, arrowLeft, new Vec3(bx, by), lineOpts);
        drawLine(state.render.lineRender, arrowRight, new Vec3(bx, by), lineOpts);
    }

}
