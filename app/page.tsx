import Link from 'next/link'
import ThemeToggle from './components/ThemeToggle'

export const metadata = {
  title: 'Fireside — Your Family Story',
  description: 'Capture your family stories through thoughtful conversations. No blank page. No generic prompts.',
}

const FEATURES = [
  {
    title: 'One Biographer',
    description: 'A thoughtful AI that knows your story and asks the next right question.',
  },
  {
    title: 'Conversations That Deepen',
    description: 'Each answer builds on what came before. Your story unfolds naturally over time.',
  },
  {
    title: 'No Blank Page',
    description: 'Skip the intimidation of journaling alone. Get guided prompts tailored to your life.',
  },
  {
    title: 'See Your Progress',
    description: 'Watch your story take shape before the book is done. A tapestry, not a to-do list.',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-2xl font-display font-semibold text-foreground tracking-tight">
            Fire<em>side</em>
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link
              href="/login"
              className="px-6 h-10 bg-primary hover:bg-primary/90 text-white text-sm font-semibold rounded-full transition-all duration-300 hover:scale-105 active:scale-95"
            >
              Log in
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="text-center space-y-6">
            <h1 className="text-5xl sm:text-6xl font-display font-bold text-foreground leading-tight tracking-tight">
              Capture the stories that matter
            </h1>
            <p className="text-xl text-muted-fg leading-relaxed max-w-2xl mx-auto">
              Your family stories deserve to be told. Fireside makes it easy through thoughtful conversations, one question at a time.
            </p>
            <div className="flex gap-4 justify-center pt-4">
              <Link
                href="/login"
                className="px-8 h-12 bg-primary hover:bg-primary/90 text-white text-base font-semibold rounded-full transition-all duration-300 hover:scale-105 active:scale-95"
                style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.20)' }}
              >
                Get started
              </Link>
              <a
                href="#signup"
                className="px-8 h-12 border border-border text-foreground text-base font-semibold rounded-full hover:bg-muted transition-all duration-300"
              >
                Learn more
              </a>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="bg-muted/30 py-20 sm:py-28">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground mb-4">
                How it works
              </h2>
              <p className="text-lg text-muted-fg max-w-2xl mx-auto">
                Fireside guides you through meaningful conversations about your life and memories. Our AI adapts to what you share, building deeper context with each answer to ask the next right question.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              {FEATURES.map((feature, idx) => (
                <div
                  key={idx}
                  className="bg-card rounded-2xl border border-border/50 p-7 space-y-3"
                  style={{ boxShadow: '0 4px 20px -4px rgba(93, 112, 82, 0.10)' }}
                >
                  <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                  <p className="text-muted-fg leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Signup Placeholder Section */}
        <section id="signup" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="bg-card rounded-3xl border border-border/50 p-10 sm:p-12 text-center space-y-6" style={{ boxShadow: '0 4px 20px -4px rgba(93, 112, 82, 0.10)' }}>
            <h2 className="text-3xl sm:text-4xl font-display font-semibold text-foreground">
              Ready to start?
            </h2>
            <p className="text-lg text-muted-fg max-w-2xl mx-auto leading-relaxed">
              Begin capturing your family stories today. Start with a 30-day free trial — no card required.
            </p>
            <div>
              <Link
                href="/login"
                className="inline-block px-8 h-12 bg-primary hover:bg-primary/90 text-white text-base font-semibold rounded-full transition-all duration-300 hover:scale-105 active:scale-95"
                style={{ boxShadow: '0 4px 20px -2px rgba(93, 112, 82, 0.20)' }}
              >
                Sign up for free
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-muted/20 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <p className="text-sm text-muted-fg">
              © 2026 Fireside. All rights reserved.
            </p>
            <div className="flex gap-6">
              <Link href="/privacy" className="text-sm text-muted-fg hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="text-sm text-muted-fg hover:text-foreground transition-colors">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
