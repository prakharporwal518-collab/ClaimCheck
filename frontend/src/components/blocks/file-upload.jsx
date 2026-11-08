// Watermelon-style file upload: keyboard-accessible drop zone with drag state and a busy state.
import { useEffect, useRef, useState } from 'react'
import { gsap, useMotionGSAP } from '@/lib/gsap'
import { FileUp, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function FileUpload({ onFiles, busy, accept, multiple = true, title, hint, children, className }) {
  const input = useRef(null)
  const [drag, setDrag] = useState(false)
  const open = () => !busy && input.current?.click()
  // The drop zone swells slightly while a file is dragged over it.
  const zone = useRef(null)
  const scaleTo = useRef(null)
  useMotionGSAP(() => {
    scaleTo.current = gsap.quickTo(zone.current, 'scale', { duration: 0.25, ease: 'power2.out' })
    return () => { scaleTo.current = null }
  }, { scope: zone })
  useEffect(() => { scaleTo.current?.(drag ? 1.015 : 1) }, [drag])

  return (
    <div
      ref={zone}
      aria-busy={busy}
      onClick={open}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) onFiles(e.dataTransfer.files) }}
      className={cn(
        'group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors',
        drag ? 'border-primary bg-accent' : 'border-input hover:border-primary hover:bg-muted/60',
        busy && 'cursor-wait',
        className,
      )}
    >
      <div aria-hidden="true" className="bg-pattern-dots fade-edges pointer-events-none absolute inset-0 opacity-70" />
      <input ref={input} type="file" multiple={multiple} accept={accept} hidden
        onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
      <span className={cn('relative grid size-11 place-items-center rounded-xl border bg-card shadow-sm transition-transform group-hover:-translate-y-0.5',
        drag && '-translate-y-0.5 border-primary')}>
        {busy ? <Loader2 className="size-5 animate-spin text-primary-text" /> : <FileUp className="size-5 text-primary-text" />}
      </span>
      <div className="relative mt-3 text-sm font-semibold">{busy ? 'Uploading…' : title}</div>
      <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); open() }}
        className="relative mt-1 rounded text-xs font-semibold text-primary-text underline-offset-4 hover:underline">
        or choose files
      </button>
      {hint && <div className="relative mt-1 text-xs text-muted-foreground">{hint}</div>}
      {children && <div className="relative mt-3 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>{children}</div>}
    </div>
  )
}
