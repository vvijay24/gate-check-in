// Handoff after the Loading Inspection: Dock (inspection passed) → Shipping (release to the gate)
// → Gate (check-out). A release is stored on the visit as `release`:
// { releasedAt, releasedBy, paperwork, orderNo, seal, note }.

// Passed inspection, still on site, not yet released by Shipping.
export const awaitingRelease = (e) => !e.timeOut && e.loadingInspection?.result === 'Pass' && !e.release?.releasedAt

// Released by Shipping and waiting for the Gate to check it out.
export const isReleased = (e) => !e.timeOut && !!e.release?.releasedAt

// Why the Gate can't check this truck out yet, or '' when it can. Anything that was at a dock needs
// a passed inspection and a Shipping release first; trucks that never got a dock (e.g. a dropped
// trailer collected from a bay) can leave as before.
export function checkOutBlock(e) {
  if (e.timeOut) return ''
  if (e.loadingInspection?.result === 'Fail') return 'The loading inspection failed. It has to be re-checked and passed, then released by Shipping.'
  if (!e.dockDoor) return ''
  if (!e.loadingInspection) return 'It is at a dock but has not been inspected yet. Inspect it on Dock & Loading, then Shipping releases it.'
  if (!e.release?.releasedAt) return 'The inspection passed, but Shipping has not released it to the gate yet.'
  return ''
}

// The seal the Gate should find on the trailer: the one Shipping released with, else the inspection's.
export const expectedSeal = (e) => e.release?.seal || e.loadingInspection?.sealApplied || ''
