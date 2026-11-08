// Watermelon-style hero: eyebrow badge, heading, sub-copy, CTAs and a visual, on the bg/ SVGs.
// Plain markup: the landing page animates it with GSAP (see lib/landing-motion.js) through the
// hero-* class names, so it still reads correctly with JavaScript off or reduced motion on.

export const HIGHLIGHT_GRADIENT =
  'bg-gradient-to-r from-[var(--grad-a)] via-[var(--grad-b)] to-[var(--grad-c)] bg-clip-text text-transparent'

export function HeroBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="hero-glow bg-glow absolute inset-x-0 top-0 h-[720px]" />
      <div className="bg-pattern-grid fade-edges absolute inset-0" />
    </div>
  )
}

export function Hero({ eyebrow, title, highlight, description, actions, note, visual }) {
  return (
    <section className="hero relative isolate">
      <HeroBackground />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div>
          {eyebrow && <div className="hero-eyebrow">{eyebrow}</div>}
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-[56px]">
            <span className="hero-title block">{title}</span>
            {highlight && <span className={`hero-highlight block ${HIGHLIGHT_GRADIENT}`}>{highlight}</span>}
          </h1>
          <p className="hero-desc mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">{description}</p>
          <div className="hero-actions mt-8 flex flex-wrap gap-3">{actions}</div>
          {note && <p className="hero-note mt-4 text-sm text-subtle">{note}</p>}
        </div>
        {visual && <div className="hero-visual">{visual}</div>}
      </div>
    </section>
  )
}
