import { Template, defaultBuildLogger } from 'e2b'
import { template } from './template'

// The sandbox size the template is built with. The default matches the SDK
// default (2 vCPU, 1 GB), which fits two renders at once, so a rebuild keeps
// today's cost. The render driver adapts to whatever the sandbox has; 4 vCPU /
// 2 GB renders ~37% faster. Set these to match your E2B plan.
const cpuCount = Number(process.env.E2B_TEMPLATE_CPU_COUNT ?? 2)
const memoryMB = Number(process.env.E2B_TEMPLATE_MEMORY_MB ?? 1024)

async function main() {
  await Template.build(template, 'manim20-ffmpeg-bookmarks-latest', {
    cpuCount,
    memoryMB,
    onBuildLogs: defaultBuildLogger(),
  });
}

main().catch(console.error);
