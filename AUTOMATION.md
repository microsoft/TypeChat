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

**Last updated: 2026-11-03 (UTC).** The read-only
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
reviews are now enabled through a separate repository rule; broader autonomy
is not enabled. The
[owner-approved discussion pilot](#second-pilot-owner-approved-discussion-drafts)
has verified Issue draft-only, direct-reply, and duplicate-free reply retry runs.
Selected Issue and Discussion draft receipts, invalid-command reporting, and
controller-only no-op retries are now
[live-verified](https://github.com/microsoft/TypeChat/discussions/508#discussioncomment-19342916).
Manual response publication, Discussion replies, and Discussion acceptance
remain unverified live.
[Exact owner work acceptance](#exact-work-acceptance) and its no-op retry are
live-verified on an Issue. The separately owner-authorized
[Issue implementation pilot](#third-pilot-owner-triggered-issue-implementation)
published [#513](https://github.com/microsoft/TypeChat/pull/513), which received
normal CI, Copilot review, owner-approved follow-up fixes, and human approval
and merge. Its activation flag is unset; broader autonomy is not enabled.

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
| 2026-10-30 | [Owner-approved issue and Discussion drafts](#second-pilot-owner-approved-discussion-drafts) | Merged through [#493](https://github.com/microsoft/TypeChat/pull/493), [#494](https://github.com/microsoft/TypeChat/pull/494), and [#495](https://github.com/microsoft/TypeChat/pull/495). The Issue draft-only path passed in [run 41147057482](https://github.com/microsoft/TypeChat/actions/runs/41147057482) on 2026-10-31 (UTC); this does not verify publication or the Discussion path. |
| 2026-10-31 | Conversational responses and `/typechat reply` | Merged through [#498](https://github.com/microsoft/TypeChat/pull/498). [Run 41226698016, attempt 1](https://github.com/microsoft/TypeChat/actions/runs/41226698016/attempts/1) posted one checked Issue response. [Attempt 2](https://github.com/microsoft/TypeChat/actions/runs/41226698016/attempts/2) skipped inference and posting, preserving the original reply. Discussion and manual publication remain unverified live. |
| 2026-10-31 | [Exact owner work acceptance](#exact-work-acceptance) | Merged through [#503](https://github.com/microsoft/TypeChat/pull/503). [Run 41339605658, attempt 1](https://github.com/microsoft/TypeChat/actions/runs/41339605658/attempts/1) posted the exact Issue acceptance on 2026-11-01 (UTC); [attempt 2](https://github.com/microsoft/TypeChat/actions/runs/41339605658/attempts/2) skipped the write and preserved the original record. Discussion acceptance remains unverified live. |
| 2026-11-02 | [Completion receipts](#completion-receipts) | Merged through [#506](https://github.com/microsoft/TypeChat/pull/506). [Owner-authorized live checks](https://github.com/microsoft/TypeChat/discussions/508#discussioncomment-19342916) verified Issue/Discussion input-needed draft receipts, an invalid-command receipt, and controller-only no-op retries; other outcomes and uncertain-write recovery are not claimed live-verified. |
| 2026-11-02 | [Owner-triggered Issue implementation](#third-pilot-owner-triggered-issue-implementation) | Merged through [#507](https://github.com/microsoft/TypeChat/pull/507), default-off. The separately authorized [#220 run](https://github.com/microsoft/TypeChat/actions/runs/41493733655) correctly blocked a candidate that failed strict Pyright checks; manual recovery did not change that failed result. |
| 2026-11-02 | Acceptance and build acknowledgments | Merged through [#510](https://github.com/microsoft/TypeChat/pull/510). A thumbs-up on the [#75 acceptance command](https://github.com/microsoft/TypeChat/issues/75#issuecomment-6592727753) confirmed recorded acceptance; a rocket on the [build command](https://github.com/microsoft/TypeChat/issues/75#issuecomment-6592903964) acknowledged startup, not success. Discussion acknowledgment remains unverified live. |
| 2026-11-03 | [Successful App publication and human review](#successful-app-publication-and-human-review) | [Run 41559378978](https://github.com/microsoft/TypeChat/actions/runs/41559378978) created [#513](https://github.com/microsoft/TypeChat/pull/513). Normal CI and Copilot reviews ran, human follow-up fixes were verified, and the owner approved and merged the PR. Original automated evidence remains bound to its original commit; activation is again unset. |
| Not yet | Selective automatic adoption | Future work, after public criteria and maintainer approval. |

These are implementation dates, not activation dates. Update this history,
the README summary, and the [owner cheat sheet](./OWNER-CHEATSHEET.md) as each
milestone changes. When a capability is enabled on
GitHub, record its activation date and link to the confirming pull request or
workflow run; do not mark unverified capabilities as active.

## Human-guided first

The agent-assisted workflow requires human authorization for public responses.
`/typechat draft` and `/typechat publish` retain exact-text review. The owner-only
`/typechat reply` command instead gives advance authorization for one advisory
response after validation and threat detection; it does not authorize continuing
autonomous conversation. The separate owner-only `/typechat accept` command
approves exact proposed terms; its Issue path is live-verified. Dispositions,
acceptance of work, implementation runs, merging,
and releases remain separate human decisions.

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
gh-aw **v0.93.5**. Maintainers should regenerate and commit the
[compiled assessment](./.github/workflows/backlog-assessment.lock.yml) and
[compiled discussion drafter](./.github/workflows/discussion-draft.lock.yml), plus
the [compiled implementation pilot](./.github/workflows/issue-implementation.lock.yml), with
[compiler action pins](./.github/aw/actions-lock.json) together, rather than
edit the generated workflow directly:

```shell
gh aw compile backlog-assessment discussion-draft issue-implementation --strict --no-check-update --no-logo --action-tag 32ecafbc061c9af57e9361942099e381102ae304
```

The action reference above pins the v0.93.5 runtime. Keep the compiler pin file
checked in: otherwise successful action resolution can create new pins and
change generated comments in CI. After committing regenerated files, repeating
the command should leave `.github/` and `.gitattributes` unchanged, including
no new untracked files.

The workflow check also runs the contract tests in `tools/` (`npm ci --ignore-scripts` followed
by `npm test`), including checks that the runtime pin matches the compilation
command, model execution stays read-only, reactions stay in trusted activation,
and reply/publication jobs have only their target-specific comment permission.
The discussion tests execute the compiled detection guard with Bash (Git Bash
on Windows), covering collected completion/incomplete signals and a missing signal.

The assessment itself remains report-only and does not change existing
maintenance and deployment workflows. The separate
[Copilot review rule](#github-copilot-pr-reviews) is enabled. Changes to stricter
human-review enforcement remain a separate owner decision.

## Second pilot: owner-approved discussion drafts

**Issue direct replies and no-op retries verified on 2026-10-31 (UTC);
selected completion receipts verified on 2026-11-02 (UTC).**
This pilot provides GitHub-native previews and owner-requested replies for Issues
and Discussions. Input-needed Issue and Discussion draft outcomes and their
receipts were verified in [the owner-authorized checks](https://github.com/microsoft/TypeChat/discussions/508#discussioncomment-19342916).
Discussion replies, Discussion acceptance, and manual response publication
still need live verification. Issue work acceptance and its no-op retry were
verified on 2026-11-01 (UTC). These discussion commands do not change labels,
close threads, start an implementation run, create PRs, or merge changes.
Existing Copilot PR review remains a separate capability.

### Owner commands

Only the human project owner, **@robgruen**, may use these commands. Put the
command in a **new comment**, with no additional text:

| Command | Authorization and result |
| --- | --- |
| `/typechat draft` | Prepare a conversational reply and, when ready, a work-acceptance preview; do not post either. Report the operational outcome separately through a trusted receipt. |
| `/typechat publish <artifact-id>:<body-sha256>` | Approve and post that exact reviewed draft. |
| `/typechat reply` | Authorize one checked advisory reply to be posted without a second approval command. |
| `/typechat accept <artifact-id>:<acceptance-sha256>` | Approve and record the exact proposed scope and criteria. No implementation run or merge is authorized. |

Use `/typechat draft` when you want to review the wording first. Use
`/typechat reply` only when you want the agent to respond publicly after the
checks. The public comment addresses the author and answers or asks focused
clarifying questions; scope analysis, readiness, criteria, and detailed evidence
remain in Actions rather than being posted as a report. Actions artifacts still
follow the public repository's visibility. A separately approved acceptance
record intentionally makes its exact scope, non-goals, and criteria public.

For the preview-and-approve route:

1. Post `/typechat draft` on one open, unlocked issue or Discussion.
2. Open **Actions > TypeChat discussion response**. After the run succeeds, open
   the **Seal discussion draft** job summary for the exact preview, approval
   command, and separate assessment.
3. To approve posting that exact text, copy the summary's
   `/typechat publish <artifact-id>:<body-sha256>` command into a new comment
   on the **same thread**. The artifact ID and complete hash are required.
4. **Publish approved response or work acceptance** revalidates the approval and posts once
   as `github-actions[bot]`. For Discussions, this is a **top-level comment**,
   even if the owner's command was a reply.

For `/typechat reply`, the same preparation, model, scan, and sealing stages run.
Trusted, target-scoped jobs then post one top-level response as the Actions bot.
The model itself has no GitHub write access. No publish command is generated for
this mode, and its artifacts cannot be repurposed for manual publication or acceptance.

Editing a command does not trigger or authorize a run. Other users, bots, PR
comments, non-default-branch code, and changed or deleted commands cannot
authorize drafting or publication. Comment events may still show ignored or
skipped workflow runs; they do not authorize model inference or posting.
An `eyes` reaction on a draft or reply command comment acknowledges that the
workflow has started processing the request. It is not confirmation that a draft
is ready, that scanning succeeded, or that work was accepted. Check Actions for
completion and errors. Native workflow code handles the reaction; the model
retains read-only access.
No new public bot comment is made just to acknowledge a request.
The pinned compiler grants reaction-write permissions to trusted activation,
including `pull-requests: write` because GitHub also uses `issue_comment` for PR
comments. The owner-only workflow guard still excludes PR comments. These write
permissions are not granted to model execution, detection, or sealing.

If a preview's wording is wrong, do not approve it. Add clarification to the
thread and request a new draft. Direct replies do not have a pre-post wording
review; use the preview route when that review is needed. There is no
force-publish or editable-artifact shortcut.
Readiness classifications and suggested criteria are proposals only; a
maintainer must still record a separate acceptance decision before development.
Unclear scope or an item under consideration requires an owner decision.

### Completion receipts

**Merged through [#506](https://github.com/microsoft/TypeChat/pull/506);
selected outcomes live-verified on 2026-11-02 (UTC).** Eyes acknowledge that a
draft or reply request has started. The separate
[outcome workflow](./.github/workflows/discussion-status.yml) waits for the full
response workflow to finish, including failures and cancellations, then records
one short, trusted operational outcome for the original command.

The [verification report](https://github.com/microsoft/TypeChat/discussions/508#discussioncomment-19342916)
records input-needed Issue and Discussion draft receipts, an invalid-command
receipt, and controller-only retries that preserved comment IDs, text hashes,
update timestamps, and counts without another model run. Cancellation,
uncertain-network-write recovery, acceptance-ready wording, and direct-reply
reuse were not exercised live in those checks; offline coverage is not live
evidence for those paths.

The receipt links the owner request and run/preview. Its fixed messages distinguish
a prepared proposal, additional input, outdated or unavailable evidence, rejected
syntax, failure/cancellation, and an unconfirmed reply. It does not publish the
model's draft, questions, assessment, or private diagnostic text. Preparing a
draft is not accepting work or starting implementation.

A successful public reply already serves as completion, so no extra "done"
comment is created. If a failure receipt already exists and a reply is later
confirmed, the same receipt is updated to link it. Manual response publication
and acceptance keep their existing outcome comments; this extension does not
add notifications to those separate publisher runs.

Only the verified Actions bot's exact, canonical operational receipts are omitted
from frozen discussion evidence. Other bots, copied receipts on another target,
edited receipt text, substantive replies, acceptance records, and member responses
remain evidence. Thus a receipt does not itself make its draft stale, while real
discussion changes still do.

The source run name carries trusted event, target, and comment identifiers, not
issue titles or comment prose. The completion workflow authenticates its own
default-branch code, the source workflow/run/repository/owner, and the unchanged
original command before any write. Issue and Discussion jobs have only their
own target's comment-write permission. No model or App credential is used.

Receipts are serialized per command and guarded by durable create/update intents.
An identical outcome is a no-op; a newer outcome updates the managed comment,
not another comment. Update intents bind the exact receipt body being replaced,
not the source run or attempt. A later completion cannot mutate that same body
while an earlier update is unresolved. Observing the earlier canonical update
confirms it has taken effect before another mutation can proceed.
Edited receipts are not overwritten. A retained creation intent blocks
recreation after deletion. Both creation and updates require a command younger
than seven days, so their 30-day intents outlive the write-authorization window.
Intents and result artifacts are kept for 30 days.
Do not delete intents to force a retry after an uncertain API outcome.

Delivery is fail-closed, not a guarantee of commenting despite lost permissions
or unavailable evidence. Withdrawn/edited requests, closed/locked targets, older
run-name formats, and superseded attempts do not receive new comments. If the
controller cannot authenticate or verify its inputs, Actions remains the error
channel. Use a new owner command on the current workflow revision; rerunning old workflow revisions
does not add the new request binding or receipt behavior.

### Exact work acceptance

**Issue acceptance and retry verified on 2026-11-01 (UTC); Discussion verification
is pending.** Ordinary
human maintainer acceptance remains available. The automated pilot accepts only
an explicit command from the project owner; it does not replace the normal
maintainer process or grant the model acceptance authority.

Use `/typechat draft` after the discussion establishes the intended outcome,
boundaries, and completion criteria. A candidate may contain a proposal only
when its scope is `in_scope`, its readiness is `ready_for_owner_decision`, and
it has no open questions. The proposal must name a goal, nonempty scope and
non-goals, and nonempty testable criteria. Other readiness states cannot produce
an acceptance preview. These checks do not replace the owner's judgment about
scope, evidence, or whether the criteria are adequate.

The **Seal discussion draft** summary shows a separate **Work acceptance
preview (not yet accepted)** and its command:

```text
/typechat accept <artifact-id>:<acceptance-sha256>
```

Review the whole preview, including its policy and existing-contribution links,
then copy that exact command into a new comment on the same thread. Approval
must follow creation of the sealed artifact. The trusted publisher rechecks
the original draft command, approval, completed successful producer, unchanged
policy and discussion, referenced PR revisions, and exact acceptance hash
before posting one top-level **Accepted work** comment.

After confirming that exact record, the publisher adds a thumbs-up reaction to
the owner's `/typechat accept` comment, on either an Issue or a Discussion.
The reaction confirms recorded acceptance, not merely receipt of the command.
The [#75 owner acceptance command](https://github.com/microsoft/TypeChat/issues/75#issuecomment-6592727753)
received this reaction after its exact record was confirmed on 2026-11-03 (UTC).
Discussion acknowledgment remains unverified live.
Rejected approvals and unconfirmed publication outcomes do not receive it.
An unchanged, already-published record can also confirm a subsequent valid
approval command without creating another acceptance comment.

Reaction failures are reported separately from the already-recorded decision.
A valid publisher retry can restore the reaction without editing or reposting
accepted work. Reaction requests are idempotent, and reactions do not change
the frozen discussion evidence. The existing target-scoped publisher credentials
are reused; the acceptance record, not the reaction alone, remains authoritative.

The conversational response and acceptance record have different hashes and
publication markers. A response publish command cannot accept work; an accept
command cannot use the response hash. A direct-reply artifact cannot be accepted.
Publishing either preview changes the thread, so posting the other requires a
new draft and approval rather than reusing stale evidence.

The posted comment preserves the exact goal, scope, non-goals, criteria, policy
revision, and contribution references after the draft artifact expires.
Acceptance approves pursuing that work, not an automated implementation run,
larger budget, merge, or release. No label, assignment, or closure is changed.
A scope exception still requires a reviewed, merged policy change first.

Material scope changes or withdrawal require a visible human decision in the
thread. Return to discussion and prepare a new proposal when appropriate; do
not edit a sealed artifact or silently rewrite an acceptance record. Removing
an approval command does not erase an already posted decision. No implementation
workflow consumes these records automatically.

The owner accepted [#504](https://github.com/microsoft/TypeChat/issues/504) using
the exact preview from [run 41337633188](https://github.com/microsoft/TypeChat/actions/runs/41337633188).
The [accepted record](https://github.com/microsoft/TypeChat/issues/504#issuecomment-6562465109)
matched the reviewed body hash, approval, producer, and durable intent.
[Publisher attempt 2](https://github.com/microsoft/TypeChat/actions/runs/41339605658/attempts/2)
skipped intent upload and posting; the record's text and timestamp were unchanged.
No coding agent, new permission, or implementation allowance was activated.

### Drafting and posting are separate

The [drafting source](./.github/workflows/discussion-draft.md) uses a trusted
preparation job to freeze the public thread and approved policy. A read-only
agent examines that snapshot and related contributions. It writes the actual
reply and a separate assessment containing questions, recorded requirements,
suggested criteria, a readiness recommendation, and an eligible proposal or
explicit `null`. The model never marks its own proposal accepted.
Discussion evidence remains bounded at 1 MiB and 1,000 non-receipt comments,
including replies. Canonical operational receipts have a separate collection
allowance so they do not consume that existing budget: the raw thread is capped
at 2 MiB and 2,000 comments. The prepared model context still has its original
1 MiB limit. Incomplete or oversized context is an error, not silent truncation.

Do not seed a native `noop` before model execution: the pinned runtime interprets
it as completed work and skips the model. The model writes the candidate first,
then emits its native completion signal. If it emits no terminal safe output,
the pinned collector records an explicit `report_incomplete` signal rather than
treating silence as successful work. The detection guard consumes the collected
output types. Before rendering or sealing an artifact, the trusted sealing step
requires `noop` to be the only collected output type. Missing or unknown outputs
and `report_missing_data` or `report_incomplete` reports fail sealing, including
reports combined with `noop`. Both reply writers require a successful seal, so
publication cannot race the later conclusion job's handling of failure reports.

The first owner-commanded [draft run](https://github.com/microsoft/TypeChat/actions/runs/41136773812)
on 2026-10-30 exposed this preflight behavior. The synthetic pre-agent no-op caused
the model to be skipped, so no candidate or sealed draft was produced. Detection
and sealing failed closed, and nothing was published. The subsequent fresh run
verified removal of that premature completion signal; the failed run is not
evidence that drafting or scanning succeeded.

The subsequent [run 41147057482](https://github.com/microsoft/TypeChat/actions/runs/41147057482)
at `6df1633` completed all nine jobs successfully on 2026-10-31 (UTC). The eyes
reaction appeared on the command comment, model and detector execution were
recorded, the detector returned no findings or warnings, and the candidate,
scan binding, and sealed preview passed integrity checks. Reported inference
usage was 25.20181 drafting credits and 8.94265 detection credits (34.14 total
after rounding). This verifies that revision's Issue draft-only path, not the
new response format, direct posting, manual publication, or the Discussion path.

After [#498](https://github.com/microsoft/TypeChat/pull/498) merged, the owner
requested `/typechat reply` on #75.
[Run 41226698016, attempt 1](https://github.com/microsoft/TypeChat/actions/runs/41226698016/attempts/1)
at `9905c6e` completed generation, detection, sealing, and Issue publication on
2026-10-31 (UTC). The eyes reaction was on the command comment, the scan returned
no findings or warnings, and the [single public response](https://github.com/microsoft/TypeChat/issues/75#issuecomment-6547150012)
matched the sealed body and receipt hashes.
[Attempt 2](https://github.com/microsoft/TypeChat/actions/runs/41226698016/attempts/2)
detected that reply before inference and skipped the model, detector, seal, and
writers. The comment count, body hash, and update timestamp were unchanged.
These results verify that revision's Issue direct-reply and retry paths, not
manual publication, Discussions, or the acceptance extension.

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

Direct replies use equivalent target-scoped writer jobs in the response
workflow. They consume the artifact ID and body hash from their own successful
seal, plus successful model, detection, and sealing job results. The enclosing
run need not have completed, since its writer is still running. A writer-only
rerun may inherit a successful seal from an earlier attempt of that same run;
it cannot substitute another run's artifact or bypass a failed mandatory stage.
The manual publisher still requires a completed, successful drafting run and
approval given after the artifact exists.

Response bundles and publication intents use protocol version 3. Sealed bundles
include either an exact acceptance body/hash or `null`; both renderings are
recomputed and checked before any write. Prepared context and scan bindings
remain version 1. The stable direct-reply command marker remains version 2 so
bundle-schema changes do not change command identity. Acceptance records use
their own version-1 marker. Existing artifacts from older control revisions are
stale; generate a new draft instead of editing or converting them to bypass
validation.

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
Publishing a response or acceptance invokes no model. The separate
[implementation pilot](#third-pilot-owner-triggered-issue-implementation)
configures a **1,000-credit main budget** and **400-credit detection budget**,
but remains disabled until later owner activation. Discussion commands do not
activate either allowance.

Context, candidate, scan-binding, and sealed draft artifacts are retained for seven days.
Approval validity ends at the earlier of artifact expiry or seven days after
artifact creation. New writes for `/typechat reply` also require a command
younger than seven days. Artifacts and Actions summaries follow repository visibility;
they are not a private channel and must not contain secrets or sensitive data.

Before posting, the publisher uploads a **publication-intent artifact** retained
for 30 days and verifies it outlives the draft's approval window. The repository
must permit that retention; an upload or retention check failure prevents the
write. The resulting receipt is also retained for 30 days. Do not delete
publication runs or intent artifacts while the associated draft remains valid.

Manual response intents are named `typechat-publish-intent-<artifact-id>`;
acceptance intents use `typechat-publish-intent-accept-<artifact-id>`. Both are
keyed by the sealed draft, but authorization modes cannot share an intent. Direct
reply intents and bot-comment markers are keyed by the owner command and target,
not the generated artifact or attempt. This preserves one reply per command
across regeneration, new runs, and reruns. The intent document records the mode,
artifact, body hash, run, and attempt. Each history check makes one
repository-artifact request filtered by that exact name and reads at most two
matches. Only one match can be the current upload, so a second match always blocks
another write. Missing, malformed, or incomplete history fails closed. This avoids
enumerating unrelated workflow runs while finding intents across runs and reruns.

Within the valid approval window and under unchanged controls, an existing exact
comment from the verified Actions bot makes a manual publication retry a no-op.
A prior intent without a confirmed matching comment blocks another write,
including reruns and new publish or accept commands for that artifact. A timeout may mean
GitHub accepted the comment: the workflow never retries that write blindly.
Inspect the original run and thread manually. Do not delete the intent to force
a retry; after resolving the uncertain outcome, request and approve a new draft.
Edited or removed bot comments are not automatically overwritten or recreated.
Expiry blocks new publication; it does not remove a previously recorded scope
agreement from the thread.

Before spending inference credits on a reply command, preparation checks for an
existing Actions-bot reply or unresolved intent. An existing command-specific
reply returns its link and skips the model at the job level; it does not seed a
premature native no-op. An unresolved intent without a confirmed reply blocks
new work. Do not delete the intent or post another command to retry an uncertain
write blindly; inspect and resolve the outcome first.

Owner operations are serialized per thread across both workflows, without
allowing another user's comments to enter that queue. GitHub concurrency is
not a FIFO queue: a newer pending owner command can replace an older pending
one. Wait for each operation to finish during the pilot.

### First live verification

The Issue `/typechat reply` and `/typechat accept` paths and their no-op retries
passed in the runs recorded above. Manual response publication and Discussions
still need separate live checks:
request `/typechat draft`, review its preview, approve its exact publish command,
and verify a no-op publication retry.
Exercise the Discussion path separately rather than inferring its permissions
from an Issue run.

For additional acceptance checks, choose genuinely agreed, in-scope work for a
fresh draft. An accept command is a real human acceptance decision,
not a harmless test: do not approve unresolved work merely to exercise the
workflow. Review the exact acceptance preview, approve it, verify one unchanged
record on retry, and check both Issue and Discussion writers separately.
Use new commands to test new code, not reruns of older workflow revisions.
After completion receipts are reviewed and merged, verify a new owner draft
receives exactly one fixed outcome comment with the correct run link. Confirm
that the receipt does not stale the draft before exact publication/acceptance,
that a repeated completion does not duplicate it, and that failures/cancellations
are distinguished from a prepared proposal. Verify the Discussion path separately.
Do not manufacture owner commands or malformed model output just to force a
successful result; use genuine owner-authorized cases and preserve blocked states.

Record the confirming runs before marking a new path active. Local tests
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

## Third pilot: owner-triggered Issue implementation

**Default-off; successful App PR publication verified on 2026-11-03 (UTC).** The
[accepted agreement for #504](https://github.com/microsoft/TypeChat/issues/504#issuecomment-6562465109)
authorizes development of this workflow, not an automated coding run. The new
[workflow](./.github/workflows/issue-implementation.md) requires
`TYPECHAT_IMPLEMENTATION_ENABLED` to equal `true` and a fresh owner Issue comment:

```text
/typechat build <acceptance-comment-id>:<acceptance-sha256>
```

The identifier names the durable public acceptance comment, not an expiring
draft artifact. A manual dispatch of **TypeChat accepted Issue implementation**
with `issue` and `acceptance` inputs verifies the record and prints a copyable
command without model execution or App-token creation. Only the exact canonical,
unchanged Actions-bot record, backed by an unchanged prior owner acceptance
command with the same hash, is supported. Ordinary manual acceptance remains
valid human governance but is not machine-readable authority for this pilot.
Discussion builds and inline notes remain unsupported; #502 is still deferred.

The native rocket reaction acknowledges startup for an eligible owner build
command. It does not mean that agreement validation, App preflight, generation,
or tests have passed. Manual command preparation does not add a reaction or
authorize execution. Only trusted activation receives reaction-write permissions;
the pinned compiler also grants `pull-requests: write` for the shared
`issue_comment` event, while the owner guard continues to reject PR comments.
The coding agent, detector, and generated checks retain read-only repository access.
No start comment is posted.

The owner-authorized [live run](https://github.com/microsoft/TypeChat/actions/runs/41493733655)
exercised App preflight, generation, full-patch threat detection, and isolated
checks. The Python suite passed 107 runtime tests with 3 skipped, but failed
strict Pyright checks on three partially unknown types. Publication was correctly
blocked, and the temporary activation flag was removed. Native usage was
50.71891 coding credits plus 10.53936 detection credits. This verifies rejection
of a failing candidate, not successful automated PR creation. Manual recovery
of that candidate does not change the failed run's outcome.

### Successful App publication and human review

On 2026-11-03 (UTC), the separately owner-authorized
[#75 run](https://github.com/microsoft/TypeChat/actions/runs/41559378978)
completed preparation, coding, full-patch detection, isolated checks, and
trusted publication. It created the App-authored
[#513](https://github.com/microsoft/TypeChat/pull/513) from the exact
[accepted record](https://github.com/microsoft/TypeChat/issues/75#issuecomment-6592736337).
That run used **124.05274 main credits plus 16.76878 detection credits =
140.82152 AI credits**, within the separate 1,000/400 limits.

Original automated commit
[adcfc932](https://github.com/microsoft/TypeChat/commit/adcfc9323fc2b5afa1130ed6a121c78a5d02a0a8)
remains the revision bound by the original context, candidate, patch, scan, and
isolated-check evidence. Its new metadata tests compiled but were omitted from
the default test selector. Owner-approved human follow-ups registered those
tests, fixed filtered-response error privacy and token-total overflow, and
shipped the metadata guide with a README link. Later test runs actually
executed the metadata suite. The original scan is not claimed to cover those
human changes.

Normal PR CI and Copilot reviews ran on the original and follow-up revisions.
All 12 checks passed at final head
[1c1abe6](https://github.com/microsoft/TypeChat/commit/1c1abe6f9566ecd7d691596344911ce1f30f83bd);
the owner approved and merged it as
[488c8ef](https://github.com/microsoft/TypeChat/commit/488c8efdcfbb41e44f31c420c84ba2a499f90e20).
Post-merge Node, Python, and Pages runs succeeded. Human review and fixes were
part of this pilot, not automatic approval or merging.

The temporary activation flag was removed after the authorized run and was
confirmed unset at repository and inherited organization scope on 2026-11-03
(UTC). This verifies one bounded TypeScript publication path, not broader
autonomy, Discussion implementation, or permission for another coding run.

### Frozen authorization and bounded spending

Preflight verifies owner identity, default-branch workflow code, the current
scope policy and its ancestry, acceptance, and existing contributions. Open PRs
linked to the target Issue or naming it in their title/body stop the run for
owner review. Citing an open PR as related work does not by itself reserve the
Issue or block an independently accepted task. References and contributor credit
remain in the agreement, and their approved revisions are still checked.
The agreement, discussion, exact source revision, control fingerprints, and
short-lived App-access proof are frozen. An immutable spending reservation
precedes inference. The model-start guard repeats authorization and rejects App
preflight older than 15 minutes. A build command expires after 24 hours.

Detection is eligible only after successful preparation and successful, sole-`noop`
agent completion. Its inference credential is released only after the trusted
authorization and exact-patch staging step succeeds and preceding job steps
have not failed or been cancelled. This explicit credential
gate is necessary because the pinned runtime can still launch detector setup
after a failed custom pre-step; that failed step must not grant inference access.

One execution permits at most **1,000 main-agent AI credits** and **400 separate
detection credits**, not a combined 1,000-credit allowance. The main agent uses
the established GPT-6.1-sol/max configuration, at most 1,000 calls, 60 minutes
of execution, and a 100-minute enclosing job. Detection has a 30-minute enclosing
job; deterministic validation and publication are also time-bounded. Native
usage outputs must be present, positive, and within their independent limits.
Incomplete, capped, failed, missing, or mixed native completion signals cannot
publish. Runtime budget overrides are not enabled.

Re-running a command cannot spend again. A confirmed PR is returned without
coding or writes; otherwise a reserved or partial run stops for inspection.
A genuinely new attempt after a failed coding run needs a fresh owner command.
An unresolved publication intent or branch still blocks it. Source commits,
policy, acceptance, or substantive discussion changes stop publication rather
than silently rebasing or expanding scope.

### Isolation, exact patch checks, and publication

The existing `typeagent-bot` App and its existing
`DEPENDABOT_APP_ID`/`DEPENDABOT_APP_PRIVATE_KEY` bindings are reused. No new App,
PAT, credential rotation, App setting change, or repository permission change
is needed. The [trusted App helper](./tools/implementation-app.mjs) verifies App
and installation identity, explicitly requests only TypeChat's `contents: write`
and `pull_requests: write`, checks returned permissions and repository selection,
masks credentials, and revokes each token. Unrelated vulnerability-alert rights
are rejected, not inherited. Missing/excessive permissions or revocation failures
are errors. The preflight token is revoked before coding; publication mints a
new one and verifies the installation again.

App credentials exist only in trusted preflight/publisher steps, never in the
coding agent, detector, generated tests, or artifacts. The coding agent has
read-only repository permissions inside the pinned runtime's firewall.
Generated tests run in a separate non-root container with no network, host
workspace, Docker socket, or credential environment. Its Node image is digest
pinned to the repository's Node version. Dependencies are installed from the
unchanged base before the patch is applied; install scripts are disabled for
npm. TypeScript validation explicitly builds the root before the workspaces,
then runs the existing tests. Python uses Hatch tests and the existing Pyright
check; site changes use the existing site build. Documentation-only changes do
not require unrelated language builds.

The first pilot supports at most 20 ordinary UTF-8/LF text-file changes under
`typescript/`, `python/`, or `site/`, plus the root `README.md`. Candidate JSON
is bounded at 64 KiB and the entire patch at 128 KiB. Dependencies, configuration,
automation, policy, permissions, credentials, agent instructions, symlinks,
binary or executable-mode changes, generated trees, and case collisions are
rejected. Unsupported work remains maintainer work; nothing is silently omitted.
Windows-incompatible trailing-dot components and case aliases of directories
are rejected as well. Failed dependency enumeration, source extraction, or
dependency installation cannot produce a partial candidate or passing check
evidence.

The [protocol](./tools/issue-implementation.mjs) validates the candidate against
the fixed source tree and stages the complete patch, candidate, and accepted
agreement for strict detection. Scan and check evidence bind that exact content
and run. The publisher independently verifies evidence, usage, freshness, App
access, and contribution history, then creates Git blobs/trees via the API.
It never checks out or executes the generated patch while holding a write token.
The complete resulting tree must preserve every unmodified file. No force-push,
existing-branch takeover, automatic approval, merge, issue closure, or release
is implemented.

A stable acceptance-owned branch and PR marker provide durable deduplication.
A publication intent precedes all writes; branch/PR uncertainty blocks blind
retries and preserves evidence. Context, reservations, candidate, scan, checks,
and results are retained for 30 days, longer than the 24-hour authorization
window. Do not delete intents to force a retry. GitHub does not provide an atomic
transaction across all these resources; late authorization changes can leave
an unpublished or partially published branch requiring human inspection.

### Activation and first live verification

The workflow was merged through the ordinary owner process in
[#507](https://github.com/microsoft/TypeChat/pull/507). Each later activation
still requires a separate owner decision.
The existing default token permissions, PR-creation/approval setting, Dependabot
workflow, library behavior, and discussion commands stay unchanged. Compiler
safe-update approval of the existing App binding is a code-review step, not
deployment or budget activation.

After a separate owner decision, set the repository variable
`TYPECHAT_IMPLEMENTATION_ENABLED=true`. Choose genuinely agreed, supported
library/documentation work with no competing contribution, generate its command,
and explicitly authorize that one run. Do not use #504 to make the future agent
rewrite its own automation. Disabling the variable prevents new builds; also
cancel an active run or withdraw its command when stopping work in progress.

Record whether the resulting App-created PR actually starts normal CI and
receives Copilot review. Neither is claimed successful in advance; both remain
separate from human approval and merging. The CI sandbox smoke test uses a
synthetic TypeScript/Python patch and no inference or App credentials. It verifies
container behavior, not a live coding run. The
[successful #75 publication](#successful-app-publication-and-human-review)
and [selected receipt checks](#completion-receipts) supply separate live
evidence; unverified Discussion paths and receipt outcomes remain separate.

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
