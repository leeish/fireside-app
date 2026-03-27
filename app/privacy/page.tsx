import { privacyHtml } from './content'

export const metadata = { title: 'Privacy Policy — Fireside' }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: privacyHtml }}
        />
      </div>
    </div>
  )
}
