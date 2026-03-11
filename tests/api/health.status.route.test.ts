import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/status/route";

describe("GET /api/health/status", () => {
  it("returns healthy status payload", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.service).toBe("mission-control");
    expect(typeof body.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
