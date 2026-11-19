import { useState } from 'react'
import * as ui from '../../ui'
import { clockTime, dayKey, shiftDate, shortDate } from '../../time'
import { TEMP_RULES, tempGap, tempStatus } from '../../loadSheet'
import { Card, Empty, HBars, RangeSwitch, ShowTable, Tile, Tiles, cases } from './parts'

// Docks & loads → Load sheets: what went on the trailers (from each visit's load sheet, SAMPLE until the
// load sheet is on a form) and the box temperature against its rule.

const pctChange = (now, before, unit) => {
  if (!before) return now ? `New against the ${unit}` : `Same as the ${unit}`
  const p = Math.round(((now - before) / before) * 100)
  return p === 0 ? `Same as the ${unit}` : `${p > 0 ? '▲' : '▼'} ${Math.abs(p)}% against the ${unit}`
}
const deg = (v) => `${Math.round(v * 10) / 10}°F`
const sumCases = (e) => (e.loadSheet?.products ?? []).reduce((s, p) => s + p.cases, 0)
const loadedLabel = (e, today) => {
  const t = e.loadFinishedAt ?? e.loadStartedAt
  return `${dayKey(new Date(t)) === today ? 'Today' : shortDate(dayKey(new Date(t)))}, ${clockTime(t)}`
}

