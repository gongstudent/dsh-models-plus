# dsh-models-plus

English | [中文](README.zh.md)

A drop-in replacement for the DeepSeek Harness **Models** settings page, packaged as an
installable profile bundle.

It exists because the two changes it carries live *inside* the shipped page's dialog and
local-route control, where no extension point reaches them — so the page is forked rather
than extended.

## What it changes

| Change | Upstream behaviour | Here |
|---|---|---|
| Model-discovery search | Long candidate list, no filtering | A search box filters candidates by id; **Deselect all** clears every pick, including ones hidden by the filter |
| Local-route switch | Remounts on every settings revision (`key={revision}`), losing the optimistic state | Keeps the switch mounted, shows an optimistic on/off state, and resyncs the port field only when the stored port actually moves |
| Empty search result | — | A "no match" line instead of a blank list |

## Install

```sh
dsh plugin --profile web add github:gongstudent/dsh-models-plus
dsh web
```

Same thing as an explicit URL, or pinned to a release:

```sh
dsh plugin --profile web add https://github.com/gongstudent/dsh-models-plus.git
dsh plugin --profile web add github:gongstudent/dsh-models-plus#v1.0.0
```

Releases are tagged; check [the tags](https://github.com/gongstudent/dsh-models-plus/tags) for the
latest before pinning one.

`dsh plugin` forwards to pnpm inside the profile directory and then reconciles the
profile's bundle list against what is installed. Because this package declares
`dsh.bundle.patch`, it joins the layer stack automatically — no file edits.

Prerequisites on the machine doing the install: `pnpm` on `PATH` (the command reports
`pnpm not found on PATH` otherwise) and `git` (a `github:` spec is fetched over git). Both
hold on Windows; `dsh plugin` already spawns pnpm through a shell there.

A `github:` install fetches the repository as published, so the package must be **public**
and `lib/` must be committed. There is no build step at install time — the repository has no
`prepare` script, so pnpm does not run one.

To remove it:

```sh
dsh plugin --profile web remove dsh-models-plus
```

The shipped `ui-settings-models` row is only *disabled*, never replaced in place, so
removing the bundle restores it.

## Verify the composition without booting

```sh
dsh --profile web --dump-config | grep -A2 'models-plus'
```

## How it is wired

Three pieces have to agree, and all three are in `package.json`:

1. `dsh.bundle.patch` — marks the package as a profile bundle, so `dsh plugin add` activates it.
2. `cordis.patch.yml` — disables the shipped `ui-settings-models` row and inserts this one.
3. `dsh.client` + `exports["./client"]` — the host's client-module registry scans loader entries for
   the first and serves the file named by the second at `/plugins/dsh-models-plus/client.js`.
   The browser fetches it at runtime, so **no frontend rebuild is needed**.

## Development

`src/` is generated from a DeepSeek Harness checkout and then built to `lib/`.

```sh
node scripts/prepare-src.mjs /path/to/deepseek-harness-fork   # copy + rename
pnpm install
pnpm run build                                                # emits lib/index.js, lib/invariant.js, lib/client.js
```

`prepare-src` is mechanical on purpose: re-syncing against a newer checkout is one run plus a
review of the diff.

**`prepare-src` copies a checkout that already carries the local changes.** This repository's
`patches/` holds those changes as standalone patches, so a checkout without them can be used
instead. Apply the patches *in the checkout, before* copying — they carry harness-root-relative
paths, and the order matters because both touch `ModelsSection.module.css`:

```sh
cd /path/to/harness-checkout
git apply --3way /path/to/dsh-models-plus/patches/0002-local-route-switch.patch
git apply --3way /path/to/dsh-models-plus/patches/0001-picker-search.patch
node /path/to/dsh-models-plus/scripts/prepare-src.mjs .
```

That base must already contain upstream's local-route feature (`feat(llm-pi-ai): add configurable
local route proxy`); `0002` edits the control that commit introduced. Applying both patches to
`0e635bf^` reproduces this package's `src/` byte for byte apart from the rename in
`src/invariant.ts`.

Once this bundle is installed, the two local commits in the harness checkout are redundant — the
bundle ships their behaviour and the shipped row is disabled. Revert them there so the change
lives in exactly one place.

`lib/` is committed. The host serves the built bundle, and a git install does not run a build.

## Compatibility

**This package requires a DeepSeek Harness build that already ships the local route.** The route
itself — the loopback listener inside `@deepseek-ai/dsh-llm-pi-ai` — is host-side, is not part of
this package, and is absent from the published npm releases: `@deepseek-ai/dsh-llm-pi-ai` at
`0.1.5-rc.2` and `0.1.6-alpha.2` export no `LocalRouteServer` and contain no listener code. On
such a build the Models page still renders the local-route switch, but the switch is inert — the
`llm-pi-ai` section schema has no `localRoute` key there, so the write is dropped. The rest of
the page works normally.

DeepSeek Harness is pre-release and makes no compatibility promise. This bundle replaces a
shipped package by name, so a release that renames `ui-settings-models`, restructures the
`settings.section` slot, or changes the slot props will break it — the boot warns about an
unmatched patch id rather than silently doing nothing, and the page then simply does not
render. Re-run `prepare-src` against the newer checkout to recover.

## Limitations

- **The fork is total.** Upstream's own changes to the Models page do not reach this package
  until `prepare-src` is re-run; there is no partial override.
- **The host half is empty.** `src/index.ts` registers nothing — all behaviour is browser-side.
- **No type declarations ship.** `exports` resolves to built JavaScript only.
