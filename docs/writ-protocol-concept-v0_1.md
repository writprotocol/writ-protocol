# Writ Protocol — Concept & Architecture v0.1

> **Status:** Pre-implementation concept document
> **Author:** Ilkka
> **Date:** March 2026

---

> **writ** /rɪt/ *noun* — A formal written order issued by a body with administrative or judicial authority. Historically, writs were the mechanism by which a sovereign delegated specific authority to act on their behalf: bounded in scope, explicit in intent, and revocable by the issuer. The term dates to Anglo-Saxon England, where a royal writ carried the king's seal and granted its bearer precise, limited authority to act in the king's name.

---

## Vision

When AI pushes the button, writs prove you said yes.

Writ Protocol is a structured delegation system for autonomous AI agents. It addresses the gap between what agents can do and what they're authorized to do — as both a trust product and a security product.

Security proves the action was allowed. Writ proves what was agreed, what happened, and how to recover.

### The Problem

AI agents are being deployed to act on behalf of users — reading email, booking travel, managing calendars, executing code. But there's no structured way to:

- Express what an agent is allowed to do
- Verify it stayed within bounds
- Show what happened after the fact
- Undo what went wrong

When an agent acts outside its intended scope, the cause doesn't matter. It may have been tricked by an injected prompt. It may have lost context through compaction. It may have hallucinated a reasonable-sounding next step. It may have been exploited through a misconfigured API. In every case, the outcome is the same: the agent did something it wasn't authorized to do, and there's no structured record of what it was supposed to do instead.

Existing approaches to AI agent risk focus primarily on the prompt layer — defending against manipulation, filtering outputs, hardening against injection attacks. These are valuable. But they only address one cause of out-of-scope behavior. They have nothing to say about context compaction, model hallucination, or scope creep from genuine task complexity. And they are categorically unable to answer the question that matters after something goes wrong: what was this agent authorized to do, who authorized it, and what actually happened?

Writ operates at the authorization layer, not the prompt layer. It doesn't attempt to predict or prevent every cause of out-of-scope behavior. Instead, it defines a boundary that holds regardless of cause. An action either falls within the issued scope or it doesn't. The writ is the record of what was agreed; the receipt is the record of what happened. Both exist independent of why the agent acted as it did.

The Summer Yue incident (Feb 2026, 9.6M views on X) demonstrates the prompt-layer failure mode. Yue is the Director of Alignment at Meta Superintelligence Labs — literally one of the most qualified people on Earth to manage an AI agent safely. She instructed her OpenClaw agent to review her inbox and "suggest what you would archive or delete, don't action until I tell you to." The workflow had been working flawlessly on a test inbox for weeks. When she pointed it at her real inbox, the volume triggered context window compaction — the agent compressed its conversation history to stay within token limits, and in the process lost her safety instruction entirely. The agent then bulk-deleted over 200 emails at full speed. Yue typed "Stop don't do anything" and "STOP OPENCLAW" — the agent ignored her. She had to physically run to her Mac Mini and kill the process. Afterward, the agent acknowledged: "Yes, I remember, and I violated it, you're right to be upset."

The safety instruction was explicit. The agent acknowledged understanding it. The failure wasn't in the prompt — it was in the infrastructure. Authority stored as volatile prompt instructions is not authority at all. No amount of prompt hardening prevents compaction from dropping an instruction it can no longer see.

The McKinsey Lilli breach (March 2026) illustrates the same gap from the adversarial direction. Lilli is McKinsey's internal AI platform, used by over 70% of its staff to search proprietary research, analyze documents, and answer queries — with access to decades of accumulated consulting knowledge. Security researchers at CodeWall pointed an autonomous AI agent at the platform with no insider knowledge. It discovered that API documentation was publicly accessible and that 22 endpoints required no authentication. Exploiting this, it executed a SQL injection and gained system-wide access in under two hours — exposing 46 million chat messages, 57,000 user accounts, and the system prompts controlling Lilli's behavior. The attack succeeded not just because of the unauthenticated endpoints, but because Lilli had been provisioned with standing access to the entire corpus, with no structured delegation record tying that access to a stated purpose or ceiling. A writ-scoped deployment limits the blast radius regardless of how the breach occurs: the attacker lands inside a defined boundary, not an unbounded system. And the accountability question — who authorized Lilli to access all of this — has a structured answer rather than dissolving into deployment history and committee decisions.

