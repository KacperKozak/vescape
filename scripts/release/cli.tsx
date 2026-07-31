import React, { useEffect, useState } from 'react'
import { Box, render, Text, useApp, useInput } from 'ink'
import type { ProductionOperation, ReleaseManifest, WorkflowJob, WorkflowRun } from './contracts'
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
  getWorkflowJobs,
  listInternalCandidates,
  listInternalWorkflowRuns,
  listProductionCandidates,
  marketingVersion,
  type ReleaseTrackConfig,
  type ProductionCandidate,
  releaseTrackConfig,
  repositoryDefaultBranch,
  repositoryName,
  resolveSourceSha,
  retryFailedJobs,
  verifyGhAuthentication,
  verifyRemoteCommit,
} from './github'
import { internalReleaseProgress, workflowElapsed } from './progress'
import {
  bumpMarketingVersion,
  currentMarketingVersion,
  type VersionBump,
  verifyReleasePreparationReady,
} from './prepare'

type Phase =
  | 'select'
  | 'version-bump'
  | 'version-confirm'
  | 'build-source'
  | 'internal-runs'
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
  workflowRef: string
  sourceSha: string
  marketingVersion: string
  requestId: string
}

interface PromotionPlan {
  repo: string
  workflowRef: string
  candidate: ReleaseManifest
  requestId: string
  notesPath: string
  tracks: ReleaseTrackConfig
}

interface ProductionPlan {
  repo: string
  workflowRef: string
  candidate: ProductionCandidate
  requestId: string
  notesPath: string
  tracks: ReleaseTrackConfig
  operation: ProductionOperation
  rolloutPercentage?: number
}

const releaseActions = [
  { id: 'prepare', shortcut: 'n', label: 'Prepare a new release version' },
  { id: 'build', shortcut: 'b', label: 'Build and send to Internal' },
  { id: 'watch', shortcut: 'w', label: 'Watch / resume an Internal release' },
  { id: 'open', shortcut: 'o', label: 'Promote Internal → Open testing' },
  { id: 'production', shortcut: 'p', label: 'Promote Open → Production / rollout controls' },
] as const

const versionBumps: ReadonlyArray<{ bump: VersionBump; label: string }> = [
  { bump: 'major', label: 'Major' },
  { bump: 'minor', label: 'Minor' },
  { bump: 'patch', label: 'Patch' },
]

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

export interface ReleaseCliOptions {
  initialPhase?: 'select' | 'build-source'
  initialSourceRef?: string
}

export type ReleaseCliResult = { kind: 'exit' } | { kind: 'prepare'; bump: VersionBump }

interface AppProps extends ReleaseCliOptions {
  finish: (result: ReleaseCliResult) => void
}

