# Safe YT Viewer — Roku channel

A sideloadable Roku channel that browses and plays the library served by the
`safe-yt-viewer` API in the parent project. Three tabs (Videos / Pins / Search),
a poster grid, and fullscreen HLS playback of `/api/m3u8/{id}`.

The tab bar is a `Group` of three focusable `Label`s, **not** a `LabelList` — a
list is a single column of items and cannot be laid out horizontally. See
[that section](#a-list-is-a-single-column-always) before changing it; the short
version is that the `LabelList` it replaced looked fine in every gate this
project has.

## Layout

| Path                       | What it is                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `components/MainScene.xml` | The whole UI. One screen, three modes.                                                           |
| `components/MainScene.brs` | UI state machine, and the keyboard. Component scope: no `Wait`, no `roUrlTransfer`, no registry. |
| `source/main.bs`           | The main thread. Owns the port loop and every request.                                           |
| `source/api.bs`            | URL building, TLS selection, settings persistence, JSON parsing.                                 |
| `source/config.bs`         | Defaults: server URL, page size, playback ceiling, registry keys.                                |

The split is not stylistic. `roUrlTransfer` and `roRegistrySection` are
main-thread-only on Roku — a component script that touches them or calls `Wait`
is a runtime error, not a lint warning. The two files talk over exactly two
interface fields: `apiRequest` (scene → main) and `apiResult` (main → scene).

The keyboard is a third thing that used to be on the wrong side of that line.
`roKeyboardScreen` was main-thread-only for the same reason, and it was also
deleted from the firmware — see [that section](#the-keyboard-was-not-deprecated-it-was-removed).
Its replacement is a node, so it lives in the scene.

## Build

Everything runs through BrighterScript:

```sh
npm install
npm run build      # transpile + zip to out/roku-channel.zip
npm run check      # validate only, no package, at hint severity
npm run watch      # rebuild on change
npm run deploy     # build and sideload over the network
```

`npm run deploy` needs the Roku **Developer Mode** password and the TV's
address (`curl http://<tv>:8060/` should respond). `--deploy` prompts for both.

There is no BrightScript linter in this toolchain. `npm run check` runs
BrighterScript's own validator at `hint` severity, which covers the SceneGraph
XML against the bundled XSD as well as the script.

## Pointing it at a server

Press **\* (Options)** on the home screen. The keyboard takes a base URL:

```
192.168.1.50:3000
http://192.168.1.50:3000/api     -> normalized to http://192.168.1.50:3000/api
```

The value is normalized (scheme added if missing, trailing slashes stripped) and
persisted in the registry, so it survives a channel restart. The second button
resets it to the compiled-in default in `source/config.bs`.

## HTTPS

`roUrlTransfer` has no system-CA option: `SetCertificatesFile()` **replaces** the
trust store, so the CA is chosen per request. `ApiApplyTls` picks one of three:

1. **LAN + bundled CA** — if the base URL host is loopback / RFC1918 / link-local
   / `.local` / `.lan` and `source/certs/lan-ca.pem` exists, that file is
   installed. This is the only way to reach a server behind a private CA.
2. **System CA** — `certstore:/systemca.pem` otherwise. Correct for a public CA,
   and required for YouTube's thumbnail hosts.
3. **Nothing** — with the insecure opt-in set, both peer and host verification
   are disabled. Suitable on a trusted LAN, never as a default.

Drop your CA in `source/certs/lan-ca.pem` and rebuild; `bsconfig.json` already
packages `source/**/*.*`, so no config change is needed. The file is absent by
design rather than shipped empty, because a stub PEM that parses is worse than no
file at all, and `source/certs/` is gitignored — a private CA belongs to one LAN,
not in the repository.

**Playback is the exception.** The SceneGraph `Video` node manages its own TLS
stack and there is no API for installing a CA into it, so a self-signed HTTPS
server will list and search fine but fail to play. Use HTTP for the LAN, or a
publicly trusted certificate.

## Controls

The tab bar is three focusable `Label`s, not a list, so **Up** from the grid's
first row goes to it and **Down** comes back. Left/Right walk the tabs and wrap.

| Key        | Browse                                             | Playing                     |
| ---------- | -------------------------------------------------- | --------------------------- |
| Up         | to the tab bar, from the grid's first row          | —                           |
| Down       | back to the grid, from the tab bar                 | —                           |
| Left/Right | between tabs (wraps), on the tab bar               | —                           |
| OK         | play the focused video; switch tab, on the tab bar | exit if playback failed     |
| Back       | back to the grid, then Videos, then leave          | stop and return to the grid |
| \*         | search                                             | —                           |
| Options    | server prompt                                      | server prompt               |

Both prompts are `StandardKeyboardDialog` nodes inside the scene, so **Back**
dismisses them — that is the dialog's own behavior, not this app's — and neither
has a Cancel button. Backing out leaves the query and the server address exactly
as they were. The server dialog offers **Save** and **Reset**; the search dialog
commits with **Search**.

## Playback notes

- The master playlist URL is handed to the `Video` node as-is. Its _body_ changes
  on every request: `/api/m3u8` mints fresh signed proxy tokens each time, so
  simply setting `content` again is a real retry. Two attempts per selection
  (`PLAYBACK_ATTEMPTS` in `source/config.bs`).
- `asyncStopSemantics` is deliberately left off, so `control = "stop"` is
  synchronous and a fresh `play` from a `state` observer is safe.
- A watch is recorded by the `play` request on the main thread, once per
  selection — `POST /api/watch/{id}` is not idempotent, so retrying playback must
  not re-post it.
- Thumbnails and the playlist are fetched by the OS, not by this app, so they
  follow the system trust store rather than `ApiApplyTls`.

## Known gaps

- **The `Label`-based tab bar has not been run on hardware yet.** It replaces a
  `LabelList` that was verified broken on a Roku OS 15.3.4 device, and the
  replacement is verified only by `npm run check` and by reading the node docs.
  Two things to look at on a real TV: whether a focusable `Label` draws the
  system focus ring on this firmware (the design does not need it — selection is
  the underline, focus is brightness — but if it appears, it is stacking on top
  of both), and whether the `focusedChild` observer fires on the tab `Group` when
  focus leaves it for the grid. Neither is load-bearing: `focusGrid()` and
  `focusTab()` repaint after every focus move the app makes, so the observer is
  only a backstop for moves the focus chain makes on its own.
- Playback of a self-signed/private-CA HTTPS server is unverified; see above.
- The `Video` node samples its `state` field on a 500 ms `Timer` rather than
  observing it, because observing a field fires the callback at a point where
  issuing another `control` write is not documented as safe. The Timer field is
  `duration` in seconds — there is no `interval`.
- **The keyboard has not been run on hardware.** It is a
  `StandardKeyboardDialog` replacing a component the device no longer has, so
  there is nothing to compare it against. Three things to check on a real TV:
  whether the dialog claims the key focus when `m.top.dialog` is set (the
  keyboard does not work without it), whether the keyboard's own OK key commits
  or only the button area does, and whether `text` fires on every keystroke. The
  commit path survives all three answers — a close with no button press and no
  dismissing key is treated as a commit — but the first two are assumptions
  until someone sideloads it.
- The dialog is grey with white text. `Scene.palette` takes an `RSGPalette` node
  and is the documented way to make standard dialogs match the rest of an app,
  so the Tokyo Night slots in the Colors section could be pushed into one. Not
  done: the `colors` field is an assocarray of ten named slots and it is a
  visual change, not a fix.

## Colors

Tokyo Night Storm, and every color in `components/MainScene.xml` comes from
that palette. There is no theme layer, no palette constant, and no manifest
theme: Roku XML cannot reference a variable, so the colors are literals in
that file. The two the script has to change at runtime — the primary and dim
tab text — are repeated in `components/MainScene.brs` for the same reason
`source/config.bs` re-sends its constants to the component: BrightScript has
no constant scope shared between files.

**The byte order is `0xRRGGBBAA` — alpha is the _last_ byte.** This is the
reverse of CSS, Android, PIL and `.NET Color.FromArgb`, and the app shipped
red for a while because of it. See "the color byte order" below. In the
`.brs` the literals are written as **strings** (`"0x9AA5CEFF"`), because a
color literal above `0x7FFFFFFF` does not fit a BrightScript `Integer` and a
string is what an `roSGNode` color field accepts anyway.

| Slot                       | Literal      | Palette name            | Ratio on `#24283B` |
| -------------------------- | ------------ | ----------------------- | ------------------ |
| surface                    | `0x24283BFF` | storm editor background | —                  |
| surface @ 75% (play scrim) | `0x24283BC0` | same hue, alpha `0xC0`  | 13.0 vs. white     |
| primary text               | `0xC0CAF5FF` | storm foreground        | 9.02:1             |
| secondary text             | `0xA9B1D6FF` | storm editor foreground | 6.90:1             |
| dim text                   | `0x9AA5CEFF` | storm markdown text     | 6.00:1             |
| muted / chrome             | `0x565F89FF` | storm comment           | 2.35:1             |
| accent / selected tab      | `0x7AA2F7FF` | storm blue              | 5.78:1             |

The text ramp is four steps, each a real slot in the palette rather than a
brightened or darkened interpolation of one. Brightness descends monotonically
with importance: **primary** (video titles, play title, focused tab) →
**secondary** (status line, channel names, play status) → **dim** (unfocused tab
text) → **muted** (the server URL and the control hints).

`#565F89` sits below the 3:1 legibility floor, deliberately. It carries the two
things that are looked at last and read once. Anything the user has to notice —
the selected tab, a video title, a failure — is at 5.78:1 or better. Nudging it
up one step to `#9AA5CE` is the obvious fix if the hints prove too faint on a
real TV.

Selection and focus are different things, so the tab bar marks them with two
different signals, both maintained by `paintTabs()` in `components/MainScene.brs`:

- **The accent underline** (`tabMarker`, a `Rectangle` translated under the
  active tab) marks the **selected** tab. Hue, not brightness, because the
  selection is still true while the focus is somewhere else.
- **Text brightness** marks the tab holding the **key focus** — `#C0CAF5`
  against `#9AA5CE` for the rest. The user arrows onto a tab before committing
  to it with OK, and until they do, "where am I" and "what am I looking at" are
  not the same answer.

`PosterGrid` keeps the system focus feedback; it has no color field, and a light
ring suits this palette anyway.

One thing the palette does _not_ reach:

- **State.** Nothing is colored by outcome. A load error in `statusLabel` and
  "Cannot play that video." in `playStatus` are text-only, as they were before
  the palette change. Adding semantic colors is a behavior change and was
  deliberately left out.

`images/icon.png` is a mid-luminance full-bleed image and was left alone; it
shows on the Roku home screen, not in the app.

## Two gates, and neither is sufficient

### 1. Do not trust the XSD

`npm run check` is not sufficient validation for SceneGraph markup. BrighterScript
validated this component cleanly while it contained four attributes that do not
exist on the device, and the only thing that caught them was a real launch:

| Attribute                          | Reality                                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `width` / `height` on `PosterGrid` | It has neither. It inherits from `ArrayGrid` → `Group`, and `Group` has 15 fields and no size. Size comes from `numColumns`/`basePosterSize`.            |
| `direction` on `LayoutGroup`       | The field is `layoutDirection`, values `horiz`/`vert` — and a `LabelList` is not a supported child of it at all, which draws its own items from `title`. |
| `interval` on `Timer`              | The field is `duration` (seconds).                                                                                                                       |

So treat `check` as a syntax gate, not a correctness gate. Before adding an
attribute, confirm it against
[the node's own documentation page](https://developer.roku.com/dev/llms.txt) —
node pages are the authority, and several of them carry copy-pasted field
descriptions from their parent that contradict themselves:

- `PosterGrid.itemSpacing` says its X value "is ignored". That text is lifted
  from the LabelList table. `ArrayGrid` is authoritative: X is ignored **for
  lists** only, and a grid uses both values.
- `captionHorizAlignment` does nothing unless `enableCaptionScrolling` is
  `false`, which is not its default.
- `fixedLayout`'s `X`/`Y` bindings are documented backwards on the bindings
  table relative to the `fixedLayout` field description.

### A list is a single column, always

This one shipped too, and it is the reason the tab bar is three `Label`s rather
than a `LabelList`. Roku's [lists and grids](https://developer.roku.com/dev/docs/list-and-grid-nodes)
page is one sentence away from the whole thing:

> Lists are a single column of items arranged vertically.

`ArrayGrid.numColumns` says the same thing from the other side: _"This field is
not used for lists."_ `LabelList` has no `numColumns` in its own field table at
all. `numRows` is the number of **visible rows**, not a column count, so
`numRows="1"` does not turn the items sideways — it produces a one-row-tall
window onto a vertical list. The three tab names were stacked, one visible at a
time, scrolled past each other.

Nothing objected. `numRows="1"`, `itemSize="[300, 56]"` and
`textHorizAlign="center"` are all documented fields with documented values, the
XSD is satisfied, and `npm run check` is clean. The comment above the node
asserted the behavior as fact — _"with numRows=1 the items run left to right,
which is a tab bar"_ — which is the failure mode to watch for here: a comment
claiming a behavior no attribute provides is not a design note, it is a guess
with a citation, and it is indistinguishable from a correct one on the page.

The second half of the bug was the arrow keys. Being a _list_, the node consumed
every up/down press to scroll its one-row viewport, so the focus could land on
it and never leave, and `itemSelected` — which is what activating a tab was
wired to — only fires on OK while the list holds focus. A `Group` of `Label`s
has neither problem: real `width`/`height` so nothing clips, and no arrow-key
capture, so the focus moves both ways.

If you need a horizontal strip, it is `Group` + `focusable="true"` `Label`s, or
`RowList` if it really is a list of rows.

### The color byte order

Roku writes color literals `0xRRGGBBAA` — **alpha last**. Every other
convention in common use (CSS, Android, PIL, `.NET Color.FromArgb`) puts alpha
first, and Roku's own `scene.md` gives no warning that it differs.

This one shipped. The whole UI rendered red and nothing objected:

- The XSD types these attributes as `color_string_containing_hex_value_eg_RGBA`
  — which names the order, if you read it — but it only pattern-matches eight
  hex digits and never checks which byte is which.
- BrighterScript has **no color parser at all**. `brighterscript/dist` contains
  no `parseColor`, `hexToRgba` or equivalent; it copies the literal through
  verbatim, so `npm run check` stays clean and even the staging copy is wrong.
- The failure only appears on a device. An alpha-first `0xFFRRGGBB` is a
  near-transparent, full-strength red: the surface came up as a red wash, the
  white text came up as pink, and the 75% scrim came up as a red panel.

Three checks against `devtools.web.roku.com/schema/RokuSceneGraph.xsd` settle
it, and are worth re-running rather than trusting memory:

| Evidence                                                      | Reads as                                       |
| ------------------------------------------------------------- | ---------------------------------------------- |
| Scene `backgroundColor` default `0x000000FF`                  | opaque black — alpha-first would be invisible  |
| Every opaque default ends in `ff`                             | alpha last                                     |
| `optionsColor` `0xddddddff` vs `optionsDimColor` `0xdddddd44` | same RGB, dimmed **only** by the trailing byte |

The third is the decisive one: a "dim" variant that differs from its pair only
in the _last_ byte is a reduced alpha, whatever else it might be.

### LabelList font crashes the render thread

On this firmware (Roku OS 15.3.4) attaching a `Font` to a list or grid **item
renderer** kills the render thread — a silent `EXIT_SYSTEM_KILL` roughly 400 ms
after `show()`, with no BrightScript error and a clean `npm run check`. Bisected
on hardware, one attribute at a time:

| Node                                         | With a font                                  |
| -------------------------------------------- | -------------------------------------------- |
| `LabelList` `font` / `focusedFont`           | dies once the node has content               |
| `PosterGrid` `caption1Font` / `caption2Font` | dies about 5 s in, once the first page lands |
| `Label` `font`                               | fine                                         |

Both list/grid captions therefore fall back to the system default font, and the
`PosterGrid` in `components/MainScene.xml` carries no `caption1Font` for that
reason — do not "restore" one. This is a device bug, not a documentation gap:
every one of these is a documented field with a documented type, and the XSD
resolves all of them.

It is also why the tab bar is made of `Label`s. A `LabelList` could not be given
a real font, and the tab bar is the one piece of chrome where a system-default
font at 28 px next to 20 px `Label`s everywhere else looked wrong.

### 2. Do not trust the transpiler

**BrightScript has no `[]` array-literal syntax.** `[1, 2, 3]` is a
BrighterScript extension, and BrighterScript 0.73 does _not_ transpile it — not
in a `.bs` file and not in a `.brs` file. It reaches the device verbatim and is a
runtime parse error. This killed the app on first launch, from a line that
`npm run check` reported no problem with:

```brightscript
m.items = []                        ' runtime error on the device
m.items = CreateObject("roArray", 0, true)   ' correct
```

`components/MainScene.brs` has a `NewArray()` helper for this. Note that `{ }`
_is_ valid — associative-array literals are part of BrightScript — so only the
square-bracket form is a trap.

The trap is not limited to `roArray`. A `vector2d` **field** assignment reads
exactly like the extension and is just as fatal, so the tab bar's underline
cannot be moved with `m.tabMarker.translation = [x, y]`:

```brightscript
m.tabMarker.translation = [x, y]                            ' runtime parse error
offset = CreateObject("roArray", 2, false)                  ' correct
offset[0] = x
offset[1] = y
m.tabMarker.translation = offset
```

The tell is that the staged copy is byte-identical to the source. Grep the
staging directory after a build rather than trusting `check` — `out/` has held
the answer every time this has bitten.

Worth knowing about the same feature area:

- `observeField(fieldName, port)` **is** valid and is the documented way for a
  main-thread script to hear about a component field change; the port receives
  an `roSGNodeEvent` and `wait(0, port)` is woken. The string-callback overload
  is component-scoped only and would not work from `Main()`.
- Observers fire only on a _change_ made after registration, and
  `roSGScreen.CreateScene()` instantiates the component (running its `init()`)
  before `Main()` can register an observer — so a request sent from `init()` is
  normally missed. The main thread therefore offers the handshake unasked
  immediately after `show()`, and the scene ignores the duplicate.

## The keyboard was not deprecated, it was removed

`roKeyboardScreen` sat in `source/main.bs` behind an `if keyboard = invalid`
guard that read like ordinary defensive code. Pressing `*` or Options did
nothing at all. `CreateObject` did not raise, nothing was logged, and the guard
turned the failure into a cancellation — the app reported "the user pressed
Cancel" when in fact the component did not exist.

The component is on Roku's _Deprecated Components: January 1, 2018_ list, and
that whole set of SDK1 visual screen components — `roGridScreen`, `roListScreen`,
`roPosterScreen`, `roKeyboardScreen` and a dozen more — was **removed from the
firmware** in Roku OS 11.5 (September 2022). The device here runs 15.3.4, so
this was not a warning about a future release; it had already happened and the
only symptom was a dead key. Roku's [deprecated APIs
page](https://developer.roku.com/dev/docs/deprecated-apis) is where the dates
are, and `ifKeyboardScreen` is in the "Deprecated interfaces: July 1, 2017"
list underneath — the interface behind the component.

Nothing in this project's toolchain could have caught it. `CreateObject` with an
unknown component name is a documented `invalid` return, `roSGScreen` was never
asked to draw one, and `npm run check` has no idea what is in the firmware. The
guard was in fact the reason it went unnoticed: it made the failure look like a
handled case.

The replacement is `StandardKeyboardDialog`, which is a **node**, not a
component:

|                 | `roKeyboardScreen`                        | `StandardKeyboardDialog`                          |
| --------------- | ----------------------------------------- | ------------------------------------------------- |
| where it lives  | its own screen, drawn by the OS           | a node in the scene's tree, via `Scene.dialog`    |
| reports back    | `roKeyboardScreenEvent` on a message port | `buttonSelected` / `text` / `wasClosed` observers |
| text in         | `.text`                                   | `.text`                                           |
| buttons in      | `.buttons`                                | `.buttons`                                        |
| thread          | main only — `Show()` blocks               | anywhere; it is a node                            |
| in the firmware | no — gone since OS 11.5                   | yes, and it has voice entry                       |

That last row is the whole reason the code moved. A blocking `Show()` is what
put the keyboard on the main thread in the first place, and a node has no
`Show()` to block on, so the prompt went back to the component script where the
rest of the UI already was. The main thread is still involved, but only
afterwards, and only for the one thing that needs the registry: persisting a
server URL the user picked.

Two things about the replacement that are easy to get wrong:

- **`onKeyEvent` has to stand aside.** A `StandardDialog` dismisses itself on
  Back, Home and Options, and the Scene's `onKeyEvent` is asked _before_ the
  focused node is. Handling `back` there — which this app does, twice, further
  down the same function — would leave the keyboard open with no way to close
  it. So `onKeyEvent` returns `false` for everything while a dialog is up, and
  merely _flags_ the three dismissing keys: the dialog closes itself; the flag
  only has to tell a dismissal apart from a commit.
- **Do not read the dialog's fields in `wasClosed`.** It fires while the node is
  being torn down. `text` is mirrored into a plain `m.*` field by its own
  observer instead, which is also the pattern in Roku's
  [sample app](https://github.com/rokudev/standard-dialog-framework). Same
  reason `buttonSelected` is read in its own handler: a button press does not
  close the dialog — `close` is WRITE_ONLY and has to be set — so there is a
  handler to read it in anyway.

One nice side effect: the BS1129 suppression that used to sit on the
`CreateObject("roKeyboardScreen")` line is gone, and so is
`source/roku-extern.d.bs`, which existed only to declare that one component to
BrighterScript. `CreateObject("roSGNode", "StandardKeyboardDialog")` is not a
component creation as far as BS1129 is concerned, so it needs neither.
