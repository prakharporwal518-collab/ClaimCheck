// Friendly fallbacks: an unknown address, a dispute that doesn't exist, or a page that crashed.
// (Without these, React Router shows its developer error screen.)
import { Link, useRouteError } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Home, RotateCcw, SearchX } from 'lucide-react'
import { Logo } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

function Message({ icon: Icon, title, children, actions }) {
  return (
    <Card className="mx-auto max-w-lg px-6 py-10 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground text-pretty">{children}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>
    </Card>
  )
}

/** Unknown address. `standalone` adds the logo for pages outside the app shell. */
export default function NotFound({ standalone = false }) {
  const body = (
    <Message icon={SearchX} title="Page not found"
      actions={<>
        <Button as={Link} to="/app"><ArrowLeft /> Go to the inbox</Button>
        <Button as={Link} to="/" variant="outline"><Home /> Home page</Button>
      </>}>
      There's nothing at this address. It may have been mistyped, or the link may be out of date.
    </Message>
  )
  if (!standalone) return <div className="py-10">{body}</div>
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <Link to="/" className="flex items-center gap-2.5 text-[17px] font-bold tracking-tight" aria-label="ClaimCheck home">
        <Logo className="size-7" /> ClaimCheck
      </Link>
      <div className="w-full">{body}</div>
    </div>
  )
}

/** A dispute id that doesn't exist (or no longer exists, e.g. after a demo reset). */
export function DisputeNotFound({ id }) {
  return (
    <div className="py-10">
      <Message icon={SearchX} title="Dispute not found"
        actions={<Button as={Link} to="/app"><ArrowLeft /> Back to the inbox</Button>}>
        There's no dispute <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{id}</code>. It may have been
        removed when the demo data was reset, or the link may be mistyped.
      </Message>
    </div>
  )
}

/** Route errorElement: a page crashed or a route was not found. */
export function RouteError() {
  const error = useRouteError()
  if (error?.status === 404) return <NotFound standalone />
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full">
        <Message icon={AlertTriangle} title="Something went wrong"
          actions={<>
            <Button onClick={() => window.location.reload()}><RotateCcw /> Reload the page</Button>
            <Button as={Link} to="/app" variant="outline"><ArrowLeft /> Go to the inbox</Button>
          </>}>
          This page hit an unexpected error. Reloading usually fixes it. Your disputes and drafts are saved on the server.
        </Message>
      </div>
    </div>
  )
}
