#!/usr/bin/env bun

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

import { buildReleaseNotes, RELEASE_NOTES_DIRECTORY, validateReleaseMarkdown } from './bundler'
import { runCodexDraft } from './codex'
import { resolveReleaseNotePlan } from './plan'

const ROOT = join(import.meta.dir, '../..')
const targetRef = argument('sha') ?? 'HEAD'
const versionOverride = argument('version')

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  throw new Error('Release-note authoring requires an interactive terminal')
}

const plan = await resolveReleaseNotePlan(targetRef, versionOverride)
const destination = join(RELEASE_NOTES_DIRECTORY, `${plan.marketingVersion}.md`)
if (await Bun.file(destination).exists()) {
  throw new Error(`${destination} already exists; edit the canonical note directly`)
}

console.log('Release-note plan')
console.log(
  `  Previous published release: ${plan.previous ? `${plan.previous.name} (${plan.previous.tagName})` : 'none'}`,
)
console.log(`  Target SHA: ${plan.targetSha}`)
console.log(`  Marketing version: ${plan.marketingVersion}`)
console.log(`  Compared range: ${plan.comparison}`)

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vescape-release-notes-'))
const draftFile = join(temporaryDirectory, 'draft.md')
const reader = createInterface({ input: process.stdin, output: process.stdout })

try {
  console.log('\nAsking local Codex to inspect the compared changes…')
  let result = await runCodexDraft({
    root: ROOT,
    outputFile: draftFile,
    prompt: initialPrompt(),
  })

  while (true) {
    preview(result.markdown)
    const choice = (
      await reader.question('\n[a]ccept  [r]e-prompt  [e]dit in $EDITOR  [d]iscard > ')
    )
      .trim()
      .toLowerCase()

    if (choice === 'd') {
      console.log('Draft discarded; canonical release notes unchanged')
      break
    }
    if (choice === 'e') {
      await openEditor(draftFile)
      result = { ...result, markdown: await readFile(draftFile, 'utf8') }
      continue
    }
    if (choice === 'r') {
      const instruction = await reader.question('Revision instruction > ')
      if (!instruction.trim()) continue
      result = await runCodexDraft({
        root: ROOT,
        outputFile: draftFile,
        threadId: result.threadId,
        prompt: `Revise the release-note draft. Return only the complete Markdown replacement.\n\nAuthor instruction: ${instruction}\n\nCurrent draft:\n${result.markdown}`,
      })
      continue
    }
    if (choice === 'a') {
      try {
        validateReleaseMarkdown(result.markdown, `${plan.marketingVersion}.md`)
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        continue
      }
      await mkdir(RELEASE_NOTES_DIRECTORY, { recursive: true })
      await writeFile(destination, ensureTrailingNewline(result.markdown), { flag: 'wx' })
      await buildReleaseNotes()
      console.log(`Accepted ${destination}`)
      break
    }
  }
} finally {
  reader.close()
  await rm(temporaryDirectory, { recursive: true, force: true })
}

function argument(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3)
}

function initialPrompt(): string {
  return [
    'Draft rider-facing release notes for Vescape.',
    'Read .agents/skills/release-notes/SKILL.md and follow its editorial policy exactly.',
    `The target is ${plan.targetSha} and the marketing version is ${plan.marketingVersion}.`,
    `Inspect the real diff with: git diff ${plan.diffBase} ${plan.targetSha}`,
    `Also inspect relevant source around changed behavior and git log ${plan.diffBase}..${plan.targetSha}.`,
    'Do not modify the working tree. Return only the complete Markdown body.',
  ].join('\n')
}

function preview(source: string): void {
  console.log('\n----- draft preview -----')
  console.log(source.trimEnd())
  console.log('----- end draft -----')
}

async function openEditor(file: string): Promise<void> {
  const command = process.env.VISUAL ?? process.env.EDITOR
  if (!command) throw new Error('$VISUAL or $EDITOR is not set')
  const [program, ...args] = command.trim().split(/\s+/)
  const child = Bun.spawn([program, ...args, file], {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await child.exited
  if (exitCode !== 0) throw new Error(`Editor exited with code ${exitCode}`)
}

function ensureTrailingNewline(source: string): string {
  return `${source.trimEnd()}\n`
}
