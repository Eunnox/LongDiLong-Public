import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("sdk session handling", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    process.env.VITE_APP_ID = "test-app";
    vi.resetModules();
  });

  it("accepts sessions even when the user name is empty", async () => {
    const { SDKServer } = await import("./_core/sdk");
    const sdk = new SDKServer(
      axios.create({
        baseURL: "https://example.com",
      })
    );

    const token = await sdk.createSessionToken("user-without-name", {
      name: "",
    });
    const session = await sdk.verifySession(token);

    expect(session).toMatchObject({
      openId: "user-without-name",
      appId: "test-app",
      name: "",
    });
  });
});
