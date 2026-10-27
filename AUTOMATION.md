# Experiment: a semi-automated TypeChat repository

We are exploring how agents can help maintain TypeChat while keeping community
discussion, clear acceptance criteria, and human accountability at the center
of the project.

Our goal is to reduce routine coordination and maintenance work so contributors
and maintainers can focus on useful ideas, design decisions, and quality.

This is an early experiment. The workflow below describes our intended direction;
capabilities will be introduced incrementally, and not everything described here
is available today.

## Status and implementation history

**Last updated: 2026-10-26.** The first pilot is implemented and locally
validated. Maintainer review, merge to the default branch, confirmation of
GitHub Copilot access, and the first live assessment are still pending.
No live repository settings have been changed as part of this pilot.

| Implemented | Change | Current state |
| --- | --- | --- |
| 2026-10-26 | Community-facing plan and [README announcement](./README.md#repository-automation-experiment) | Documented. |
| 2026-10-26 | Shared [Copilot contributor and review guidance](./.github/copilot-instructions.md) | Prepared; instructions do not configure automatic PR reviews. |
| 2026-10-26 | [Manual backlog assessment](./.github/workflows/backlog-assessment.md) | Implemented; produces a draft report without changing issues or PRs. First GitHub run pending. |
| 2026-10-26 | [Compilation checks](./.github/workflows/agent-workflow-check.yml) and [contract tests](./tools/tests/backlog-assessment.test.mjs) | Strict compilation and 16 tests passed locally; generated output is reproducible. GitHub CI execution pending. |
| 2026-10-26 | [Assessment model and reasoning effort](#model-selection) | GPT-6.1-sol pinned with `max` effort for the main assessment only; threat detection keeps its default effort. Live model access unverified. |
| Not yet | Automatic Copilot PR reviews and human approval gates | Live settings need verification and a maintainer-approved rollout. |
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

## First pilot: a draft backlog assessment

The first pilot is a [manually triggered assessment workflow](./.github/workflows/backlog-assessment.md).
Once it has been reviewed, merged to the default branch, and its GitHub Copilot
access enabled, a maintainer can select **Actions > Backlog assessment > Run
workflow** on the default branch.

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
The existing time, turn, and inference-budget limits are unchanged; maximum
effort can use more time and credits within those limits.

The separate threat-detection job inherits `gpt-6.1-sol`, but not the main
assessment's extra CLI arguments. By design, `max` applies only to the main
assessment; the detector's reasoning effort remains at its own default.
Its explicit inherited model also replaces its previous model-variable fallback.

To change either setting, edit the Markdown source, regenerate the compiled
workflow, and update the model contract test and this documentation. The first
approved GitHub run must still verify that the model is available and permitted
for the workflow's Copilot access. Local compilation and tests verify the
configuration, not live inference or model access. See the
[engine configuration reference](https://github.github.com/gh-aw/reference/engines/#extended-coding-agent-configuration)
and [Copilot model behavior](https://github.github.com/gh-aw/reference/engines/copilot/#capabilities-and-limitations).
Editor chat or subagent model preferences do not configure this workflow, and
its model setting does not configure GitHub Copilot PR reviews.

### Validation and rollout

Changes to the workflow are checked by compiling its Markdown source with
gh-aw **v0.93.5**. Maintainers should regenerate and commit its companion
`.lock.yml` file rather than edit that generated file directly:

```shell
gh aw compile backlog-assessment --strict --no-check-update --no-logo --action-tag 32ecafbc061c9af57e9361942099e381102ae304
```

The action reference above pins the v0.93.5 runtime. The workflow check also runs
the contract tests in `tools/` (`npm ci` followed by `npm test`), including checks
that generated reporting jobs cannot write to issues or pull requests.

This first pilot does not enable automatic Copilot PR reviews or change existing
maintenance and deployment workflows. Configuring those reviews and their human
approval gates remains a separate, maintainer-approved rollout step.

## From discussion to a reviewed change

We aim to keep the entire process on GitHub:

1. **Start with the community.** Use issues for bugs and feature requests, and
   Discussions for questions and exploratory conversations.
2. **Clarify the proposal.** Contributors, maintainers, and agents help establish
   the intended outcome, scope, non-goals, and testable acceptance criteria.
3. **Accept the work.** A maintainer approves the agreed scope before
   implementation begins. Material scope changes return to discussion.
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
