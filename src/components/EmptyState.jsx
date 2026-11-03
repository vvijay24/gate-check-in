import { Box, P, pts } from './YardScene'

// A small isometric picture for empty lists, in the yard map's style: a patch of painted asphalt with
// a traffic cone, or (`kind="dock"`) an empty dock door. Decoration only; the text says what's empty.
function EmptyArt({ kind }) {
  const ground = pts([
    [0, 0, 0],
    [26, 0, 0],
    [26, 18, 0],
    [0, 18, 0],
  ])
  const [cx, cy] = P(16, 9, 0)
  return (
    <svg viewBox="-55 -34 125 76" width="120" height="74" aria-hidden="true" className="shrink-0">
      <polygon points={ground} fill="var(--color-iso-lot)" opacity={0.85} />
      {[6, 13, 20].map((x) => (
        <polygon key={x} points={pts([[x, 2, 0], [x + 0.6, 2, 0], [x + 0.6, 16, 0], [x, 16, 0]])} fill="var(--color-iso-paint)" opacity={0.9} />
      ))}
      {kind === 'dock' ? (
        <>
          <Box x={0} y={-6} w={26} d={6} h={16} color="var(--color-iso-wall)" top="var(--color-iso-roof)" />
          <polygon points={pts([[7, 0, 3], [17, 0, 3], [17, 0, 12], [7, 0, 12]])} fill="var(--color-iso-door)" />
          {[5, 7, 9, 11].map((z) => (
            <polyline key={z} points={pts([[7, 0, z], [17, 0, z]])} stroke="var(--color-iso-steel)" strokeWidth={0.6} />
          ))}
        </>
      ) : (
        <g transform={`translate(${cx} ${cy})`}>
          {/* Traffic cone: base, body with a white band. */}
          <polygon points="-9,2 0,6.5 9,2 0,-2.5" fill="var(--color-paint-2)" />
          <polygon points="-6,1 0,-22 6,1 0,3.5" fill="var(--color-paint-2)" />
          <polygon points="0,-22 6,1 0,3.5" fill="black" opacity={0.15} />
          <polygon points="-4.2,-6 0,-14 4.2,-6 0,-4.6" fill="white" opacity={0.9} />
        </g>
      )}
    </svg>
  )
}

// Empty list: the picture beside a sentence saying why it's empty and what to do.
export default function EmptyState({ children, kind, compact }) {
  return (
    <div className={'flex items-center gap-3 ' + (compact ? 'py-1' : 'py-3')}>
      <EmptyArt kind={kind} />
      <p className="text-sm text-muted">{children}</p>
    </div>
  )
}
