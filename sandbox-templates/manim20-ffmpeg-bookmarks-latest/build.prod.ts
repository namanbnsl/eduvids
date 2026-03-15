import { Template, defaultBuildLogger } from 'e2b'
import { template } from './template'

async function main() {
  await Template.build(template, 'manim20-ffmpeg-bookmarks-latest', {
    onBuildLogs: defaultBuildLogger(),
  });
}

main().catch(console.error);