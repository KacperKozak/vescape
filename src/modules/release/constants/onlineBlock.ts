/**
 * Bundled default shown when the server imposes an Online Block but the matched rule carries no
 * message. Markdown, rendered by `Markdown`. The server can override this per release.
 */
export const DEFAULT_ONLINE_BLOCK_MESSAGE = [
  'Online features are disabled in this version.',
  '',
  '- Update to re-enable them',
  '- Board, recording, and history keep working',
].join('\n')
