---
name: to-issues
description: Break a plan, spec, or PRD into independently-grabbable issues on the project issue tracker using tracer-bullet vertical slices. Use when user wants to convert a plan into issues, create implementation tickets, or break down work into issues.
---

# To Issues

Break a VESC app plan into independently-grabbable GitHub issues using vertical slices (tracer bullets).

The issue tracker and triage label vocabulary live in `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`.

## Titles and Area Tags

Keep issue titles short and scannable.

If the source is a PRD with title:

```text
[PRD][<Area>] <PRD title>
```

then implementation issue titles must use:

```text
[<Area>] <number> - <Short verb phrase>
```

Examples:

```text
[Sanitizers] 1 - Move avg filter
[History] 2 - Rebuild buckets
```

If there is no PRD source/title, choose a regular feature tag instead:

```text
[<Feature Tag>] <number> - <Short verb phrase>
```

Examples:

```text
[Privacy Zone] 1 - Store zones
[Privacy Zone] 2 - Edit zones
```

Rules:

- Use the same `<Area>` prefix for all issues spawned from one PRD unless a slice clearly belongs elsewhere.
- When there is no PRD, use the same `<Feature Tag>` prefix for all issues spawned from the same plan unless the user asks for separate tags.
- If the user gives an explicit bracket tag/prefix, use it exactly after fixing only obvious typos.
- If the user does not give a tag, infer a short domain tag from the plan using the project's glossary vocabulary. Prefer a noun phrase over an implementation layer.
- Use 2-5 meaningful words after the number.
- Number from the approved slice order, not GitHub issue number.
- Apply the matching GitHub area label, e.g. `area:sanitizers`.
- If user types a typo for a known area, normalize it in issue metadata, e.g. `sanatizers` -> `sanitizers`.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference (issue number, URL, or path) as an argument, fetch it from the issue tracker and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

When publishing implementation issues, identify likely starting-point files while exploring. Prefer files that are already part of the behavior being changed, nearby tests, domain docs, native bridge/module entrypoints, route files, and established shared utilities. Keep this list small and useful: usually 3-8 paths, enough to give an AFK agent a head start without pretending the list is exhaustive.

For this app, include JS/TS route or domain files plus native Android/iOS module entrypoints when the slice crosses the bridge. Useful starting areas include `src/tune/`, `src/components/`, `src/hooks/`, `modules/vesc-ble/`, `modules/vesc-native/`, `docs/tune.md`, `CONTEXT.md`, and relevant ADRs under `docs/adr/`.

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
</vertical-slice-rules>

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Type**: HITL / AFK
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?

Iterate until the user approves the breakdown.

### 5. Publish the issues to the issue tracker

For each approved slice, publish a new issue to the issue tracker. Use the issue body template below. These issues are considered ready for AFK agents, so publish them with the correct triage label unless instructed otherwise.

Publish issues in dependency order (blockers first) so you can reference real issue identifiers in the "Blocked by" field. Do not publish concurrently when blocker references are needed.

Before publishing, re-check each issue has a **Likely files** section. Paths are navigational hints, not ownership boundaries. Do not force a path into the list if you are guessing without codebase evidence; write "Unknown - inspect <area/module> first" only when the repo structure cannot be narrowed further.

<issue-template>
## Parent

A reference to the parent issue on the issue tracker (if the source was an existing issue, otherwise omit this section).

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation.

Avoid code snippets unless a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape). Inline that snippet here and note briefly that it came from a prototype. Trim to the decision-rich parts - not a working demo, just the important bits.

## Likely files

Starting points for implementation. Include repo-relative paths and one short reason each. These are hints, not a complete or mandatory file list.

- `src/or/modules/path.ts` - why this file is probably relevant

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- A reference to the blocking ticket (if any)

Or "None - can start immediately" if no blockers.

</issue-template>

Do NOT close or modify any parent issue.