// The box temperature cell: "34.6°F" with its tag, then how far from the set point.
function BoxTemp({ e }) {
  const s = e.loadSheet
  const status = tempStatus(e)
  if (status === 'none') return <span className="text-[14px] text-muted">Not checked yet, set to {deg(s.setPoint)}</span>
  const gap = tempGap(e)
  const out = status === 'out'
  return (
    <span className="grid gap-0.5">
      <span className="flex flex-wrap items-center gap-2">
        <b className="tabular-nums">{deg(s.boxTemp)}</b>
        <span className={ui.tag + ' ' + (out ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok')}>{out ? 'Out of range' : 'In range'}</span>
      </span>
      <span className={'text-[13px] ' + (out ? 'font-semibold text-danger' : 'text-muted')}>
        {gap === 0 ? `At the ${deg(s.setPoint)} set point` : `${Math.abs(gap)}° ${gap > 0 ? 'over' : 'under'} the ${deg(s.setPoint)} set point`}
      </span>
    </span>
  )
}

export function LoadSheetsSection({ entries, now }) {
  const [days, setDays] = useState(7)
  const [all, setAll] = useState(false)
  const today = dayKey(new Date(now))
  const from = shiftDate(today, -(days - 1))
  const prevFrom = shiftDate(today, -(2 * days - 1))
  const inRange = (e, a, b) => e.loadSheet && e.loadStartedAt && e.dateIn >= a && e.dateIn <= b
  const loads = entries.filter((e) => inRange(e, from, today))
  const before = entries.filter((e) => inRange(e, prevFrom, shiftDate(from, -1)))
  const done = (list) => list.filter((e) => e.loadFinishedAt)
  const unit = days === 1 ? 'day before' : `${days} days before`
  const fig = (list) => ({
    loads: done(list).length,
    cases: done(list).reduce((s, e) => s + sumCases(e), 0),
    pallets: done(list).reduce((s, e) => s + (e.loadSheet.pallets ?? 0), 0),
    out: list.filter((e) => tempStatus(e) === 'out').length,
  })
  const f = fig(loads)
  const p = fig(before)

  // Cases by product, most first.
  const byProduct = new Map()
  for (const e of done(loads)) for (const x of e.loadSheet.products) byProduct.set(x.name, (byProduct.get(x.name) ?? 0) + x.cases)
  const products = [...byProduct].sort((a, b) => b[1] - a[1])
  // The latest box readings, newest first.
  const read = loads.filter((e) => tempStatus(e) !== 'none').sort((a, b) => b.loadFinishedAt - a.loadFinishedAt).slice(0, 10)
  // Out-of-range loads first, then the newest.
  const rows = [...loads].sort((a, b) => Number(tempStatus(b) === 'out') - Number(tempStatus(a) === 'out') || (b.loadFinishedAt ?? b.loadStartedAt) - (a.loadFinishedAt ?? a.loadStartedAt))
  const shown = all ? rows : rows.slice(0, 8)
  const rule = (k) => `${k}: set ${deg(TEMP_RULES[k].set)}, within ${TEMP_RULES[k].within}°`

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-muted">
          Sample load sheets. Temperature rules to confirm with QA: {rule('Fresh')}; {rule('Frozen')}.
        </p>
        <RangeSwitch value={days} onChange={setDays} />
      </div>
      <Tiles>
        <Tile icon="load" label="Loads finished" value={`${f.loads} loads`} note={days === 1 ? 'Today' : `Last ${days} days`} change={pctChange(f.loads, p.loads, unit)} />
        <Tile icon="orders" label="What we shipped" value={cases(f.cases)} note="Across every product" change={pctChange(f.cases, p.cases, unit)} />
        <Tile icon="dock" label="Pallets shipped" value={`${f.pallets.toLocaleString()} pallets`} note="On the finished loads" change={pctChange(f.pallets, p.pallets, unit)} />
        <Tile
          icon="reefer"
          label="Box out of range"
          value={`${f.out} loads`}
          tone={f.out ? 'bad' : undefined}
          note={f.out ? 'Check these with QA before they leave' : 'Every box read was in range'}
          change={pctChange(f.out, p.out, unit)}
        />
      </Tiles>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card icon="chart" title="What we shipped" sub="Cases by product on the finished loads">
          <div className="grid gap-3 px-5 pt-4 pb-4">
            {products.length ? (
              <>
                <HBars labelWidth={150} rows={products.map(([name, n]) => ({ label: name, value: n, text: cases(n) }))} />
                <p className="text-[13px] text-muted">Each bar is one product. It shows how many cases of it left on finished loads. The most shipped is at the top.</p>
                <ShowTable head={['Product', { label: 'Cases', right: true }]} rows={products.map(([name, n]) => [name, cases(n)])} />
              </>
            ) : (
              <p className="text-muted">No loads finished in this range.</p>
            )}
          </div>
        </Card>
        <Card icon="reefer" title="Box temperature" sub="How far each box read from its set point, latest 10 loads">
          <div className="grid gap-3 px-5 pt-4 pb-4">
            {read.length ? (
              <>
                <HBars
                  labelWidth={150}
                  rows={read.map((e) => {
                    const g = tempGap(e)
                    return {
                      label: `${e.trailerNumber}, ${e.loadSheet.kind}`,
                      value: Math.abs(g),
                      text: `${g > 0 ? '+' : g < 0 ? '−' : ''}${Math.abs(g)}°F`,
                      color: tempStatus(e) === 'out' ? 'var(--color-danger)' : 'var(--color-chart-live)',
                    }
                  })}
                />
                <p className="text-[13px] text-muted">
                  Each bar is one load, latest first. It shows how far the box was from its set point. Red is outside the allowed range.
                </p>
                <ShowTable
                  head={['Trailer', 'Kind', { label: 'Box', right: true }, { label: 'Set point', right: true }, 'Range']}
                  rows={read.map((e) => [e.trailerNumber, e.loadSheet.kind, deg(e.loadSheet.boxTemp), deg(e.loadSheet.setPoint), tempStatus(e) === 'out' ? 'Out of range' : 'In range'])}
                />
              </>
            ) : (
              <p className="text-muted">No box temperatures read in this range.</p>
            )}
          </div>
        </Card>
      </div>
      <Card icon="log" title="Load sheets" sub="Out-of-range boxes first, then the newest">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className={ui.table + ' min-w-[880px]'}>
              <thead>
                <tr>
                  {['Loaded', 'Order no.', 'Trailer', 'Customer', 'Products'].map((h) => (
                    <th key={h} className={ui.th}>
                      {h}
                    </th>
                  ))}
                  <th className={ui.th + ui.num}>Cases</th>
                  <th className={ui.th}>Box temperature</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => (
                  <tr key={e.id} className={ui.tr + ' align-top'}>
                    <td className={ui.tdTight + ' whitespace-nowrap'}>
                      {loadedLabel(e, today)}
                      {!e.loadFinishedAt && <span className="block text-[13px] text-muted">Still loading</span>}
                    </td>
                    <td className={ui.tdTight + ' whitespace-nowrap'}>{e.pickupNumber || '—'}</td>
                    <td className={ui.tdTight + ' font-semibold whitespace-nowrap'}>{e.trailerNumber}</td>
                    <td className={ui.tdTight}>{e.customerPickupFor || '—'}</td>
                    <td className={ui.tdTight}>
                      <span className={ui.tag + ' ' + (e.loadSheet.kind === 'Frozen' ? 'bg-signal-soft text-signal' : 'bg-pickup-soft text-pickup')}>{e.loadSheet.kind}</span>
                      <span className="block text-[13px]">{e.loadSheet.products.map((x) => x.name).join(', ')}</span>
                    </td>
                    <td className={ui.tdTight + ui.num + ' whitespace-nowrap'}>{cases(sumCases(e))}</td>
                    <td className={ui.tdTight}>
                      <BoxTemp e={e} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No load sheets in this range. Load the sample visits to see some.</Empty>
        )}
        {rows.length > 8 && (
          <div className="border-t border-hair px-5 py-2">
            <button type="button" onClick={() => setAll((v) => !v)} className={ui.btnGhost + ' -ml-3'}>
              {all ? 'Show less' : `Show all (${rows.length})`}
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}
