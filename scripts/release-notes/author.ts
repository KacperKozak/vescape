#!/usr/bin/env bun

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildReleaseNotes, RELEASE_NOTES_DIRECTORY, validateReleaseMarkdown } from './bundler'
import { runCodexDraft } from './codex'
import { resolveEditorCommand } from './editor'
import { resolveReleaseNotePlan } from './plan'
import { selectPrompt, textPrompt } from './prompt'

const ROOT = join(import.meta.dir, '../..')
const targetRef = argument('sha') ?? 'HEAD'
const versionOverride = argument('version')

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  throw new Error('Release-note authoring requires an interactive terminal')
}

const plan = await resolveReleaseNotePlan(targetRef, versionOverride)
const editorCommand = resolveEditorCommand()
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
console.log(`  Editor: ${editorCommand.join(' ')}`)

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vescape-release-notes-'))
const draftFile = join(temporaryDirectory, 'draft.md')

try {
  console.log('\nAsking local Codex to inspect the compared changes…')
  let result = await runCodexDraft({
    root: ROOT,
    outputFile: draftFile,
    prompt: initialPrompt(),
  })

  while (true) {
    preview(result.markdown)
    const choice = await selectPrompt('Review release-note draft', [
      { value: 'accept', label: 'Accept canonical notes', shortcut: 'a' },
      { value: 'revise', label: 'Revise with Codex', shortcut: 'r' },
      { value: 'edit', label: `Edit in ${editorCommand[0]}`, shortcut: 'e' },
      { value: 'discard', label: 'Discard draft', shortcut: 'd' },
    ] as const)

    if (choice === 'discard') {
      console.log('Draft discarded; canonical release notes unchanged')
      break
    }
    if (choice === 'edit') {
      try {
        await openEditor(draftFile, editorCommand)
        result = { ...result, markdown: await readFile(draftFile, 'utf8') }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
      }
      continue
    }
    if (choice === 'revise') {
      const instruction = await textPrompt('How should Codex revise the draft?')
      if (!instruction) continue
      result = await runCodexDraft({
        root: ROOT,
        outputFile: draftFile,
        threadId: result.threadId,
        prompt: `Revise the release-note draft. Return only the complete Markdown replacement.\n\nAuthor instruction: ${instruction}\n\nCurrent draft:\n${result.markdown}`,
      })
      continue
    }
    if (choice === 'accept') {
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
    'Use only ## New, ## Improved, and ## Fixed, in that order, omitting empty sections.',
    'Include only important rider-visible outcomes. Consolidate related changes into one bullet and lead each section with its most important change.',
    'Do not modify the working tree. Return only the complete Markdown body.',
  ].join('\n')
}

function preview(source: string): void {
  console.log('\n----- draft preview -----')
  console.log(source.trimEnd())
  console.log('----- end draft -----')
}

async function openEditor(file: string, [program, ...args]: string[]): Promise<void> {
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
