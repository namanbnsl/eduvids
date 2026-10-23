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
            assert all(" at scale " in warning for warning in report["warnings"]), report
    hero = r.hero_energy_levels({}, cool, warm, ts, False)
    levels = hero.graphics[0]
    assert abs(levels[0].width - levels[1].width) < 1e-6
    assert np.isclose(hero.labels[0].anchor[0], hero.labels[1].anchor[0])
    assert hero.labels[0].mob.height * r.PX > 30
    assert hero.labels[1].mob.height * r.PX > 30

    # Click-through devices: every new visual composes cleanly in both modes,
    # the struck word and callout survive in full mode, and the visual-only
    # slot never takes a callout.
    ctr = REPO / "docs/thumbnail-ctr"
    fixtures = json.loads((ctr / "after.json").read_text()) + json.loads((ctr / "package-after.json").read_text())
    fixtures += [{"headline": "", "visual": {"type": "spiral"}}, {"headline": "Same start", "callout": "here", "visual": {"type": "chaos", "shape": "pendulum"}}]
    fixtures += [{"headline": "Zero area", "callout": "a copy", "visual": {"type": "fractal", "shape": shape}} for shape in ("sierpinski", "koch", "tree")]
    for safe in (False, True):
        for spec in fixtures:
            _, report = r.compose(spec, fonts, safe)
            # Shrinking to make room for labels is expected; nothing else is.
            assert all(" at scale " in warning for warning in report["warnings"]), (spec, report)
            if not safe:
                assert report["visual"] == spec["visual"]["type"], report
                if spec.get("strike"):
                    assert report.get("strike") == spec["strike"], report
    _, report = r.compose({"headline": "Counted twice", "accent": "twice", "callout": "this part", "visual": {"type": "geometry", "shape": "venn"}}, fonts, False)
    assert report.get("callout") == "this part", report
    _, report = r.compose({"headline": "", "callout": "this part", "visual": {"type": "geometry", "shape": "venn"}}, fonts, False)
    assert "callout" not in report, report

    # The strike never swallows the accent or part of a word.
    assert r.strike_range("Height Area is chance", "Height", (7, 11)) == (0, 6)
    assert r.strike_range("Height Area is chance", "Area", (7, 11)) is None
    assert r.strike_range("Heights rise", "Height", None) is None
    assert r.callout_copy(r"\input{x}", ts, False) is None
    assert r.clean_number("67%") == "67%" and r.clean_number("os.system") == ""

    # Every new composition keeps the same collision, safe-area and duration
    # badge checks, including fallback mode and molecule labels inside atoms.
    review = json.loads((REPO / "docs/packaging-quality/specs.json").read_text())
    review += [{"headline": "Linear bonds", "visual": {"type": "molecule", "shape": "carbon_dioxide"}}]
    for safe in (False, True):
        for spec in review:
            for layout in ("split_left", "split_right", "poster", "visual_only"):
                _, report = r.compose({**spec, "layout": layout}, fonts, safe)
                assert report["visual"] == spec["visual"]["type"], (spec, layout, report)
                assert report["layout"] == layout
                if layout == "visual_only":
                    assert "size" not in report and "callout" not in report
    water = r.hero_molecule({"shape": "water"}, cool, warm, ts, False)
    center = water.graphics[2].get_center()
    bonds = [water.graphics[index].get_center() - center for index in (3, 4)]
    angle = np.degrees(np.arccos(np.dot(*bonds) / (np.linalg.norm(bonds[0]) * np.linalg.norm(bonds[1]))))
    assert np.isclose(angle, 104.5), angle

print("Thumbnail geometry, label sizes, safe fallback, click-through devices and equation colours passed")
