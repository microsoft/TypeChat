# Experiment: a semi-automated TypeChat repository

For day-to-day commands and next actions, use the separate
[owner cheat sheet](./OWNER-CHEATSHEET.md).

We are exploring how agents can help maintain TypeChat while keeping community
discussion, clear acceptance criteria, and human accountability at the center
of the project.

Our goal is to reduce routine coordination and maintenance work so contributors
and maintainers can focus on useful ideas, design decisions, and quality.

Automation must follow [GOALS.md](./GOALS.md), the primary repository policy for
product scope. It can help carry out the project's direction, not choose a new
one. Changes to that policy require explicit human owner approval.

This is an early experiment. The workflow below describes our intended direction;
capabilities will be introduced incrementally, and not everything described here
is available today.

## Status and implementation history

**Last updated: 2026-10-30 (UTC).** The read-only
[Backlog assessment workflow](https://github.com/microsoft/TypeChat/actions/workflows/backlog-assessment.lock.yml)
is available for manual dispatch on `main`. The
[latest run](https://github.com/microsoft/TypeChat/actions/runs/40997369231)
completed successfully with the named owner, restricted tool choices, and
native diagnostics enabled after [#491](https://github.com/microsoft/TypeChat/pull/491)
merged. It inventories 20 issues and 13 open PRs. The earlier October 29
[preserved draft](./reports/backlog-assessments/2026-10-29-40962028077.md)
remains an unchanged historical snapshot.

The inventory is complete, but verification remains partial. The agent inspected
PR patches, reviews, and check records; it did not run tests or inspect job logs,
and did not retest the earlier restriction on two CI definitions. The report's direction classifications
and next steps remain advisory. Human review is still required. Copilot PR
reviews are now enabled through a separate repository rule; issue acceptance
and broader autonomy are not enabled. The
[owner-approved discussion pilot](#second-pilot-owner-approved-discussion-drafts)
is prepared for review, not yet activated.

| Implemented | Change | Current state |
| --- | --- | --- |
| 2026-10-26 | Community-facing plan and [README announcement](./README.md#repository-automation-experiment) | Documented. |
| 2026-10-26 | Shared [Copilot contributor and review guidance](./.github/copilot-instructions.md) | Merged; instructions do not configure automatic PR reviews. |
| 2026-10-26 | [Manual backlog assessment](./.github/workflows/backlog-assessment.md) | Available on `main` since 2026-10-27 (UTC), via [#482](https://github.com/microsoft/TypeChat/pull/482). First live report produced; maintainer review required. |
| 2026-10-26 | [Compilation checks](./.github/workflows/agent-workflow-check.yml) and [contract tests](./tools/tests/backlog-assessment.test.mjs) | Verified in [post-merge CI](https://github.com/microsoft/TypeChat/actions/runs/40454115457) on 2026-10-27 (UTC): strict compilation, no generated-file drift, and 17 passing tests. |
| 2026-10-26 | [Assessment model and reasoning effort](#model-selection) | GPT-6.1-sol and main-assessment `max` effort verified in the first live run on 2026-10-27 (UTC); threat detection keeps its separately configured default effort. |
| 2026-10-27 | [Compiler action pins](./.github/aw/actions-lock.json) and clearer drift diagnostics | Merged; the post-merge drift check passed on GitHub. |
| 2026-10-27 | [First live assessment](https://github.com/microsoft/TypeChat/actions/runs/40461739316) | Successful execution and report upload. All 24 issues and 26 PRs enumerated; selective PR investigation means overall coverage remains partial. |
| 2026-10-27 | [Clearer report language](#report-language) | Merged via [#485](https://github.com/microsoft/TypeChat/pull/485). The successful October 29 draft uses narrative entries, explicit next steps, and separate evidence notes; human review remains required. |
| 2026-10-27 | [Assessment budget](#inference-budget) | Main assessment increased from 200 to 400 AI credits via [#485](https://github.com/microsoft/TypeChat/pull/485), confirmed in the latest run. Detection keeps its separate default. |
| 2026-10-27 | [Owner-controlled project direction](./GOALS.md) | Merged via [#485](https://github.com/microsoft/TypeChat/pull/485). The latest draft classifies every item against the policy at its trusted commit. Scope judgments remain advisory; full GitHub approval enforcement still needs verification. |
| 2026-10-27 | [Second live assessment](#second-live-assessment) | Stopped at 120 model calls with 146.09 of 400 main-assessment credits used. Report validation and upload were skipped; no backlog report was produced. |
| 2026-10-29 | [Call and execution-time limits](#execution-limits) | Merged via [#490](https://github.com/microsoft/TypeChat/pull/490), then used in successful run 40962028077. Limits are 1,000 model calls, 60 minutes of agent execution, and a 100-minute enclosing job; credit budgets unchanged. |
| 2026-10-29 | [Successful policy-aware assessment](#successful-policy-aware-assessment) | All six jobs succeeded, including report validation and upload. Complete open-item inventory, with partial verification and human review still required. |
| 2026-10-29 | Human follow-through | Maintainers subsequently merged [#433](https://github.com/microsoft/TypeChat/pull/433) and [#437](https://github.com/microsoft/TypeChat/pull/437). The archive preserves their earlier assessment-time status. |
| 2026-10-30 | [Selected report archive](#archived-snapshot) | The October 29 draft is preserved unchanged with provenance and review limits, for normal PR review. No automatic archiving is enabled. |
| 2026-10-30 | Named project owner | [Policy](./GOALS.md), shared guidance, and [CODEOWNERS](./.github/CODEOWNERS) name `@robgruen`. Merged through [#491](https://github.com/microsoft/TypeChat/pull/491) and verified in the latest assessment. Existing branch-review protections are unchanged. |
| 2026-10-30 | [Model-visible tools and native diagnostics](#tool-boundaries-and-trustworthy-diagnostics) | Merged through [#491](https://github.com/microsoft/TypeChat/pull/491). All seven jobs in run 40997369231 passed; 216 model-selected calls stayed within the allowed set, with one failure and no repeated requests. |
| Not yet | [Owner-approved budget overrides](#owner-approved-budget-overrides-planned) | Future work only; no budget-override input or approval mechanism is enabled. |
| 2026-10-30 | [Automatic Copilot PR reviews](#github-copilot-pr-reviews) | Active for ready PRs targeting `main` and subsequent pushes; drafts are skipped. Configuration and the review on [#491](https://github.com/microsoft/TypeChat/pull/491) were verified. |
| Not enabled | Stricter human-review enforcement | Existing branch-review protections are retained at the owner's request. The written owner-approval requirement still applies. |
| 2026-10-30 | [Owner-approved issue and Discussion drafts](#second-pilot-owner-approved-discussion-drafts) | Prepared for review: owner-only draft and exact-draft publish commands, using the Actions bot. Merge and owner-commanded live verification remain pending. |
| Not yet | Explicit work acceptance | Separate human decision; no acceptance command is enabled. Publishing a draft does not accept work. |
| Not yet | Human-approved agent implementation | Planned with a future 1,000-credit implementation allowance; no build command, implementation workflow, or implementation spending is enabled. |
| Not yet | Selective automatic adoption | Future work, after public criteria and maintainer approval. |

These are implementation dates, not activation dates. Update this history,
the README summary, and the [owner cheat sheet](./OWNER-CHEATSHEET.md) as each
milestone changes. When a capability is enabled on
GitHub, record its activation date and link to the confirming pull request or
workflow run; do not mark unverified capabilities as active.

## Human-guided first

The initial agent-assisted workflow will require human approval for issue
responses and dispositions, acceptance of proposed work, implementation,
merging, and releases.

Agents may investigate problems, summarize discussions, suggest questions, write
tests, and propose changes. Automated tests and GitHub Copilot code reviews will
support review, not replace human judgment.

### GitHub Copilot PR reviews

**Enabled on 2026-10-30 (UTC).** The
[Automatic Copilot review on main](https://github.com/microsoft/TypeChat/rules/26174313)
rule requests reviews for ready pull requests targeting `main` and for
subsequent pushes to those PRs. This rule skips draft PRs; personal settings or
manual requests can still initiate additional reviews independently.

The saved rule and its application to `main` were verified through GitHub's API.
The [review on #491](https://github.com/microsoft/TypeChat/pull/491#pullrequestreview-5707624975)
was observed before its human-approved merge. The rule
does not accept issues, start implementation, merge changes, or satisfy a
required human approval. Existing branch-review protections and team visibility
were left unchanged at the owner's request.

Copilot code-review usage is separate from the assessment's 400-credit budget.
Its model and review effort follow GitHub Copilot code-review settings, not the
backlog workflow's model or `--reasoning-effort` argument.

### Protecting project direction

The direction owner is `@robgruen`. Goals, non-goals, and the
[items under consideration](./GOALS.md#under-consideration) can change only
through an owner-approved policy pull request. Under consideration does not mean
approved for implementation. Ordinary work already within the goals follows
normal maintainer review.

The assessment reads the policy at its trusted default-branch run commit. Each
issue and PR receives an **In scope**, **Needs owner decision**, or **Conflicts
with direction** classification, with a plain-language reason and a policy
citation. An unreadable policy or uncertain fit is not permission to recommend
implementation. Proposed policy edits in unmerged PRs do not replace the active
policy.

[CODEOWNERS](./.github/CODEOWNERS) covers the policy, this automation document,
any `AGENTS.md` guidance, the `.github/` controls, and repository automation tools
and tests. These rules request review from the named owner; they do not enable
required reviews themselves. The owner chose to keep existing branch-review
protections unchanged. The
[enforcement checklist](./GOALS.md#approval-and-enforcement) describes the
separate decisions needed for stricter GitHub enforcement. The written owner
policy must not be described as automatic approval enforcement.

An ownership change needs deliberate human owner approval: GitHub uses the
CODEOWNERS file already on the base branch, not the proposed one. Archived
reports retain the ownership policy used at their assessment commit. Record
activation only after the relevant changes have been merged and verified.

## First pilot: a draft backlog assessment

The first pilot is a [manually triggered assessment workflow](./.github/workflows/backlog-assessment.md).
It is now available on the default branch. Once the relevant organization
Copilot access is enabled, a maintainer can select
**Actions > Backlog assessment > Run workflow**, using `main`. Every report
remains a draft until maintainer review; successful execution alone is not
a complete backlog review or approval to act.

The workflow reads open issues, their discussions, and existing pull requests.
It proposes next steps and acceptance criteria in a draft report. It does not
post comments, change labels, accept or close issues, modify repository code,
or start implementation. Source inspection is not a claim that a reported
problem has been reproduced.

Download the **backlog-assessment** artifact from the completed Actions run.
Check its coverage and any reported gaps before acting on its recommendations.
A partial assessment is not a completed backlog review. Reports are temporary
Actions artifacts and follow the repository's visibility; they are not a
private channel for sensitive information.

The pilot uses GitHub Actions and the GitHub Copilot engine through
[GitHub Agentic Workflows](https://docs.github.com/en/copilot/concepts/agent-capabilities/agent-powered-workflows-and-operations/about-github-agentic-workflows),
which is in public preview. It requests organization-billed Copilot access using
the per-run Actions token, so the relevant organization policy must allow it.
No personal token or bot write credentials are needed for this read-only pilot.
It has time, turn, and inference-budget limits and no scheduled trigger.

### Report retention

The downloadable **backlog-assessment** report is kept for **seven days** by
default. The [source workflow](./.github/workflows/backlog-assessment.md) sets
`retention-days: 7`. In the generated workflow,
`GH_AW_DEFAULT_ARTIFACT_RETENTION_DAYS` overrides that value when set, subject
to GitHub Actions retention limits. Other artifacts, such as execution logs and
usage records, have their own retention settings; they do not extend the report's
lifetime.

The workflow does not automatically commit reports. Maintainers can select a
report for preservation through a normal pull request, with its run link,
assessed commit, coverage limits, and review status. The
[October 29 snapshot](./reports/backlog-assessments/2026-10-29-40962028077.md)
is the first selected report; its provenance is recorded
[below](#successful-policy-aware-assessment). Raw execution logs are not archived
with it.

The repository copy is not subject to the Actions artifact's seven-day expiry.
Keep the original snapshot unchanged and record later decisions separately.
Preserving a report does not approve its recommendations, make its findings
current, or replace the owner-approved scope policy.

### Report language

Reports should be easy to follow even when English is not the reader's first
language. The revised [writing guidance](./.github/workflows/backlog-assessment.md)
asks the agent to explain what each issue means for users, acknowledge existing
contributions, and describe a practical next step in short paragraphs.
Technical terms should be explained, not removed. Detailed evidence belongs in
clearly labeled notes rather than wide tables full of compressed phrases.

Clearer language must keep the same facts and limits. Reports still distinguish
what a contributor says from checks the assessment actually inspected. They
still identify incomplete coverage and decisions that need maintainer approval.
The writing change does not alter tools, permissions, model settings, or budgets.
Those follow-ups remain separate work.

### First live assessment

[Run 40461739316](https://github.com/microsoft/TypeChat/actions/runs/40461739316)
completed on 2026-10-27 (UTC). The draft contains 24 issue rows and 26 open-PR
rows. It investigated 11 issue-linked PRs more deeply, but left formal reviews
and head checks on the other 15 PRs, and inline review threads, for follow-up.
This is a useful review inventory, not a complete code review or merge approval.

Reported usage was 188.67 AI credits for the assessment and 7.43 for threat
detection, approximately 196.10 in total. These are reported usage units, not a
currency charge. That run used the earlier 200-credit main-assessment limit.
Limits are per component, not a combined workflow budget.

The run also revealed that permission approvals did not restrict the model's
tool inventory, and that built-in failure and repetition totals disagreed with
native tool records. The control changes below address those observations.
Historical artifacts are retained as originally produced, not rewritten.

### Tool boundaries and trustworthy diagnostics

**Activated and live-verified on 2026-10-30 (UTC).** The
[shared read-only controls](./.github/workflows/shared/read-only-analysis.md),
imported by the assessment and discussion drafter, set an explicit
Copilot CLI `--available-tools` filter as well as permission approvals. These
are separate controls: permission approval alone does not hide tools from the
model. See [Copilot CLI tool controls](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools).

The model's choices are limited to nine repository-scoped GitHub readers, four
local report tools (`apply_patch`, `glob`, `rg`, and `view`), and three reporting
signals. The issue and PR search tools used in the successful assessment are
explicitly included. Shell commands, web browsing, unrelated GitHub readers,
and subagent tools are not in that model-visible set. The existing read-only
token permissions, repository restriction, and secrecy guards are unchanged.
Internal gateway metadata calls may still appear in transport logs; they are
not additional model-selected actions.

The pinned CLI accepts the exact 16-tool argument, and contract tests check its
presence in the generated agent command without applying it to threat detection.
The [live assessment](https://github.com/microsoft/TypeChat/actions/runs/40997369231)
also verified all 216 model-selected calls stayed within this set. Its native
metrics recorded 215 successes, one failed local regular-expression query, and
zero repeated requests. The main agent used 148.42 credits and detection used
7.89 credits. The smaller backlog also contributed to the different workload;
the cost difference is not attributable solely to these controls.

For metrics, the pinned runtime counted transport records as extra failed tool
calls. Its shared lookup helper did not respect a filtered-session argument, and
an offline replay with version 1.0.1 also retained the incorrect failure count.
The runtime therefore remains pinned to 0.93.5 rather than being upgraded on
the assumption that this would fix the numbers.

Four affected built-ins are explicitly disabled: `tool-success-rate`,
`tool-failure-count`, `loops`, and `trajectory-efficiency`. Three replacement
diagnostics share a small implementation that reads only main-agent native
events and scopes call IDs to their original sessions:

| Recorded run 40962028077 | Original built-in result | Native-only replay |
| --- | --- | --- |
| Failed or unfinished tool calls | 421 | 5 |
| Successful tool calls | 37.81% | 98.08% (256 of 261) |
| Consecutive identical requests | 358 | 0 |

Real failures and unfinished calls are not discarded. The five recorded failures
were three denied shell attempts and two denied file reads. When evidence needed
for a metric is missing, unknown, or duplicated, that metric is explicitly
unavailable rather than guessed. Repetition compares actual names and arguments
within each session; repeating a request can be legitimate and is not by itself
proof of a loop.

These diagnostics do not approve work or replace test evidence. Custom graders
use the runtime's experimental feature. Importing the shared controls may omit
the compiler's experimental warning; that does not change the feature's status.
They run without model inference in a separate, read-only job after a
successful conclusion. If conclusion fails, that job is skipped; missing
results must not be interpreted as zero failures. The dedicated report
validation and upload steps, not a general-purpose artifact score, establish
whether a draft was delivered.

**CI evidence remains restricted.** The gateway classified the two CI-definition
reads in the recorded run as private-scoped data and denied them. This change
does not weaken that policy, widen credentials, or use another path to retrieve
the files. An authorized policy review or human-verified CI evidence is still
needed; assessments must keep the resulting coverage gap visible. The latest
run did not retry those reads and does not establish that access was restored.

### Inference budget

**Changed on 2026-10-27:** The main assessment is configured for **400 AI credits**
per run through `max-ai-credits` in the
[source workflow](./.github/workflows/backlog-assessment.md), increased from 200.
This merged through [#485](https://github.com/microsoft/TypeChat/pull/485), and
the second live run confirmed the setting. The call and timeout changes below
do not increase this budget.

Threat detection has a separate **400-credit default**, controlled by
`GH_AW_DEFAULT_DETECTION_MAX_AI_CREDITS`. That setting is unchanged. The
400-credit assessment budget is therefore not a cap for the entire workflow:
the two default component budgets total 800 credits. Actual usage may be lower,
and other configured guardrails can still prevent a run.

### Second live assessment

[Run 40586341288](https://github.com/microsoft/TypeChat/actions/runs/40586341288)
ran on 2026-10-27 (UTC), using the merged policy and writing guidance. It stopped
after 120 successful model calls while still researching issues and PRs.
The call limit, not the credit budget or timeout, ended the assessment.
The agent had not written a report, so report validation and upload were skipped.

Reported usage was 146.09 AI credits for the main assessment and 8.58 for threat
detection, approximately 154.67 in total. The run confirmed GPT-6.1-sol with
maximum reasoning effort, the 400-credit main budget, and a successful policy
read at the trusted run commit. Without a report, it did not validate the new
prose or direction classifications.

### Successful policy-aware assessment

[Run 40962028077](https://github.com/microsoft/TypeChat/actions/runs/40962028077)
completed successfully on **2026-10-29 at 22:33:24 UTC**, about 36 minutes after
the workflow started. It ran on the merged
[commit `a79b291`](https://github.com/microsoft/TypeChat/commit/a79b291556f81ad02ece6eec484219598573920a)
from [#490](https://github.com/microsoft/TypeChat/pull/490). All six jobs succeeded,
including the draft-report validation and upload.

The run used GPT-6.1-sol with maximum reasoning effort for the main assessment.
Recorded usage was:

| Component | Successful model responses | AI credits |
| --- | --- | --- |
| Main assessment | 195 | 387.86 |
| Threat detection | 6 | 8.82 |

The total, calculated before rounding the component figures, was **396.67 AI
credits**. The main assessment used about 97% of its own 400-credit allowance;
detection has a separate budget. This result confirms
the configured limits worked for this run, not a measured success rate for
future workloads or permission to increase spending.

The draft contains **21 open issues and 25 open PRs**, with a direction
classification and proposed human next step for each. Successful tool records
confirm reads of all 21 issue descriptions and all 25 PRs' descriptions,
changed files, reviews, review threads, and check records. The scope policy was
read at the trusted run commit, not from an unmerged proposal.

**Verification is still partial.** Two pinned CI definitions were inaccessible.
The assessment did not inspect job logs, run tests, reproduce bugs, or verify
proposed fixes. It is not a GitHub Copilot code review or approval to act.
The remaining control and evidence checks described above are still required
before expanding automation.

#### Archived snapshot

The [dated report](./reports/backlog-assessments/2026-10-29-40962028077.md) is a
verbatim copy of the uploaded Markdown, including its original draft status,
contributor credit, and assessment-time findings.

- **Assessment start:** 2026-10-29T22:00:10.999Z, as recorded in the report.
- **Source artifact:** `backlog-assessment`, artifact ID `12938685685`.
  The Actions copy expires on 2026-11-05 at 22:30:23 UTC.
- **Original file:** 81,288 bytes.
- **File SHA-256:** `dd0e28402dcf3b589c6f4d077493351e6d1df9934aa9328e227934540406439f`.

Archival checks confirmed the original file's identity and cross-checked
coverage against recorded tool activity. They did not independently validate
every patch or recommendation. The preserved report remains an
**agent-generated draft requiring human review**. Review this selected snapshot
through the normal PR process; it is evidence, not project policy.

Later human follow-through includes [#433](https://github.com/microsoft/TypeChat/pull/433),
merged at 23:48:00 UTC, and [#437](https://github.com/microsoft/TypeChat/pull/437),
merged at 23:48:44 UTC on 2026-10-29. Those later decisions do not rewrite the
snapshot, which still describes the PRs as open at assessment time. Check current
issues, PRs, and the approved policy before acting on historical recommendations.

### Execution limits

**Changed on 2026-10-29:** The main assessment is configured for **1,000 model
calls** and a **60-minute execution timeout**, increased from 120 and 20 minutes.
These changes merged through [#490](https://github.com/microsoft/TypeChat/pull/490)
at 21:52:23 UTC that day. The subsequent successful run used the updated limits:

```yaml
timeout-minutes: 60
max-turns: 1000
max-ai-credits: 400
jobs:
  agent:
    timeout-minutes: 100
```

`max-turns` limits model requests, not GitHub API tool calls or report entries.
The 60-minute timeout applies to the main agent's execution. The enclosing job
has a 100-minute timeout, preserving the previous 40-minute allowance for setup,
report upload, and post-processing. This prevents setup from consuming the
agent's execution allowance. Detection and other jobs can add time to the
overall workflow; their limits and both credit budgets are unchanged.

These are ceilings, not a guarantee of completion or a measured coverage rate.
A run can still reach its credit budget or produce only a partial assessment.
Saving drafts incrementally remains a separate reliability follow-up.

### Owner-approved budget overrides (planned)

Future work: support a temporary main-assessment budget override for a specific
run after explicit approval from the human project owner, `@robgruen`.
Record the approved amount, reason, and intended run, and enforce approval before
inference starts. The run should record the approved allowance alongside actual
usage, without changing the default budget for later runs.

An agent must not approve its own increase. Approval must not bypass organization
billing limits, other guardrails, or the project's scope policy. **This is a
planned capability only:** no budget-override input or approval mechanism is
enabled by this change. Until implemented, budget changes require an
owner-reviewed change to the workflow source and generated workflow.

### Model selection

**Pinned on 2026-10-26:** The main assessment uses `gpt-6.1-sol` with `max`
reasoning effort. The setting is in the
[shared Markdown frontmatter](./.github/workflows/shared/read-only-analysis.md),
which is also used by the discussion drafter.

`engine.model` pins the model; `engine.args` passes the native Copilot CLI
`--reasoning-effort max` option and the model-visible tool filter. Preserve the
complete `--available-tools` argument when changing the model or reasoning
effort; the checked-in source is the authoritative configuration.
The generated assessment no longer falls back
to `GH_AW_MODEL_AGENT_COPILOT`, `GH_AW_DEFAULT_MODEL_COPILOT`, or `auto`.
The model and effort settings do not replace the separate time, turn, and
[credit limits](#inference-budget). Maximum effort can use more time and credits
within those limits.

The separate threat-detection job inherits `gpt-6.1-sol`, but not the main
assessment's extra CLI arguments. By design, `max` applies only to the main
assessment; the detector's reasoning effort remains at its own default.
Its explicit inherited model also replaces its previous model-variable fallback.

To change either setting, edit the Markdown source, regenerate the compiled
workflow, and update the model contract test and this documentation. The first
live run verified the pinned model and main-assessment `max` setting on
2026-10-27 (UTC). Local compilation and tests verify configuration, not continued
model availability or organization access; recheck live access when changing
the configuration. See the
[engine configuration reference](https://github.github.com/gh-aw/reference/engines/#extended-coding-agent-configuration)
and [Copilot model behavior](https://github.github.com/gh-aw/reference/engines/copilot/#capabilities-and-limitations).
Editor chat or subagent model preferences do not configure this workflow, and
its model setting does not configure GitHub Copilot PR reviews.

### Validation and rollout

Changes to the workflow are checked by compiling its Markdown source with
gh-aw **v0.93.5**. Maintainers should regenerate and commit both the
[compiled assessment](./.github/workflows/backlog-assessment.lock.yml) and
[compiled discussion drafter](./.github/workflows/discussion-draft.lock.yml), with
[compiler action pins](./.github/aw/actions-lock.json) together, rather than
edit the generated workflow directly:

```shell
gh aw compile backlog-assessment discussion-draft --strict --no-check-update --no-logo --action-tag 32ecafbc061c9af57e9361942099e381102ae304
```

The action reference above pins the v0.93.5 runtime. Keep the compiler pin file
checked in: otherwise successful action resolution can create new pins and
change generated comments in CI. After committing regenerated files, repeating
the command should leave `.github/` and `.gitattributes` unchanged, including
no new untracked files.

The workflow check also runs the contract tests in `tools/` (`npm ci --ignore-scripts` followed
by `npm test`), including checks that the runtime pin matches the compilation
command, generated drafting jobs cannot write to issues or pull requests, and
the separate publisher has only its target-specific comment permission.

The assessment itself remains report-only and does not change existing
maintenance and deployment workflows. The separate
[Copilot review rule](#github-copilot-pr-reviews) is enabled. Changes to stricter
human-review enforcement remain a separate owner decision.

## Second pilot: owner-approved discussion drafts

**Prepared on 2026-10-30 (UTC); not active until reviewed and merged to `main`.**
This pilot adds GitHub-native drafting and approved posting for both Issues and
Discussions. It does not accept work, change labels, close threads, start
implementation, create PRs, or merge changes. Existing Copilot PR review remains
a separate capability.

### Owner commands

Only the human project owner, **@robgruen**, may use these commands. Put the
command at the start of a **new comment**, with no additional text:

1. Post `/typechat draft` on one open, unlocked issue or Discussion.
2. Open **Actions > Prepare discussion draft**. After the run succeeds, review
   the exact preview and the sealed review artifact in its summary.
3. To approve posting that exact text, copy the summary's
   `/typechat publish <artifact-id>:<body-sha256>` command into a new comment
   on the **same thread**. The artifact ID and complete hash are required.
4. **Publish approved discussion draft** revalidates the approval and posts once
   as `github-actions[bot]`. For Discussions, this is a **top-level comment**,
   even if the owner's command was a reply.

Editing a command does not trigger or authorize a run. Other users, bots, PR
comments, non-default-branch code, and changed or deleted commands cannot
authorize drafting or publication. Comment events may still show ignored or
skipped workflow runs; they do not authorize model inference or posting.
No new public bot comment is made just to acknowledge a draft request.

If the wording is wrong, do not approve it. Add clarification to the thread and
request a new draft. There is no force-publish or editable-artifact shortcut.
Readiness classifications and suggested criteria are proposals only; a
maintainer must still record a separate acceptance decision before development.
Unclear scope or an item under consideration requires an owner decision.

### Drafting and posting are separate

The [drafting source](./.github/workflows/discussion-draft.md) uses a trusted
preparation job to freeze the public thread and approved policy. A read-only
agent examines that snapshot and related contributions. It proposes questions,
recorded requirements, suggested criteria, and a readiness recommendation.
Thread context is bounded at 1 MiB and 1,000 comments, including replies;
incomplete or oversized context is an error, not silent truncation.

The detector downloads the attempt-specific, immutable candidate artifact.
Trusted code adds its complete JSON text to the detector's agent-output input,
preserving any native safe outputs. This includes file-only candidates, not just
text the model sends to safe-output tools. Sealing requires an executed,
successful scan with a successful verdict; skipped scans, warnings, and failures
cannot authorize sealing.

After detection, a separate trusted job downloads that same candidate artifact
and checks its SHA-256 against an immutable scan-binding artifact from the same
run and attempt. The binding records the bytes staged for scanning and the
detector step's successful execution; the job's final verdict must also succeed.
The sealing job validates the structured output and downloads the **original**
context again. It checks for changes, renders the comment, and seals its exact
bytes and provenance. Model output cannot choose the publishing target, owner,
workflow identity, or approval record.

The [publisher](./.github/workflows/publish-discussion-draft.yml) runs no model.
Its Issue job has `issues: write`; its Discussion job has `discussions: write`.
Neither has repository-content write access or Copilot inference permission.
Both use the repository's short-lived Actions token, not a new personal token
or bot secret. The [protocol helper](./tools/discussion-draft.mjs) verifies the
owner, artifact/run provenance, approved body hash, and current context again
immediately before the one comment write.

Relevant policy or automation-code changes, new discussion evidence, edits,
closure/locking, or changes to referenced PR revisions invalidate a pending
draft. Unrelated commits with unchanged controls do not. GitHub does not offer
an atomic transaction across comments, policy, and PRs: last-moment checks reduce
races but cannot eliminate a concurrent change between checking and posting.
The posted body is never silently rewritten.

### Budgets, retention, and retries

The main drafting agent has a **50-AI-credit budget per run**. It reuses the
assessment's GPT-6.1-sol/max configuration, restricted tools, 1,000-call limit,
60-minute execution limit, and 100-minute enclosing job. The backlog assessment
keeps its **400-credit** main budget. Detection retains its **separate
400-credit default**, so 50 credits is not a combined workflow cap.
Publishing invokes no model. A **1,000-credit implementation budget** is a
future owner-approved implementation-stage setting only; this pilot enables
neither that spending nor a build command.

Context, candidate, scan-binding, and sealed draft artifacts are retained for seven days.
Approval validity ends at the earlier of artifact expiry or seven days after
artifact creation. Artifacts and Actions summaries follow repository visibility;
they are not a private channel and must not contain secrets or sensitive data.

Before posting, the publisher uploads a **publication-intent artifact** retained
for 30 days and verifies it outlives the draft's approval window. The repository
must permit that retention; an upload or retention check failure prevents the
write. The resulting receipt is also retained for 30 days. Do not delete
publication runs or intent artifacts while the associated draft remains valid.

Intent names are keyed by the sealed draft's artifact ID, not the publishing run
or attempt; the intent document still records both. Each history check makes one
repository-artifact request filtered by that exact name and reads at most two
matches. Only one match can be the current upload, so a second match always blocks
another write. Missing, malformed, or incomplete history fails closed. This avoids
enumerating unrelated workflow runs while finding intents across runs and reruns.

An existing exact comment from the verified Actions bot makes a retry a no-op.
A prior intent without a confirmed matching comment blocks another write,
including reruns and new publish commands for that artifact. A timeout may mean
GitHub accepted the comment: the workflow never retries that write blindly.
Inspect the original run and thread manually. Do not delete the intent to force
a retry; after resolving the uncertain outcome, request and approve a new draft.
Edited or removed bot comments are not automatically overwritten or recreated.

Owner operations are serialized per thread across both workflows, without
allowing another user's comments to enter that queue. GitHub concurrency is
not a FIFO queue: a newer pending owner command can replace an older pending
one. Wait for each operation to finish during the pilot.

### First live verification

After human review and merge, use **#75** as the first candidate if it remains
open and suitable. The owner should request a draft, review it, and then approve
the exact publish command. Verify one correct bot comment and a no-op retry.
Record the confirming runs before marking this capability active. Local tests
and compilation do not prove live Actions-token permissions or model access.

## From discussion to a reviewed change

We aim to keep the entire process on GitHub:

1. **Start with the community.** Use issues for bugs and feature requests, and
   Discussions for questions and exploratory conversations.
2. **Clarify the proposal.** Contributors, maintainers, and agents help establish
   the intended outcome, scope, non-goals, and testable acceptance criteria.
   Check the proposal against [GOALS.md](./GOALS.md). Unclear fit and items under
   consideration need an owner decision, not an assumption of acceptance.
3. **Accept the work.** A maintainer approves agreed, in-scope work before
   implementation begins. A direction change or exception needs an
   owner-approved policy change merged first. Material scope changes return
   to discussion.
4. **Propose an implementation.** A contributor or agent opens a pull request
   linked to the accepted work, with tests and supporting documentation.
5. **Review and accept the result.** Automated checks, GitHub Copilot review, and
   human review evaluate the change against its acceptance criteria. Maintainers
   approve merging and record the outcome in the original discussion or issue.

Accepting a proposal is not the same as accepting its implementation. Both
decisions should be clear and visible.

## Existing issues and contributions

The experiment will include the existing backlog, not only new submissions.

We will preserve prior discussions, decisions, and contributor credit; identify
related pull requests; and confirm whether older reports still apply. Existing
contributions should be reviewed and supported rather than duplicated.

Issues will not be automatically accepted or closed simply because of their age.

## Longer-term direction

Eventually, we want suitable community proposals to progress automatically from
discussion to accepted work when they meet clear, publicly documented criteria.
Agents could then help carry that work through implementation and review with
less manual coordination.

The criteria for automatic adoption will be discussed and published before that
behavior is enabled. Participation, elapsed time, or an agent's recommendation
alone will not guarantee acceptance.

Any future automatic adoption must remain within the owner-approved goals.
Changing those goals, making exceptions, or promoting an item under
consideration into accepted scope will continue to require explicit human
owner approval, even if routine work becomes more autonomous.

Ambiguous proposals and higher-impact decisions, including significant API
changes, security-sensitive work, and releases, will continue to involve humans.

## Gradual rollout

We plan to:

- Assess existing issues and related pull requests with maintainer oversight.
- Pilot assisted discussion, clarification, and acceptance.
- Pilot implementation with automated checks, Copilot review, and human approval.
- Evaluate quality and contributor experience before expanding automation.
- Introduce selective autonomy through reviewed, documented policy changes.

The process should remain understandable, correctable, and easy to pause.

## Participate

Continue contributing through issues, Discussions, and pull requests. You do not
need an agent or an AI subscription to participate. Feedback on this experiment
is welcome in GitHub Discussions.

Our existing [contribution guidance](./README.md#contributing),
[Code of Conduct](./CODE_OF_CONDUCT.md), and [support guidance](./SUPPORT.md)
continue to apply.

Please follow the [security reporting policy](./SECURITY.md) for vulnerabilities;
do not report sensitive security details in public issues or discussions.
