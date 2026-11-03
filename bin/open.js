#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const herdr = process.env.HERDR_BIN_PATH || 'herdr';
const url = process.env.HERDR_PLUGIN_CLICKED_URL;
const args = ['plugin', 'pane', 'open', '--plugin', process.env.HERDR_PLUGIN_ID ?? 'jjangsky.pr-flow', '--entrypoint', 'board', '--placement', 'tab', '--focus'];
if (url) args.push('--env', `PR_FLOW_OPEN_URL=${url}`);
execFileSync(herdr, args, { stdio: 'inherit' });
