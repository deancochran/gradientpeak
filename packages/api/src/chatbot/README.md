# Chatbot API tools

`@repo/api/chatbot/ai-sdk` adapts the explicit API and Core allowlists to Vercel AI SDK
dynamic tools. It projects the descriptors' existing JSON Schemas and dispatches only to the
existing validated executors—it does not add a provider, API key, UI, model selection, or an
authorization policy.

## Server-only OpenAI model routing

`@repo/api/chatbot/model-routing` provides the host with a bounded two-tier OpenAI router. It
never accepts a model name, provider URL, or routing mode from a browser request. The deployment
must set both `CHATBOT_OPENAI_FAST_MODEL` and `CHATBOT_OPENAI_REASONING_MODEL` to model IDs that
the deployment's OpenAI account supports; the repository intentionally does not claim that any
example model ID is available to an account.

`OPENAI_API_KEY` and `TYPESAFE_API_KEY` are independent server secrets. `OPENAI_API_KEY` is
required when the host resolves a real OpenAI model. Jev is optional: the default
`CHATBOT_MODEL_ROUTING_MODE=fixed` uses the configured reasoning model without requiring a Jev
key. Supply `TYPESAFE_API_KEY` to enable Jev in `jev` mode; a missing/unavailable/invalid/
low-confidence classifier decision safely uses the configured reasoning model instead. The initial
 `CHATBOT_JEV_CONFIDENCE_THRESHOLD=0.75` is a policy default, not a calibration claim; measure it
on representative requests before changing it.

Jev remains opt-in. `CHATBOT_JEV_MODEL` defaults to the pinned `jev-1.14.0`; moving aliases
such as `jev-latest` are rejected because their confidence behavior can drift. The 0.75 threshold
is an **unvalidated starting policy**, and Choice concentration is not correctness. Before a
production Jev enablement, evaluate pinned prompt/criteria against representative synthetic tier
fixtures. This repository does not make paid evaluation calls. A Jev request sends bounded raw
current-user text to TypeSafe, so a separate processor data-policy and retention review is needed
before enabling it for sensitive production traffic. Likewise OpenAI `store: false` prevents this
API's stored-response option; it is not a vendor zero-retention claim.

```ts
import { generateText } from "ai";
import {
  chatbotOpenAIResponsesProviderOptions,
  createChatbotModelRouter,
} from "@repo/api/chatbot/model-routing";
import { loadChatbotProviderConfig } from "@repo/api/chatbot/model-routing";

const router = createChatbotModelRouter(loadChatbotProviderConfig());
const selected = await router.resolve({ text: currentUserText, signal: request.signal });
await generateText({
  model: selected.model,
  providerOptions: chatbotOpenAIResponsesProviderOptions,
  // The host's existing tools/authorization policy remains separate.
});
```

The router sends only the bounded current user text (default 4,000 characters) to Jev—never
private history, profile data, or tool results. It has a bounded, abortable classifier call and
zero classifier retries by default. Caller cancellation propagates rather than falling back.
Routing chooses one configured model per turn; it never grants tool permissions or authorization.

## Optional bounded Jev decisions

`CHATBOT_JEV_DECISIONS_ENABLED=false` is independent of routing. `TYPESAFE_API_KEY` is required
when either Jev routing or this helper is enabled. When explicitly enabled with a valid key and
pinned `CHATBOT_JEV_MODEL`, the host additionally exposes one read-only `jev_decide` tool. It
accepts only the versioned `select_activity_plan`, `identify_session`, and `check_preferences` templates,
at most 12 supplied candidates and six independent conditions. Candidate and question IDs reserve
`__none__`, `__proto__`, `constructor`, and `prototype` to prevent unsafe object-key handling.

The helper sends its bounded model-supplied context, candidate evidence, and questions to TypeSafe.
The host does not automatically fetch full profiles or histories for it, follow URLs, or execute
code. This is not a privacy guarantee: the model can copy excerpts from any conversation or API
context it sees, including potentially sensitive material. Tool instructions to prefer evidence from
prior authorized reads and not invent options are guidance, not DLP or provenance enforcement;
candidate provenance is unverified. Enabling the helper is therefore a separate external-processor
opt-in and requires data-policy/retention review for the traffic it may receive.

