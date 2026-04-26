/** Short note below the left column (time sync control lives in the header). */
export function SidebarSyncFooter() {
  return (
    <p className="mt-4 text-xs leading-relaxed text-zinc-600">
      Fixed observer: marker 📷. Map routes from{" "}
      <code className="mx-0.5 font-mono text-zinc-500">routes.json</code>{" "}
      (static, OpenSky). The provider chooses real vs. approximate flight
      positions.
    </p>
  );
}
