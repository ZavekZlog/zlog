Zlog — Design Rulebook
This is the visual DNA of Zlog. Every screen — dashboard, diary, survey, progress
report, snag list, H&S, PDF preview, settings, login — should look like it was
designed by the same person on the same day.
Point every agent prompt at this file. If a change contradicts something here,
the change is wrong, or this file needs amending first. Not both at once.
0. Status — read this first
Written from the real values in app/globals.css, not from intent. Reviewed,
amended, and signed off. All decisions are closed. This file is now the
authority.
The audit found that Zlog does not yet have a design system. It has:
a Next.js boilerplate token layer (still active, still setting the background)
a Zlog token block that is partially used
a mobile-only override sheet (@media (max-width: 768px)) carrying 62
!important declarations
The !important count is the tell: the real styling lives inline in the JSX, and
the stylesheet is fighting it. A rulebook cannot enforce values that live
somewhere the agent doesn't look. Task 0 of Phase 2 is moving styling out of
inline JSX into classes that reference tokens. Everything below assumes that
happens.
1. The five principles
Principle
Means
Industrial
Forged steel, enamel, powder coat. Construction, not consumer.
Premium
Uncluttered, spacious, confident. More empty space, not less.
Voice-first
Speaking before typing. The mic is the recurring motif.
Fast
One-tap actions. A site manager is standing in the rain.
Consistent
Every screen unmistakably Zlog.
The test: if a rule can't be answered yes or no by looking at a screen, it
isn't a rule. Everything below is written to be decidable.
2. Colour language
Near-black background. Warm off-white text. Dark forged-steel borders. Orange
only for actions. Warm glow only around things that matter right now.
The orange split — approved
Three oranges are in play: --rust: #B8431C, --premium-cta-orange: #F5762A,
and the brand's Forge Orange #FF5000, which does not appear in the codebase at
all.
Three oranges is the "two oranges fighting" problem the landing page rework was
meant to solve. It didn't get solved — it moved into the tokens.
Two oranges, two jobs, never swapped:
--rust: #B8431C is a material. The colour of rusted steel. It belongs
to the Z, the Z's glow, and nothing else. Never applied to a control.
--action: #FF5000 (Forge Orange) is an action. Every button, every
live state, every tappable orange thing. Never applied to a surface, border, or
decoration.
This makes "orange only for actions, never decoration" structurally true without
repainting the hero: the Z isn't decoration in orange, it's an object made of
rust. Different substance, different token.
--premium-cta-orange: #F5762A is deleted and folded into --action.
#FF5000 is the single source of truth for primary actions across the entire
application. Every primary button changes from #F5762A to #FF5000.
The distinction that makes this work: the logo is a brand asset; a button is an
interface element. They are allowed to differ, because they are different kinds
of object. What is not allowed is three near-identical oranges drifting into the
UI over time because nobody could say which one was which.
Warm over cool — approved
The palette was fighting itself: warm text (#F4F2EF), warm rust, against cool
blue-grey body text (#93a7b9, #8ea2b5, #A3B5C4) and a navy card gradient
(rgba(15,33,53) → rgba(11,25,41)).
Warm wins. Rust is warm, the industrial lighting is warm, and the Z is the
fixed point everything else sits beside. Cool blue reads as tech SaaS; warm
neutral reads as a workshop. Blue-grey text and navy surfaces are removed.
Guardrail — warm is not beige. Warm means neutral graphite with a memory of
warmth. Not tan, not sepia, not brown.
Constraint
Value
Saturation
≤ 8%
Hue
30–45°
The test: if a surface reads as a colour rather than as dark, it's gone
too far. Retain enough neutral separation that surfaces stay legible against each
other.
Text roles
One white, four roles. Three competing whites (#F4F2EF, #FAFAF8, #FFFFFF)
collapse to one — but hierarchy still needs distinct semantic tokens. Do not
express text hierarchy by inventing new whites.
Token
Value
Use
--text
#F4F2EF
Headings, key values, primary labels, button text
--text-2
#B8B2AA
Secondary copy, card descriptions
--text-dim
#9A968F
Metadata, timestamps, muted labels, tagline pipes
disabled
--text-dim at 40% opacity
Disabled controls
--text-dim keeps its existing #9A968F rather than moving to a darker muted
grey. It's already on the finished landing page (the tagline pipes) and the
landing page is the reference implementation — don't churn a shipped surface to
gain 5% of contrast separation.
Disabled is opacity, not a fifth colour.
3. Materials
Powder-coated steel. Forged metal. Enamel. Soft warm industrial lighting.
No glossy plastic. No frosted glass.
Glass out, depth in — approved
Every card currently carries backdrop-filter: blur(16px) — frosted glass, the
exact material this rulebook forbids. It reads as consumer app rather than site
tool, it's the most dated look available in 2026, and it's expensive on the
mid-range Androids site managers actually carry. Solid surfaces also read better
in bad light, which is most light on a site.
backdrop-filter and -webkit-backdrop-filter come off every card and panel.
(The one place blur may survive — a full-screen modal scrim — is a named
exception in §16, not a card treatment.)
Removing blur is not removing depth. Cards must not flatten into rectangles.
Depth comes from tone, edge and shadow instead of transparency:
Layer
Treatment
Surface
Solid warm-dark plate, tonally lifted off --ink
Top edge
inset 0 1px 0 hairline highlight — light on a machined edge
Border
Restrained hairline, --edge
Shadow
Soft drop shadow, 0 8px 32px
The inset highlight is the most convincing detail in the codebase. It stays.
4. Radius
Tokens only. Never type a radius number.
A single radius was the original rule and it doesn't survive contact with small
components: 16px on a 28px-tall chip leaves ~2px of straight edge — that's
already a pill, just a malformed one — and a circular mic button can't be 16px at
all. Three tokens, in a fixed 2:1 relationship:
Css
16px is the value already in use (globals.css:51, :203) and is correct for
large surfaces. 8px is half of it — a 2:1 relationship reads as a system; 10:16
reads as two numbers someone picked.
The lookup — no discretion
The failure mode of a multi-radius system is an agent choosing each time.
Nobody chooses. The component determines the radius:
Component
Radius
Cards, panels, modals, photo containers, primary buttons
--radius-lg
Inputs, textareas, selects, chips, tags, status pills, menus, toasts, icon buttons
--radius-sm
Circular controls (mic), avatars, true pills
--radius-full
Anything not on this list uses --radius-lg and gets added to the list. A fourth
radius token is not flexibility. It's the beginning of drift.
5. Typography
Role
Face
Use
Display
Space Grotesk
Logo, tagline, landing headline, major page titles. A spice — used with restraint. Never for operational screens.
UI
Barlow
Everything else: body, labels, buttons, inputs, nav, tables, report forms.
Barlow must be the body default. It currently is not — body is
Arial, Helvetica, sans-serif. Anything new inherits Arial unless someone
remembers to override. Fix at the root, not per-component. This is not cosmetic;
it's the difference between a system and a habit.
Scale
Role
Size
Weight
Card title
17px
700
Section / panel title
16px
600
Body, inputs
16px
400
Button
15px
600
Card description, secondary copy
14–15px
400–500
Label (feature strip, category, uppercase)
13–14px
600
Metadata
13px
500
Non-essential timestamps only
12px
500
Line-height 1.5–1.55 on anything multi-line.
Two rules inside this table worth stating outright:
Labels and descriptions are different roles. A label is a name for something
and can carry 600. A description is prose and must not — 14px/600 on secondary
copy makes the screen dense and shouty. The codebase already gets this right
(.premium-dash-card-desc is 14px/1.55 at default weight); don't "fix" it.
13px is the floor. Outdoors, mid-range phone, gloves, reading glasses. 12px
is reserved for timestamps nobody needs to read. Inputs never go below 16px — iOS
zooms the viewport on focus below that, which is a bug that looks like a design
choice.
6. Spacing
The rhythm already in the file: 8 / 14 / 16 / 22 / 24 / 32.
Formalise as --space-1: 8px through --space-6: 32px. Use nothing else. Card
padding 22px. Empty states 32px 24px.
Keep the landing page's generosity. Premium products have more empty space,
not more content. When a screen feels wrong, remove something before adding
anything.
Touch targets
Element
Minimum
Primary button
50px
Back / secondary
44px
Any tappable thing
44px
Non-negotiable. Gloves.
7. Orange hierarchy
Orange means: this is the thing to do, or this is happening now.
In priority order:
Recording — live voice capture
Primary action — the one thing this screen is for
Save / Continue — commit and move on
Mic (idle) — the invitation to speak
Never for: dividers, icons at rest, borders, backgrounds, headings, decoration,
or "making it look Zlog." If orange is doing anything other than pointing at an
action, remove it.
One orange action per screen. If two things are orange, one of them is wrong.
Same state counts as one. A live mic, its waveform and its elapsed timer are
one thing — the recording — rendered in three places. That's not three calls to
action. A second orange element representing a different action is a violation.
This is the test, not a judgement call: can you name the single action the
orange is pointing at? If it takes two names, the screen has two accents.
8. Lighting
Glow is the signature. It's also the easiest thing here to ruin, because it
works, and things that work get overused.
Permitted on:
the active card
the selected item
the recording state
the live mic
Forbidden everywhere else. A glow on every card is a gradient. A gradient on
every card is 2019.
The reference implementation is the landing page hero: a color-mix radial
gradient on var(--rust), filter: blur(60px), dissolving the circular edge into
a wall-wash rather than a disc. Every future glow derives from that — same
technique, smaller radius. Don't invent a second glow method.
Glow follows the orange split: a rust glow belongs to the Z. An action
glow belongs to a live control.
9. Icons
White line icons. Consistent stroke width. Minimal. Construction and professional
— never playful, never filled, never duotone, never emoji.
Icons are white at rest, not orange. An icon turns orange only when its
control is the screen's one action, or is live.
10. Motion
Engineered. Smooth. Slightly heavy. Confident. Never bouncy. Machinery, not
social media.
The codebase already contains the right curve, in the back button:
Css
Adopt as standard. Do not introduce a second easing. No spring physics, no
overshoot, no bounce, no elastic.
Long transitions (screen changes, the Phase 3 splash) may run longer but use the
same curve. Weight comes from mass, not from wobble.
Respect prefers-reduced-motion. A site manager with vestibular issues still has
a diary to file.
11. Voice-first
The mic is the recurring motif. It appears on essentially every report screen,
because speaking is the primary workflow and typing is the fallback.
The mic must be available without being loud. See §12.
Voice is the product's reason to exist. Every report screen should make speaking
the obvious first move — but the mic earns prominence by being present and
consistent, not by shouting.
12. Precedence — when rules collide
Two rules here pull against each other. Settled now, so it isn't re-litigated in
the middle of building a screen.
The mic is a shape, not a state
"Mic on almost every screen" vs "glow only where attention is needed."
The mic is a shape: a white line icon like any other, at rest, quiet. It
becomes a state only when live.
On a screen with a mic, an active card and a save button:
the active card carries the glow
the mic sits quiet as a white icon
the save button is orange, unglowed
Glow means happening right now. Not available, not important. The mic being
recordable is not the mic recording.
Recording outranks save
"Orange means recording" vs "orange means save."
Recording wins. While recording is live, save demotes to a steel outline and
gives up its orange. When recording stops, save takes the orange back.
Two oranges competing is exactly the "orange as decoration" failure this rulebook
exists to prevent. While recording, the only thing that matters is that it's
recording.
The line that resolves both
One accent, one action, one glow per screen.
If you can't say which single element is the action, the screen isn't designed
yet.
13. Token reference (target state)
Not yet the state of the file. This is what globals.css should contain once §2's
open decision is signed off.
Css
Deletions required
the boilerplate :root (--background: #ffffff / --foreground: #171717)
the prefers-color-scheme: dark block — Zlog is dark. Always. It is not a
preference. Currently a light-mode phone gets a white body behind dark screens.
font-family: Arial, Helvetica, sans-serif on body
--premium-cta-orange → folded into --action
--premium-text-muted → duplicate of --text-dim
--premium-text-body (#93a7b9, cool) → --text-2
--premium-card-bg navy gradient → --plate
all 16 rgba() literals → tokens
#FFFFFF (×2), #A3B5C4, #FAFAF8 → the text ladder
backdrop-filter / -webkit-backdrop-filter → removed
14. Rules for agents
Never type a colour. No hex, no rgba(), no named colours. Tokens only.
Shadows and borders are colour too — that's where the leaks happen.
Never type a radius. Use the §4 lookup.
Never type an easing. var(--ease).
Never add a token without adding it here first.
Never use !important. If it's needed, the styling is in the wrong place.
Fix the place.
No backdrop-filter in production UI. Steel, not glass. A full-screen
overlay (onboarding, a modal scrim) may use blur only if it's added to §16
as a named exception first — not approved in the moment. Cards never do.
One file per change. Show the diff. Wait for approval.
Verification, not trust:
Powershell
Should return nothing outside the :root block. Anything it finds is a violation.
15. What this is for
The landing page is finished, and from this point it stops being "the landing
page." It is the reference implementation of every rule above — the proof the
rules produce something worth having.
Every dashboard, diary, survey, snag list, PDF preview, settings page and login
screen should feel like they were designed by the same person on the same day.
That sameness isn't tidiness. It's what gives a product a recognisable identity,
and identity is what separates a tool someone pays £32 a month for from a form
with a logo on it.
Zlog should feel like a piece of equipment: heavy, warm, lit where it matters, and
built by someone who has actually stood on a site in the rain with a phone in one
hand.
If a screen doesn't feel like that, it isn't finished — however correct the code
is.
16. When to break the rules
A system with no exceptions becomes dogma, and dogma gets ignored. Four
categories may override the rules above. Everything else is not an exception —
it's a violation.
1. Accessibility always wins
prefers-reduced-motion, OS text scaling, contrast requirements, visible
keyboard focus. A focus ring may be the only non-orange thing on a screen that
draws the eye — that's allowed. Someone who can't use the product isn't served by
a consistent palette.
2. Platform conventions
Native pickers, share sheets, keyboards, Android back behaviour, iOS swipe.
Don't reskin the OS to look like Zlog. A date picker that fights muscle memory
costs more than it gains.
3. Error and destructive actions
Orange means "do this." It cannot also mean "this went wrong" or "this will
delete."
Destructive and error states need their own colour:
Css
Red is deliberate, not incidental: on a building site, danger is red. Our
users already read red as "stop" before they read a single word. The constraint
was never "avoid red" — it was avoid a red that reads as another orange beside
#FF5000. Signal red (hue ~358°) sits cool of Forge Orange (hue ~19°) and
separates cleanly in daylight; a warm brick red would not. This borrows site
language and satisfies the palette at once.
The test: at arm's length, in sunlight, does it read as a different meaning
or a different shade? If it's a shade, it's wrong.
Rules for --danger:
Destructive confirmation only — the second step, not the first. The button
that opens a delete dialog is not itself destructive.
Error text, failed sync, validation failures.
It does not consume the screen's one orange action. Danger and action are
different axes.
It never glows.
Three signals, never a shade of each other
Orange, red and amber map onto three distinct meanings — the same discipline as
the orange split, extended:
Signal
Meaning
Token
Orange
Do this
--action #FF5000
Red
This is wrong / gone
--danger #E5484D
Amber
Be aware (non-blocking)
--warn (reserved)
On site, dayglo hi-vis yellow means visibility — "see me" — not danger. So
amber is not a second danger colour; it's for the non-blocking warning that isn't
an error: "offline, saving locally," "upload retrying." Red stops you; amber
tells you.
--warn is reserved, not yet defined. Don't add it until a screen actually
has a non-blocking warning to show — a token looking for a use is how palettes
bloat. When one appears, define amber then, and mind that full-saturation hi-vis
yellow is punishing on #0b0d12: it needs dialling back to sit on dark without
glaring.
4. Exceptional workflows
Offline, sync failure, expired subscription, no projects yet. A system-state
banner is a readout, not a call to action — it doesn't consume the screen's
orange.
An empty screen is an invitation to act, not a mood. It gets the orange, because
its whole job is one action.
5. Full-screen overlay blur
backdrop-filter is banned on cards and panels (§3) — that's the glassmorphism
this rulebook rejects. A full-screen overlay is different: an onboarding
scrim or a modal backdrop blurring the whole app behind it is depth between
layers, not a frosted surface pretending to be glass.
Permitted only if:
it covers the whole viewport (not a card, not a panel)
it's a scrim behind a modal or overlay, never a resting surface
the layer on top is solid — the blur is the backdrop, not the content
Anything narrower is a violation. When a specific overlay needs it, name it here.
The discipline
An exception is written into this file before it ships, not decided in the
moment. "Rare and justified" judged live, screen by screen, is exactly how
three oranges ended up in the codebase.