It has a three-call turn budget, zero retries, caller cancellation, and safe `unavailable` output on
service, timeout, or validation failure. Choice and condition output must match the SDK's exact
discriminators and supplied IDs; malformed output is unavailable. Its `evidenceLimits` reports only
that a judgment is based on the supplied candidates/context, not that the data was authorized or
true. Judgments are advisory and never API authorization, truth, medical advice, exact arithmetic,
ownership, or preview authority. Low confidence/abstention returns `uncertain`, so the main model
must clarify rather than choose blindly. The 0.75 policy bands are unvalidated. Synthetic fixtures
validate mapping only; live quality has not been measured and requires separate consent, keys, and a
same-model/tool-settings comparison with only this flag toggled (record task success, wrong action,
clarification, latency, and nullable provider token/cost fields without fabricating values).
The host must pass the exported Responses provider options (`store: false`,
`parallelToolCalls: false`) to the AI SDK generation call.

```ts
import type { LanguageModel } from "ai";
import { generateText, stepCountIs } from "ai";
import type { ChatbotApiExecutor } from "@repo/api/chatbot";
import {
  createChatbotAiSdkTools,
  type ResolveChatbotOperationId,
} from "@repo/api/chatbot/ai-sdk";

declare const model: LanguageModel; // host-selected, configured model
declare const apiExecutor: ChatbotApiExecutor; // bound to trusted request context
// Host implementation: persist logical-action identity across retries, not just toolCallId.
declare const resolveOperationId: ResolveChatbotOperationId;
const { tools } = createChatbotAiSdkTools({
  apiExecutor,
  resolveOperationId,
});
await generateText({ model, prompt: "…", tools, stopWhen: stepCountIs(5) });
```

The host must persist its stable operation-ID mapping. `toolCallId` can change when a model call
is regenerated, so it alone is not a cross-process retry key. The resolver must return an ID
valid for the original command (UUID is compatible with every current write tool), and must reuse
the same ID only for the same logical action and arguments. Durable command receipts remain the
authority. Model-facing write schemas omit operation IDs and reject a supplied ID before resolver
or dispatch. Cancellation is checked before resolving and before dispatch; it cannot undo a
database mutation already in flight.

Run the real PostgreSQL read/write acceptance only against the guarded disposable local target:

```sh
mise exec node@24.19.0 -- pnpm exec tsx packages/api/scripts/chatbot-reads.disposable.test.ts --disposable --local
mise exec node@24.19.0 -- pnpm exec tsx packages/api/scripts/chatbot-writes.disposable.test.ts --disposable --local
mise exec node@24.19.0 -- pnpm --filter @repo/api test:chatbot-host:disposable
```

The harnesses create and drop uniquely named `gradientpeak_api_chatbot_*` databases. They must not be pointed at a preserved dev, E2E, or hosted database.

Write-tool callers must provide a stable `operationId` for every logical action, reuse the exact same arguments and ID when recovering a lost acknowledgement, and never automatically retry with a fresh ID. The tools use the normal authenticated `appRouter` caller; they neither accept an actor/profile ID nor dispatch an arbitrary router method. Training-plan commit and apply tools require the real revision/hash/fingerprint returned by their corresponding preview; they do not refresh stale previews.

## App clients

The authenticated web header opens an Assistant Sheet; native Inbox opens the
full-screen Assistant route. Both use the React-independent
`@repo/api/chatbot/client` controller. Presentation stays platform-specific and
reuses existing UI primitives. The client decodes the SDK stream and also handles
completed JSON replay and recovery conflicts; the default SDK chat transport is
not a drop-in replacement for this endpoint's strict request body.

