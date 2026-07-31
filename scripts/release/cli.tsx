import React, { useEffect, useState } from 'react'
import { Box, render, Text, useApp, useInput } from 'ink'
import type { ProductionOperation, ReleaseManifest } from './contracts'
import { productionSummary, promotionSummary, releaseOutcome } from './contracts'
import {
  canonicalNotesPath,
  createDispatchPayload,
  createPromotionDispatchPayload,
  createProductionDispatchPayload,
  dispatchInternalBuild,
  dispatchOpenPromotion,
  dispatchProduction,
  downloadManifest,
  downloadPromotionManifest,
  downloadProductionManifest,
  failedWorkflowJobs,
  findDispatchedRun,
  findPromotionRun,
  findProductionRun,
  getWorkflowRun,
  listInternalCandidates,
  listProductionCandidates,
  marketingVersion,
  type ReleaseTrackConfig,
  type ProductionCandidate,
  releaseTrackConfig,
  repositoryName,
  resolveSourceSha,
  retryFailedJobs,
  verifyGhAuthentication,
  verifyRemoteCommit,
} from './github'

type Phase =
  | 'select'
  | 'build-source'
  | 'checking'
  | 'candidate'
  | 'production-candidate'
  | 'production-operation'
  | 'production-percentage'
  | 'confirm'
  | 'promote-confirm'
  | 'production-confirm'
  | 'dispatching'
  | 'waiting'
  | 'running'
  | 'complete'
  | 'error'

interface Plan {
  repo: string
  sourceSha: string
  marketingVersion: string
  requestId: string
}

interface PromotionPlan {
  repo: string
  candidate: ReleaseManifest
  requestId: string
  notesPath: string
  tracks: ReleaseTrackConfig
}

interface ProductionPlan {
  repo: string
  candidate: ProductionCandidate
  requestId: string
  notesPath: string
  tracks: ReleaseTrackConfig
  operation: ProductionOperation
  rolloutPercentage?: number
}

const releaseActions = [
  { shortcut: 'b', label: 'Build and send to Internal' },
  { shortcut: 'o', label: 'Promote Internal → Open testing' },
  { shortcut: 'p', label: 'Promote Open → Production / rollout controls' },
] as const

