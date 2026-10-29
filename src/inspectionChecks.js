// The Yes / No checks on the Loading Inspection, shared by the form, the sample data and the
// Overview's data-quality figures. Every check must be answered Yes for the load to pass.
export const TRAILER_CHECKS = [
  { name: 'trailerClean', label: 'Trailer clean and free of debris' },
  { name: 'odorFree', label: 'Free of odors' },
  { name: 'noPests', label: 'No signs of pests' },
  { name: 'structureIntact', label: 'Walls, floor and ceiling intact' },
  { name: 'doorsSeal', label: 'Doors and seals close properly' },
  { name: 'noChemicals', label: 'No chemicals or non-food items' },
]
export const LOAD_CHECKS = [
  { name: 'palletsGood', label: 'Pallets in good condition' },
  { name: 'packagingIntact', label: 'Packaging and labels intact' },
  { name: 'loadSecured', label: 'Load secured (load locks / straps)' },
]
export const CHECK_NAMES = [...TRAILER_CHECKS, ...LOAD_CHECKS].map((c) => c.name)
