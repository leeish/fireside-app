'use client'

import type { ExtractionResult } from '@/lib/graph'

export default function ExtractionTab({ extraction }: { extraction: ExtractionResult | null }) {
  if (!extraction) {
    return <p className="text-sm text-muted-fg">No extraction data available for this entry.</p>
  }

  const { people, places, era, themes, events, interests, new_threads_opened } = extraction

  const hasContent = (
    (people?.length ?? 0) > 0 ||
    (places?.length ?? 0) > 0 ||
    era ||
    (themes?.length ?? 0) > 0 ||
    (events?.length ?? 0) > 0 ||
    (interests?.length ?? 0) > 0 ||
    (new_threads_opened?.length ?? 0) > 0
  )

  if (!hasContent) {
    return <p className="text-sm text-muted-fg">Nothing was extracted from this entry.</p>
  }

  return (
    <div className="space-y-8">
      {people && people.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">People</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {people.map((person, i) => (
              <div key={i} className="bg-card border border-border/50 rounded-2xl px-5 py-4 space-y-1">
                <p className="text-sm font-medium text-foreground">{person.name}</p>
                {person.relationship && (
                  <p className="text-xs text-muted-fg capitalize">{person.relationship}</p>
                )}
                {person.sentiment && (
                  <p className="text-xs text-muted-fg capitalize">{person.sentiment}</p>
                )}
                {person.new_facts && person.new_facts.length > 0 && (
                  <ul className="space-y-0.5 pt-1">
                    {person.new_facts.map((f, j) => (
                      <li key={j} className="text-xs text-foreground/70">- {f}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {places && places.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Places</p>
          <div className="flex flex-wrap gap-2">
            {places.map((place, i) => (
              <div key={i} className="px-3 py-1.5 bg-card border border-border/50 rounded-xl text-xs text-foreground/80">
                <span className="font-medium">{place.name}</span>
                {place.city && (
                  <span className="text-muted-fg">
                    {' '}&middot;{' '}{place.city}{place.state ? `, ${place.state}` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {era && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Era</p>
          <span className="px-3 h-7 inline-flex items-center rounded-full border border-border/50 text-xs text-foreground/80 bg-card capitalize">
            {era}
          </span>
        </section>
      )}

      {themes && themes.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Themes</p>
          <div className="flex flex-wrap gap-2">
            {themes.map((theme, i) => (
              <span key={i} className="px-3 h-7 flex items-center rounded-full border border-border/50 text-xs text-foreground/80 bg-card">
                {theme}
              </span>
            ))}
          </div>
        </section>
      )}

      {events && events.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Events</p>
          <div className="bg-card border border-border/50 rounded-2xl divide-y divide-border/30">
            {events.map((event, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between gap-4">
                <p className="text-sm text-foreground/80">{event.name}</p>
                {event.date?.year && (
                  <p className="text-xs text-muted-fg shrink-0">{event.date.year}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {interests && interests.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Interests</p>
          <div className="flex flex-wrap gap-2">
            {interests.map((interest, i) => (
              <span key={i} className="px-3 h-7 flex items-center rounded-full border border-border/50 text-xs text-foreground/80 bg-card">
                {interest}
              </span>
            ))}
          </div>
        </section>
      )}

      {new_threads_opened && new_threads_opened.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-widest">Threads opened</p>
          <div className="bg-card border border-border/50 rounded-2xl divide-y divide-border/30">
            {new_threads_opened.map((thread, i) => (
              <div key={i} className="px-5 py-3">
                <p className="text-sm text-foreground/80">{thread}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
