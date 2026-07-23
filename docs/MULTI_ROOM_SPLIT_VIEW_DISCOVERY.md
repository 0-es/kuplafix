# Multi-room split view: discovery and implementation plan

Status: shelved technical discovery, 2026-07-21

> **Decision:** Multi-account presence is not an acceptable KuplaFix feature
> because online time generates valuables and community rules prohibit using
> multiple accounts this way. One account cannot be present in several rooms
> under the current server contract. This document is retained only as an
> architectural record; it is not an implementation plan for the current
> release.

## Goal

Show and operate more than one Kuplahotelli room at the same time inside one
KuplaFix-controlled browser view.

There are two materially different meanings of "present in multiple rooms":

1. **One account/avatar is present in every room.** This is not possible with
   the current client/server contract without Kuplahotelli server changes.
2. **One browser view controls several live room sessions, each authenticated as
   a different account.** This is feasible from KuplaFix with multiple Nitro
   iframe realms and is the recommended client-only target.

This distinction is the first product decision. The proposed implementation
keeps the UI/session architecture useful for either path, but the authentication
and server work are very different.

## Evidence gathered

### Live Kuplahotelli client

The live client was inspected read-only on 2026-07-21.

- The outer page is `https://kuplahotelli.com/game/nitro`.
- It contains one same-origin, full-window `iframe#nitro` pointing at the
  current `/client/dist/index.html` build.
- The live Nitro room surface is one full-window canvas under
  `.roomView-background`. A second small canvas exists outside the main React
  root and is not the room renderer.
- The current UI bundle still calls
  `initializeRoomInstanceRenderingCanvas(activeRoomId, canvasId, width, height)`,
  defaults the room canvas to ID `1`, and calls `setActiveRoomId(roomId)`.
- KuplaFix 2.1.6 is active against that one iframe and one captured game socket.

The SSO ticket is embedded in the iframe URL. It must be treated as a secret:
never persist it, display it, or write it to console output.

### KuplaFix's current assumptions

The active script is single-client throughout:

- `DOM.getNitroIframe()` resolves only `#nitro`.
- `_nitroLastIframeDoc` tracks one current iframe document.
- `DOM.getIframeDoc()` returns one document.
- `PacketManager.socket` and `PacketManager.activeWindow` hold one connection.
- Capturing a later game WebSocket overwrites the earlier socket.
- Packet history, macros, listeners, injection, and send operations have no
  client/pane identity.
- Many feature modules call `DOM.getIframeDoc()` directly and would silently
  operate on the wrong pane after a second client is added.

There is also a security prerequisite: the bookmarklet restart currently logs
the complete Nitro source URL. Since that URL includes the SSO ticket, URL
redaction must land before multi-room work.

### Server authentication and presence model

The archived Atom CMS and Arcturus sources explain the current behavior:

- Every load of the Nitro page generates and stores a new SSO ticket for the
  account.
- Arcturus consumes that ticket after successful login.
- If the account is already connected, `cloneCheck` alerts and disposes the
  existing game client before rejecting the new load.
- A `Habbo` has one `GameClient` and one current room state.

Therefore, cloning the existing iframe or reusing its SSO URL cannot create a
second same-account room. It will either fail because the ticket was already
consumed or disconnect/replace the original client.

### Nitro renderer and UI model

The archived Nitro source shows a useful split:

- Low level: `RoomManager` stores a map of room instances, and a room renderer
  can create multiple canvas IDs. The engine APIs accept `roomId` and
  `canvasId` in many places.
- Application/session level: `RoomSessionManager.getRoomId()` returns the
  literal `hard_coded_room_id`, intentionally collapsing its session map to one
  entry.
- Room packet handlers are rebound to one room ID whenever a session starts.
- `RoomView` moves the single Pixi application canvas into one DOM container.
- `useRoom` owns one `roomSession`, one room background/filter, canvas ID `1`,
  one global resize path, and one global active room ID.

