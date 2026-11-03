# Response metadata and reported token usage

Model and translation `Result<T>` envelopes have optional `metadata` on **success and failure**.
Successful model data remains text; translation data remains the validated application object.
Metadata never enters application data, schemas, or repair prompts. Validation, `getData`, and
the default limit of one repair are unchanged.

```ts
const result = await translator.translate(request);
const tokens = result.metadata?.usage?.inputTokens; // undefined: unknown; 0: reported zero
const coverage = result.metadata?.usageReporting?.inputTokens; // "complete", "partial", or "overflow"
if (result.success) {
    const applicationData = result.data;
} else {
    const message = result.message;
    const records = result.metadata?.responses; // retained on failure
}
```

`metadata.responses` contains ordered records with optional `usage` and `filtering` across initial
and repair responses, including failures. A metadata-free completion contributes `{}` when another
has metadata; if all metadata is absent, the result stays unchanged. Built-in clients also retain
metadata from JSON HTTP errors and responses preceding HTTP retries, without extra service or
moderation requests. An unreadable JSON HTTP error body adds a record's `error` diagnostic (the
error class, not the body), preserving status messages and HTTP retry behavior. Filtered/refused
output remains failure, even if it contains valid-looking JSON. An otherwise successful HTTP
response that is filtered or refused returns a concise error rather than putting the complete
provider body or refusal text in the error message. Filtering details remain in metadata, and
available text remains in `responseText`.

Models adapted by `createOpenAILanguageModelFromClient` use the same reported-usage and
filtering parser for Chat Completions and Responses output. Their records cover resolved
SDK responses visible to TypeChat, including translator repair, not requests/retries hidden
inside the supplied client. Client exceptions propagate instead of creating fabricated
response records. HTTP token-provider models retain the existing per-HTTP-response accounting.

`metadata.usage` sums **reported counts only**, once per record: input/output/total 13/7/20 plus
5/3/8 yields 18/10/28. Each corresponding `metadata.usageReporting` field is `"complete"` if every
record reports that count, otherwise `"partial"`. If no record reports a count, its total and
coverage remain absent. Missing total tokens are never inferred from input/output counts. Built-in
clients accept nonnegative safe integers; missing/null counts are unknown, not zero. Even complete
reporting excludes unreported requests, failed transports, and usage the service omits. These
totals are not estimates of all billable usage; TypeChat does not calculate prices.

If a reported aggregate would exceed JavaScript's safe-integer range, that count is omitted from
`metadata.usage` and its `metadata.usageReporting` status is `"overflow"`. Individual response
records, other representable totals, and the application validation result remain intact; the
aggregate is never rounded, clamped, or represented as zero.

| Existing API | `usage` fields mapped to `inputTokens` / `outputTokens` / `totalTokens` | Filtering sources |
| --- | --- | --- |
| OpenAI Chat Completions | `prompt_tokens` / `completion_tokens` / `total_tokens` | First choice's `finish_reason: "content_filter"`, `message.refusal` |
| OpenAI Responses | `input_tokens` / `output_tokens` / `total_tokens` | `incomplete_details.reason: "content_filter"`, output content `type: "refusal"` and its `refusal` text |
| Azure OpenAI Chat Completions | Same as Chat Completions | Same, plus `prompt_filter_results` (or `prompt_annotations`), first choice's `content_filter_results`, HTTP error `error.innererror.content_filter_result`, `error.code`, `error.innererror.code` |

Filtering exposes optional `blocked`, `reason`, `refusals`, `input`, and `output`. `input` retains
prompt filtering details, `output` completion filtering details; both are `unknown` provider-returned
filtering subtrees, never complete response bodies. Compatible Chat Completions endpoints can return
the same fields. Reported filtering flags, filtering finish reasons, and refusals prevent accepting
filtered output. Missing details remain optional, not evidence that no filtering occurred. Filtering
details and refusals may be sensitive; do not log them automatically.

Custom models returning metadata-free `Promise<Result<string>>` remain compatible. To attach
metadata without altering text, use `withResponseMetadata(result, [{ usage, filtering }])`; it
computes reported totals from those records. Translation recomputes from records, not existing
totals, so each response contributes exactly once and separate translations stay isolated.

Run the offline mocked regression suite from `typescript/` with `npm test`.
The default test command includes the metadata, repair-accounting, and failure-retention tests.
No live provider access or credentials are required.

Thanks to [intuity-hans](https://github.com/intuity-hans) for the prior work in
[#80](https://github.com/microsoft/TypeChat/pull/80) at
[4f3e378](https://github.com/microsoft/TypeChat/commit/4f3e37840bd5007aeaa05c75589b1e4c16505a80).
That contribution was closed without merging, not an available feature of earlier releases.
