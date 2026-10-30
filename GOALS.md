# TypeChat project direction

TypeChat helps developers build natural-language interfaces using
application-defined types. This document is the primary repository policy for
product scope: what belongs in TypeChat, what does not, and who can change those
boundaries.

It guides contributors, maintainers, and agents. The
[automation experiment](./AUTOMATION.md), issue acceptance criteria, and agent
recommendations must stay within it. It does not override organization,
platform, security, or legal requirements.

## Goals

- **G1. Types define the interface.** Keep TypeChat a focused library for building
  natural-language interfaces using application-defined types.
- **G2. Validation remains reliable.** Produce validated structured data with
  accurate schemas, explicit errors, and controlled repair.
- **G3. APIs remain practical to maintain.** Keep APIs composable, maintainable,
  and compatible. Preserve the existing TypeScript and Python implementations
  and their documented behavior.
- **G4. Integration does not require platform lock-in.** Support practical
  integrations through clear interfaces and examples, without unnecessary
  dependencies or vendor lock-in.
- **G5. People can learn and verify the behavior.** Prioritize useful
  documentation, accessible examples, and deterministic regression tests.

## Non-goals

- **N1. A general-purpose agent platform.** Do not turn TypeChat into a platform
  with built-in planning, memory, multi-agent orchestration, hosting, storage, or
  deployment management. Applications can use TypeChat alongside other tools
  without moving those responsibilities into TypeChat.
- **N2. Application-specific business logic in the core.** Keep that logic in
  the application, not in the core library.
- **N3. A core tied to one vendor's platform.** Do not add provider-specific
  product features or integrations that make the core depend on a particular
  vendor's platform.
- **N4. Convenience at the expense of validation.** Do not weaken schema or
  runtime validation, or silently accept unsupported types.
- **N5. Features accepted solely through popularity or AI recommendations.**
  Community interest and agent suggestions can inform a discussion. They do not
  decide project direction or authorize a feature.

Existing supported integrations and examples are not automatically deprecated
by these boundaries. Preserve existing contributions and contributor credit.
If an existing behavior appears to conflict with this policy, ask the owner to
resolve the difference rather than removing it or closing related issues
automatically.

## Under consideration

Under consideration is not approval to implement, a roadmap commitment, or a
change to the goals above. Ideas in this section need an explicit owner decision
before they can become accepted implementation work.

- **Additional language support.** We may consider implementations beyond the
  existing TypeScript and Python libraries. A proposal should explain who it
  serves, how it preserves TypeChat's validation guarantees, and who will
  maintain, test, and release it.
- **The relationship with TypeChat.NET.** The related
  [TypeChat.NET project](https://github.com/microsoft/TypeChat.net) already exists.
  We may consider how additional language support and that work fit together.
  Listing it here does not approve moving it into this repository, changing
  its ownership, or committing to shared releases.

## Who decides

The project direction owner is **@microsoft/typechat**. Direction decisions
require explicit approval from a human member of that owner team.

Every change to this document requires explicit owner approval, including
changes to the goals, non-goals, ownership rules, and items under consideration.
Propose a change through a pull request that explains the reason, intended
benefit, and effect on existing users and maintainers. A scope change or
exception must be approved and merged here before dependent implementation is
accepted.

The active policy is the version on the default branch, not proposed edits in
an unmerged pull request. An assessment should cite the policy at the trusted
default-branch commit used for its run. When that policy is missing, unreadable,
or unclear about a proposal, record the problem and seek an owner decision;
do not treat the gap as permission to expand scope.

Community votes, labels, an AI recommendation, passing checks, or an unrelated
approval comment do not amend this policy. GitHub Copilot reviews support human
review; they do not provide owner approval.

Ordinary in-scope library maintenance follows the normal maintainer review
process. It does not need a new project-direction decision for every fix.
Approval to pursue work is still separate from approval to merge its
implementation. Material scope changes return to discussion.

## Approval and enforcement

The [CODEOWNERS file](./.github/CODEOWNERS) requests review from the owner team
for this policy, [AUTOMATION.md](./AUTOMATION.md), any `AGENTS.md` guidance,
the `.github/` controls
(including CODEOWNERS itself, agent instructions, and workflows), and the
repository automation tools and tests in `tools/`. It does not assign all
library changes to the direction owner.

**Prepared on 2026-10-27 (UTC).** These repository files do not by themselves
make owner approval mandatory in GitHub. No live settings were changed as part
of this work. A repository administrator still needs to verify:

- The owner team is visible and has explicit write access to this repository.
- The default branch requires pull requests and code-owner approval.
- New changes cannot rely on stale approval; configure dismissal of stale
  approvals and approval of the most recent reviewable push.
- Bypass permissions and direct pushes are restricted so people, bots, and apps
  cannot silently skip owner review.

The first pull request introducing these rules needs deliberate human approval
from the owner team. GitHub uses CODEOWNERS from the pull request's base branch,
so a new CODEOWNERS file does not enforce its own initial adoption.

Record verified activation dates in the
[automation status history](./AUTOMATION.md#status-and-implementation-history).
Until then, distinguish the written approval requirement from GitHub-enforced
protection. See GitHub's
[code owner documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
for the platform requirements.
