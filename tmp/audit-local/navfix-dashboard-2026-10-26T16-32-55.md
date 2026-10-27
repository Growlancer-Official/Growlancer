# Growlanzo element audit — dashboard
Base: http://127.0.0.1:4175 · 1 routes × 3 viewports = 3 loads
Authenticated run: yes (.e2e/freelancer.json)

## Auth integrity (must be empty on an authenticated run): 3
- /dashboard/workspace?contract=c66345f8-5d4b-42cd-8c4f-80024628d5b7 [mobile-375]: left the authenticated surface → / (no logout control) [GoTrue rejected every session check: user=403]
- /dashboard/workspace?contract=c66345f8-5d4b-42cd-8c4f-80024628d5b7 [tablet-768]: left the authenticated surface → / (no logout control) [GoTrue rejected every session check: user=403]
- /dashboard/workspace?contract=c66345f8-5d4b-42cd-8c4f-80024628d5b7 [desktop-1280]: left the authenticated surface → / (no logout control) [GoTrue rejected every session check: user=403]
## Auth chrome proof: 0 load(s) via logout TEXT · 0 via logout ATTRIBUTE · 3 with no control
- /dashboard/workspace?contract=c66345f8-5d4b-42cd-8c4f-80024628d5b7 [mobile-375] → / (no logout control)
- /dashboard/workspace?contract=c66345f8-5d4b-42cd-8c4f-80024628d5b7 [tablet-768] → / (no logout control)
- /dashboard/workspace?contract=c66345f8-5d4b-42cd-8c4f-80024628d5b7 [desktop-1280] → / (no logout control)
## Auth session proof: 0 load(s) had a GoTrue session check SUCCEED · 0 had no GoTrue traffic (still-valid token) · 3 REJECTED by GoTrue
- /dashboard/workspace?contract=c66345f8-5d4b-42cd-8c4f-80024628d5b7 [mobile-375] GoTrue: user=403
- /dashboard/workspace?contract=c66345f8-5d4b-42cd-8c4f-80024628d5b7 [tablet-768] GoTrue: user=403
- /dashboard/workspace?contract=c66345f8-5d4b-42cd-8c4f-80024628d5b7 [desktop-1280] GoTrue: user=403

## Page/console errors: 0

## Leftover/placeholder text: 0 unique

## Wrong/broken currency: 0 unique

## Silently clipped text (mobile): 0 unique

## Generic button labels: 0 unique

## Unnamed interactive (icon-only a11y): 0 unique

## Bad placeholders: 0 unique

## Inputs without label: 0 unique

## External link issues: 0 unique

## Broken internal links (4xx): 0

## Broken images: 0 unique

## Overflow offenders (non-scroller): 0 unique

## Duplicate ids: 0 unique

## Heading skips: 0

## Doc issues (title/lang/viewport): 0 unique

## HTTP failures: 0

## Theme sweep: 0 load(s) wrong