function App({ finish, initialPhase = 'select', initialSourceRef }: AppProps) {
  const { exit } = useApp()
  const initialRef =
    initialSourceRef ?? process.argv.find((value) => value.startsWith('--sha='))?.slice(6) ?? 'HEAD'
  const [sourceRef, setSourceRef] = useState(initialRef)
  const [phase, setPhase] = useState<Phase>(initialPhase)
  const [status, setStatus] = useState('Ready')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [promotionPlan, setPromotionPlan] = useState<PromotionPlan | null>(null)
  const [productionPlan, setProductionPlan] = useState<ProductionPlan | null>(null)
  const [candidates, setCandidates] = useState<ReleaseManifest[]>([])
  const [productionCandidates, setProductionCandidates] = useState<ProductionCandidate[]>([])
  const [internalRuns, setInternalRuns] = useState<WorkflowRun[]>([])
  const [internalRunsRepo, setInternalRunsRepo] = useState('')
  const [workflowJobs, setWorkflowJobs] = useState<WorkflowJob[]>([])
  const [watchedRun, setWatchedRun] = useState<WorkflowRun | null>(null)
  const [clock, setClock] = useState(Date.now())
  const [actionIndex, setActionIndex] = useState(0)
  const [versionBumpIndex, setVersionBumpIndex] = useState(1)
  const [currentVersion, setCurrentVersion] = useState('')
  const [runIndex, setRunIndex] = useState(0)
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [operationIndex, setOperationIndex] = useState(0)
  const [rolloutInput, setRolloutInput] = useState('10')
  const [run, setRun] = useState<{ id: number; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryRunId, setRetryRunId] = useState<number | null>(null)

  const prepareVersionMenu = async () => {
    setPhase('checking')
    setStatus('Checking branch and working tree…')
    try {
      await verifyReleasePreparationReady()
      setCurrentVersion(await currentMarketingVersion())
      setVersionBumpIndex(1)
      setStatus('Choose the marketing version bump')
      setPhase('version-bump')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }

  const prepare = async () => {
    setPhase('checking')
    setStatus('Checking gh auth and source commit…')
    try {
      await verifyGhAuthentication()
      const repo = await repositoryName()
      const workflowRef = await repositoryDefaultBranch(repo)
      const sourceSha = await resolveSourceSha(sourceRef)
      await verifyRemoteCommit(repo, sourceSha)
      const version = await marketingVersion(repo, sourceSha)
      setPlan({
        repo,
        workflowRef,
        sourceSha,
        marketingVersion: version,
        requestId: crypto.randomUUID(),
      })
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
      const [available, tracks, workflowRef] = await Promise.all([
        listInternalCandidates(repo),
        releaseTrackConfig(repo),
        repositoryDefaultBranch(repo),
      ])
      if (available.length === 0) throw new Error('No successful internal release manifests found')
      setCandidates(available)
      setCandidateIndex(0)
      setPromotionPlan({
        repo,
        workflowRef,
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
      const [available, tracks, workflowRef] = await Promise.all([
        listProductionCandidates(repo),
        releaseTrackConfig(repo),
        repositoryDefaultBranch(repo),
      ])
      if (available.length === 0) throw new Error('No exact open-tested release manifests found')
      setProductionCandidates(available)
      setCandidateIndex(0)
      setProductionPlan({
        repo,
        workflowRef,
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

  const prepareInternalRuns = async () => {
    setPhase('checking')
    setStatus('Finding recent Internal releases…')
    try {
      await verifyGhAuthentication()
      const repo = await repositoryName()
      const available = await listInternalWorkflowRuns(repo)
      if (available.length === 0) throw new Error('No resumable Internal release runs found')
      setInternalRunsRepo(repo)
      setInternalRuns(available)
      setRunIndex(0)
      setStatus('Select an Internal release to watch')
      setPhase('internal-runs')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }

  const finishInternalRun = async (repo: string, workflowRun: WorkflowRun) => {
    setStatus('Reading release manifest…')
    let manifest
    try {
      manifest = await downloadManifest(workflowRun.id)
    } catch (manifestError) {
      if (workflowRun.conclusion !== 'success') {
        const failedJobs = await failedWorkflowJobs(repo, workflowRun.id)
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
  }

  const watchInternalRun = async (repo: string, initialRun: WorkflowRun) => {
    let workflowRun = initialRun
    setClock(Date.now())
    setRun({ id: workflowRun.id, url: workflowRun.html_url })
    setWatchedRun(workflowRun)
    setWorkflowJobs(await getWorkflowJobs(repo, workflowRun.id))
    setPhase('running')
    while (workflowRun.status !== 'completed') {
      setStatus(`Internal release ${workflowRun.status.replace('_', ' ')}…`)
      await sleep(10_000)
      const [nextRun, jobs] = await Promise.all([
        getWorkflowRun(repo, workflowRun.id),
        getWorkflowJobs(repo, workflowRun.id),
      ])
      workflowRun = nextRun
      setWatchedRun(nextRun)
      setWorkflowJobs(jobs)
    }
    await finishInternalRun(repo, workflowRun)
  }

  const resumeInternalRun = async () => {
    const selected = internalRuns[runIndex]
    if (!selected || !internalRunsRepo) return
    setPhase('checking')
    setStatus('Loading live workflow progress…')
    try {
      const current = await getWorkflowRun(internalRunsRepo, selected.id)
      await watchInternalRun(internalRunsRepo, current)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }

  const dispatch = async (confirmedPlan: Plan) => {
    setPhase('dispatching')
    setStatus(`Dispatching trusted workflow from ${confirmedPlan.workflowRef}…`)
    try {
      await dispatchInternalBuild(
        confirmedPlan.repo,
        createDispatchPayload(
          confirmedPlan.sourceSha,
          confirmedPlan.requestId,
          confirmedPlan.workflowRef,
        ),
      )
      setPhase('waiting')
      setStatus('Waiting for structured workflow run…')
      let workflowRun = null
      for (let attempt = 0; attempt < 30 && !workflowRun; attempt += 1) {
        workflowRun = await findDispatchedRun(confirmedPlan.repo, confirmedPlan.requestId)
        if (!workflowRun) await sleep(2_000)
      }
      if (!workflowRun) throw new Error('Dispatch succeeded, but its workflow run was not found')
      await watchInternalRun(confirmedPlan.repo, workflowRun)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPhase('error')
    }
  }

  const promote = async (confirmedPlan: PromotionPlan) => {
    setPhase('dispatching')
    setStatus(`Dispatching trusted open-promotion workflow from ${confirmedPlan.workflowRef}…`)
    try {
      await dispatchOpenPromotion(
        confirmedPlan.repo,
        createPromotionDispatchPayload(
          confirmedPlan.candidate,
          confirmedPlan.requestId,
          confirmedPlan.workflowRef,
        ),
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
    setStatus(
      `Dispatching trusted production ${confirmedPlan.operation} workflow from ${confirmedPlan.workflowRef}…`,
    )
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
          confirmedPlan.workflowRef,
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
        const action = releaseActions[selectedIndex].id
        if (action === 'prepare') void prepareVersionMenu()
        else if (action === 'build') setPhase('build-source')
        else if (action === 'watch') void prepareInternalRuns()
        else if (action === 'open') void preparePromotion()
        else void prepareProduction()
      }
      return
    }
    if (phase === 'version-bump') {
      if (key.upArrow || input.toLowerCase() === 'k')
        setVersionBumpIndex((value) => (value - 1 + versionBumps.length) % versionBumps.length)
      else if (key.downArrow || input.toLowerCase() === 'j')
        setVersionBumpIndex((value) => (value + 1) % versionBumps.length)
      else if (key.return) setPhase('version-confirm')
      else if (key.escape) setPhase('select')
      return
    }
    if (phase === 'version-confirm') {
      if (input.toLowerCase() === 'y') {
        finish({ kind: 'prepare', bump: versionBumps[versionBumpIndex].bump })
        exit()
      } else if (input.toLowerCase() === 'n' || key.escape) {
        setPhase('version-bump')
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
    if (phase === 'internal-runs') {
      if (key.upArrow || input.toLowerCase() === 'k') setRunIndex((value) => Math.max(0, value - 1))
      else if (key.downArrow || input.toLowerCase() === 'j')
        setRunIndex((value) => Math.min(internalRuns.length - 1, value + 1))
      else if (key.return) void resumeInternalRun()
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
      setWatchedRun(null)
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
    if ((phase === 'complete' || phase === 'error') && (input === 'q' || key.escape)) {
      finish({ kind: 'exit' })
      exit()
    }
  })

  useEffect(() => {
    if (phase !== 'running' || !watchedRun) return
    const timer = setInterval(() => setClock(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [phase, watchedRun])

  const progress = watchedRun ? internalReleaseProgress(workflowJobs) : null

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
      {phase === 'version-bump' && (
        <Box flexDirection="column">
          <Text bold>Choose the next marketing version</Text>
          {versionBumps.map((item, index) => {
            const selected = index === versionBumpIndex
            return (
              <Text key={item.bump} color={selected ? 'cyan' : undefined} bold={selected}>
                {selected ? '◆ ' : '  '}
                {item.label}: {currentVersion} → {bumpMarketingVersion(currentVersion, item.bump)}
              </Text>
            )
          })}
          <Text dimColor>↑/↓ or j/k · Enter selects · Esc goes back</Text>
        </Box>
      )}
      {phase === 'version-confirm' && (
        <Box flexDirection="column">
          <Text bold>Prepare release candidate</Text>
          <Text>
            Version: {currentVersion} →{' '}
            <Text color="cyan">
              {bumpMarketingVersion(currentVersion, versionBumps[versionBumpIndex].bump)}
            </Text>
          </Text>
          <Text>
            Next: author canonical notes → commit dev → merge dev into main → atomic push → Internal
            build
          </Text>
          <Text dimColor>
            No Play upload, tag, GitHub Release, or production mutation happens yet.
          </Text>
          <Text color="yellow">Prepare and push this release candidate? y/N</Text>
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
      {phase === 'internal-runs' && (
        <Box flexDirection="column">
          <Text bold>Watch / resume an Internal release</Text>
          {internalRuns.map((workflowRun, index) => (
            <Text key={workflowRun.id} color={index === runIndex ? 'cyan' : undefined}>
              {index === runIndex ? '◆ ' : '  '}#{workflowRun.run_number ?? workflowRun.id} ·{' '}
              {workflowRun.status === 'completed'
                ? (workflowRun.conclusion ?? 'completed')
                : workflowRun.status.replace('_', ' ')}{' '}
              · {workflowElapsed(workflowRun, clock)} ·{' '}
              {workflowRun.head_sha?.slice(0, 12) ?? 'SHA unknown'}
            </Text>
          ))}
          <Text dimColor>Newest first · ↑/↓ or j/k · Enter watches · Esc goes back</Text>
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
          <Text>Workflow definition: {plan.workflowRef}:.github/workflows/release-android.yml</Text>
          <Text>Repository: {plan.repo}</Text>
          <Text>Source SHA: {plan.sourceSha}</Text>
          <Text>Marketing version: {plan.marketingVersion}</Text>
          <Text>Destination: phone internal + Wear internal only</Text>
          <Text color="yellow">Create workflow run? y/N</Text>
        </Box>
      )}
      {promotionPlan && phase === 'promote-confirm' && (
        <Box flexDirection="column">
          <Text>
            Workflow definition: {promotionPlan.workflowRef}:.github/workflows/promote-open.yml
          </Text>
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
          <Text>
            Workflow definition: {productionPlan.workflowRef}
            :.github/workflows/promote-production.yml
          </Text>
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
      {phase === 'running' && watchedRun && progress && (
        <Box flexDirection="column">
          <Text>
            <Text color="cyan">[{progress.bar}]</Text> {progress.completed}/{progress.total} stages
          </Text>
          <Text>
            Now: <Text bold>{progress.current}</Text>
          </Text>
          {progress.detail && <Text dimColor>Step: {progress.detail}</Text>}
          <Box flexDirection="column" marginTop={1}>
            {progress.stages.map((stage) => (
              <Text
                key={stage.name}
                color={
                  stage.state === 'done'
                    ? 'green'
                    : stage.state === 'active'
                      ? 'cyan'
                      : stage.state === 'failed'
                        ? 'red'
                        : undefined
                }
                dimColor={stage.state === 'waiting' || stage.state === 'skipped'}
              >
                {stage.state === 'done'
                  ? '✓'
                  : stage.state === 'active'
                    ? '◆'
                    : stage.state === 'failed'
                      ? '✗'
                      : stage.state === 'skipped'
                        ? '–'
                        : '○'}{' '}
                {stage.name}
              </Text>
            ))}
          </Box>
          <Text>
            Elapsed: {workflowElapsed(watchedRun, clock)} · Remaining: {progress.remaining}
          </Text>
          <Text dimColor>
            Run #{watchedRun.run_number ?? watchedRun.id} · attempt {watchedRun.run_attempt ?? 1} ·{' '}
            {watchedRun.head_sha?.slice(0, 12) ?? 'source SHA unavailable'}
          </Text>
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
      {phase === 'complete' && !retryRunId && <Text dimColor>Q quit</Text>}
      {phase === 'error' && (
        <Box flexDirection="column">
          <Text color="red">{error}</Text>
          <Text dimColor>Q quit</Text>
        </Box>
      )}
    </Box>
  )
}

export async function runReleaseCli(options: ReleaseCliOptions = {}): Promise<ReleaseCliResult> {
  let result: ReleaseCliResult = { kind: 'exit' }
  const instance = render(<App {...options} finish={(next) => (result = next)} />)
  await instance.waitUntilExit()
  return result
}

if (import.meta.main) await runReleaseCli()
