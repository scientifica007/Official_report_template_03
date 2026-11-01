# ARCH-01D2-P4-B16 — Field acceptance follow-up (01/11/2026)

Status: implemented in an isolated branch; field print acceptance pending.

## Scope

Inspector accepts every earlier result not explicitly listed below.

1. Remove only the label «المراجع:» in both report and minutes, PDF and DOCX, while retaining the underlying legal-reference text.
2. Render the minutes opening in ordinary font. Render only the candidate's name in bold, followed by «المولد(ة) في: [تاريخ الميلاد] بـ: [مكان الميلاد]».
3. Provide two editable metadata fields: date of birth and place of birth. Never infer an unreliable split of the legacy combined field. Retain legacy data and JSON import compatibility.
4. Enlarge the four committee signer headings in the final report page only; leave minutes signature headings at their accepted size.
5. Preserve the accepted report footer and A4 print margins from P4-B15. Do not alter scores, committee authority, final approval process, or the cloud-backed model-03 system.

## Acceptance

Check all Node regression tests and CI; then have the inspector verify browser PDF, editable DOCX, page flow and the minutes on one A4 sheet. CI alone is not field acceptance.