These incidents are symptoms of three compounding problems that no single existing approach resolves together:

**The model problem.** LLMs hallucinate, lose context, and act confidently on incomplete information. This is not a bug to be patched — it's an intrinsic property of the current technology. An agent that deletes an inbox, contacts the FBI, or exceeds its mandate isn't necessarily broken. It's doing what the model does: filling in gaps with confident inference. The gap between what an agent was told and what it understood is a permanent feature of the deployment landscape, not a temporary one.

**The configuration problem.** IAM and rights management systems can theoretically constrain agent access to limit blast radius. In practice, these systems are complex enough that misconfiguration is the norm. The tools to scope Lilli's access properly existed — they weren't applied correctly. Configuration complexity creates its own failure mode: the harder it is to get right, the more likely it is to be wrong, and the harder it is to audit after the fact.

**The fatigue problem.** The naive response to both of the above is to put a human in the loop — require approval for every action, every step, every tool call. This creates rubber-stamping behavior. When a developer approves a stream of agent actions in rapid succession, they are no longer evaluating what they're approving. The approval becomes a reflex. The human is nominally in the loop but has stopped exercising judgment. This is worse than it appears: it creates an illusion of oversight without the substance, and it assigns accountability to a human who was never really making a decision.

Amazon's response to its "high blast radius" incidents — mandatory senior engineer sign-off on AI-assisted code changes — is institutionalized fatigue. It moves the rubber-stamp up the seniority ladder without fixing the underlying dynamic. The senior engineer approving a queue of agent-generated diffs is exercising the same reflex as the junior engineer they replaced.

Writ addresses all three simultaneously. The model problem is handled by making scope a durable artifact rather than a prompt instruction — the writ exists outside the context window and cannot be compacted away. The configuration problem is handled by making delegation explicit and human-issued at the task level, rather than relying on correctly configured standing permissions. The fatigue problem is handled by moving approval upstream: one considered decision about scope and constraints before the task runs, a receipt to review afterward. The approval moment is real because it's rare and meaningful — a plan being evaluated, not a stream of actions being rubber-stamped.

### The Principle

If a human pushes the button, it's their responsibility. If an AI pushes the button, we should show that a human gave it permission to do so.

### Positioning

Writ Protocol occupies the **delegation experience layer** — between enterprise governance dashboards (ServiceNow, Zenity) above and cryptographic capability primitives (Tenuo, UCAN, Biscuit) below. It's the layer that faces the human: the agent shows you a plan, you approve it, it runs within those bounds, and you get a receipt showing what happened.

Nobody else is building this layer.

---

## Primitives

Writ Protocol defines five core primitives.

1. **Writ** — the delegation envelope. What was agreed between human and agent.
2. **Token** — the verifiable proof. Derived from writs, signs actions, proves authority.
3. **Receipt** — the evidence. What happened, with enough context to verify or undo.
4. **Amendment** — the evolution. How authority changed during a task, and why.
5. **Registry** — the authority oracle. Optional central verification, revocation, and cross-system coordination.

Together they cover the full lifecycle: agree → authorize → execute → evidence → evolve → observe. The Registry provides optional infrastructure for coordination and oversight at scale.

### 1. Writ

The delegation envelope. A formal agreement between a human and an agent defining what the agent is authorized to do.

A writ is not a permission, not a role, not an API key. It's a task-scoped authority contract.

```
writ_7f3a9c
  issued_by: @ilkka
  delegate: agent:email-assistant
  scope: [email.read, email.label, email.send]
  constraints:
    folders: [inbox]
    send: requires_explicit_approval
  expires: 2026-03-07T18:00:00Z
  status: active
  revision: 1
```

**Lifecycle:** `issued → active → amended → completed | expired | revoked`

**Composition:** Writs can contain child writs with different scopes for different subtasks:

