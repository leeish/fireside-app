import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from './LogoutButton'
import ThemeToggle from '@/app/components/ThemeToggle'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-background">

      {/* Floating pill nav */}
      <div className="sticky top-4 z-40 px-4">
        <div
          className="max-w-2xl mx-auto flex items-center justify-between px-6 py-3 rounded-full border border-border/60 backdrop-blur-md"
          style={{ backgroundColor: 'var(--fs-glass)', boxShadow: '0 4px 20px -4px rgba(93, 112, 82, 0.12)' }}
        >
          <Link href="/dashboard" className="text-xl font-display font-semibold text-foreground tracking-tight">
            Fire<em>side</em>
          </Link>
          <div className="flex items-center gap-5">
            <p className="text-xs text-muted-fg hidden sm:block">{user.email}</p>
            <Link href="/settings" className="text-sm text-muted-fg hover:text-foreground transition-colors duration-300">Settings</Link>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </div>

      {children}

      <footer className="pb-8 flex items-center justify-center gap-6">
        <Link href="/dashboard/archive" className="text-xs text-muted-fg hover:text-foreground transition-colors duration-300">
          Archive
        </Link>
        <Link href="/dashboard/graph" className="text-xs text-border hover:text-muted-fg transition-colors duration-300">
          debug: view narrative graph
        </Link>
      </footer>

    </div>
  )
}
