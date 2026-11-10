// GSAP motion for AG Grid tables.
//
// AG Grid positions each row with `transform: translateY(...)`, so we never animate rows: we
// animate the cells inside them (cells are placed with left/width only, so their transform is
// free) and the content of expanded detail rows.
//
// - Rows arriving for the first time fade up, one row after another.
// - Rows added after the first load (a new dispute, a new evidence file) also get a soft
//   highlight that fades out.
// - Rows already shown are remembered, so polling refreshes don't re-animate anything.
// - Changing `resetKey` (a filter, a new analysis) forgets them, so the new set plays again.
// - Expanding a master/detail row fades its detail panel in.
// Nothing animates when the viewer prefers reduced motion.
import { useRef } from 'react'
import { gsap, useGSAP } from '@/lib/gsap'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const MAX_STAGGER_ROWS = 12 // rows further down start together, so long tables don't drag

export function useGridMotion(resetKey) {
  const ref = useRef(null) // put on the element that wraps <AgGridReact>
  const seen = useRef(new Set())
  const lastKey = useRef(resetKey)
  const { contextSafe } = useGSAP({ scope: ref })

  const animateRows = contextSafe((ids, flash, retried = false) => {
    const root = ref.current
    if (!root) return
    const found = []
    const pending = []
    for (const id of ids) {
      const rows = root.querySelectorAll(`.ag-row[row-id="${CSS.escape(id)}"]:not(.ag-full-width-row)`)
      if (rows.length) found.push({ index: Number(rows[0].getAttribute('row-index')) || 0, cells: [...rows].flatMap((r) => [...r.querySelectorAll('.ag-cell')]) })
      else pending.push(id)
    }
    if (found.length) {
      const first = Math.min(...found.map((r) => r.index))
      const accent = gsap.utils.splitColor(getComputedStyle(root).getPropertyValue('--accent').trim() || '#eef3ff')
      for (const { index, cells } of found) {
        const delay = Math.min(index - first, MAX_STAGGER_ROWS) * 0.04
        gsap.fromTo(cells, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, delay, ease: 'power3.out', clearProps: 'opacity,transform' })
        if (flash) {
          gsap.fromTo(cells, { backgroundColor: `rgba(${accent[0]},${accent[1]},${accent[2]},1)` },
            { backgroundColor: `rgba(${accent[0]},${accent[1]},${accent[2]},0)`, duration: 1.6, delay: delay + 0.2, ease: 'power1.out', clearProps: 'backgroundColor' })
        }
      }
    }
    // Rows AG Grid hasn't drawn yet usually appear on the next frame (scrolled-out rows never do).
    if (pending.length && !retried) requestAnimationFrame(() => animateRows(pending, flash, true))
  })

  const reveal = (api, flash) => {
    const fresh = []
    api.forEachNode((n) => { if (n.id && !n.detail && !seen.current.has(n.id)) fresh.push(n.id) })
    fresh.forEach((id) => seen.current.add(id))
    if (fresh.length && !reducedMotion()) animateRows(fresh, flash)
  }

  const onFirstDataRendered = (e) => reveal(e.api, false)

  const onRowDataUpdated = (e) => {
    const reset = lastKey.current !== resetKey
    if (reset) { seen.current.clear(); lastKey.current = resetKey }
    // Highlight genuinely new rows, not the first load and not a whole new filtered set.
    reveal(e.api, !reset && seen.current.size > 0)
  }

  // AG Grid may draw the detail row a frame or two after the event, so look for it each frame
  // for a short while.
  const fadeInDetail = contextSafe((id, framesLeft) => {
    const detail = ref.current?.querySelector(`[row-id="detail_${CSS.escape(id)}"]`)
    // The detail renderer sits inside AG Grid's .ag-full-width-anchor element.
    const content = detail && [...detail.querySelectorAll(':scope > .ag-full-width-anchor > *, :scope > :not(.ag-full-width-anchor)')]
    if (content?.length) {
      gsap.fromTo(content, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'opacity,transform' })
    } else if (framesLeft > 0) {
      requestAnimationFrame(() => fadeInDetail(id, framesLeft - 1))
    }
  })

  const onRowGroupOpened = (e) => {
    if (e.node.expanded && !reducedMotion()) fadeInDetail(e.node.id, 20)
  }

  // Briefly flash the rows matching `selector` (e.g. rows just linked to a selected claim) in the
  // primary colour, fading back to their normal look. Waits a few frames for AG Grid to apply
  // new row classes.
  const flashRows = contextSafe((selector, framesLeft = 10) => {
    if (reducedMotion()) return
    const cells = ref.current ? [...ref.current.querySelectorAll(`${selector} .ag-cell`)] : []
    if (!cells.length) {
      if (framesLeft > 0) requestAnimationFrame(() => flashRows(selector, framesLeft - 1))
      return
    }
    const [r, g, b] = gsap.utils.splitColor(getComputedStyle(ref.current).getPropertyValue('--primary').trim() || '#2a52d9')
    gsap.fromTo(cells, { backgroundColor: `rgba(${r},${g},${b},0.3)` },
      { backgroundColor: `rgba(${r},${g},${b},0)`, duration: 1, ease: 'power2.out', overwrite: true, clearProps: 'backgroundColor' })
  })

  return { ref, flashRows, gridProps: { onFirstDataRendered, onRowDataUpdated, onRowGroupOpened } }
}
