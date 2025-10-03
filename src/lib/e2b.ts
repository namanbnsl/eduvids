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
      timeoutMs: 1200_000,
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
      const errorDetails = [
        `LaTeX check failed with exit code: ${checkLatex.exitCode}`,
        `\nSTDERR:\n${checkLatex.stderr || '(empty)'}`,
        `\nSTDOUT:\n${checkLatex.stdout || '(empty)'}`,
      ].join('\n');
      throw new Error(errorDetails);
    }

    // Run manim
    const proc = await sandbox.commands.run(
      `manim ${scriptPath} MyScene --media_dir ${mediaDir} -ql --disable_caching --format=mp4`,
      {
        onStdout: (d) => console.log(d),
        onStderr: (d) => console.error(d),
        timeoutMs: 600_000,
      }
    );

    if (proc.exitCode !== 0) {
      const errorDetails = [
        `Manim rendering failed with exit code: ${proc.exitCode}`,
        `\nSTDERR:\n${proc.stderr || '(empty)'}`,
        `\nSTDOUT:\n${proc.stdout || '(empty)'}`,
      ].join('\n');
      throw new Error(errorDetails);
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
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${videoPath}`,
      {
        timeoutMs: 300_000,
      }
    );
    const duration = parseFloat((probe.stdout || "").trim());
    console.log("ffprobe duration:", duration);

    if (!duration || duration <= 0) {
      throw new Error("Rendered video has 0s duration — aborting upload");
    }

    // Watermark the video inside the sandbox using ffmpeg drawtext for robust output
    const watermarkedPath = `${outputDir}/watermarked.mp4`;
    const watermarkText = "Created by Naman Bansal via scimath-vids";
    const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
    const drawText = `drawtext=fontfile=${fontFile}:text='${watermarkText}':fontcolor=white@0.85:fontsize=24:box=1:boxcolor=black@0.4:boxborderw=10:x=w-tw-20:y=h-th-20`;

    const ffmpegCmd = `ffmpeg -y -i ${videoPath} -vf \"${drawText}\" -c:v libx264 -profile:v main -pix_fmt yuv420p -movflags +faststart -c:a copy ${watermarkedPath}`;
    const wmProc = await sandbox.commands.run(ffmpegCmd, {
      onStdout: (d) => console.log(d),
      onStderr: (d) => console.error(d),
      timeoutMs: 300_000,
    });

    if (wmProc.exitCode !== 0) {
      const errorDetails = [
        `Watermarking failed with exit code: ${wmProc.exitCode}`,
        `\nSTDERR:\n${wmProc.stderr || '(empty)'}`,
        `\nSTDOUT:\n${wmProc.stdout || '(empty)'}`,
      ].join('\n');
      throw new Error(errorDetails);
    }

    // Validate watermarked output
    const probeWm = await sandbox.commands.run(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${watermarkedPath}`,
      {
        timeoutMs: 300_000,
      }
    );
    const wmDuration = parseFloat((probeWm.stdout || "").trim());
    if (!wmDuration || wmDuration <= 0) {
      throw new Error("Watermarked video has 0s duration — aborting upload");
    }

    // Read file bytes reliably via base64 in the sandbox to avoid encoding issues
    const base64Result = await sandbox.commands.run(
      `base64 -w 0 ${watermarkedPath}`,
      { timeoutMs: 300_000 }
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
    await sandbox?.kill();
    console.log("E2B sandbox is closed.");
  }
}
