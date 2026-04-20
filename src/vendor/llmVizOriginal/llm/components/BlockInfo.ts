import type { IProgramState } from "../Program";
import { Mat4f } from "@llmviz/utils/matrix";
import { Vec3 } from "@llmviz/utils/vector";
import { getCurrentMicroVizTheme, type MicroVizTheme } from "../../../../viz/microViz/theme";
import { measureTextWidth, writeTextToBuffer } from "../render/fontRender";

const STRUCTURAL_LABELS = new Set([
    "attention",
    "projection",
    "Q",
    "K",
    "V",
]);

function normalizeLabelName(name: string) {
    switch (name) {
        case "Q weights":
        case "Q vectors":
            return "Q";
        case "K weights":
        case "K vectors":
            return "K";
        case "V weights":
        case "V vectors":
            return "V";
        default:
            return name;
    }
}

function shouldDrawLabel(name: string) {
    return name.trim().length > 0 && !STRUCTURAL_LABELS.has(name);
}

function sceneMidX(state: IProgramState) {
    let minX = Infinity;
    let maxX = -Infinity;

    for (let cube of state.layout.cubes) {
        minX = Math.min(minX, cube.x);
        maxX = Math.max(maxX, cube.x + cube.dx);
    }

    return (minX + maxX) * 0.5;
}

function pickRepresentativeBlocks(state: IProgramState) {
    let candidates = new Map<string, IProgramState["layout"]["cubes"][number]>();

    for (let blk of state.layout.cubes) {
        if (blk.opacity <= 0) {
            continue;
        }

        let labelName = normalizeLabelName(blk.name);
        if (!shouldDrawLabel(labelName)) {
            continue;
        }

        let existing = candidates.get(labelName);
        if (!existing) {
            candidates.set(labelName, blk);
            continue;
        }

        let blkDepth = blk.z + blk.dz * 0.5;
        let existingDepth = existing.z + existing.dz * 0.5;
        if (blkDepth > existingDepth || (blkDepth === existingDepth && blk.idx < existing.idx)) {
            candidates.set(labelName, blk);
        }
    }

    return [...candidates.entries()]
        .map(([labelName, blk]) => ({ labelName, blk }))
        .sort((a, b) => a.blk.idx - b.blk.idx);
}

type LabelPlacement = {
    text: string;
    textX: number;
    textY: number;
    textWidth: number;
    textHeight: number;
    faceZ: number;
    textColor: MicroVizTheme["scene"]["blockInfoText"];
    shadowColor: MicroVizTheme["scene"]["blockInfoBackground"];
};

function overlaps(a: LabelPlacement, b: LabelPlacement) {
    return !(
        a.textX + a.textWidth <= b.textX ||
        b.textX + b.textWidth <= a.textX ||
        a.textY + a.textHeight <= b.textY ||
        b.textY + b.textHeight <= a.textY
    );
}

function resolvePlacementOverlap(
    placement: LabelPlacement,
    placed: LabelPlacement[],
) {
    let nextY = placement.textY;
    let guard = 0;

    while (guard < 12) {
        let trial = { ...placement, textY: nextY };
        let blocker = placed.find((other) => overlaps(trial, other));
        if (!blocker) {
            return trial;
        }
        nextY = blocker.textY + blocker.textHeight + 2;
        guard += 1;
    }

    return { ...placement, textY: nextY };
}

function buildPlainWorldLabel(
    state: IProgramState,
    text: string,
    blk: IProgramState["layout"]["cubes"][number],
    midX: number,
    theme: MicroVizTheme,
): LabelPlacement {
    let fontSize = theme.typography.scale.md;
    let textWidth = measureTextWidth(
        state.render.modelFontBuf,
        text,
        fontSize,
        theme.typography.fontFaceName,
    );
    let faceZ = blk.z + blk.dz + 0.02;
    let textOpacity = Math.max(0, Math.min(1, blk.opacity));
    let textColor = theme.scene.blockInfoText.mul(textOpacity);
    let shadowColor = theme.scene.blockInfoBackground.mul(Math.min(0.88, 0.28 + textOpacity * 0.44));
    let fitsOnFace = textWidth <= blk.dx - 6 && blk.dy >= fontSize + 4;

    let textX = blk.x + 2;
    let textY = blk.y + 2;

    if (fitsOnFace) {
        textX = blk.x + (blk.dx - textWidth) * 0.5;
        textY = blk.y + 2;
    } else {
        let placeLeft = blk.x + blk.dx * 0.5 < midX;
        let gap = 4;
        textX = placeLeft ? blk.x - textWidth - gap : blk.x + blk.dx + gap;
        textY = blk.y + (blk.dy - fontSize) * 0.5;
    }

    return {
        text,
        textX,
        textY,
        textWidth,
        textHeight: fontSize,
        faceZ,
        textColor,
        shadowColor,
    };
}

function drawPlainWorldLabel(state: IProgramState, placement: LabelPlacement, theme: MicroVizTheme) {
    let mtx = Mat4f.fromTranslation(new Vec3(0, 0, placement.faceZ));
    let shadowOffset = 0.7;

    writeTextToBuffer(
        state.render.modelFontBuf,
        placement.text,
        placement.shadowColor,
        placement.textX + shadowOffset,
        placement.textY + shadowOffset,
        placement.textHeight,
        mtx,
        theme.typography.fontFaceName,
    );

    writeTextToBuffer(
        state.render.modelFontBuf,
        placement.text,
        placement.textColor,
        placement.textX,
        placement.textY,
        placement.textHeight,
        mtx,
        theme.typography.fontFaceName,
    );
}

export function drawBlockInfo(
    state: IProgramState,
    theme: MicroVizTheme = getCurrentMicroVizTheme(),
) {
    let midX = sceneMidX(state);
    let placed: LabelPlacement[] = [];

    for (let { labelName, blk } of pickRepresentativeBlocks(state)) {
        let preferred = buildPlainWorldLabel(state, labelName, blk, midX, theme);
        let resolved = resolvePlacementOverlap(preferred, placed);
        placed.push(resolved);
        drawPlainWorldLabel(state, resolved, theme);
    }
}
