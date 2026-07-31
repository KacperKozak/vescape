import React, { useEffect, useState } from 'react'
import { Box, render, Text, useApp, useInput } from 'ink'
import type { ReleaseManifest } from './contracts'
import { promotionSummary, releaseOutcome } from './contracts'
import {
  canonicalNotesPath,
  createDispatchPayload,
  createPromotionDispatchPayload,
  dispatchInternalBuild,
  dispatchOpenPromotion,
  downloadManifest,
  downloadPromotionManifest,
  failedWorkflowJobs,
  findDispatchedRun,
  findPromotionRun,
  getWorkflowRun,
  listInternalCandidates,
  marketingVersion,
  type ReleaseTrackConfig,
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
  | 'confirm'
  | 'promote-confirm'
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

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function App() {
  const { exit } = useApp()
  const initialRef = process.argv.find((value) => value.startsWith('--sha='))?.slice(6) ?? 'HEAD'
  const [sourceRef, setSourceRef] = useState(initialRef)
  const [phase, setPhase] = useState<Phase>('select')
  const [status, setStatus] = useState('Ready')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [promotionPlan, setPromotionPlan] = useState<PromotionPlan | null>(null)
  const [candidates, setCandidates] = useState<ReleaseManifest[]>([])
  const [candidateIndex, setCandidateIndex] = useState(0)
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

  useInput((input, key) => {
    if (phase === 'select') {
      if (input.toLowerCase() === 'b' || key.return) setPhase('build-source')
      else if (input.toLowerCase() === 'p') void preparePromotion()
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
          <Text>B Build and send to Internal</Text>
          <Text>P Promote Internal → Open testing</Text>
          <Text dimColor>Choose an action</Text>
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
