# TypeChat owner cheat sheet

**For @robgruen. Last checked: 2026-10-31 (UTC).**

[Issues](https://github.com/microsoft/TypeChat/issues) |
[Discussions](https://github.com/microsoft/TypeChat/discussions) |
[Pull requests](https://github.com/microsoft/TypeChat/pulls) |
[Actions](https://github.com/microsoft/TypeChat/actions) |
[Approved goals on main](https://github.com/microsoft/TypeChat/blob/main/GOALS.md) |
[Full automation guide](./AUTOMATION.md)

**Verified:** backlog assessment, automatic Copilot PR reviews, and the initial Issue draft-only run.
**Awaiting review and live verification:** conversational responses and `/typechat reply`.
Manual publication and the Discussion path still need live verification.
**Still manual:** work acceptance, implementation handoff, merging, and releases.

## What do I do next?

| I want to... | My next action | What I get |
| --- | --- | --- |
| Decide what to tackle | [Run a backlog assessment](#refresh-the-backlog-live). | An advisory report, not acceptance. Artifacts follow public repository visibility. |
| Have the agent answer an issue or Discussion | After rollout, [request one direct reply](#reply-directly-awaiting-rollout). | One checked conversational response, without accepting work. |
| Review wording before responding | [Request a draft](#draft-and-publish-awaiting-rollout). | The actual reply as a preview; assessment metadata stays in Actions. |
| Post the proposed response | Review the exact draft, then copy its publish command into the same thread. | One Actions-bot comment, not approval to build. |
| Accept work for implementation | Check scope, existing PRs, and unresolved questions; [record a human decision](#accept-work-manually). | A visible agreement and named next person; no agent starts automatically. |
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

## Reply directly (awaiting rollout)

**Use only after the direct-reply changes are reviewed, merged, and ready for an
owner-commanded live test.** From your `@robgruen` account, post a new comment
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

## Draft and publish (awaiting rollout)

**Do not use these before the pilot is reviewed and merged to `main`.**
After merge, follow the [rollout checklist](./AUTOMATION.md#first-live-verification)
for the first owner-commanded live test.

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

**4. Confirm:** Open **Actions > Publish approved discussion draft** and follow
the posted-comment link. Discussions receive a top-level `github-actions[bot]`
comment, even when your command was a reply.

**Publishing is not acceptance or permission to implement.** Wait for each
operation to finish before sending another command on that thread.

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

This is an ordinary human comment, not an automation command. There is currently
**no `/typechat accept` or `/typechat build` command**, and posting it does not
assign a coding agent.

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
| No draft, reply, or publish run | Confirm rollout, owner account, new-comment syntax, and target type. Open Actions; do not keep reposting commands. |
| Draft is stale or expired | Request and review a new draft. The approval window is at most seven days; thread, policy/control, or referenced-PR changes can invalidate it sooner. |
| Publishing says "already published" | Follow the existing-comment link. This is the intended no-op, not another post. |
| A reply command says "already answered" | Follow the existing reply link. No new model execution or comment is needed. |
| Workflow code changed | After merge and CI, use a new command. Old runs retain their original code, and older sealed artifacts may be stale. |
| Publishing times out or reports an uncertain outcome | Inspect the thread and original run first. Do not retry blindly or delete the publication-intent artifact; resolve the uncertainty before approving a new draft. |
| Assessment/drafting stops on a budget or evidence limit | Read the failure and coverage notes. Narrow the task or seek an owner-reviewed configuration change; do not bypass restrictions. |

**Spending reminder:** main assessment **400 AI credits/run**; planned main
drafting/reply generation **50/run**. Each has a **separate detection budget, default 400**,
so those main-agent limits are not whole-workflow caps. Publishing uses no
model. Copilot PR reviews are billed separately. The future **1,000-credit
implementation allowance** and per-run budget overrides are **not enabled**.

Keep this sheet's date and availability notes aligned with the
[verified rollout history](./AUTOMATION.md#status-and-implementation-history).
It is a quick reference, not a replacement for project policy.
