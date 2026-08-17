import { describe, test, expect } from "vitest";

import { API_BASE, resolveFileUrl } from "./api";

describe("resolveFileUrl", () => {
  test("passes absolute URLs through untouched", () => {
    // Azure Blob storage returns a fully qualified URL.
    const blobUrl = "https://acct.blob.core.windows.net/job-evidence/report_3_1.png";
    expect(resolveFileUrl(blobUrl)).toBe(blobUrl);
    expect(resolveFileUrl("http://example.com/a.png")).toBe("http://example.com/a.png");
  });

  test("passes data and blob URLs through untouched", () => {
    expect(resolveFileUrl("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
    expect(resolveFileUrl("blob:http://localhost:8080/abc")).toBe("blob:http://localhost:8080/abc");
  });

  test("resolves a stored local path against the API base", () => {
    // Local storage returns a path; it has to be resolved against the API rather
    // than the page, since in development they are different origins.
    expect(resolveFileUrl("/uploads/job-evidence/report_3_1.png")).toBe(
      `${API_BASE}/uploads/job-evidence/report_3_1.png`
    );
  });

  test("tolerates a path with no leading slash", () => {
    expect(resolveFileUrl("uploads/x.png")).toBe(`${API_BASE}/uploads/x.png`);
  });

  test("returns an empty string for no value", () => {
    expect(resolveFileUrl("")).toBe("");
  });
});
