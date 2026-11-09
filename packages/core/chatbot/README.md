# Chatbot tools

Use `defineChatbotTool` for framework-neutral Core tools. It keeps a typed local call
(`executeValidated`) and an unknown adapter boundary (`executeParsed`) behind the same Zod
input/output validation. `createChatbotToolRegistry` is the explicit allowlist and rejects
duplicate IDs.

Core owns pure tool definitions and its registry. API owns its separate allowlist through
`defineApiReadTool` and `defineApiWriteTool`, which add checked router metadata and supply the trusted tRPC caller;
untrusted calls only select an already registered tool and provide input.

Core additionally validates bounded activity-plan structures (returning only issue codes and
paths), summarizes authored completion quantities, and reports an evidence-labelled elapsed
duration estimate. Duration results are not medical advice and an `unavailable` result never
guesses a pace. API reads are an explicit nine-tool allowlist: notification count, own
activity-plan list plus permitted-plan detail, own training-plan list plus permitted-plan detail,
own recent activities, own goals, own basic profile, and an inclusive 1–90 calendar-date
scheduled-session range. API inputs cannot select an actor; the trusted request context supplies
it. Lists cap at 20 results and accept an existing forward cursor when one is returned; session
ranges cap output at 500 items and cap dates at 90 days. JSON Schema discovery uses Zod's public `io: "input"` or `io: "output"`
conversion; unsupported requested conversions fail when the definition is created. API writes
remain actor-bound and require a stable operation ID; Core does not depend on an AI SDK.