The low-level renderer could support a future forked Nitro client, but the
shipped UI and packet/session layer are not multi-room capable. Reaching and
rewriting the bundled private module graph from a userscript would be much more
fragile than isolating full clients in iframe realms.

## Options

| Option | Live presence | Same account | Interaction | KuplaFix-only | Assessment |
| --- | --- | --- | --- | --- | --- |
| Multiple full Nitro iframes, one account per pane | Yes | No | Full | Yes, once tickets exist | **Recommended client-only route** |
| Fork Nitro into one app with several native room canvases | Yes, with separate connections/accounts | No | Full | No; requires maintaining a client fork | Technically elegant, very invasive |
| Cached/snapshot room mirrors | No; stale after leaving | Yes | Read-only/custom | Yes | Useful UI prototype, not the requested presence |
| Packet-only auxiliary clients rendered by KuplaFix | Yes, with separate accounts | No | Custom/partial | Partly | Large protocol and renderer rebuild |
| Server-supported multi-room subscriptions | Yes | Potentially | Full after protocol work | No | Only honest path for one avatar in several rooms |

### Why multi-iframe is the first target

Each iframe gives us isolation for:

- Nitro's singleton communication manager;
- its global active room and session;
- the Pixi application, stage, ticker, and canvas;
- React hooks and UI singleton state;
- WebSocket constructors and packet hooks.

KuplaFix then owns the outer split-view shell and explicitly associates every
iframe, document, socket, room, and action with a pane ID. This works with the
current public build instead of depending on its private bundled symbols.

The main unresolved input is safe secondary authentication. A secondary pane
must receive a fresh SSO ticket for a different account. KuplaFix must not ask
for or store account passwords. For an initial test, tickets can be provisioned
manually from separate authenticated browser contexts and kept in memory only.
A polished release needs a safe pairing flow or cooperation from Kuplahotelli.

## Recommended architecture

### 1. Pane registry in the outer page

Introduce a `MultiRoomController` that owns stable pane contexts:

```js
{
  id,
  label,
  iframe,
  window,
  document,
  socket,
  roomId,
  lifecycleState,
  connectionState,
  isPrimary,
  isFocused
}
```

Use `Map<paneId, PaneContext>`, `WeakMap<Document, paneId>`,
`WeakMap<Window, paneId>`, and `WeakMap<WebSocket, paneId>`. Never infer the
target pane from "last iframe" or "last socket."

The native `#nitro` iframe becomes the primary pane. Additional iframes receive
generated IDs such as `kuplafix-nitro-2`; code must not clone the primary SSO
URL.

### 2. Generalize the DOM lifecycle

Replace the singleton helpers with pane-aware equivalents:

- `getNitroPanes()`
- `getPane(paneId)`
- `getPaneDocument(paneId)`
- `onPaneDocumentReady((context) => ...)`
- `querySelector(selector, { paneId })`
- `waitFor(selector, { paneId, timeout })`

Keep compatibility wrappers that default to the focused pane during migration.
Features must progressively accept a `PaneContext` instead of reading a global
iframe document.

### 3. Replace `PacketManager.socket` with connection contexts

Create a registry-based transport layer:

- capture every game socket with its owning iframe window/pane;
- store history as `{ paneId, direction, header, ... }`;
- dispatch listeners as `(context, header, buffer, parsedArgs)`;
- add `sendTo(paneId, header, ...values)` and
  `injectInto(paneId, header, ...values)`;
- preserve `send(...)` temporarily as "send to focused pane";
- make macros explicitly scoped to one pane, all panes, or a named pane group;
- show pane identity in packet-builder logs.

The WebSocket proxy should only capture sockets created in the relevant iframe
realm. Prototype-wide logging must also attach the realm/pane identity so
packets cannot be mixed.

### 4. Split-view shell

Build the shell outside Nitro so it survives individual iframe reloads:

