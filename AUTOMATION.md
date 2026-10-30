# Experiment: a semi-automated TypeChat repository

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
[latest run](https://github.com/microsoft/TypeChat/actions/runs/40962028077)
completed successfully with the policy, clearer writing guidance, and higher
execution limits enabled. Its
[preserved draft](./reports/backlog-assessments/2026-10-29-40962028077.md)
inventories 21 open issues and 25 open PRs at the assessment time.

The inventory is complete, but verification remains partial. The agent inspected
PR patches, reviews, and check records; it did not run tests or inspect job logs,
and two CI definitions were inaccessible. The report's direction classifications
and next steps remain advisory. Human review is still required; automatic
Copilot PR reviews, issue acceptance, and broader autonomy are not enabled by
this pilot.

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
| Not yet | [Owner-approved budget overrides](#owner-approved-budget-overrides-planned) | Future work only; no budget-override input or approval mechanism is enabled. |
| Not yet | Automatic Copilot PR reviews and full owner-gate verification | Human review remains required. Complete settings verification and review automation remain separate, maintainer-approved work. |
| Not yet | Agent-assisted discussion and explicit issue acceptance | Planned; no issue-discussion or acceptance commands are enabled by this pilot. |
| Not yet | Human-approved agent implementation | Planned; the assessment does not start implementation or open PRs. |
| Not yet | Selective automatic adoption | Future work, after public criteria and maintainer approval. |

These are implementation dates, not activation dates. Update this history and
the README summary as each milestone changes. When a capability is enabled on
GitHub, record its activation date and link to the confirming pull request or
workflow run; do not mark unverified capabilities as active.

## Human-guided first

The initial agent-assisted workflow will require human approval for issue
responses and dispositions, acceptance of proposed work, implementation,
merging, and releases.

Agents may investigate problems, summarize discussions, suggest questions, write
tests, and propose changes. Automated tests and GitHub Copilot code reviews will
support review, not replace human judgment.

### Protecting project direction

The direction owner is `@microsoft/typechat`. Goals, non-goals, and the
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
and tests. These local rules request owner review; they do not enable required
reviews themselves.
An administrator must verify the team has the required visibility and write
access, require pull requests and code-owner approval, prevent stale approvals,
and restrict bypasses. The
[enforcement checklist](./GOALS.md#approval-and-enforcement) records these
requirements. No live settings were changed for this policy work.

The first policy PR needs deliberate human owner review: GitHub uses the
CODEOWNERS file already on the base branch, not the proposed one. Record
activation only after the protections have been verified on GitHub.

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

Two follow-up checks remain before expanding autonomy:

- **Tool exposure:** Copilot CLI's `--allow-tool` controls permission approval,
  not a strict available-tool filter. Additional read-only search tools were
  used. Preserve the read-only repository guards and explicitly validate the
  intended available-tool set before adding capabilities. See
  [Copilot CLI tool controls](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools).
- **Telemetry quality:** The built-in grader's failure and loop totals conflict
  with the detailed activity records. Reconcile those measurements before using
  them as automated acceptance gates; a grader summary is not code-review evidence.

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
run after explicit approval from a human member of `@microsoft/typechat`.
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
[workflow's Markdown frontmatter](./.github/workflows/backlog-assessment.md):

```yaml
engine:
  id: copilot
  model: gpt-6.1-sol
  args: ["--reasoning-effort", "max"]
```

`engine.model` pins the model; `engine.args` passes the native Copilot CLI
`--reasoning-effort max` option. The generated assessment no longer falls back
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
[compiled workflow](./.github/workflows/backlog-assessment.lock.yml) and
[compiler action pins](./.github/aw/actions-lock.json) together, rather than
edit the generated workflow directly:

```shell
gh aw compile backlog-assessment --strict --no-check-update --no-logo --action-tag 32ecafbc061c9af57e9361942099e381102ae304
```

The action reference above pins the v0.93.5 runtime. Keep the compiler pin file
checked in: otherwise successful action resolution can create new pins and
change generated comments in CI. After committing regenerated files, repeating
the command should leave `.github/` and `.gitattributes` unchanged, including
no new untracked files.

The workflow check also runs the contract tests in `tools/` (`npm ci` followed
by `npm test`), including checks that the runtime pin matches the compilation
command and that generated reporting jobs cannot write to issues or pull requests.

This first pilot does not enable automatic Copilot PR reviews or change existing
maintenance and deployment workflows. Configuring those reviews and their human
approval gates remains a separate, maintainer-approved rollout step.

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