```
writ_main (email-triage)
  scope: email.read, email.label

  writ_vc_reply (vc-outreach-reply)
    scope: email.send
    constraints:
      to: reply to inbound VC only
      style: professional, interested
```

The child writ is what gets attached to outward-facing actions. When a VC receives a reply, they see `writ_vc_reply`, not the broader `writ_main`.

### 2. Token

The verifiable proof of authority. Tokens are derived from writs and serve as the signing mechanism for actions.

When an agent acts, it signs the action with its token. The receipt contains the signature. Anyone can verify the chain: action → token → writ → human who authorized it.

**Two modes:**

- **Consumption-limited:** Finite uses or budget. "Book up to 3 flights, each under €200." Token is spent when consumed. Once depleted, authority is gone.
- **Time-limited:** Valid for a duration. "Triage my email for the next 7 days." Token proves ongoing authority under the writ. Expires when the writ expires.
- Tokens can be both: "Reply to VCs for 7 days, max 10 replies." Whichever limit hits first.

**Revocation:** Tokens can be revoked at any time. `writ revoke writ_7f3a9c` immediately invalidates all tokens under that writ. Agents holding those tokens try to act, engine rejects.

**Signing:** Tokens sign actions to prove and backtrack that there was a mandate to do what the agent did. This creates a cryptographic proof chain without starting from security-first thinking — it arrives at verifiability from the need for accountability.

### 3. Receipt

Evidence of what happened under a writ. Not just a log — a structured narrative of the task.

```
receipt_4e9f0a
  writ: writ_7f3a9c (email-triage)
  scope: email.read, email.label

  actions:
    ✓ read 12 emails
    ✓ labeled 8 as priority/high
    ✓ labeled 4 as priority/low
    ○ email.send — not used

  sub-agent: email-categorizer
    scope: email.read, email.label
    ✓ read 12 emails
    ✓ labeled 12 emails
    ✗ attempted calendar.create — blocked, not in scope

  no amendments requested
  writ completed
```

**Two classes of action, two receipt behaviors:**

- **Reversible actions** (label, archive, draft, move): Receipt includes undo capability. `receipt.undo()` reverses the action.
- **Irreversible actions** (send email, make payment, publish): No undo exists. The receipt is pure evidence — proof of what was authorized and by whom.

Actions that cannot be undone are precisely where writs matter most. The approval protocol IS the safety mechanism for irreversible actions.

**Receipt schema fields** (designed for future use):

- `confirmed` — user explicitly confirmed the action was correct
- `undone` — user reversed the action
- `corrected` — user manually corrected the result downstream

These fields enable future progressive trust features without retroactive schema changes.

### 4. Amendment

Explicit authority evolution. When a task grows beyond the original writ scope, an amendment formalizes the change.

```
amendment_2d7c3b
  writ: writ_7f3a9c
  revision: 1 → 2
  changes:
    scope_added: [calendar.create]
    reason: "Agent determined calendar events should be created from meeting-related emails"
    requested_by: agent:email-assistant
    approved_by: @ilkka
```

**Amendments are non-destructive.** The writ's history is preserved. Revision 1 shows the original scope. Revision 2 shows what changed and why. This prevents silent scope creep and provides an audit trail of how authority evolved during a task.

### 5. Registry

The optional authority oracle. A coordination service for writ verification, revocation, and cross-system trust.

The first four primitives work entirely locally — core validates, engine manages state, tokens sign actions, receipts capture evidence. The Registry adds network-level coordination for scenarios that exceed a single agent or single machine:

- **Writ status verification:** Is `writ_7f3a9c` still active, or has it been revoked?
- **Token validity:** Has this token been consumed or is it still live?
- **Revocation propagation:** When a user revokes a writ, all agents across all systems learn immediately — not on their next check-in.
- **Cross-system verification:** An external service receiving an agent action can verify the writ chain without trusting the agent's self-report.

**The Registry is NOT required for basic functionality.** A single agent operating locally with the CLI works fine without it. The Registry becomes valuable when:

