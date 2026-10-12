"""Thumbnail regressions using actual TeX glyphs and Manim geometry."""
import json
from pathlib import Path
import sys
import tempfile

import numpy as np
from manim import config

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "src/lib/thumbnail"))
import renderer as r


with tempfile.TemporaryDirectory(prefix="thumbnail-layout-") as folder:
    config.verbosity = "ERROR"
    config.media_dir = folder
    Path(folder, "Tex").mkdir()
    fonts = str(REPO / "src/lib/thumbnail/fonts")
    cool, warm = r.PALETTES["teal-amber"]
    ts = r.Typesetter(fonts, cool, warm, region_w=r.u(528))
    equation = r.hero_equation({"notation": r"P(A)=\hl{x}"}, cool, warm, ts, False)
    colours = {glyph.get_fill_color().to_hex().upper() for glyph in equation.graphics.family_members_with_points()}
    assert r.INK in colours and cool in colours, colours
    assert warm not in colours, colours

    # A highlighted relation must keep TeX's ordinary relation spacing.
    plain = ts.math("x=y", 82)
    marked = ts.math(r"x\hl{=}y", 82)
    assert abs(plain.width - marked.width) < 0.01, (plain.width, marked.width)
    assert cool in {glyph.get_fill_color().to_hex().upper() for glyph in marked.family_members_with_points()}

    specs = json.loads((REPO / "docs/thumbnail-layout/specs.json").read_text())
    for safe in (False, True):
        for spec in specs:
            _, report = r.compose(spec, fonts, safe)
            assert report["visual"] == spec["visual"]["type"], report
            assert not report["warnings"], report
    hero = r.hero_energy_levels({}, cool, warm, ts, False)
    levels = hero.graphics[0]
    assert abs(levels[0].width - levels[1].width) < 1e-6
    assert np.isclose(hero.labels[0].anchor[0], hero.labels[1].anchor[0])
    assert hero.labels[0].mob.height * r.PX > 30
    assert hero.labels[1].mob.height * r.PX > 30

print("Thumbnail geometry, label sizes, safe fallback and equation colours passed")
