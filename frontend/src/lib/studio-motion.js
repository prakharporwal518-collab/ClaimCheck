// GSAP motion for the AG Studio dashboard on the Analytics page.
//
// AG Studio draws its charts on canvases, but its widgets and side panels are plain DOM:
// widgets are placed with left/top (so their transform is free), and side panels are shown and
// hidden with an `ag-hidden` class. A MutationObserver spots them; its callback runs before the
// browser paints, so a widget is hidden before you could see it pop in unanimated.
//
// - Dashboard load (and whenever AG Studio rebuilds it): widgets fade up and settle into
//   place, top-left to bottom-right, once the charts have finished drawing.
// - Widgets added later (Edit mode or the AI assistant): a short pop.
// - A side panel that becomes visible slides in from its own side (View <-> Edit, AI panel).
// - Switching mode briefly fades the dashboard area, so widgets jumping to their new size
//   doesn't look jarring.
// Nothing animates when the viewer prefers reduced motion.
import { useEffect, useRef } from 'react'
import { gsap, useGSAP } from '@/lib/gsap'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const LOAD_WINDOW_MS = 1500 // widgets arriving this soon after the first one count as the initial load

// Run `fn` once the browser is idle (charts have finished drawing), or after `timeout` ms at most.
const whenIdle = (fn, timeout) =>
  window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout }) : setTimeout(fn, Math.min(timeout, 150))

export function useStudioMotion(mode) {
  const ref = useRef(null) // put on the element that wraps <AgStudio>
  const { contextSafe } = useGSAP({ scope: ref })

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const seenWidgets = new WeakSet()
    let panelsVisible = new Set() // panels visible at the last check
    let firstWidgetAt = 0

    const check = contextSafe(() => {
      const widgets = [...root.querySelectorAll('.ag-studio-layout-widget')]
      if (!widgets.length) firstWidgetAt = 0 // dashboard torn down: the next set is a fresh load
      const fresh = widgets.filter((w) => !seenWidgets.has(w))
      fresh.forEach((w) => seenWidgets.add(w))

      // Compare against the last check: AG Studio removes some panels from the page (the Filters
      // panel in Edit mode) and puts the same element back later, which should slide in again.
      const panelsShown = []
      const visibleNow = new Set()
      for (const panel of root.querySelectorAll('.ag-studio-panel')) {
        const box = panel.closest('.ag-studio-root-panel-container')
        if (!box || box.classList.contains('ag-hidden') || panel.offsetParent === null) continue
        visibleNow.add(panel)
        if (!panelsVisible.has(panel)) panelsShown.push({ panel, left: box.classList.contains('ag-studio-root-panel-container-left') })
      }
      panelsVisible = visibleNow

      if (reducedMotion()) return

      if (fresh.length) {
        const now = performance.now()
        if (!firstWidgetAt) firstWidgetAt = now
        const loading = now - firstWidgetAt < LOAD_WINDOW_MS
        fresh.sort((a, b) => (a.offsetTop - b.offsetTop) || (a.offsetLeft - b.offsetLeft))
        // Hide them now (before this frame paints), and play the entrance once AG Studio has
        // finished drawing the charts, so they arrive fully drawn rather than mid-render.
        gsap.set(fresh, loading ? { opacity: 0, y: 18, scale: 0.97 } : { opacity: 0, scale: 0.9 })
        whenIdle(contextSafe(() => {
          if (!root.isConnected) return
          gsap.to(fresh, { opacity: 1, y: 0, scale: 1, duration: loading ? 0.55 : 0.5, ease: loading ? 'power3.out' : 'back.out(1.7)',
            stagger: 0.07, clearProps: 'opacity,transform' })
        }), 700)
      }
      // Same for panels: hide at once, slide in when AG Studio has finished building them.
      for (const { panel, left } of panelsShown) gsap.set(panel, { opacity: 0, x: left ? -24 : 24 })
      if (panelsShown.length) {
        whenIdle(contextSafe(() => {
          if (!root.isConnected) return
          gsap.to(panelsShown.map((s) => s.panel), { opacity: 1, x: 0, duration: 0.45, ease: 'power3.out', clearProps: 'opacity,transform' })
        }), 300)
      }
    })

    // Watch for widgets/panels being added, and for panels being shown or hidden (class changes).
    const observer = new MutationObserver(check)
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    check()
    return () => observer.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Mode switch: a quick fade over the dashboard area while widgets resize to the new width.
  const lastMode = useRef(mode)
  useEffect(() => {
    if (lastMode.current === mode) return
    lastMode.current = mode
    if (reducedMotion()) return
    contextSafe(() => {
      const canvas = ref.current?.querySelector('.ag-studio-root-canvas')
      if (canvas) gsap.fromTo(canvas, { opacity: 0.35 }, { opacity: 1, duration: 0.45, ease: 'power2.out', clearProps: 'opacity' })
    })()
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  return ref
}