Closing the web panel preserves the draft and does not stop transport. Stop
interrupts transport without claiming that an in-flight action was undone.
Status checking, retrying the **same** pending request, recovery of recorded
actions, and starting a new conversation are separate operations. An uncertain
pending request blocks a fresh send until reconciled. No client automatically
regenerates a turn after losing its response.

Recovery snapshots are actor-scoped and contain thread/pending request identifiers
and, while unresolved, the original request text—not the full transcript. Web
uses sessionStorage. Native uses SecureStore. Treat pending text as private data;
do not log snapshots or use them as authorization. Server ownership checks remain
authoritative. Messages render as plain text; tool payloads are not dumped into
the transcript.

Focused shared and web regression checks:

```sh
mise exec node@24.19.0 -- pnpm --filter @repo/api exec vitest run src/chatbot/client.test.ts
mise exec node@24.19.0 -- pnpm --filter web exec vitest run src/components/chatbot/use-chatbot.test.tsx src/components/chatbot/chatbot-panel.test.tsx
```

Mocked tests and browser harnesses do not establish live provider quality or
native keyboard, accessibility, and real Expo streaming behavior. Those require
separate runtime evidence; never reset a preserved test target to obtain it.

## Durable server history and recovery

`contracts/chatbot` accepts only a request UUID, bounded current user text, and an
optional thread UUID. `repositories/chatbot-history-repository` owns actor-scoped thread and turn
claims. A repeated request UUID with identical input is a durable duplicate, while a different
input is a conflict. Expired running turns become `interrupted`; they are never silently rerun.
The host persists the canonical action before dispatch and treats uncertain effects as `unknown`.
Interrupted turns with recorded actions block new generation on that thread until explicitly
reconciled. Cancellation cannot roll back an in-flight domain mutation.

`GET /api/chat?threadId=<UUID>` returns bounded actor-owned status. To reconcile an interrupted
turn, send `POST /api/chat` with `{ "type": "recover", "threadId": "<UUID>", "turnId": "<UUID>" }`.
Recovery reauthorizes the recorded commands through the normal API executor with their original
operation IDs. It never calls the model or invents replacement actions. A failed reconciliation
leaves the thread blocked rather than claiming no mutation occurred.

## Server host

`@repo/api/chatbot/host` is the server-only orchestration boundary for the web `POST /api/chat` route. It
accepts a trusted `ApiContext`, strict request payload, and optional request abort signal, then
returns either an AI SDK UI-stream `Response` or a small safe outcome for the route to map. It
authenticates before configuration, persistence, or provider work; claims a turn before model
generation; and replays a completed duplicate without selecting a model. Running, interrupted,
and failed duplicates return an explicit recovery state rather than regeneration.

The route authenticates with the normal `createApiContext`/`resolveAuthSession` transport, requires a
same-origin `Origin` for cookie sessions (or an origin-less bearer session declared as mobile), rejects
other origins, reads at most 16 KiB of JSON request bytes, and applies a dedicated durable 20 requests per
minute per-user chatbot bucket before parsing or provider work. It returns `429` with `Retry-After` when
that bucket is exhausted. Completed duplicate turns are `200` JSON with `{ status: "completed", threadId,
turnId, text }`; running, failed, and interrupted duplicates are recoverable `409` JSON with `{ status,
threadId, turnId }`. New successful turns preserve the AI SDK stream response and headers unchanged.

The host has no UI, model picker, or automatic action recovery. Its private persistence tables
must be installed through the approved database workflow; this work verified them only on
disposable targets, not preserved/shared databases.
It bounds completed-history context to 24,000 characters, excludes incomplete prior turns, uses
one configured model selection, five generation steps, a 2,000-token output cap, and the exported
OpenAI Responses options. API tool actions are journaled before dispatch with the repository's
stable action UUID; a post-dispatch journal failure is treated as unknown rather than successful.
The streamed text has a separate 16,000-character bound. The stream reports normal completion
only after the final response is durably saved; persistence failure, overflow, or uncertain action
outcomes produce a safe error/abort instead. Cancellation and the host timeout abort model/tool
work and best-effort mark the turn interrupted; lease expiry remains crash recovery.
