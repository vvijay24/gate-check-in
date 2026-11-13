// Handoff after the Loading Inspection: Dock (inspection passed) → the inspector (release to the gate,
// on Loading & Inspection) → Gate (check-out). A release is stored on the visit as `release`:
// { releasedAt, releasedBy, paperwork, orderNo, seal, note }.

// A dropped trailer that passed its inspection is released to the yard instead of the gate: it leaves the
// dock (which is free again) and parks in the yard lane until a driver hooks it at the Gate. Stored on the
// release as { toYard: true, spot }.
export const inYard = (e) => Boolean(e.release?.toYard)

// At its dock right now: on site with a dock, and not released to the yard.
export const atDockNow = (e) => !e.timeOut && !!e.dockDoor && !inYard(e)

// Passed inspection, still on site, not yet released by the inspector.
export const awaitingRelease = (e) => !e.timeOut && e.loadingInspection?.result === 'Pass' && !e.release?.releasedAt

// Released by the inspector and waiting for the Gate to check it out.
export const isReleased = (e) => !e.timeOut && !!e.release?.releasedAt

// Why the Gate can't check this truck out yet, or '' when it can. Anything that was at a dock needs
// a passed inspection and the inspector's release first; trucks that never got a dock (e.g. a dropped
// trailer collected from the yard) can leave as before.
export function checkOutBlock(e) {
  if (e.timeOut) return ''
  if (e.loadingInspection?.result === 'Fail') return 'The loading inspection failed. It has to be re-checked and passed, then released by the inspector.'
  if (!e.dockDoor) return ''
  if (!e.loadingInspection) return 'It is at a dock but has not been inspected yet. The inspector inspects it and releases it on Loading & Inspection.'
  if (!e.release?.releasedAt) return 'The inspection passed, but the inspector has not released it to the gate yet.'
  return ''
}

// The seal the Gate should find on the trailer: the one it was released with, else the inspection's.
export const expectedSeal = (e) => e.release?.seal || e.loadingInspection?.sealApplied || ''
