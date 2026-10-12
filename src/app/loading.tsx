// Top-level loading skeleton. Matches the catalogue aesthetic so the
// page→page transition looks intentional rather than janky.

export default function Loading() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b border-ink/15">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="catalogue">M.A. — Vol. I</span>
            <span className="hidden sm:inline-block w-12 h-px bg-ink/30" aria-hidden />
            <span className="catalogue text-inkMuted">preparing the page</span>
          </div>
        </div>
      </header>

      <section className="flex-1 flex items-center justify-center px-6 md:px-10">
        <div className="max-w-md w-full text-center py-24">
          <div className="flex justify-center gap-1.5" aria-hidden>
            <span
              className="w-1.5 h-1.5 rounded-full bg-ink animate-pulse"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-ink animate-pulse"
              style={{ animationDelay: '180ms' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-ink animate-pulse"
              style={{ animationDelay: '360ms' }}
            />
          </div>
          <p className="catalogue text-inkMuted mt-6">preparing the page…</p>
        </div>
      </section>
    </main>
  );
}
