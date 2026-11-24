import { describe, expect, it } from "vitest";
import { uploadFailureKind } from "./uploadFailureKind";

describe("uploadFailureKind", () => {
  it("treats timeouts and dropped transfers as a slow network (2026-11-18 records)", () => {
    expect(
      uploadFailureKind("POST nije uspio: curl: (28) Connection timed out after 20001 milliseconds")
    ).toBe("slow-network");
    expect(
      uploadFailureKind(
        "POST nije uspio: curl: (56) OpenSSL SSL_read: OpenSSL/3.5.5: error:0A000126:SSL routines::unexpected eof while reading, errno 0"
      )
    ).toBe("slow-network");
  });

  it("separates a refused connection and a server rejection", () => {
    expect(
      uploadFailureKind("POST nije uspio: curl: (7) Failed to connect to drusany.com port 443 after 125 ms")
    ).toBe("no-connection");
    expect(uploadFailureKind("ingest odbio snapshot: HTTP 503 — Service Unavailable")).toBe(
      "server-error"
    );
  });

  it("falls back to unknown", () => {
    expect(uploadFailureKind(null)).toBe("unknown");
    expect(uploadFailureKind("nešto drugo")).toBe("unknown");
    expect(uploadFailureKind("POST nije uspio: curl: (60) SSL certificate problem")).toBe("unknown");
  });
});
