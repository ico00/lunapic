type SidebarSyncFooterProps = {
  onSyncTime: () => void;
};

export function SidebarSyncFooter({ onSyncTime }: SidebarSyncFooterProps) {
  return (
    <>
      <button
        type="button"
        onClick={onSyncTime}
        className="mt-4 w-full rounded border border-zinc-700 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-white"
      >
        Sync time
      </button>
      <p className="mt-2 text-xs leading-relaxed text-zinc-600">
        Fixed observer: marker 📷. Map routes from{" "}
        <code className="mx-0.5 font-mono text-zinc-500">routes.json</code>{" "}
        (static, OpenSky). The provider chooses real vs. approximate flight
        positions.
      </p>
    </>
  );
}
