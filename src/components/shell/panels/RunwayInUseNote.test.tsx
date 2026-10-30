import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunwayInUseNote } from "./RunwayInUseNote";

const base = { aircraft04: 0, aircraft22: 0, lastSeenMs: 1 };

describe("RunwayInUseNote", () => {
  it("names the plan line that applies to runway 04", () => {
    const html = renderToStaticMarkup(<RunwayInUseNote status={{ ...base, runway: "04", aircraft04: 7 }} />);
    expect(html).toContain("Runway 04 in use now.");
    expect(html).toContain("7 aircraft");
    expect(html).toContain("Landing 04 line applies");
  });

  it("names the plan line that applies to runway 22", () => {
    const html = renderToStaticMarkup(<RunwayInUseNote status={{ ...base, runway: "22", aircraft22: 3 }} />);
    expect(html).toContain("3 aircraft");
    expect(html).toContain("Departure 22 line applies");
  });

  it("says so when the last hour does not settle it", () => {
    const html = renderToStaticMarkup(<RunwayInUseNote status={{ ...base, runway: null, aircraft04: 1 }} />);
    expect(html).toContain("unclear");
  });

  it("renders nothing before the first answer", () => {
    expect(renderToStaticMarkup(<RunwayInUseNote status={null} />)).toBe("");
  });
});
