import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: About,
});

function About() {
  return (
    <main className="py-12 sm:py-16">
      <section className="max-w-3xl rounded-3xl border border-border bg-card p-8 shadow-sm sm:p-10">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Phase 1
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          Monorepo-safe TanStack Start baseline
        </h1>
        <ul className="mt-6 list-disc space-y-3 pl-5 text-sm leading-6 text-muted-foreground sm:text-base">
          <li>Official TanStack CLI scaffolded the current TanStack Start web app.</li>
          <li>Turbo now recognizes TanStack Start build outputs alongside Next.js outputs.</li>
          <li>
            A shared TypeScript preset for TanStack Start was added under `tooling/typescript`.
          </li>
          <li>The starter shell was replaced with a minimal GradientPeak migration workspace.</li>
          <li>
            Next steps are shared providers, auth, typed API integration, and initial route ports.
          </li>
        </ul>
      </section>
    </main>
  );
}
