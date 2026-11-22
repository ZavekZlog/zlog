# Zlog spec — rotated photos in the issued site diary PDF

Status: agreed 22 Nov 2026. Sits alongside `ZLOG_PDF_DESIGN_RULES.md` and is subject to its section 14 (verification against a real worker PDF).

## Purpose

Site diary photos are documentary evidence. Every photo must appear **whole**, in an **identical frame**, in an even grid of about four per page. A landscape photo placed in a portrait frame would otherwise be cropped (losing evidence) or letterboxed with grey bars (looking unfinished and wasting frame area). Neither is acceptable.

The agreed solution is to rotate landscape photos to fill the portrait frame, and to mark them clearly so a reader is never misled about the orientation of what they are looking at.

## Rules

1. **Detect.** After the photo's EXIF orientation has been applied, a photo is a rotation candidate if it is landscape — that is, its width/height ratio is not within 0.03 of 0.75 (3:4 portrait).

2. **Rotate.** Turn the photo 90° **anticlockwise**, always the same direction, never varying per photo. A 4:3 landscape then fills the 3:4 frame exactly, with no crop and no bars.

3. **Rotation badge.** A small dark square badge with a white border sits in the **top-right corner of the frame**, holding a white circular arrow pointing **clockwise**. Its meaning: turn the page 90° clockwise to see the photo as it was taken.
   Reference proportions, taken from a 221.1 × 294.8 pt frame: badge 21 pt square, inset 6 pt from the top and 6 pt from the right. Scale these proportionally to Zlog's actual frame size rather than using the literal values.

4. **Area tag (optional).** A small dark label with white bold text sits in the **bottom-left of the photo**, above the caption bar. The text is chosen per photo — CEILING, FLOOR, WALL and so on — and is used only where the view would otherwise be ambiguous. Reference: 7.5 pt text, 6 pt in from the left, 6 pt above the caption bar, scaled as above.

5. **Captions unchanged.** No "rotated", "rotated 90°" or similar wording anywhere in caption text. The badge carries that meaning visually, which is the point of it.

6. **Portrait photos.** A 3:4 portrait photo is never rotated and never carries a badge.

7. **Frame.** Every photo keeps the identical frame, the caption bar beneath it, and the numbered box top-left. Rotation changes the image, never the frame.

Superseded: "the numbered box top-left." The photo number, and every reference text, sits in the caption bar beneath the photograph. The outline sits snug around the photograph, with no white inside it, and the photograph is shown whole. The photo grid is top-aligned and is never centred vertically. Where "identical frame" would leave white inside the outline, the snug-outline rule in `ZLOG_PDF_DESIGN_RULES.md` section 8 wins.

Work Photographs is one section bar, the same 36.65pt bar as every other section. Each area is a slim sub-heading of about 20pt, in one style wherever it falls. Areas flow on in the page stream and do not each start a new page. The sub-heading spans the full width, the area's photographs start on the next row, and a part-filled row stays part-filled. The sub-heading stays with at least the first row of its photographs. Photo numbers continue across areas. Every frame of one photos-per-page setting is one size on every page, derived so the section bar, one area sub-heading, and two full rows fit. The clearance is the existing 14pt photo-page slack, because a 2pt remainder drops the second row onto the next page.

## Data model

Each photo carries `options = { rot: boolean, tag: string | null }`.

- `rot` is set automatically during detection. It is not user-editable.
- `tag` is user-set and may be null.

## Supporting Documents

Permits to work, toolbox talks, and MEWP or other inspection sheets do **not** sit among the work photos. They go in their own **Supporting Documents** section, placed after the work photos. They use the same frame size, the same grid, and the same snug outline as the work photographs. Numbering restarts at 1 within that section. Captions read "<document name>: hard copy in site file". Their purpose in the diary is only to evidence that the check was carried out; the hard copies are held in the site file. An empty Supporting Documents section is omitted, and that omission is not printed as "none".

## Verification

Per section 14 of `ZLOG_PDF_DESIGN_RULES.md`, this is not verified until it has been checked on a real diary generated through the worker, exactly as the app produces it. A render from source with sample data proves nothing.

The check must confirm:
- which photos were detected as landscape and rotated
- that no photo is cropped
- that no photo is letterboxed with bars inside its frame
- that every badge and tag renders inside its frame and does not overlap the caption bar. The numbered box at the top left is superseded; the number is in the caption bar.
- that no text clipping has reappeared elsewhere in the document
