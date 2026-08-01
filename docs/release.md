# Releases

How Vescape versions, notes, and Android releases work.

> Implementation tracked in issues [#307](https://github.com/KacperKozak/vescape/issues/307)–[#311](https://github.com/KacperKozak/vescape/issues/311). Until they land, tags and GitHub Releases are created only at production promote.

## Trains

A **train** is a `major.minor` version line (`1.0`, `1.1`). It exists implicitly: bumping the app to `1.1.0` starts train `1.1` — no ceremony.

- **New train (minor bump)** — a fresh "what's new" story worth its own page.
- **Patch within a train** — an addendum: fixes and follow-ups to the current story.

Unsure which to pick? It's low-stakes: features added in a patch still land in the current train's notes, and an over-eager minor bump only costs one extra notes file.

## Release notes: two tiers

| Tier                               | Where                                      | Audience     | Authoring                                                    |
| ---------------------------------- | ------------------------------------------ | ------------ | ------------------------------------------------------------ |
| Train notes `release-notes/X.X.md` | Bundled into the app ("what's new" screen) | Riders       | Codex draft, hand-curated, `New / Improved / Fixed` sections |
| Patch notes                        | GitHub Release body per `vX.Y.Z`           | Devs/testers | Codex-refined commit log, no curation                        |

Train notes stay editable while the train is pre-production. Once the train reaches production they are **frozen** — late edits trigger a CLI warning (typo fixes are fine; features belong in the next train).

## Tags and GitHub Releases

- Every version that passes an internal build gets an immutable tag `vX.Y.Z` on its build's `source_sha`, plus a GitHub **prerelease** with codex-generated patch notes. The CLI creates both after the internal workflow succeeds (workflows stay `contents: read`).
- **Prerelease flag = not on production yet.** A version that fails Open just stays a prerelease forever; the fix ships as the next patch.
- Production promote validates the train notes file exists, then flips the existing Release to full + latest. It creates nothing new.
- A version that fails the internal build gets no tag — the number is burned, nothing is visible.

## Lifecycle example

```text
prod = 1.0.3 (train 1.0, frozen)

prepare  → minor → 1.1.0, draft release-notes/1.1.md (or skip)
internal → build fails → no tag
prepare  → patch → 1.1.1
internal → success → tag v1.1.1 + GH prerelease
promote  → open track (soak)
prepare  → patch → 1.1.2, CLI: "new commits since 1.1.md — update?" → re-prompt codex
internal → success → tag v1.1.2 + prerelease
promote  → open → production
           validates 1.1.md, flips v1.1.2 to latest, freezes train 1.1
```

## Pieces

- `scripts/release/` — release CLI (`prepare`, internal dispatch, promote, production rollout controls).
- `scripts/release-notes/` — codex authoring, validation, and the bundler that compiles `release-notes/*.md` into `src/modules/release/generated/releaseNotes.ts`.
- `.github/workflows/release-android.yml` — internal build + Play upload from an immutable commit.
- `.github/workflows/promote-open.yml`, `promote-production.yml` — track promotion and rollout.
