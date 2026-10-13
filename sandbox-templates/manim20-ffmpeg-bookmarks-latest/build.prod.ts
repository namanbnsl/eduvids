import { Template, defaultBuildLogger } from 'e2b'
import { template } from './template'

// The render driver runs one Manim process per CPU that memory allows, and a
// 1080p render peaks at ~450 MB. The SDK default (2 vCPU, 1 GB) fits only one
// render at a time, so scenes render one after another. 8 vCPU / 8 GB renders
// eight scenes (or segments of a long one) at once. Lower these to match your
// E2B plan if needed; the driver adapts to whatever the sandbox has.
const cpuCount = Number(process.env.E2B_TEMPLATE_CPU_COUNT ?? 8)
const memoryMB = Number(process.env.E2B_TEMPLATE_MEMORY_MB ?? 8192)

async function main() {
  await Template.build(template, 'manim20-ffmpeg-bookmarks-latest', {
    cpuCount,
    memoryMB,
    onBuildLogs: defaultBuildLogger(),
  });
}

main().catch(console.error);
