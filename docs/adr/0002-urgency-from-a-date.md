# 0002: Work out urgency from a date

- Status: accepted
- Date: 2026-10-23

## Context
Urgency was a 0 to 100 slider set when a task was captured. It went stale: a task due in a month kept the score it was given, so the matrix stopped answering "what now?" unless every score was revised by hand. The owner asked for urgency to follow a date instead (Q22), with a way to mark dates that are follow-ups rather than firm deadlines (Q24).

## Decision
- A task stores an optional local `date` (YYYY-MM-DD), an optional local `time` (HH:MM, only with a date) and a `followUp` flag (only with a date). It no longer stores urgency.
- Urgency is calculated whenever tasks are shown: `100 x 2^(-days_left / 7)`, rounded; overdue is 100; no date is 0. Days left count hours / 24; a date without a time is due at the end of that day. The 50 line falls at 7 days left (i36).
- Follow-up dates use the same formula; their dots are striped (i42, i43).
- The app scores tasks once per render (`scoreTasks`), and refreshes every 15 minutes and when the page comes back into view (i37).
- Dates are local wall-clock values, read in the viewer's time zone (i38).
- Each document type has its own schema version: labels 1, tasks 2.
- Version 1 tasks are upgraded when read (Q28: a): the date is the day whose end is nearest to when the stored urgency would be reached, counted from the task's last save. It is stored as version 2 the next time the task is saved.

## Alternatives considered
- Straight-line urgency (for example 0 at 14 days to 100 today): every day weighs the same, so a task 3 weeks out looks like one 3 months out, and nothing near the deadline stands out.
- Storing the calculated urgency: goes stale between saves, which is the problem being solved.
- Storing an instant (UTC timestamp) instead of a local date: an all-day date would shift between time zones; local values keep phone and laptop in agreement in one zone.
- A date kind (due, review, appointment): replaced by the single follow-up tickbox, which is the distinction that changes behavior (Q24).
- Rewriting stored version 1 tasks once (Q28: b): needs live writes, and a version 1 task saved later by a page left open would be skipped.

## Consequences
- Dots move right on their own as dates near; tasks without a date sit at urgency 0 (Schedule or Drop).
- Quadrant, ordering and Next up rules take scored tasks; views never hold a stored urgency, and edits rebuild stored fields so the calculated value is never saved.
- The version 1 upgrade code stays in `core` while any version 1 document may exist.
- In another time zone, urgency is worked out with that zone's clock.
- Export: the CSV gains date, time and follow-up columns and a calculated urgency; the JSON holds stored fields and a version per document type.
