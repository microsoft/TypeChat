---
engine:
  id: copilot
  model: gpt-6.1-sol
  # Permission approvals do not restrict the model's tool inventory.
  args:
    - "--reasoning-effort"
    - "max"
    - "--available-tools=apply_patch,glob,rg,view,github-get_discussion,github-get_discussion_comments,github-get_file_contents,github-issue_read,github-list_issues,github-list_pull_requests,github-pull_request_read,github-search_issues,github-search_pull_requests,safeoutputs-noop,safeoutputs-report_incomplete,safeoutputs-report_missing_data"
tools:
  edit:
  bash: []
  cli-proxy: false
  github:
    mode: local
    github-token: ${{ secrets.GITHUB_TOKEN }}
    toolsets: [repos, issues, pull_requests, discussions]
    allowed-repos:
      - ${{ github.repository }}
    # The assessment must include community submissions, not only approved items.
    min-integrity: none
    allowed:
      - get_file_contents
      - list_issues
      - issue_read
      - list_pull_requests
      - pull_request_read
      - get_discussion
      - get_discussion_comments
      - search_issues
      - search_pull_requests
safe-outputs:
  github-token: ${{ secrets.GITHUB_TOKEN }}
  runs-on: ubuntu-latest
  create-issue: false
  report-failure-as-issue: false
  report-failed-jobs: false
  report-missing-tool: false
  report-missing-data:
    create-issue: false
  report-incomplete:
    create-issue: false
graders:
  # These pinned built-ins mix native actions with MCP transport records.
  tool-success-rate:
    enabled: false
  tool-failure-count:
    enabled: false
  loops:
    enabled: false
  trajectory-efficiency:
    enabled: false
  native-tool-failure-count:
    name: Native tool failures
    description: Failed or unfinished main-agent tool calls, counted once per session.
    unit: count
    config:
      metric: failures
    script: &native_tool_metrics |
      function unavailable(message) {
        return { value: null, message };
      }
      const calls = new Map();
      const starts = [];
      for (const event of session) {
        if (event.type !== "tool.execution_start" && event.type !== "tool.execution_complete") {
          continue;
        }
        const scope = event.provenance;
        if (!scope || typeof scope.component !== "string" || !scope.component ||
            typeof scope.phase !== "string" || !scope.phase) {
          return unavailable("Native tool scope is unavailable.");
        }
        if (scope.component !== "agent" || scope.phase !== "agent") {
          continue;
        }
        const data = event.data;
        if (typeof scope.path !== "string" || !scope.path ||
            !data || typeof data.toolCallId !== "string" || !data.toolCallId) {
          return unavailable("Native tool identity is incomplete.");
        }
        const key = JSON.stringify([scope.path, data.toolCallId]);
        const call = calls.get(key) ?? { scope: scope.path };
        if (event.type === "tool.execution_start") {
          if (call.start) {
            return unavailable("Duplicate native tool starts cannot be counted reliably.");
          }
          call.start = data;
          starts.push(call);
        } else {
          if (call.complete || typeof data.success !== "boolean") {
            return unavailable("Native tool outcomes are incomplete or duplicated.");
          }
          call.complete = data;
        }
        calls.set(key, call);
      }
      if (calls.size === 0) {
        return unavailable("Native tool evidence is unavailable.");
      }
      if (starts.length !== calls.size) {
        return unavailable("Native tool completions are missing their starts.");
      }
      const failures = [...calls.values()].filter(call => !call.complete || !call.complete.success).length;
      if (config.metric === "failures") {
        return failures;
      }
      if (config.metric === "success-rate") {
        return (calls.size - failures) / calls.size;
      }
      if (config.metric === "repeated") {
        const canonical = value => Array.isArray(value) ? value.map(canonical) :
          value && typeof value === "object" ?
            Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
        const previous = new Map();
        let repeated = 0;
        for (const call of starts) {
          if (typeof call.start.toolName !== "string" || !call.start.toolName ||
              !Object.hasOwn(call.start, "input")) {
            return unavailable("Native tool arguments or names are unavailable.");
          }
          const signature = JSON.stringify([call.start.toolName, canonical(call.start.input)]);
          if (previous.get(call.scope) === signature) {
            repeated++;
          }
          previous.set(call.scope, signature);
        }
        return repeated;
      }
      throw new Error("Unsupported native tool metric.");
  native-tool-success-rate:
    name: Native tool success rate
    description: Fraction of main-agent native tool calls that completed successfully.
    unit: ratio
    config:
      metric: success-rate
    script: *native_tool_metrics
  native-repeated-tool-calls:
    name: Repeated native tool requests
    description: Consecutive identical requests within one session, not proof of a loop.
    unit: count
    config:
      metric: repeated
    script: *native_tool_metrics
---
