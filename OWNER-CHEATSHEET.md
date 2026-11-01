# TypeChat owner cheat sheet

**For @robgruen. Last checked: 2026-10-31 (UTC).**

[Issues](https://github.com/microsoft/TypeChat/issues) |
[Discussions](https://github.com/microsoft/TypeChat/discussions) |
[Pull requests](https://github.com/microsoft/TypeChat/pulls) |
[Actions](https://github.com/microsoft/TypeChat/actions) |
[Approved goals on main](https://github.com/microsoft/TypeChat/blob/main/GOALS.md) |
[Full automation guide](./AUTOMATION.md)

**Verified:** backlog assessment, automatic Copilot PR reviews, Issue draft generation,
and Issue `/typechat reply` delivery with a duplicate-free rerun.
**Awaiting review and live verification:** exact-proposal `/typechat accept`.
Manual publication and the Discussion path still need live verification.
**Still human decisions:** work acceptance, implementation handoff, merging, and releases.

## What do I do next?

| I want to... | My next action | What I get |
| --- | --- | --- |
| Decide what to tackle | [Run a backlog assessment](#refresh-the-backlog-live). | An advisory report, not acceptance. Artifacts follow public repository visibility. |
| Have the agent answer an issue or Discussion | [Request one direct reply](#reply-directly); the Issue path is live-verified. | One checked conversational response, without accepting work. |
| Review wording before responding | [Request a draft](#draft-and-publish). | The actual reply as a preview; assessment metadata stays in Actions. |
| Post the proposed response | Review the exact draft, then copy its publish command into the same thread. | One Actions-bot comment, not approval to build. |
| Accept an agent-prepared proposal | After acceptance rollout, [review and approve its exact terms](#accept-an-exact-proposal). Until then, [record a human decision manually](#accept-work-manually). | A visible scope agreement; no coding agent starts automatically. |
| Move an existing PR forward | [Review the latest revision](#review-and-merge-manually); support the existing contributor rather than duplicate their PR. | A human decision to request changes or merge. |
| Resolve unclear or out-of-scope work | Pause dependent work. If changing direction, approve and merge a [policy PR](./GOALS.md#who-decides) first. | An explicit scope decision; popularity or a label is not approval. |

## Refresh the backlog (live)

1. Open [Backlog assessment](https://github.com/microsoft/TypeChat/actions/workflows/backlog-assessment.lock.yml).
2. Select **Run workflow**, choose **main**, and start it.
3. Open the completed run and download the **backlog-assessment** artifact.
4. Read coverage gaps and existing-PR links before choosing the next item.

The report does not post, accept, close, assign, or implement anything.
Download reports worth keeping within **seven days**; archival is a separate
human-reviewed change. The workflow can take an hour or more including setup.

## Reply directly

**The Issue path and no-op retry are live-verified; Discussions still need a
separate live test.** From your `@robgruen` account, post a new comment
containing only this command on an open, unlocked Issue or Discussion:

```text
/typechat reply
```

This authorizes **one public advisory response after validation and threat
detection**, without reviewing the wording first. The model stays read-only;
trusted workflow code posts the checked response. The eyes reaction acknowledges
the request. Follow **Actions > TypeChat discussion response** for progress and
the final comment link. Discussion replies are top-level comments.

The command does not accept work, change labels, close anything, start
implementation, or merge code. Another reply requires another explicit owner
command; replies to the bot do not start an autonomous conversation.

Rerunning an already answered command is a no-op, not another response. If a
write has an uncertain outcome, inspect the original run and thread before
doing anything else. Do not delete its intent artifact or retry blindly.

## Draft and publish

**Draft generation is live-verified on Issues; manual publication is not.**
Follow the [rollout checklist](./AUTOMATION.md#first-live-verification)
for an owner-approved publication test.

Once enabled, use your **@robgruen** account on an **open, unlocked issue or
Discussion**, not a PR. Each command must be a **new comment containing only
the command**, with no leading text. Editing an old comment does not trigger it.

**1. Request a draft:**

```text
/typechat draft
```

The Actions bot acknowledges the command comment with an `eyes` reaction when
the workflow starts processing it. This is not a success or acceptance signal;
check Actions for progress and errors.

**2. Review:** Open **Actions > TypeChat discussion response**, wait for the run
to succeed, and open the **Seal discussion draft** job summary. It contains the
exact public reply, the approval command, and a separate assessment that is not
posted. Check factual accuracy, scope, existing contributions, and open questions.

**3. Approve only the wording:** Copy the complete command from that summary
into a new comment on the **same thread**. Its format is:

```text
/typechat publish <artifact-id>:<body-sha256>
```

Do not post the placeholders or invent the hash. If the wording is wrong, add
clarification and request a new draft instead of editing the artifact.

**4. Confirm:** Open **Actions > Publish approved response or work acceptance** and follow
the posted-comment link. Discussions receive a top-level `github-actions[bot]`
comment, even when your command was a reply.

**Publishing is not acceptance or permission to implement.** Wait for each
operation to finish before sending another command on that thread.

## Accept an exact proposal

**Prepared for review; do not use until merged and ready for owner-commanded
live verification.** This is a real scope decision, not a test acknowledgment.

1. Resolve open questions, check the approved policy and existing contributions,
   then request a new `/typechat draft` on the same thread.
2. In **Seal discussion draft**, review **Work acceptance preview (not yet
   accepted)**: goal, included scope, non-goals, testable criteria, and references.
   If it is absent or inaccurate, clarify the thread and request a new draft.
3. Copy its exact command into a new comment on that thread:

   ```text
   /typechat accept <artifact-id>:<acceptance-sha256>
   ```

4. Follow **Publish approved response or work acceptance** to the **Accepted
   work** comment. Confirm it records the terms you approved.

Use the acceptance hash, not the conversational reply's publish hash. A
`/typechat reply` artifact cannot be accepted. Publishing a response first changes
the context; request a fresh draft before accepting rather than reusing it.

Acceptance does not assign a coding agent, start an implementation run, increase
its budget, close anything, or approve merging. Coordinate the next person and
step separately. Material scope changes or withdrawal need a visible human
decision; automation does not silently rewrite old acceptance records.

## Accept work manually

Check the [approved scope](https://github.com/microsoft/TypeChat/blob/main/GOALS.md),
resolve open questions, and check for an existing implementation first.
An in-scope acceptance comment can use this template; replace the placeholders
and post it only when you actually approve pursuing the work:

```text
Accepted for implementation (human decision).
Scope: <the agreed change and what is out of scope>
Completion criteria: <observable behavior and required regression tests>
Existing contribution: <PR link, or confirmation that none was found>
Next step: <person responsible and the action agreed with them>
This is not approval to merge. Material scope changes return to discussion.
```

This remains an ordinary human comment, not an automation command. It does not
assign a coding agent. The separate exact-proposal acceptance command is pending
rollout; **no `/typechat build` command or implementation workflow is enabled**.

## Review and merge manually

- Make the PR **ready for review**, targeting `main`. Copilot reviews are
  requested automatically, including on subsequent pushes; drafts are skipped.
- Review the **latest commit** against the accepted criteria, test/check results,
  compatibility, documentation, and outstanding comments. A backlog report is
  not a PR review.
- Obtain the required human approval; policy/control changes need the relevant
  owner review. Copilot review and a green merge button do not replace it.
- Merge only after that decision. Record the outcome in the original thread.
  Releases remain a separate human-approved operation.

## If something stalls

| Symptom | Safe next step |
| --- | --- |
| No draft, reply, publish, or accept run | Confirm rollout, owner account, new-comment syntax, and target type. Open Actions; do not keep reposting commands. |
| Draft is stale or expired | Request and review a new draft. The approval window is at most seven days; thread, policy/control, or referenced-PR changes can invalidate it sooner. |
| Publishing says "already published" | Follow the existing-comment link. This is the intended no-op, not another post. |
| Acceptance says "already accepted" | Follow the existing record. No second acceptance comment is needed. |
| No acceptance preview or wrong acceptance hash | Resolve the questions or scope, then request and review a new draft. Do not substitute the response hash or edit artifacts. |
| A reply command says "already answered" | Follow the existing reply link. No new model execution or comment is needed. |
| Workflow code changed | After merge and CI, use a new command. Old runs retain their original code, and older sealed artifacts may be stale. |
| Publishing times out or reports an uncertain outcome | Inspect the thread and original run first. Do not retry blindly or delete the publication-intent artifact; resolve the uncertainty before approving a new draft. |
| Assessment/drafting stops on a budget or evidence limit | Read the failure and coverage notes. Narrow the task or seek an owner-reviewed configuration change; do not bypass restrictions. |

**Spending reminder:** main assessment **400 AI credits/run**; main
drafting/reply generation **50/run**. Each has a **separate detection budget, default 400**,
so those main-agent limits are not whole-workflow caps. Publishing and acceptance use no
model. Copilot PR reviews are billed separately. The future **1,000-credit
implementation allowance** and per-run budget overrides are **not enabled**.

Keep this sheet's date and availability notes aligned with the
[verified rollout history](./AUTOMATION.md#status-and-implementation-history).
It is a quick reference, not a replacement for project policy.
