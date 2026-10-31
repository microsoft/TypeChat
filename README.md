# TypeChat

<p align="center">
  <b>English</b> · <a href="https://github.com/microsoft/TypeChat/blob/main/README.zh.md">简体中文</a>
</p>

TypeChat is a library that makes it easy to build natural language interfaces using types.

Building natural language interfaces has traditionally been difficult. These apps often relied on complex decision trees to determine intent and collect the required inputs to take action. Large language models (LLMs) have made this easier by enabling us to take natural language input from a user and match to intent. This has introduced its own challenges including the need to constrain the model's reply for safety, structure responses from the model for further processing, and ensuring that the reply from the model is valid. Prompt engineering aims to solve these problems, but comes with a steep learning curve and increased fragility as the prompt increases in size.

TypeChat replaces _prompt engineering_ with _schema engineering_.

Simply define types that represent the intents supported in your natural language application. That could be as simple as an interface for categorizing sentiment or more complex examples like types for a shopping cart or music application. For example, to add additional intents to a schema, a developer can add additional types into a discriminated union. To make schemas hierarchical, a developer can use a "meta-schema" to choose one or more sub-schemas based on user input.

After defining your types, TypeChat takes care of the rest by:

1. Constructing a prompt to the LLM using types.
2. Validating the LLM response conforms to the schema. If the validation fails, repair the non-conforming output through further language model interaction.
3. Summarizing succinctly (without use of a LLM) the instance and confirm that it aligns with user intent.

Types are all you need!

# Getting Started

