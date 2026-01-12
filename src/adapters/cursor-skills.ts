import { createBaseAdapter } from './base.js';

export const cursorSkillsAdapter = createBaseAdapter({
  name: 'cursor-skills',
  tool: 'cursor',
  subtype: 'skills',
  configPath: ['cursor', 'skills'],
  defaultSourceDir: '.cursor/skills',
  targetDir: '.cursor/skills',
  mode: 'directory',
});