- CSS grid with 1x1, 1x2, 2x1, and 2x2 layouts;
- pane header with account label, room name/ID, connection indicator, focus,
  reload, mute, and close actions;
- focused-pane border and keyboard routing;
- per-pane audio mute, with secondary panes muted by default;
- resize each iframe by layout, allowing Nitro's existing resize handler to
  resize its own canvas;
- persist layout and non-secret labels only, never SSO-bearing URLs.

Start with at most two panes. Each iframe loads an independent client and asset
graph, so memory, GPU textures, tickers, audio, and WebSockets scale roughly
with pane count. A 2x2 mode should remain experimental until profiling proves
it safe.

### 5. Feature scoping policy

Classify existing KuplaFix features before enabling them in secondary panes:

- **Global shell:** update checker, main settings, layout, pane management.
- **Focused-pane:** packet builder, room lighting controls, browser/LiveKit
  launchers, direct actions.
- **Every pane:** safe DOM fixes, GIF handling, notifications, input helpers.
- **Session-owned data:** chat history, packet history, Roomilus state, macros.

For the first prototype, run ordinary KuplaFix DOM enhancements only in the
primary pane. Secondary panes should remain stock Nitro until the lifecycle and
transport registries are proven.

## Authentication paths

### Client-only test path

Use two dedicated test accounts. Generate each secondary SSO ticket in a
separate authenticated browser context, pass the ticket URL to KuplaFix once,
keep it in memory, and redact it from all diagnostics. Tickets are single-use;
reloading a secondary pane requires a new ticket.

This is acceptable for controlled development, not a polished end-user flow.

### Production client-only path

A safe pairing flow must obtain a one-time ticket without collecting passwords
or collapsing all accounts into the same cookie jar. Possibilities require
validation with the actual deployment/userscript manager:

- explicit one-time pairing from another browser profile/device;
- a Kuplahotelli endpoint that mints a scoped ticket for a linked secondary
  account;
- a companion extension with isolated account containers.

Do not implement password storage, credential forwarding, or a remote login
proxy.

### Same-account path

This requires Kuplahotelli server work. At minimum it needs:

- an authenticated connection or subscription identity that can join several
  rooms without replacing `Habbo.client`;
- room-specific virtual units/presence and routing;
- every incoming/outgoing room packet tagged or bound to a room stream;
- per-room permissions, moderation, movement, chat, and disconnect semantics;
- changes to duplicate-login handling and possibly the database/session model;
- a modified Nitro session manager/UI or several client realms consuming those
  streams.

This should be treated as a separate server feature, not a KuplaFix patch.

## Delivery phases

### Phase 0: security and observability

- Add an SSO/URL redaction helper and tests.
- Stop logging complete Nitro URLs.
- Add stable pane IDs to diagnostics.
- Record frame/socket creation, close, reload, and focus transitions without
  secrets.

Exit criterion: diagnostics can be shared without exposing a ticket.

### Phase 1: internal multi-context refactor, single visible pane

- Add the pane registry with the existing `#nitro` as `primary`.
- Convert WebSocket capture to a connection registry.
- Add pane-aware listener/send/inject APIs.
- Preserve current APIs as focused-primary compatibility wrappers.
- Migrate the highest-risk global callers first: packet builder, macros,
  Roomilus bridge, chat history, room lighting, and game mode.

Exit criterion: all current single-pane features behave identically and every
packet/history entry has an unambiguous pane ID.

### Phase 2: inert split shell

- Add grid layout and a placeholder secondary pane.
- Prove focus, resize, close/reopen, keyboard, and per-pane UI state.
- Profile the primary client in half-width and half-height layouts.

Exit criterion: switching layouts never reloads or disconnects the primary
client and the Nitro canvas resizes correctly.

### Phase 3: two live clients with test accounts

- Add an in-memory secondary ticket input/import path for developers.
- Load a second full Nitro iframe.
- Capture and associate both sockets before either client creates its game
  connection.