The TypeScript/JavaScript package requires [Node.js 24.22.1 or newer](https://nodejs.org/en/download).
Development uses Node.js 24.22.1, pinned in [.nvmrc](./.nvmrc), which includes the
[October 21, 2026 security fixes](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).

Install TypeChat for TypeScript/JavaScript:

```
npm install typechat
```

<!--

Or from PyPI:

...

Or NuGet

...

-->

You can also work with TypeChat from source for:

* [Python](./python/README.md)
* [TypeScript](./typescript/README.md)
* [C#/.NET](https://github.com/microsoft/TypeChat.net)

To see TypeChat in action, we recommend exploring the [TypeChat example projects](./typescript/examples). You can try them on your local machine or in a GitHub Codespace.

To learn more about TypeChat, visit the [documentation](https://microsoft.github.io/TypeChat) which includes more information on TypeChat and how to get started.

## Project direction

[GOALS.md](./GOALS.md) defines what belongs in TypeChat, what does not, and what
is still under consideration. It is the primary repository policy for product
scope. Changes require explicit approval from the human project owner,
`@robgruen`; community interest and AI recommendations do not change it.
Read it before proposing a new direction. Ordinary in-scope maintenance follows
the normal contribution process.

## Repository automation experiment

We are experimenting with a gradual transition to a semi-automated repository.
The initial agent-assisted workflow
keeps humans in the loop, while our longer-term goal is to help community
proposals progress from discussion to accepted, reviewed changes with less
manual coordination. Read about the [automation experiment](./AUTOMATION.md)
and how to participate.

**Status as of 2026-10-30 (UTC):** The
[latest backlog assessment](https://github.com/microsoft/TypeChat/actions/runs/40997369231)
completed successfully after the control hardening merged through
[#491](https://github.com/microsoft/TypeChat/pull/491). It inventories 20 issues
and 13 open PRs. The earlier
[saved draft](./reports/backlog-assessments/2026-10-29-40962028077.md) inventories
21 open issues and 25 open pull requests at the assessment time, with
plain-language next steps and project-direction classifications.

The latest run used 23 model calls and 148.42 of the main assessment's 400 AI
credits. Detection used a separate 7.89 credits. Its 216 tool calls stayed within
the allowed set; native diagnostics recorded one failure and no repeated requests.
Verification remains partial: tests, CI definitions, and job logs were not
checked. The earlier CI access restriction was not retested. Reports are not
acceptance of work, GitHub Copilot code reviews, or merge approval.

The next [owner-approved discussion pilot](./AUTOMATION.md#second-pilot-owner-approved-discussion-drafts)
is prepared for review. It adds `/typechat draft` and exact-draft publication
for Issues and Discussions, with a 50-credit main drafting budget. It is not
active until merged and live-verified, and does not enable acceptance or builds.

| Milestone | Implemented | Current status |
| --- | --- | --- |
| Community-facing automation plan | 2026-10-26 | Documented in [AUTOMATION.md](./AUTOMATION.md). |
| Manual backlog assessment, Copilot guidance, and workflow checks | 2026-10-26 | Merged via [#482](https://github.com/microsoft/TypeChat/pull/482) on 2026-10-27 (UTC); manual assessment available on `main`. |
| Assessment model and reasoning effort | 2026-10-26 | GPT-6.1-sol and main-assessment `max` effort verified in the first live run on 2026-10-27 (UTC). |
| Reproducible workflow compilation | 2026-10-27 | [Verified on GitHub](https://github.com/microsoft/TypeChat/actions/runs/40454115457): no generated-file drift and 17 passing tests. |
| First live backlog assessment | 2026-10-27 | [Completed successfully](https://github.com/microsoft/TypeChat/actions/runs/40461739316); 24 issues and 26 PRs enumerated. PR investigation is partial; no dispositions are approved. |
| Clearer report language | 2026-10-27 | [Writing guidance](./AUTOMATION.md#report-language) merged via [#485](https://github.com/microsoft/TypeChat/pull/485). The successful October 29 report uses narrative entries and separates evidence from suggestions; human review remains required. |
| Assessment budget | 2026-10-27 | [Main-assessment budget](./AUTOMATION.md#inference-budget) raised to 400 AI credits via [#485](https://github.com/microsoft/TypeChat/pull/485), confirmed in the latest run. Detection remains separately budgeted. |
| Owner-controlled project direction | 2026-10-27 | [Policy](./GOALS.md), assessment guidance, and [CODEOWNERS](./.github/CODEOWNERS) merged via [#485](https://github.com/microsoft/TypeChat/pull/485). The latest draft classifies every item against the pinned policy. Classifications are advisory; full GitHub enforcement still needs verification. |
| Call and execution-time limits | 2026-10-29 | [1,000 calls, 60-minute agent execution, and a 100-minute enclosing job](./AUTOMATION.md#execution-limits) merged via [#490](https://github.com/microsoft/TypeChat/pull/490) and used in the successful October 29 run. Credit budgets unchanged. |
| Successful policy-aware assessment | 2026-10-29 | [Run details](./AUTOMATION.md#successful-policy-aware-assessment): 21 issues and 25 open PRs inventoried, with partial verification and human review still required. |
| Human follow-through | 2026-10-29 | Maintainers subsequently merged [#433](https://github.com/microsoft/TypeChat/pull/433) and [#437](https://github.com/microsoft/TypeChat/pull/437). These were human decisions, not automated acceptance. |
| Selected report archive | 2026-10-30 | The [October 29 draft](./reports/backlog-assessments/2026-10-29-40962028077.md) is preserved unchanged with [provenance and review limits](./AUTOMATION.md#archived-snapshot), for normal PR review. No automatic archiving is enabled. |
| Named project owner | 2026-10-30 | [Policy](./GOALS.md) and [CODEOWNERS](./.github/CODEOWNERS) name `@robgruen`, merged through [#491](https://github.com/microsoft/TypeChat/pull/491). Existing branch-review protections are unchanged. |
| Tool boundaries and run diagnostics | 2026-10-30 | [Restricted model tools and native-only metrics](./AUTOMATION.md#tool-boundaries-and-trustworthy-diagnostics) merged through [#491](https://github.com/microsoft/TypeChat/pull/491) and verified in the latest live run. CI access restrictions are not bypassed. |
| Owner-approved budget overrides | Not yet | [Future work](./AUTOMATION.md#owner-approved-budget-overrides-planned); no override input or approval mechanism is enabled. |
| Automatic Copilot PR reviews | 2026-10-30 | [Active review rule](https://github.com/microsoft/TypeChat/rules/26174313) for ready PRs targeting `main` and subsequent pushes; drafts are skipped. Configuration and the review on [#491](https://github.com/microsoft/TypeChat/pull/491) were verified. |
| Stricter human-review enforcement | Not enabled | Existing branch-review protections are retained at the owner's request. Copilot reviews do not replace human approval. |
| Owner-approved issue and Discussion drafts | 2026-10-30 | [Draft and exact-draft publish commands](./AUTOMATION.md#second-pilot-owner-approved-discussion-drafts) prepared for review; merge and live verification pending. Posting is not acceptance. |
| Acceptance and agent implementation | Not yet | Separate human decisions. A future 1,000-credit implementation allowance is documented, not enabled. |
| Selective automatic adoption of community proposals | Not yet | Future work, subject to public criteria and maintainer approval. |

Implementation dates do not mean a feature is enabled on GitHub. Existing
maintenance and deployment workflows are unchanged. See the
[detailed status](./AUTOMATION.md#status-and-implementation-history) and
[workflow model configuration](./AUTOMATION.md#model-selection).

The saved report is a historical snapshot, not today's backlog. Later merges
and decisions do not rewrite it or turn its recommendations into project policy.

## Contributing

Start with the [project goals and non-goals](./GOALS.md). Proposals that would
change these boundaries need an owner-approved policy change before their
implementation can be accepted.

**Repository automation experiment:** We are experimenting with a gradual
transition to a semi-automated repository. The initial agent-assisted workflow
keeps humans in the loop, while our longer-term goal is to help community
proposals progress from discussion to accepted, reviewed changes with less
manual coordination. Read about the [automation experiment](./AUTOMATION.md)
and how to participate.

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

### Website changes

The website source is in [site](./site). From the repository root:

```sh
npm --prefix site ci
npm --prefix site run build
npm --prefix site run serve
```

For UI changes, check keyboard navigation, including visible focus in Windows high-contrast themes.
Focus indicators should have at least 3:1 contrast against the adjacent background.
Check reflow at a 320 x 256 CSS-pixel viewport, equivalent to 400% zoom at 1280 x 1024.
Also apply text-spacing overrides: line height of 1.5, letter spacing of 0.12em, word spacing of
0.16em, and paragraph spacing of 2em. The install command must remain readable and its copy button
visible and keyboard-operable. With JavaScript disabled, the command should remain readable and the
inactive copy button should be hidden.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft
trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