const productionOperations: ReadonlyArray<{
  operation: ProductionOperation
  shortcut: string
  label: string
}> = [
  { operation: 'promote', shortcut: 'p', label: 'Promote staged rollout' },
  { operation: 'status', shortcut: 's', label: 'Show rollout status' },
  { operation: 'halt', shortcut: 'h', label: 'Halt rollout' },
  { operation: 'resume', shortcut: 'r', label: 'Resume rollout' },
  { operation: 'advance', shortcut: 'a', label: 'Advance rollout percentage' },
]

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function App() {
  const { exit } = useApp()
  const initialRef = process.argv.find((value) => value.startsWith('--sha='))?.slice(6) ?? 'HEAD'
  const [sourceRef, setSourceRef] = useState(initialRef)
  const [phase, setPhase] = useState<Phase>('select')
  const [status, setStatus] = useState('Ready')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [promotionPlan, setPromotionPlan] = useState<PromotionPlan | null>(null)
  const [productionPlan, setProductionPlan] = useState<ProductionPlan | null>(null)
  const [candidates, setCandidates] = useState<ReleaseManifest[]>([])
  const [productionCandidates, setProductionCandidates] = useState<ProductionCandidate[]>([])
  const [actionIndex, setActionIndex] = useState(0)
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [operationIndex, setOperationIndex] = useState(0)
  const [rolloutInput, setRolloutInput] = useState('10')
  const [run, setRun] = useState<{ id: number; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryRunId, setRetryRunId] = useState<number | null>(null)

  const prepare = async () => {
    setPhase('checking')
    setStatus('Checking gh auth and source commit…')
    try {
      await verifyGhAuthentication()
      const repo = await repositoryName()
      const sourceSha = await resolveSourceSha(sourceRef)
      await verifyRemoteCommit(repo, sourceSha)
      const version = await marketingVersion(repo, sourceSha)
      setPlan({ repo, sourceSha, marketingVersion: version, requestId: crypto.randomUUID() })
      setPhase('confirm')
      setStatus('Dispatch plan ready')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }

  const preparePromotion = async () => {
    setPhase('checking')
    setStatus('Loading successful internal manifests…')
    try {
      await verifyGhAuthentication()
      const repo = await repositoryName()
      const [available, tracks] = await Promise.all([
        listInternalCandidates(repo),
        releaseTrackConfig(repo),
      ])
      if (available.length === 0) throw new Error('No successful internal release manifests found')
      setCandidates(available)
      setCandidateIndex(0)
      setPromotionPlan({
        repo,
        candidate: available[0],
        requestId: crypto.randomUUID(),
        notesPath: '',
        tracks,
      })
      setStatus('Select an internal candidate')
      setPhase('candidate')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }

  const confirmPromotionCandidate = async () => {
    const candidate = candidates[candidateIndex]
    if (!promotionPlan || !candidate) return
    setPhase('checking')
    setStatus(`Checking canonical notes for ${candidate.marketingVersion}…`)
    try {
      const notesPath = await canonicalNotesPath(promotionPlan.repo, candidate.marketingVersion)
      setPromotionPlan({ ...promotionPlan, candidate, notesPath })
      setStatus('Promotion plan ready; live Play tracks will be revalidated by the workflow')
      setPhase('promote-confirm')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }

  const prepareProduction = async () => {
    setPhase('checking')
    setStatus('Loading releases proven active on open testing…')
    try {
      await verifyGhAuthentication()
      const repo = await repositoryName()
      const [available, tracks] = await Promise.all([
        listProductionCandidates(repo),
        releaseTrackConfig(repo),
      ])
      if (available.length === 0) throw new Error('No exact open-tested release manifests found')
      setProductionCandidates(available)
      setCandidateIndex(0)
      setProductionPlan({
        repo,
        candidate: available[0],
        requestId: crypto.randomUUID(),
        notesPath: '',
        tracks,
        operation: 'promote',
        rolloutPercentage: 10,
      })
      setStatus('Select an open-tested release')
      setPhase('production-candidate')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }

  const confirmProductionCandidate = async () => {
    const candidate = productionCandidates[candidateIndex]
    if (!productionPlan || !candidate) return
    setPhase('checking')
    setStatus(`Checking canonical notes for ${candidate.manifest.marketingVersion}…`)
    try {
      const notesPath = await canonicalNotesPath(
        productionPlan.repo,
        candidate.manifest.marketingVersion,
        candidate.manifest.sourceSha,
      )
      setProductionPlan({ ...productionPlan, candidate, notesPath })
      setStatus('Select production rollout operation')
      setPhase('production-operation')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }

  const selectProductionOperation = (operation: ProductionOperation) => {
    if (!productionPlan) return
    const next = { ...productionPlan, operation, requestId: crypto.randomUUID() }
    setProductionPlan(next)
    if (operation === 'promote' || operation === 'advance') {
      setRolloutInput(String(next.rolloutPercentage ?? 10))
      setPhase('production-percentage')
    } else {
      setPhase('production-confirm')
    }
  }

  const confirmProductionPercentage = () => {
    if (!productionPlan) return
    const percentage = Number(rolloutInput)
    if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      setError('Rollout percentage must be greater than 0 and at most 100')
      setPhase('error')
      return
    }
    setProductionPlan({ ...productionPlan, rolloutPercentage: percentage })
    setPhase('production-confirm')
  }

  const dispatch = async (confirmedPlan: Plan) => {
    setPhase('dispatching')
    setStatus('Dispatching trusted workflow from main…')
    try {
      await dispatchInternalBuild(
        confirmedPlan.repo,
        createDispatchPayload(confirmedPlan.sourceSha, confirmedPlan.requestId),
      )
      setPhase('waiting')
      setStatus('Waiting for structured workflow run…')
      let workflowRun = null
      for (let attempt = 0; attempt < 30 && !workflowRun; attempt += 1) {
        workflowRun = await findDispatchedRun(confirmedPlan.repo, confirmedPlan.requestId)
        if (!workflowRun) await sleep(2_000)
      }
      if (!workflowRun) throw new Error('Dispatch succeeded, but its workflow run was not found')
      setRun({ id: workflowRun.id, url: workflowRun.html_url })
      setPhase('running')

      while (workflowRun.status !== 'completed') {
        setStatus(`Workflow ${workflowRun.status.replace('_', ' ')}…`)
        await sleep(10_000)
        workflowRun = await getWorkflowRun(confirmedPlan.repo, workflowRun.id)
      }

      setStatus('Reading release manifest…')
      let manifest
      try {
        manifest = await downloadManifest(workflowRun.id)
      } catch (manifestError) {
        if (workflowRun.conclusion !== 'success') {
          const failedJobs = await failedWorkflowJobs(confirmedPlan.repo, workflowRun.id)
          throw new Error(
            `Workflow failed${failedJobs.length > 0 ? ` in ${failedJobs.join(', ')}` : ''}. ${workflowRun.html_url}`,
          )
        }
        throw manifestError
      }
      const outcome = releaseOutcome(manifest)
      if (outcome.kind === 'success') {
        setStatus(
          `Internal ready · phone ${manifest.versionCodes.phone} · Wear ${manifest.versionCodes.wear}`,
        )
      } else if (outcome.kind === 'partial') {
        setStatus(`${outcome.succeeded} uploaded; ${outcome.failed} failed`)
        setRetryRunId(workflowRun.id)
      } else {
        setStatus('Both internal uploads failed')
        setRetryRunId(workflowRun.id)
      }
      setPhase('complete')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }

  const promote = async (confirmedPlan: PromotionPlan) => {
    setPhase('dispatching')
    setStatus('Dispatching trusted open-promotion workflow from main…')
    try {
      await dispatchOpenPromotion(
        confirmedPlan.repo,
        createPromotionDispatchPayload(confirmedPlan.candidate, confirmedPlan.requestId),
      )
      setPhase('waiting')
      setStatus('Waiting for structured promotion run…')
      let workflowRun = null
      for (let attempt = 0; attempt < 30 && !workflowRun; attempt += 1) {
        workflowRun = await findPromotionRun(confirmedPlan.repo, confirmedPlan.requestId)
        if (!workflowRun) await sleep(2_000)
      }
      if (!workflowRun) throw new Error('Dispatch succeeded, but its promotion run was not found')
      setRun({ id: workflowRun.id, url: workflowRun.html_url })
      setPhase('running')
      while (workflowRun.status !== 'completed') {
        setStatus(`Promotion ${workflowRun.status.replace('_', ' ')}…`)
        await sleep(10_000)
        workflowRun = await getWorkflowRun(confirmedPlan.repo, workflowRun.id)
      }
      setStatus('Reading per-form-factor promotion result…')
      const manifest = await downloadPromotionManifest(workflowRun.id)
      setStatus(promotionSummary(manifest))
      if (manifest.phone.status === 'failed' || manifest.wear.status === 'failed') {
        setRetryRunId(workflowRun.id)
      }
      setPhase('complete')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }

  const runProduction = async (confirmedPlan: ProductionPlan) => {
    setPhase('dispatching')
    setStatus(`Dispatching trusted production ${confirmedPlan.operation} workflow from main…`)
    try {
      await dispatchProduction(
        confirmedPlan.repo,
        createProductionDispatchPayload(
          confirmedPlan.candidate,
          confirmedPlan.operation,
          confirmedPlan.requestId,
          confirmedPlan.operation === 'promote' || confirmedPlan.operation === 'advance'
            ? confirmedPlan.rolloutPercentage
            : undefined,
        ),
      )
      setPhase('waiting')
      setStatus('Waiting for structured production run…')
      let workflowRun = null
      for (let attempt = 0; attempt < 30 && !workflowRun; attempt += 1) {
        workflowRun = await findProductionRun(confirmedPlan.repo, confirmedPlan.requestId)
        if (!workflowRun) await sleep(2_000)
      }
      if (!workflowRun) throw new Error('Dispatch succeeded, but its production run was not found')
      setRun({ id: workflowRun.id, url: workflowRun.html_url })
      setPhase('running')
      while (workflowRun.status !== 'completed') {
        setStatus(`Production ${workflowRun.status.replace('_', ' ')}…`)
        await sleep(10_000)
        workflowRun = await getWorkflowRun(confirmedPlan.repo, workflowRun.id)
      }
      setStatus('Reading exact production rollout state…')
      const manifest = await downloadProductionManifest(workflowRun.id)
      setStatus(productionSummary(manifest))
      if (
        manifest.phone.status === 'failed' ||
        manifest.wear.status === 'failed' ||
        manifest.githubRelease === 'failed'
      ) {
        setRetryRunId(workflowRun.id)
      }
      setPhase('complete')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }

  useInput((input, key) => {
    if (phase === 'select') {
      const shortcutIndex = releaseActions.findIndex(
        (action) => action.shortcut === input.toLowerCase(),
      )
      const selectedIndex = shortcutIndex >= 0 ? shortcutIndex : actionIndex
      if (key.upArrow || input.toLowerCase() === 'k')
        setActionIndex((value) => (value - 1 + releaseActions.length) % releaseActions.length)
      else if (key.downArrow || input.toLowerCase() === 'j')
        setActionIndex((value) => (value + 1) % releaseActions.length)
      else if (key.return || shortcutIndex >= 0) {
        setActionIndex(selectedIndex)
        if (selectedIndex === 0) setPhase('build-source')
        else if (selectedIndex === 1) void preparePromotion()
        else void prepareProduction()
      }
      return
    }
    if (phase === 'build-source') {
      if (key.return) void prepare()
      else if (key.escape) setPhase('select')
      else if (key.backspace || key.delete) setSourceRef((value) => value.slice(0, -1))
      else if (input && !key.ctrl && !key.meta) setSourceRef((value) => value + input)
      return
    }
    if (phase === 'candidate') {
      if (key.upArrow || input.toLowerCase() === 'k')
        setCandidateIndex((value) => Math.max(0, value - 1))
      else if (key.downArrow || input.toLowerCase() === 'j')
        setCandidateIndex((value) => Math.min(candidates.length - 1, value + 1))
      else if (key.return) void confirmPromotionCandidate()
      else if (key.escape) setPhase('select')
      return
    }
    if (phase === 'production-candidate') {
      if (key.upArrow || input.toLowerCase() === 'k')
        setCandidateIndex((value) => Math.max(0, value - 1))
      else if (key.downArrow || input.toLowerCase() === 'j')
        setCandidateIndex((value) => Math.min(productionCandidates.length - 1, value + 1))
      else if (key.return) void confirmProductionCandidate()
      else if (key.escape) setPhase('select')
      return
    }
    if (phase === 'production-operation') {
      const shortcutIndex = productionOperations.findIndex(
        (item) => item.shortcut === input.toLowerCase(),
      )
      const selectedIndex = shortcutIndex >= 0 ? shortcutIndex : operationIndex
      if (key.upArrow || input.toLowerCase() === 'k')
        setOperationIndex(
          (value) => (value - 1 + productionOperations.length) % productionOperations.length,
        )
      else if (key.downArrow || input.toLowerCase() === 'j')
        setOperationIndex((value) => (value + 1) % productionOperations.length)
      else if (key.return || shortcutIndex >= 0) {
        setOperationIndex(selectedIndex)
        selectProductionOperation(productionOperations[selectedIndex].operation)
      } else if (key.escape) setPhase('production-candidate')
      return
    }
    if (phase === 'production-percentage') {
      if (key.return) confirmProductionPercentage()
      else if (key.escape) setPhase('production-operation')
      else if (key.backspace || key.delete) setRolloutInput((value) => value.slice(0, -1))
      else if (/^[0-9.]$/.test(input)) setRolloutInput((value) => value + input)
      return
    }
    if (phase === 'confirm') {
      if (input.toLowerCase() === 'y' && plan) void dispatch(plan)
      else if (input.toLowerCase() === 'n' || key.escape) {
        setPhase('build-source')
        setStatus('Ready')
      }
      return
    }
    if (phase === 'promote-confirm') {
      if (input.toLowerCase() === 'y' && promotionPlan) void promote(promotionPlan)
      else if (input.toLowerCase() === 'n' || key.escape) {
        setPhase('candidate')
        setStatus('Select an internal candidate')
      }
      return
    }
    if (phase === 'production-confirm') {
      if (input.toLowerCase() === 'y' && productionPlan) void runProduction(productionPlan)
      else if (input.toLowerCase() === 'n' || key.escape) {
        setPhase('production-operation')
        setStatus('Select production rollout operation')
      }
      return
    }
    if (phase === 'complete' && retryRunId && input.toLowerCase() === 'r') {
      setRetryRunId(null)
      setPhase('running')
      setStatus('Retrying failed jobs only…')
      void retryFailedJobs(retryRunId)
        .then(() => {
          setStatus(`Retry requested for workflow ${retryRunId}. Re-run this CLI to watch it.`)
          setPhase('complete')
        })
        .catch((caught) => {
          setError(caught instanceof Error ? caught.message : String(caught))
          setPhase('error')
        })
      return
    }
    if ((phase === 'complete' || phase === 'error') && (input === 'q' || key.escape)) exit()
  })

  useEffect(() => {
    if (phase === 'complete' && !retryRunId) {
      const timer = setTimeout(exit, 1_500)
      return () => clearTimeout(timer)
    }
  }, [exit, phase, retryRunId])

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold color="cyan">
        Vescape · Android Release
      </Text>
      <Text>Status: {status}</Text>
      {phase === 'select' && (
        <Box flexDirection="column">
          <Text bold>What do you want to do?</Text>
          {releaseActions.map((action, index) => {
            const selected = index === actionIndex
            return (
              <Text key={action.shortcut} color={selected ? 'cyan' : undefined} bold={selected}>
                {selected ? '◆ ' : '  '}
                {action.label} <Text dimColor>({action.shortcut.toUpperCase()})</Text>
              </Text>
            )
          })}
          <Text dimColor>↑/↓ or j/k to move · Enter to select · shortcuts work directly</Text>
        </Box>
      )}
      {phase === 'build-source' && (
        <Box flexDirection="column">
          <Text>Build and send to Internal</Text>
          <Text>
            Source commit: <Text color="yellow">{sourceRef || ' '}</Text>
          </Text>
          <Text dimColor>Type a git ref or SHA · Enter continues · Esc cancels</Text>
        </Box>
      )}
      {phase === 'candidate' && (
        <Box flexDirection="column">
          <Text>Promote Internal → Open testing</Text>
          {candidates.map((candidate, index) => (
            <Text
              key={candidate.workflow.runId}
              color={index === candidateIndex ? 'yellow' : undefined}
            >
              {index === candidateIndex ? '› ' : '  '}v{candidate.marketingVersion} ·{' '}
              {candidate.sourceSha.slice(0, 12)} · phone {candidate.versionCodes.phone} · Wear{' '}
              {candidate.versionCodes.wear} · run {candidate.workflow.runId}
            </Text>
          ))}
          <Text dimColor>↑/↓ or j/k · Enter selects · Esc cancels</Text>
        </Box>
      )}
      {phase === 'production-candidate' && (
        <Box flexDirection="column">
          <Text>Promote Open → Production</Text>
          {productionCandidates.map((candidate, index) => (
            <Text
              key={candidate.openPromotionRunId}
              color={index === candidateIndex ? 'yellow' : undefined}
            >
              {index === candidateIndex ? '› ' : '  '}v{candidate.manifest.marketingVersion} ·{' '}
              {candidate.manifest.sourceSha.slice(0, 12)} · phone{' '}
              {candidate.manifest.versionCodes.phone} · Wear {candidate.manifest.versionCodes.wear}{' '}
              · open proof {candidate.openPromotionRunId}
            </Text>
          ))}
          <Text dimColor>Only successful exact open-promotion manifests · ↑/↓ or j/k</Text>
        </Box>
      )}
      {phase === 'production-operation' && (
        <Box flexDirection="column">
          <Text bold>Production rollout</Text>
          {productionOperations.map((item, index) => {
            const selected = index === operationIndex
            return (
              <Text key={item.operation} color={selected ? 'cyan' : undefined} bold={selected}>
                {selected ? '◆ ' : '  '}
                {item.label} <Text dimColor>({item.shortcut.toUpperCase()})</Text>
              </Text>
            )
          })}
          <Text dimColor>↑/↓ or j/k · Enter selects · Esc goes back</Text>
          <Text dimColor>Every operation targets the selected exact phone/Wear codes</Text>
        </Box>
      )}
      {phase === 'production-percentage' && productionPlan && (
        <Box flexDirection="column">
          <Text>
            {productionPlan.operation === 'promote' ? 'Initial rollout' : 'Advance rollout'}:{' '}
            <Text color="yellow">{rolloutInput || ' '}%</Text>
          </Text>
          <Text dimColor>Type percentage 0–100 · Enter continues · Esc cancels</Text>
        </Box>
      )}
      {plan && (phase === 'confirm' || phase === 'dispatching') && (
        <Box flexDirection="column">
          <Text>Workflow definition: main:.github/workflows/release-android.yml</Text>
          <Text>Repository: {plan.repo}</Text>
          <Text>Source SHA: {plan.sourceSha}</Text>
          <Text>Marketing version: {plan.marketingVersion}</Text>
          <Text>Destination: phone internal + Wear internal only</Text>
          <Text color="yellow">Create workflow run? y/N</Text>
        </Box>
      )}
      {promotionPlan && phase === 'promote-confirm' && (
        <Box flexDirection="column">
          <Text>Workflow definition: main:.github/workflows/promote-open.yml</Text>
          <Text>Marketing version: {promotionPlan.candidate.marketingVersion}</Text>
          <Text>Source SHA: {promotionPlan.candidate.sourceSha}</Text>
          <Text>
            Phone code: {promotionPlan.candidate.versionCodes.phone} · recorded{' '}
            {promotionPlan.tracks.phoneInternal}: {promotionPlan.candidate.uploads.phone}
          </Text>
          <Text>
            Wear code: {promotionPlan.candidate.versionCodes.wear} · recorded{' '}
            {promotionPlan.tracks.wearInternal}: {promotionPlan.candidate.uploads.wear}
          </Text>
          <Text>Canonical notes: {promotionPlan.notesPath} on main</Text>
          <Text>
            Targets: {promotionPlan.tracks.phoneOpen} + {promotionPlan.tracks.wearOpen}
          </Text>
          <Text dimColor>
            Workflow revalidates both exact codes on live Play tracks before mutation.
          </Text>
          <Text color="yellow">Promote existing Play artifacts? y/N</Text>
        </Box>
      )}
      {productionPlan && phase === 'production-confirm' && (
        <Box flexDirection="column">
          <Text>Workflow definition: main:.github/workflows/promote-production.yml</Text>
          <Text>Operation: {productionPlan.operation}</Text>
          <Text>Marketing version: {productionPlan.candidate.manifest.marketingVersion}</Text>
          <Text>Source SHA: {productionPlan.candidate.manifest.sourceSha}</Text>
          <Text>
            Phone code: {productionPlan.candidate.manifest.versionCodes.phone} · current{' '}
            {productionPlan.candidate.open.phone.targetTrack}:{' '}
            {productionPlan.candidate.open.phone.status} · target{' '}
            {productionPlan.tracks.phoneProduction}
          </Text>
          <Text>
            Wear code: {productionPlan.candidate.manifest.versionCodes.wear} · current{' '}
            {productionPlan.candidate.open.wear.targetTrack}:{' '}
            {productionPlan.candidate.open.wear.status} · target{' '}
            {productionPlan.tracks.wearProduction}
          </Text>
          <Text>Canonical notes: {productionPlan.notesPath} at exact source SHA</Text>
          {(productionPlan.operation === 'promote' || productionPlan.operation === 'advance') && (
            <Text>Rollout percentage: {productionPlan.rolloutPercentage}%</Text>
          )}
          {productionPlan.operation === 'promote' && (
            <Text>New release tag: v{productionPlan.candidate.manifest.marketingVersion}</Text>
          )}
          <Text dimColor>
            Trusted workflow revalidates source ancestry, canonical notes, and both live Play
            tracks.
          </Text>
          <Text color="yellow">Run explicitly approved production operation? y/N</Text>
        </Box>
      )}
      {run && (
        <Text>
          Run: {run.id} · {run.url}
        </Text>
      )}
      {phase === 'complete' && retryRunId && (
        <Text color="yellow">R retry failed jobs only · Q quit</Text>
      )}
      {phase === 'error' && (
        <Box flexDirection="column">
          <Text color="red">{error}</Text>
          <Text dimColor>Q quit</Text>
        </Box>
      )}
    </Box>
  )
}

render(<App />)