- Keep secondary KuplaFix features disabled except connection status and focus.
- Verify distinct accounts are simultaneously visible in distinct rooms.

Exit criterion: both clients remain connected for 30 minutes, can chat/move in
their own rooms, and no action or packet is routed to the wrong pane.

### Phase 4: pane-aware features

- Enable chat history and notifications per pane.
- Add focused-pane packet tools and Roomilus routing.
- Add unread/activity indicators and audio focus.
- Add per-pane reload recovery with fresh-ticket handling.

Exit criterion: each enabled feature declares and passes its scoping contract.

### Phase 5: performance and release hardening

- Measure heap, GPU memory where available, FPS, long tasks, network, and asset
  load for one, two, and four panes.
- Pause or throttle unfocused panes only if it does not break server heartbeats
  or room state.
- Test slow loads, out-of-order iframe readiness, disconnects, ticket expiry,
  account replacement, and one-pane crashes.
- Keep the 2x2 layout behind an experimental setting until it meets budgets.

## Test strategy

### Automated unit tests

- SSO URL redaction, including logs and errors.
- Pane registry add/remove/reload and WeakMap ownership.
- Two sockets created in either order map to the correct pane.
- `sendTo` and `injectInto` reject unknown/closed contexts.
- Packet histories/listeners/macros never cross pane IDs.
- Focused-pane compatibility APIs change target only after an explicit focus
  transition.
- Persisted configuration contains no ticket or complete client URL.

### Browser harness

Create a local same-origin harness with two fake Nitro iframes and a
`MockWebSocket`. Exercise:

- concurrent and out-of-order iframe loads;
- iframe navigation and document replacement;
- socket reconnect and stale-socket cleanup;
- pane close while packets are in flight;
- layout resize storms;
- keyboard focus and chat input isolation.

The harness should be the main regression suite; it must not require live hotel
accounts.

### Controlled live tests

Use dedicated accounts and low-risk rooms.

1. Baseline one-pane KuplaFix behavior.
2. Two panes, two accounts, same room: verify two visible avatars and isolated
   controls.
3. Two panes, two accounts, different rooms: verify simultaneous presence,
   chat, movement, notifications, and packet routing.
4. Reload/close the secondary pane: primary must remain connected.
5. Intentionally submit a consumed ticket: show a scoped error without touching
   the primary client.
6. Run 30-minute and 2-hour soak tests.
7. Profile 1x1, vertical split, horizontal split, and experimental 2x2.

Do not test by cloning the active account ticket; the archived server behavior
predicts disconnection/replacement.

## Acceptance criteria for the first real release

- Two distinct accounts can remain live in two rooms in one browser view.
- Pane focus is obvious and all movement/chat/packet actions affect only the
  focused pane.
- Closing, reloading, or losing one pane never disconnects the other.
- No SSO ticket appears in storage, exported diagnostics, DOM labels, or logs.
- Existing single-pane KuplaFix behavior remains the default.
- Memory/FPS budgets are measured and documented for supported layouts.
- The UI says clearly that same-account simultaneous presence is unsupported
  unless Kuplahotelli gains server support.

## Immediate next implementation slice

The first code change should not create a second iframe. Implement Phase 0 and
the smallest Phase 1 seam:

1. redact SSO-bearing URLs;
2. register the current `#nitro` as pane `primary`;
3. associate its document/window/socket with that pane;
4. add `PacketManager.sendTo('primary', ...)` while preserving `send(...)`;
5. tag packet history and listener callbacks with `paneId`;
6. add a two-iframe fake-client harness to prove isolation.

Only after this passes should the split shell or secondary authentication be
introduced.

## Archive policy

`KillingFloor2.0` remains a read-only archive. Its CMS, emulator, Nitro source,
Roomilus work, protocol notes, HAR/log material, and CLI bot are references only.
New implementation and maintained documentation belong in the active
`kuplafix` workspace.
