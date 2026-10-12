import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyManimHouseStyle,
  HOUSE_LIGHT_PY,
  HOUSE_STYLE,
  HOUSE_STYLE_MARKER,
} from "../src/lib/visual-style";

const exec = promisify(execFile);

async function pythonHas(module: string): Promise<boolean> {
  try {
    await exec("python3", ["-c", `import ${module}`], { timeout: 60_000 });
    return true;
  } catch {
    return false;
  }
}

const legacyScript = `from manim import *
from manim_voiceover import VoiceoverScene
config.background_color = "#050505"

class Scene01Intro(Scene):
    def construct(self):
        self.camera.background_color = BLACK
        title = Text("The Derivative", font="EB Garamond", disable_ligatures=True, font_size=48)
        label = Text("tangent line", disable_ligatures=True, font="EB Garamond", font_size=28, color=YELLOW)
        self.add(title, label)
`;

test("house style removes the truncating ligature flag and old typography", () => {
  const styled = applyManimHouseStyle(legacyScript);
  assert.doesNotMatch(styled, /disable_ligatures|EB Garamond|#050505/);
  assert.ok(styled.includes(`font="${HOUSE_STYLE.font}"`));
  assert.ok(styled.includes("self.camera.background_color = BG"));
  assert.equal(styled.split(HOUSE_STYLE_MARKER).length, 2);
  assert.ok(
    styled.indexOf(HOUSE_STYLE_MARKER) >
      styled.indexOf("from manim_voiceover import VoiceoverScene"),
  );
});

test("house style is idempotent", () => {
  const once = applyManimHouseStyle(legacyScript);
  assert.equal(applyManimHouseStyle(once), once);
  assert.ok(
    once.includes(`config.background_color = "${HOUSE_STYLE.background}"`),
  );
});

test("house style renders full labels and remaps Manim colors", async (t) => {
  if (!(await pythonHas("manim"))) {
    t.skip("manim is not installed");
    return;
  }
  const folder = await mkdtemp(join(tmpdir(), "eduvids-house-style-"));
  try {
    const script = join(folder, "probe.py");
    await writeFile(
      script,
      `${applyManimHouseStyle(legacyScript.replace(/class Scene01Intro[\s\S]*/, ""))}
title = Text("The Derivative", font_size=48)
label = Text("tangent line", font_size=28, color=YELLOW)
axis = NumberLine()
# The truncation bug swaps the final glyph for the wrong outline, so compare
# the last glyph with a standalone "e" set in the same face.
same_e = len(title[-1].points) == len(Text("e", font_size=48)[0].points) and len(label[-1].points) == len(Text("e", font_size=28)[0].points)
print(same_e, title[0].get_fill_color().to_hex(), label[0].get_fill_color().to_hex(), axis.get_color().to_hex())
`.replace(/^from manim_voiceover.*$/m, ""),
    );
    const { stdout } = await exec("python3", [script], {
      cwd: folder,
      timeout: 120_000,
    });
    const [fullLabels, ink, accent, axis] = stdout
      .trim()
      .split(/\s+/)
      .slice(-4);
    assert.equal(fullLabels, "True", "labels end in their real final letter");
    assert.equal(ink, HOUSE_STYLE.ink);
    assert.equal(accent, HOUSE_STYLE.yellow);
    assert.equal(axis, HOUSE_STYLE.muted);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("thumbnail spotlight lifts only the background around the hero", async (t) => {
  if (!(await pythonHas("numpy")) || !(await pythonHas("PIL"))) {
    t.skip("numpy or Pillow is not installed");
    return;
  }
  const folder = await mkdtemp(join(tmpdir(), "eduvids-light-"));
  try {
    const helper = join(folder, "house_light.py");
    await writeFile(helper, HOUSE_LIGHT_PY);
    const frame = join(folder, "frame.png");
    const lit = join(folder, "lit.png");
    await exec("python3", [
      "-c",
      `from PIL import Image
im = Image.new("RGB", (320, 180), "${HOUSE_STYLE.background}")
for x in range(100, 220):
    im.putpixel((x, 90), (88, 196, 221))
im.save(${JSON.stringify(frame)})`,
    ]);
    await exec("python3", [helper, "thumbnail", frame, lit]);
    const { stdout } = await exec("python3", [
      "-c",
      `from PIL import Image
l = Image.open(${JSON.stringify(lit)}).convert("RGB")
print(l.getpixel((160, 90)), l.getpixel((160, 80)), l.getpixel((0, 0)))`,
    ]);
    const values = [...stdout.matchAll(/\((\d+), (\d+), (\d+)\)/g)].map(
      (match) => match.slice(1).map(Number),
    );
    const [line, nearHero, corner] = values;
    assert.deepEqual(line, [88, 196, 221], "content pixels are untouched");
    assert.ok(nearHero![0]! >= 30, "background near the hero is lit");
    assert.ok(corner![0]! <= 12, "frame edges stay at the background");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
