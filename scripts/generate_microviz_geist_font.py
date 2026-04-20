#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import math
from pathlib import Path
from struct import pack
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


CHARSET = "".join(chr(codepoint) for codepoint in range(32, 127)) + "·…²‧—Σγβσμε√π"
FONT_SIZE = 56
PADDING = 6
ATLAS_WIDTH = 1024


def encode_int16(values: Iterable[int]) -> str:
    raw = b"".join(pack("<h", int(value)) for value in values)
    return base64.b64encode(raw).decode("ascii")


def build_face(font_path: Path, face_name: str) -> tuple[dict, Image.Image]:
    font = ImageFont.truetype(str(font_path), FONT_SIZE)
    ascent, descent = font.getmetrics()
    line_height = FONT_SIZE + PADDING
    base = ascent

    atlas_height = 512
    atlas = Image.new("RGBA", (ATLAS_WIDTH, atlas_height), (0, 0, 0, 255))

    x_cursor = PADDING
    y_cursor = PADDING
    row_height = 0

    char_values: list[int] = []

    for index, char in enumerate(CHARSET):
        bbox = font.getbbox(char, anchor="ls")
        if bbox is None:
            continue

        left, top, right, bottom = bbox
        width = max(0, right - left)
        height = max(0, bottom - top)
        advance = int(round(font.getlength(char)))

        glyph_width = max(1, width)
        glyph_height = max(1, height)
        draw_width = glyph_width + PADDING * 2
        draw_height = glyph_height + PADDING * 2

        if x_cursor + draw_width > ATLAS_WIDTH:
            x_cursor = PADDING
            y_cursor += row_height + PADDING
            row_height = 0

        if y_cursor + draw_height > atlas_height:
            atlas_height *= 2
            grown = Image.new("RGBA", (ATLAS_WIDTH, atlas_height), (0, 0, 0, 255))
            grown.paste(atlas, (0, 0))
            atlas = grown

        if width > 0 and height > 0:
            glyph = Image.new("RGBA", (glyph_width, glyph_height), (0, 0, 0, 255))
            draw = ImageDraw.Draw(glyph)
            draw.text((-left, -top), char, font=font, fill=(255, 255, 255, 255), anchor="ls")
            atlas.paste(glyph, (x_cursor + PADDING, y_cursor + PADDING))

        char_values.extend(
            [
                ord(char),
                index,
                ord(char),
                x_cursor + PADDING,
                y_cursor + PADDING,
                width,
                height,
                left,
                base + top,
                advance,
                0,
                0,
            ]
        )

        x_cursor += draw_width + PADDING
        row_height = max(row_height, draw_height)

    used_height = max(1, y_cursor + row_height + PADDING)
    cropped_height = 2 ** math.ceil(math.log2(used_height))
    atlas = atlas.crop((0, 0, ATLAS_WIDTH, cropped_height))

    face = {
        "name": face_name,
        "common": {
            "lineHeight": line_height,
            "base": base,
            "scaleW": atlas.width,
            "scaleH": atlas.height,
            "pages": 1,
            "packed": 0,
            "alphaChnl": 0,
            "redChnl": 0,
            "greenChnl": 0,
            "blueChnl": 0,
        },
        "info": {
            "face": face_name,
            "size": FONT_SIZE,
            "bold": 0,
            "italic": 0,
            "charset": CHARSET,
            "unicode": 1,
            "stretchH": 100,
            "smooth": 1,
            "aa": 1,
            "padding": [0, 0, 0, 0],
            "spacing": [0, 0],
            "outline": 0,
        },
        "chars": encode_int16(char_values),
        "kernings": "",
    }

    return face, atlas


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate the MicroViz viewer font atlas.")
    parser.add_argument(
        "--font-path",
        default="node_modules/geist/dist/fonts/geist-sans/Geist-Medium.ttf",
    )
    parser.add_argument(
        "--face-name",
        default="Geist-Medium",
    )
    parser.add_argument(
        "--atlas-output",
        default="public/fonts/microviz-geist-mono-atlas.png",
    )
    parser.add_argument(
        "--json-output",
        default="public/fonts/microviz-geist-mono.json",
    )
    args = parser.parse_args()

    font_path = Path(args.font_path)
    atlas_output = Path(args.atlas_output)
    json_output = Path(args.json_output)

    face, atlas = build_face(font_path, args.face_name)
    atlas_output.parent.mkdir(parents=True, exist_ok=True)
    json_output.parent.mkdir(parents=True, exist_ok=True)

    atlas.save(atlas_output)
    payload = {
        "faces": [face],
        "pages": [atlas_output.name],
    }
    json_output.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
