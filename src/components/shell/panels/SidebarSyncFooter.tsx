import { ShellFootnote } from "@/components/shell/ShellSectionCard";

/** Short note below the left column (time sync control lives in the header). */
export function SidebarSyncFooter() {
  return (
    <ShellFootnote>
      <p>
        Fixed observer: marker 📷. Map routes from{" "}
        <code className="mx-0.5 font-mono text-zinc-500">routes.json</code>{" "}
        (static, OpenSky). The provider chooses real vs. approximate flight
        positions.
      </p>
    </ShellFootnote>
  );
}
