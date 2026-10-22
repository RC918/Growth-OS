// Derived-preview Review UI flag (build-time only, dist output).
// Preparation for persistent Review: flips urlReviewEnabled in the derived
// config ONLY when REVIEW_UI_ENABLED=true is set for the deployment build.
// Default (unset/other) leaves the derived output untouched, so the flag
// can be prepared in code and activated per deployment after the database
// enable lands. Frozen sources are never modified; anchors fail loud.
import {readFile, writeFile} from 'node:fs/promises';

const OFF = 'export const urlReviewEnabled=false;';
const ON = 'export const urlReviewEnabled=true;';

export async function applyReviewFlag(distDir, env = process.env) {
  if (env.REVIEW_UI_ENABLED !== 'true') return {review_ui: 'disabled'};
  const path = new URL('url-result-config.mjs', distDir);
  const source = await readFile(path, 'utf8');
  if (source.includes(ON) && !source.includes(OFF)) return {review_ui: 'already_enabled'};
  if (!source.includes(OFF)) throw Error('review flag anchor drift: urlReviewEnabled');
  await writeFile(path, source.replace(OFF, ON));
  return {review_ui: 'enabled'};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(await applyReviewFlag(new URL('./dist/', import.meta.url))));
}
