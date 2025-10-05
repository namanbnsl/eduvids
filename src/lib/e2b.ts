import { CommandExitError, Sandbox } from "@e2b/code-interpreter";

export interface RenderRequest {
  script: string;
  prompt: string;
}

/**
 * Quick validation to catch common errors before expensive E2B rendering
 */
function validateManimScript(script: string): { valid: boolean; error?: string } {
  const issues: string[] = [];

  // Check for camera.frame in VoiceoverScene (most common error)
  if (script.includes("VoiceoverScene")) {
    if (script.includes("self.camera.frame") && !script.includes("MovingCameraScene")) {
      issues.push("❌ VoiceoverScene does not have camera.frame. Remove all camera.frame references or use multiple inheritance: class MyScene(VoiceoverScene, MovingCameraScene)");
    }
    if (script.match(/frame\s*=\s*self\.camera\.frame/) && !script.includes("MovingCameraScene")) {
      issues.push("❌ Cannot assign frame = self.camera.frame in VoiceoverScene. Use FRAME_WIDTH=14.2, FRAME_HEIGHT=8.0 constants instead.");
    }
  }

  // Check for required imports
  if (script.includes("VoiceoverScene") && !script.includes("from manim_voiceover")) {
    issues.push("❌ Missing: from manim_voiceover import VoiceoverScene");
  }
  if (script.includes("GTTSService") && !script.includes("from manim_voiceover.services.gtts")) {
    issues.push("❌ Missing: from manim_voiceover.services.gtts import GTTSService");
  }

  // Check for scene class
  if (!script.includes("class MyScene")) {
    issues.push("❌ Missing: class MyScene definition");
  }

  // Check for construct method
  if (!script.includes("def construct(self)")) {
    issues.push("❌ Missing: def construct(self) method");
  }

  // Check for speech service initialization in VoiceoverScene
  if (script.includes("VoiceoverScene") && !script.includes("set_speech_service")) {
    issues.push("❌ VoiceoverScene requires: self.set_speech_service(GTTSService())");
  }

  // Check for common "'str' object is not callable" errors
  // This happens when shadowing built-in names or method calls
  const strNotCallablePatterns = [
    /\bstr\s*=\s*["']/i,  // str = "something" (shadows built-in)
    /\blist\s*=\s*\[/i,    // list = [...] (shadows built-in)
    /\bdict\s*=\s*\{/i,    // dict = {...} (shadows built-in)
    /\bint\s*=\s*\d/i,     // int = 123 (shadows built-in)
    /\bfloat\s*=\s*\d/i,   // float = 1.5 (shadows built-in)
    /\blen\s*=\s*/i,       // len = ... (shadows built-in)
    /\bmax\s*=\s*/i,       // max = ... (shadows built-in)
    /\bmin\s*=\s*/i,       // min = ... (shadows built-in)
  ];

  for (const pattern of strNotCallablePatterns) {
    if (pattern.test(script)) {
      const match = script.match(pattern);
      issues.push(`❌ Shadowing built-in name detected: ${match?.[0]}. This causes "'str' object is not callable" errors. Use a different variable name.`);
    }
  }

  // Check for incorrect string method calls (common mistake)
  if (script.match(/["'][^"']*["']\s*\(/)) {
    issues.push("❌ Potential error: calling a string literal like a function. Check for syntax like 'text'() instead of Text('text')");
  }

  if (issues.length > 0) {
    return { valid: false, error: issues.join("\n") };
  }

  return { valid: true };
}

export async function renderManimVideo({
  script,
  prompt: _prompt,
}: RenderRequest): Promise<string> {
  void _prompt;
  let sandbox: Sandbox | null = null;
  let cleanupAttempted = false;

  const ensureCleanup = async () => {
    if (sandbox && !cleanupAttempted) {
      cleanupAttempted = true;
      try {
        await sandbox.kill();
        console.log("E2B sandbox cleaned up successfully");
      } catch (cleanupError) {
        console.warn("Sandbox cleanup error (non-fatal):", cleanupError);
      }
    }
  };

  try {
    // Pre-validation to catch common errors early
    console.log("Validating Manim script...");
    const validation = validateManimScript(script);
    if (!validation.valid) {
      console.error("Script validation failed:", validation.error);
      const error = new Error(`Script validation failed:\n${validation.error}`);
      Object.assign(error, { exitCode: -1, validationError: true });
      throw error;
    }
    console.log("Script validation passed");

    sandbox = await Sandbox.create("manim-ffmpeg-latex-voiceover-watermark", {
      timeoutMs: 1200_000,
    });
    console.log("E2B sandbox created successfully", { sandboxId: sandbox.sandboxId });

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
        `\nSTDERR:\n${checkLatex.stderr || "(empty)"}`,
        `\nSTDOUT:\n${checkLatex.stdout || "(empty)"}`,
      ].join("\n");
      throw new Error(errorDetails);
    }

    // Run manim with explicit Python path and error capture
    console.log("Starting manim render...");
    const proc = await sandbox.commands.run(
      `manim ${scriptPath} MyScene --media_dir ${mediaDir} -ql --disable_caching --format=mp4 2>&1`,
      {
        onStdout: (d) => console.log("[manim stdout]", d),
        onStderr: (d) => console.error("[manim stderr]", d),
        timeoutMs: 600_000,
      }
    );

    if (proc.exitCode !== 0) {
      const errorDetails = [
        `Manim rendering failed with exit code: ${proc.exitCode}`,
        `\nSTDERR:\n${proc.stderr || "(empty)"}`,
        `\nSTDOUT:\n${proc.stdout || "(empty)"}`,
      ].join("\n");
      console.error("Manim render failed:", errorDetails);
      await ensureCleanup();
      const error = new Error(errorDetails);
      Object.assign(error, {
        exitCode: proc.exitCode,
        stderr: proc.stderr,
        stdout: proc.stdout,
      });
      throw error;
    }
    console.log("Manim render completed successfully");

    // Find output file
    console.log("Looking for rendered video in:", outputDir);
    const files = (await sandbox.files.list(outputDir)) as Array<{
      name: string;
    }>;
    console.log("Files found:", files.map(f => f.name));
    const videoFile = files.find((f) => f.name.endsWith(".mp4"));
    if (!videoFile) {
      await ensureCleanup();
      throw new Error(`No .mp4 file produced in ${outputDir}. Files found: ${files.map(f => f.name).join(", ")}`);
    }

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
      await ensureCleanup();
      throw new Error(`Rendered video has invalid duration: ${duration}s — aborting upload`);
    }

    // Watermark the video inside the sandbox using ffmpeg drawtext for robust output
    const watermarkedPath = `${outputDir}/watermarked.mp4`;
    const watermarkText = "eduvids";
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
        `\nSTDERR:\n${wmProc.stderr || "(empty)"}`,
        `\nSTDOUT:\n${wmProc.stdout || "(empty)"}`,
      ].join("\n");
      await ensureCleanup();
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
      await ensureCleanup();
      throw new Error(`Watermarked video has invalid duration: ${wmDuration}s — aborting upload`);
    }

    // Read file bytes reliably via base64 in the sandbox to avoid encoding issues
    const base64Result = await sandbox.commands.run(
      `base64 -w 0 ${watermarkedPath}`,
      { timeoutMs: 500_000 }
    );
    if (base64Result.exitCode !== 0 || !base64Result.stdout) {
      await ensureCleanup();
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
    
    // Cleanup before returning
    await ensureCleanup();
    return dataUrl;
  } catch (err: unknown) {
    console.error("E2B render error:", err);
    await ensureCleanup();
    
    if (err instanceof CommandExitError) {
      const exitCode = err.exitCode;
      const stderr = err.stderr ?? "";
      const stdout = err.stdout ?? "";
      const commandError = err.error ?? err.message ?? "";
      const summary =
        typeof exitCode === "number"
          ? `Manim command exited with code ${exitCode}`
          : "Manim command failed";
      const messageParts = [summary];
      const normalizedCommandError = commandError.trim();
      if (
        normalizedCommandError &&
        normalizedCommandError.toLowerCase() !==
          `exit status ${(exitCode ?? "").toString()}`
      ) {
        messageParts.push(`Error: ${normalizedCommandError}`);
      }
      if (stderr.trim().length) {
        messageParts.push(`STDERR:\n${stderr}`);
      }
      if (stdout.trim().length) {
        messageParts.push(`STDOUT:\n${stdout}`);
      }

      const detailedError = new Error(messageParts.join("\n\n"));
      detailedError.name = err.name;
      detailedError.stack = err.stack;
      Object.assign(detailedError, {
        exitCode,
        stderr,
        stdout,
        originalMessage: err.message,
        cause: err,
      });
      throw detailedError;
    }
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    // Ensure cleanup happens even if not already done
    await ensureCleanup();
  }
}
