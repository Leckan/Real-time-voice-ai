"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="font-display text-4xl">The page could not be shown</h1>
        <button type="button" className="mt-6 rounded-full bg-accent px-4 py-2 text-[#1c130c]" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
