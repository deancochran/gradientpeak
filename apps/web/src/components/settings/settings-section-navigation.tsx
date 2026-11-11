const sections = [
  ["profile", "Profile"],
  ["preferences", "Preferences"],
  ["account", "Account"],
  ["security", "Security"],
] as const;

export function SettingsSectionNavigation() {
  return (
    <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
      {sections.map(([id, label]) => (
        <a
          key={id}
          className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
          href={`#${id}`}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