- Multiple agents operate under writs from the same user
- Agents cross system boundaries (calling external APIs, delegating to remote sub-agents)
- Enterprise environments need centralized audit and revocation
- Third parties need to verify writ authenticity (the VC receiving your agent's email)

**Deferred from v1.** The Registry is documented here for completeness but is not part of the initial implementation. The local-first model (core + engine) ships first. Future deployments may run their own registries; the protocol does not mandate a single canonical one.

---

## Delegation

Delegation describes how authority flows between agents. It's not a primitive — it's a behavior that emerges from writs and tokens working together.

### Writs All the Way Down

A writ defines a ceiling, not an assignment. When an agent delegates a subtask to a sub-agent, it creates a child writ and moves tokens from its own writ into the child. Every agent at every level operates under a writ. The delegation tree is a tree of writs, consistent from root to leaf.

```
writ_travel (travel-booking)
  tokens: 3 × flight.book (€200), 1 × hotel.book (€500)

  writ_flights (delegated to agent:flight-finder)
    tokens: 3 × flight.book (€200)

  writ_hotel (delegated to agent:hotel-finder)
    tokens: 1 × hotel.book (€500)
```

Child writs can never exceed the parent's scope. Tokens can be attenuated when moved: a €500 token in the parent can become a €200 token in the child. Authority only shrinks, never expands. If the parent writ is revoked, all child writs and their tokens die with it.

### Conservation of Authority

Token delegation is an atomic operation managed by the engine, not a copy. When a parent writ moves a €500 token to a child writ as a €200 token:

1. The engine validates the request (within scope, sufficient balance)
2. The original €500 token is destroyed
3. Two new tokens are minted: €200 for the child writ, €300 remaining on the parent writ
4. Both new tokens reference the original as their provenance

Total authority is conserved — €500 in, €200 + €300 out. Authority in the system behaves like energy: it can be transformed and divided, but never created from nothing. Only the original `writ.issue()` by a human creates new authority. Everything downstream is splitting and attenuating. This prevents privilege escalation through token cloning — if the parent just copied a token to the child, authority would double.

### Self-Organization Within Bounds

Agents don't need per-delegation approval to distribute work. If a user approves a writ with scope `email.read, email.label`, the agent can freely create child writs for sub-agents covering parts of that scope. The user doesn't care how many agents are involved — they care that nothing outside the writ happens.

### Escalation

When a sub-agent hits a scope boundary, escalation follows the delegation tree — not a flat "always ask the human" model:

1. Sub-agent tries an action outside its child writ scope
2. Escalates to parent agent
3. If the parent's writ covers it, the parent handles it directly (creates new child writ, moves tokens)
4. If it exceeds the parent's writ too, it bubbles up to the human as an amendment request
5. Only when both parent and sub-agent agree the action is genuinely needed does the user see it

The human is the last resort, not the first. This keeps the user's approval queue focused on decisions that genuinely need human judgment.

### Blocked Attempts

If a sub-agent tries an action outside scope and gets blocked, that's not an alert — it's the system working as intended. The attempt is logged in the receipt as useful information, not an interruption:

```
sub-agent: email-categorizer
  ✓ read 12 emails
  ✓ labeled 12 emails
  ✗ attempted calendar.create — blocked, not in scope
```

Over time, patterns of blocked attempts inform whether templates need updating — but that's a maintenance insight, not an urgent notification.

### Two Loops at Two Speeds

Writ Protocol manages two nested decision loops operating at fundamentally different speeds.

The agent's loop runs fast. Within a writ, the agent observes, orients, decides, and acts autonomously at machine speed. This is the point — the human doesn't want to approve every micro-decision, and the agent doesn't need to ask. The writ defines the decision space; within it, the agent runs freely.

The human's loop runs slow and deliberate. The human observes via receipt, orients against what was originally agreed, decides via writ issuance or amendment, and acts by authorizing or revoking. This loop is infrequent by design — and meaningful precisely because the agent's fast loop absorbs everything within scope.

The design goal is clean separation: each loop runs at its natural speed without the other interfering.

This framing explains the rubber-stamping failure mode structurally. Requiring approval for every agent action forces the human into micro-loops faster than they can actually orient. The Decide phase becomes vestigial — a reflex, not a judgment. The human is nominally in the loop but has stopped exercising it. Writ fixes this by pushing the human's Decide phase upstream to scope definition, where there's time to actually orient on what's being approved.

Amendments are loop handoffs. When the agent hits a boundary it cannot resolve within its fast loop, it escalates — handing the decision up to the human's loop for a proper Decide cycle, then returning to autonomous execution once the amendment is approved. The escalation chain is a formalized protocol for transferring a decision between loops when its complexity exceeds the faster one.

The `intent` field maps directly to commander's intent in military doctrine — the mechanism that allows subordinates to run fast autonomous decision loops without checking back constantly, because the boundaries and purpose of their authority have been pre-defined. A writ is commander's intent made machine-readable and auditable.

---

## Architecture

### Package Structure

```
@writprotocol/core        ← pure logic: schema, types, validation, zero side effects
@writprotocol/engine      ← stateful runtime: persistence, approval queue, receipt store
@writprotocol/sdk         ← integration toolkit: guard(), wrap(), intercept()
@writprotocol/server      ← HTTP/REST interface to engine
@writprotocol/cli         ← terminal interface to engine
@writprotocol/mcp         ← MCP interface to engine
```

### Layer Separation

**Core** is pure functional. Given a writ, is this token valid? Does this amendment satisfy constraints? Is this receipt well-formed? No state, no I/O, no side effects. Runs anywhere including the browser.

**Engine** is stateful. It manages the writ lifecycle, persists receipts, maintains the approval queue, tracks amendments. It uses core for all validation logic but adds the runtime behavior. This is the heart.

**Server, CLI, and MCP** are equal peers — thin interfaces that translate their protocol into engine calls. None are special. None own state. All three can run simultaneously against the same engine.

**SDK** is the integration toolkit. It provides the primitives for wrapping any tool call in a writ flow. Framework-specific adapters are built on the SDK:

```
@writprotocol/langchain   ← adapter built on SDK
@writprotocol/anthropic   ← adapter built on SDK
@writprotocol/openai      ← adapter built on SDK
```

### CLI as Primary Interface

CLI ships first because it's the most universal interface:

- Every agent framework can shell out
- Every MCP server can call a CLI
- Every human can type a command
- Every CI/CD pipeline can run one

```bash
$ writ propose "triage my inbox"
Plan: Read 12 unread emails, label by priority
Scope: email.read, email.label
Expires: 30m

Approve? [y/n]

$ writ approve
Writ issued: writ_7f3a9c

$ writ receipts
3 actions completed.
  receipt_01: labeled "Project update" → priority/high [undo available]
  receipt_02: labeled "Newsletter" → priority/low [undo available]

$ writ undo receipt_02
Undone: "Newsletter" label removed.
```

### HTTP/REST API

The server enables:

- Remote agents requesting writs via HTTP
- Approval from any surface (web UI, mobile, Slack bot)
- Multiple agents hitting the same endpoint
- The foundation for the dashboard product

`writ serve` starts a local server. Agents point at it. Browser opens the dashboard. One command, whole system running.

### The Dashboard Product (Phase 2)

The protocol enables a product layer: a view of what your agents are doing.

```
🟢 email-triage: labeled 8 messages (receipts available)
🟡 travel-booking: wants to confirm hotel for €180 (approve?)
🔴 code-review: requested file system access outside scope (blocked)
🟢 calendar-manage: drafted 2 meetings (review drafts?)
```

Every line is backed by a writ. Every action has a receipt. Yellow items are the approval protocol in action. Red items are the constraint system working. Green items are trust proving itself.

This is not a CISO dashboard. It's for the person who has agents running and wants to see what they're up to.

---

## Templates

Templates are the source of truth for common delegation patterns.

```json
{
  "name": "email-triage",
  "version": "1.0",
  "description": "Read and label emails. Never send or delete.",
  "scope": {
    "allowed": ["email.read", "email.label"],
    "blocked": ["email.delete"],
    "requires_approval": ["email.send"]
  },
  "actions": {
    "email.read": { "reversible": false, "approval": "auto" },
    "email.label": { "reversible": true, "approval": "auto" },
    "email.send": { "reversible": false, "approval": "explicit" }
  },
  "defaults": {
    "ttl": "30m",
    "constraints": {
      "folders": ["inbox"]
    }
  },
  "extensions": {}
}
```

**Templates define:**

- What's allowed, blocked, and requires approval
- Which actions are reversible vs irreversible
- Default constraints and TTLs
- The action classification (reversible/irreversible) is baked in — the agent can't get it wrong

**Distribution:** GitHub repo initially (`writprotocol/templates`). Each template is a JSON file — human-readable, versionable, diffable.

**Validation tiers:**

- Schema validation — automated, CI checks every PR (v1)
- Community review — PR approval process, GitHub gives this for free (v1)
- Signed templates — cryptographic publisher signature, optional `signature` field in schema (future)

**Skill generation:** Templates can automatically generate skill instructions for agent platforms (Claude skills, OpenClaw skills). The template defines the boundary, the generated skill teaches the agent how to operate within it. One artifact, multiple outputs. This is the advisory layer — useful for demos and dogfooding, but not enforcement. The SDK provides enforcement.

---

## Schema Design Principles

- **Version from day one.** All primitives carry a `protocol` version identifier — `writ/v0` pre-release, `writ/v1` at stabilization.
- **Extensions field on every primitive.** Domain-specific metadata without breaking the core spec.
- **Design for future, don't build for future.** Receipt schema includes `confirmed`, `undone`, `corrected` fields from v1. Progressive trust thresholds in template schema are reserved but not implemented.
- **Readable IDs.** `writ_7f3a9c`, `token_8b2c1d`, `receipt_4e9f0a`, `amendment_2d7c3b`. No abbreviations needed — "writ" is already short. The name does brand work every time it appears.
- **Identity is pluggable, not prescribed.** Principals have a `handle` (display name, cosmetic), an `identities` array (email, GitHub, OIDC, SAML — whatever the context requires), and a `key` (the cryptographic truth). Each identity can optionally carry an `attestation` object with a `method` discriminator. When omitted, attestation defaults to `self` — the principal vouches for themselves. The protocol doesn't do identity verification — it records who did. The schema structure supports richer attestation (registry, OIDC, SAML) from day one without requiring any of it to be built yet. The core of v1 is governing what agents can do, not proving who issued the writ — identity verification is a future concern.

```json
{
  "principal": {
    "handle": "@ilkka",
    "identities": [
      {
        "type": "email",
        "value": "ilkka@writprotocol.dev"
      }
    ],
    "key": "ed25519:base64encodedpublickey"
  }
}
```

---

## Dogfooding

Writ Protocol uses itself. Every outward-facing action completed by an AI agent on behalf of the project carries a visible writ.

- GitHub issue triaged by an agent → footer shows the writ scope and approval
- Blog post drafted by an agent → metadata shows the delegation chain
- Email sent by an agent → writ signature proves human authorization

This serves three purposes:

1. **Proves the product works.** Not a demo — the actual project running on its own infrastructure.
2. **Normalizes the model.** People see writs on real actions and understand what they are without reading docs.
3. **Builds trust through transparency.** AI involvement isn't hidden. It's shown with a clear authority chain.

There's a broader point here. Everyone is already using agents — for drafting emails, triaging issues, writing code, managing schedules. But most people hide it, or at best ignore it. The result is a world pretending it's humans all the way down when it isn't. Attaching a writ doesn't add AI to the process — it makes the AI that's already there visible and accountable. The goal isn't to justify using agents. It's to stop pretending we don't, and to show that a human was in the loop when it mattered.

Only agent-completed actions carry writ metadata. If a human pushes the button, no writ is needed. The distinction matters — overtagging dilutes the signal.

---

## Regulatory & Legal Implications

Writs carry consequences beyond developer tooling. As AI agents take real-world actions — sending emails, making payments, modifying data, entering agreements — the question of "who authorized this" becomes a legal question, not just a technical one.

**Writs as legal artifacts.** A writ receipt is structured evidence of authorization. It answers the questions that regulators, auditors, and courts will ask:

- **Agent acted within its writ:** The receipt proves authorization. The human approved this scope, the agent stayed within bounds, here's the cryptographic evidence. The human is accountable — they issued the writ.
- **Agent acted outside its writ:** The receipt proves it was unauthorized. The writ defined the boundary, the action exceeded it, here's the proof. The system failed, not the human's judgment.
- **No writ existed:** The absence itself is evidence. The agent acted without structured delegation — no approval, no scope, no receipt. In a world where writ-like governance exists and was available, that's negligence.

**The "AI did it" defense.** Without durable authorization artifacts, "the AI hallucinated" becomes a convenient and unfalsifiable excuse when agent actions cause harm. Writs make that defense testable. Either a writ exists proving authorization, or it doesn't. Either the action was within scope, or it wasn't. Binary, verifiable, not a matter of reconstructing intent from logs and testimony.

**Regulatory direction.** NIST published a concept paper on agent identity and authorization (Feb 2026) with comments due April 2. The EU AI Act requires audit trails and human oversight for high-risk AI systems. As regulation catches up to agent deployment, having a structured delegation and receipt trail moves from nice-to-have to compliance requirement. Organizations deploying agents without governance frameworks face increasing exposure.

**For organizations with audit or compliance requirements**, structured receipts provide testable evidence. The receipt isn't just a UX feature — it's an artifact that holds up under scrutiny.

---

## Prior Art & Differentiation

### Tenuo (tenuo.dev)

Closest technical cousin. Rust core, Python bindings, capability-based warrants with cryptographic attenuation. Well-thought-out security engineering. Differs from Writ Protocol in:

- **Audience:** Security engineers and CISOs vs. agent users and product developers
- **Approach:** Security-first (defend against injection) vs. trust-first (manage reliability failures)
- **Missing:** No approval protocol, no amendment lifecycle, no receipts with reversal context, no templates. TypeScript SDK planned for v0.2 but not yet shipped.
- **Interface:** Developer API vs. CLI + dashboard product

The warrant/token attenuation model may be wire-compatible at the crypto layer. Writ Protocol acknowledges Tenuo as prior art alongside Macaroons, Biscuit, UCAN, and Google's CaMeL research.

### Enterprise Governance (ServiceNow, Zenity, Holistic AI)

Operate at 30,000 feet — AI asset inventory, compliance reporting, risk scoring. Don't touch runtime delegation. A different layer of the same problem; writ receipts can feed audit dashboards.

### Agent Framework Permissions (LangChain, CrewAI, OpenAI Agents SDK)

Duct-tape safety: breakpoints, human_input flags, tool allowlists. No schema, no receipts, no delegation chains. Writ Protocol provides the structured layer these frameworks are missing.

### Auth & Identity (Okta/Auth0, Stytch, Cerbos)

Extending OAuth/OIDC for agents. Handle "agent X can call API Y" but don't model task-scoped delegation, approval flows, or undo.

### Academic & Standards (NIST, CaMeL, MIT Media Lab)

NIST published a concept paper on agent identity and authorization (Feb 2026, comments due April 2) signaling regulatory direction. Google DeepMind's CaMeL paper formalized capability-based security for agents — separating what the agent knows from what it can do. MIT Media Lab's "Authenticated Delegation" paper (Jan 2025) proposed extending OAuth 2.0/OIDC with agent-specific delegation tokens. All are frameworks and research — no shipping implementations aimed at agent users.

---

## Design risks

1. **Undo complexity.** Partial reversibility must be explicit and typed, not marketing. Irreversible actions don't get undo — they get gates.
2. **Overbuilding before validating.** Ship incrementally. Working code before elegant semantics.

---

## Roadmap

1. **JSON schema** for the five primitives. Versioned from day one (`writ/v0`, → `writ/v1` at stabilization).
2. **Working CLI demo** with a concrete connector (e.g. Gmail). `writ propose` → `writ approve` → `writ receipts` → `writ undo`.
3. **MCP server** wrapping arbitrary MCP tool calls with the writ approval + receipt flow.
4. **Templates + a second connector.** Two connectors proves the pattern generalizes.
