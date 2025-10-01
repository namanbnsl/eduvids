import { Sandbox } from "@e2b/code-interpreter";

export interface RenderRequest {
  script: string;
  prompt: string;
}

export async function renderManimVideo({
  script,
  prompt: _prompt,
}: RenderRequest): Promise<string> {
  let sandbox: Sandbox | null = null;

  try {
    sandbox = await Sandbox.create("manim-ffmpeg-latex-voiceover-watermark", {
      timeoutMs: 1200000,
    });
    console.log("E2B sandbox created successfully");

    const scriptPath = `/home/user/script.py`;
    const mediaDir = `/home/user/media`;
    const outputDir = `${mediaDir}/videos/script/480p15`;

    // Write Manim script
    await sandbox.files.write(scriptPath, script);
    console.log("Manim script written to sandbox");

    const checkLatex = await sandbox.commands.run(`latex --version`, {
      onStdout: (d) => console.log(d),
      onStderr: (d) => console.error(d),
    });

    if (checkLatex.exitCode !== 0) {
      throw new Error(
        `Latex failed: ${checkLatex.exitCode}\n${checkLatex.stderr}`
      );
    }

    // Run manim
    const proc = await sandbox.commands.run(
      `manim ${scriptPath} MyScene --media_dir ${mediaDir} -ql --disable_caching --format=mp4`,
      {
        onStdout: (d) => console.log(d),
        onStderr: (d) => console.error(d),
      }
    );

    if (proc.exitCode !== 0) {
      throw new Error(`Manim failed: ${proc.exitCode}\n${proc.stderr}`);
    }

    // Find output file
    const files = (await sandbox.files.list(outputDir)) as Array<{
      name: string;
    }>;
    const videoFile = files.find((f) => f.name.endsWith(".mp4"));
    if (!videoFile) throw new Error("No .mp4 file produced");

    const videoPath = `${outputDir}/${videoFile.name}`;
    console.log("Video file candidate:", videoPath);

    // Validate with ffprobe
    const probe = await sandbox.commands.run(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${videoPath}`
    );
    const duration = parseFloat((probe.stdout || "").trim());
    console.log("ffprobe duration:", duration);

    if (!duration || duration <= 0) {
      throw new Error("Rendered video has 0s duration — aborting upload");
    }

    // Watermark the video inside the sandbox using OpenCV before upload
    const watermarkedPath = `${outputDir}/watermarked.mp4`;

    // Write a small Python script that applies a semi-transparent text watermark
    const watermarkScriptPath = `/home/user/watermark.py`;
    const watermarkText = "Eureka";
    const pythonScript = `import sys\nimport cv2\n\nif len(sys.argv) < 3:\n    print('usage: watermark.py <in> <out> [text]')\n    sys.exit(2)\n\nin_path = sys.argv[1]\nout_path = sys.argv[2]\ntext = sys.argv[3] if len(sys.argv) > 3 else 'Eureka'\n\ncap = cv2.VideoCapture(in_path)\nif not cap.isOpened():\n    print('failed to open input')\n    sys.exit(3)\n\nfourcc = cv2.VideoWriter_fourcc(*'mp4v')\nfps = cap.get(cv2.CAP_PROP_FPS) or 30.0\nwidth = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))\nheight = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))\nwriter = cv2.VideoWriter(out_path, fourcc, fps, (width, height))\nif not writer.isOpened():\n    print('failed to open writer')\n    sys.exit(4)\n\nfont = cv2.FONT_HERSHEY_SIMPLEX\nfont_scale = max(0.5, min(width, height) / 720.0)\nthickness = max(1, int(2 * font_scale))\nalpha = 0.5\n\nwhile True:\n    ret, frame = cap.read()\n    if not ret:\n        break\n\n    overlay = frame.copy()\n    (tw, th), _ = cv2.getTextSize(text, font, font_scale, thickness)\n    x = width - tw - 20\n    y = height - 20\n\n    # Draw filled rectangle for better readability (transparent)\n    cv2.rectangle(overlay, (x - 10, y - th - 10), (x + tw + 10, y + 10), (0, 0, 0), -1)\n    # Blend overlay\n    cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)\n\n    # Draw the text itself (less transparent for crispness)\n    cv2.putText(frame, text, (x, y), font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)\n\n    writer.write(frame)\n\ncap.release()\nwriter.release()\nprint('ok')\n`;

    await sandbox.files.write(watermarkScriptPath, pythonScript);
    const wmProc = await sandbox.commands.run(
      `python3 ${watermarkScriptPath} ${videoPath} ${watermarkedPath} '${watermarkText}'`,
      {
        onStdout: (d) => console.log(d),
        onStderr: (d) => console.error(d),
      }
    );

    if (wmProc.exitCode !== 0) {
      throw new Error(
        `Watermarking failed: ${wmProc.exitCode}\n${wmProc.stderr}`
      );
    }

    // Read file bytes reliably via base64 in the sandbox to avoid encoding issues
    const base64Result = await sandbox.commands.run(
      `base64 -w 0 ${watermarkedPath}`
    );
    if (base64Result.exitCode !== 0 || !base64Result.stdout) {
      throw new Error(
        `Failed to base64-encode video in sandbox: ${
          base64Result.stderr || "no stdout"
        }`
      );
    }
    const base64 = (base64Result.stdout || "").trim();
    const dataUrl = `data:video/mp4;base64,${base64}`;
    console.log(
      `Prepared base64 data URL for upload (length: ${base64.length} chars)`
    );
    return dataUrl;
  } catch (err: any) {
    console.error("E2B render error:", err);
    throw new Error(`Failed to render Manim video: ${err.message}`);
  } finally {
    console.log("E2B sandbox will be closed by the framework");
  }
}
