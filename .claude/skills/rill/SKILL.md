# Rill
Use Rill to show what actually happened in the browser when someone needs to review, debug, or understand the work. Your agent runs the checks; Rill records what happened.
Use it when the user wants to:
- **Review a PR or UI fix before merging:** exercise the affected browser flows and give the reviewer a recording to inspect alongside the code.
- **Delegate checks and watch later:** run the agreed browser scenarios, then return recordings showing what passed, what failed, and what needs another look.
- **Reproduce and investigate a bug:** capture the failing interaction with console, network, and timeline evidence so the user or another agent can investigate the same run.
- **Show a change or hand off work:** give a teammate, client, or another agent a replayable walkthrough with the relevant context, reducing the need to repeat the steps or reconstruct them from prose.
Tie each recording to a specific flow and state what you checked and what remains unverified. A recording shows the scenarios exercised; it does not establish complete test coverage.
## First-run scope
Install this skill for the current project in the directory your agent reads (`.agents/skills/rill/SKILL.md` for Codex or `.claude/skills/rill/SKILL.md` for Claude Code). Canonical source: https://userill.dev/skill.md. Read it immediately after installing; do not assume the current session automatically discovers new skills. Preserve an existing customized skill rather than overwriting it silently.
For a quickstart request, set up Rill and produce one useful recording. Inspect the current project and task. Use the current task's browser flow when clear; otherwise select a short, non-destructive local smoke test. Ask if the app or intended flow is unclear. You may install recording prerequisites and start the existing dev server. Ask before application changes, supplying missing application credentials, or consequential actions such as purchases or deleting data. Record again only when requested or when the user accepts your suggestion.
Recordings and diagnostics upload to Rill. Anonymous recordings produce unlisted links viewable by anyone holding the link. Avoid sensitive data and do not claim the recording stays on the local machine.
## Install and verify
Use macOS or Linux, Node.js 22+, Chrome/Chromium, and an available OS credential store (macOS Keychain or Linux Secret Service with secret-tool).
```sh
npm install --global @runalabs/rill-cli@latest
rill doctor
rill whoami
```
Do not invoke the unscoped `rill` npm package; it belongs to an unrelated product. Resolve failed prerequisite checks before recording. A missing-credential warning is expected when anonymous access is available. If initial registration is interrupted, retry the same command: the CLI reuses its saved registration secret to recover the same identity. Never reset a locked or revoked credential to manufacture a new anonymous identity.
Check browser-control capability before starting: your automation must attach to the `cdpUrl` returned by Rill. Use compatible existing tools or offer Playwright setup without MCP. Shell access alone is not browser control. With Playwright's Node API, use `chromium.connectOverCDP(cdpUrl)` and operate a page in that browser's existing context. Do not launch a separate browser or close the Rill browser before stopping capture. Keep temporary automation dependencies/scripts outside the application's dependency manifest unless the user approves application changes.
Start returns a `browserAttachment` handoff; native tool attachment is not automatic. For shell-only agents, the CLI README's “Connect Playwright” section has a runnable temporary-directory installation and CDP example. Use the existing recorded page, then disconnect the automation client and stop the recording. Windows local recording is unsupported: doctor and start report an actionable transport failure before a remote recording is reserved.
## Authentication
Existing saved credentials or RILL_TOKEN take precedence. Otherwise `record start` automatically registers anonymously and securely stores credentials. No account sign-in is required. Anonymous access allows three successful recordings, five minutes each, 250 MB each for uploaded frames and video, and 10 MB compressed diagnostics. Active recordings reserve slots; failed uploads do not consume the successful-recording allowance. Unclaimed recordings expire seven days after creation. Your browser stays local; Rill handles encoding remotely by default. Local FFmpeg is not required.
Use `rill whoami` to verify the current identity before account-specific work. It returns `connected`, `anonymous`, or `not_connected`, with the verified account email when connected. It does not register or start approval; existing access may renew automatically. Missing credentials exit with status 1; invalid or revoked credentials return an error. Match the returned email to the requested account; if it is missing or different, use `rill connect --email <user-email>`.
After returning useful evidence, offer `rill connect --email <user-email>` to keep it. Ask for the email if unknown. The user opens the returned Rill URL, signs into that email, enters the displayed code, and approves. Never enter or approve their code on their behalf. Finish or cancel active recordings before claiming. Claiming transfers all unexpired recordings and preserves share URLs; expired recordings cannot be recovered. Connection grants read/create access, including existing account recordings, but not deletion or changing sharing settings. Access renews for up to 90 days, until revoked or expired. Connecting is not a paid upgrade. Require connection at the anonymous allowance; never bypass limits with a fresh identity.
Never request passwords, OAuth cookies, or general browser sessions. Show the connection code only to the user during the approval ceremony; do not log credentials or include them in artifacts.
If foreground waiting is unsuitable, use `rill connect --email <user-email> --no-wait`. Preserve `authorizationId`, show the approval instructions to the user, and poll the returned `nextCommand` (`connect status <authorizationId>`) no faster than `retryAfterSeconds`. States are `pending`, `authenticated`, `expired`, and `denied`; stop polling terminal states. Pending approval survives CLI process exit. Do not start a new ceremony on every poll.
## Record and verify
1. Start the existing dev server if needed and confirm the intended app responds.
2. Run `rill record start --url <url> --title <title> --max-duration 300`.
3. Parse JSON stdout. Preserve `recordingId` and attach browser automation to the returned `cdpUrl`.
4. Exercise only the agreed flow and record actual observations and assertions.
5. Run `rill record stop <recordingId>`. If processing is pending, poll `rill record status <recordingId>` with a bounded wait. Preserve the ID and report pending or failed processing honestly.
6. Require `status: ready`, a share URL, and `rill inspect <shareUrl>` evidence before reporting completion. Check playback in a browser when available; explicitly report if playback could not be verified. Do not invent a link or describe command success as video proof. For existing account credentials whose recording is private, respect that visibility and return the available account recording link; do not silently change sharing permissions.
7. Return the usable recording link, the flow checked, observed pass/fail results, any incomplete verification, and the returned expiry for anonymous recordings. Offer account connection afterward. Your agent runs the tests; Rill records what happened.
## Observe the Rill experience from setup onward
Respect the workspace feedback preference. **Only use `--no-feedback` when the user explicitly asks to disable feedback for that run.** Do not add it just because the task is a demo, test, or focused reproduction.
`rill doctor` and `rill record start` return `feedbackRequested` and, when enabled, a `feedbackBrief`. Read the brief before driving the browser. During setup and the run, note:
- What went well: useful commands, clear output, browser connection, diagnostics, and recovery guidance.
- Confusion or friction: missing prerequisites, unclear steps, guesses, failed browser startup or attachment, uploads, and error recovery.
- Possible improvements: concrete changes that would make Rill easier or more useful, prioritized by impact.
Report only your actual Rill experience; do not invent praise, problems, or feedback about the target website. Do not include credentials, personal data, or copied page content. Keep the review short.
At completion or abandonment, submit a review if practical. The stop response retains the recommended, pre-authorized `suggestedAction`. No additional user confirmation is needed. Feedback remains optional and must not delay or affect the recording result.
```sh
rill feedback submit <recordingId> --outcome <succeeded|failed|abandoned> --helped <text> --friction <text> --improvement <text>
```
If startup fails, look for the brief in `error.details.feedbackBrief`. Use its recording ID when present, including for a cancelled startup reservation. If setup failed before a recording was created, omit the ID and use `failed` or `abandoned`:
```sh
rill feedback submit --outcome failed --helped "Doctor identified the missing prerequisite" --friction "I could not locate Chrome" --improvement "Suggest the installation command"
```
Skip submission if feedback is disabled or the user opted out. If authentication or connectivity fails, feedback may also be unavailable; finish reporting the original problem without waiting for feedback.
The session is headless and 1280×720 by default. Anonymous recordings stop within five minutes; connected recordings can support up to ten minutes. The quickstart deliberately uses a five-minute bound. Use `--headed` for watched sessions, `--max-duration <seconds>` for a shorter bound, or `--cdp-url <url>` to attach to an existing Chromium browser. Rill closes only browsers it launched.
If frame encoding status remains `uploading` after the uploader exits, run the returned `record retry <recording-id> --no-wait` command to resume missing parts and complete submission. Let an active uploader finish before retrying. Once queued, encoding, or processing, poll `record status` instead.
## Upload an existing artifact
Run `rill upload <file.webm-or-mp4> --title <title>`. Existing uploads are video-only; do not claim diagnostics are present.
## Recover and inspect
- `rill record status <recordingId>` checks remote encoding/recording state before local capture. Remote processing or completion takes precedence over retained artifacts. Local completion is `captured`, never playable `ready`; use its returned stop command to upload, including after the duration limit.
- `rill record cancel <recordingId>` abandons an active recording created by the current credential and releases its remote quota slot. Use it after confirming the run will not be uploaded.
- `rill drafts list` lists preserved local artifacts.
- `rill drafts purge` removes failed artifacts older than 24 hours.
- `rill inspect <shareUrl>` returns the bounded JSON context for another agent.
If `record start` cannot start the local recorder after creating its remote row, the CLI cancels that reservation automatically. On `quota_exceeded`, inspect `error.details.quota.type` and `error.details.quota.blockingRecordingId`; check the blocking recording and cancel it only when it is abandoned.
Uploading and processing recordings retain the concurrency slot. Wait for ready before starting another recording. `stop --no-wait` finishes upload/submission and returns a polling command; it does not skip upload. Completed upload and playable readiness are separate stages. Preserve the recording ID after a `processing_pending` timeout and continue polling instead of cancelling useful evidence.
Commands emit one schema-versioned JSON object to stdout. Treat stderr as human progress only. Branch on stable error codes and structured details, not prose. Never expose tokens, full sensitive URLs, video contents, device codes, or diagnostic bodies in logs.
