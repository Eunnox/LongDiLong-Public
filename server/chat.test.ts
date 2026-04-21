import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getMessagesByUserId: vi.fn().mockResolvedValue([]),
  insertMessage: vi.fn().mockResolvedValue({ insertId: 1 }),
  getUserSettings: vi.fn().mockResolvedValue(null),
  upsertUserSettings: vi.fn().mockResolvedValue(undefined),
  setFirstMessageAt: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock LLM ─────────────────────────────────────────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "테스트 AI 답장이에요 💕" } }],
  }),
}));

import { appRouter } from "./routers";
import * as db from "./db";

// ─── Auth context helper ──────────────────────────────────────────────────────
function makeCtx(overrides: Partial<TrpcContext["user"]> = {}): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "test-user",
      email: "test@example.com",
      name: "테스트 유저",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("chat.getSettings", () => {
  it("returns null when no settings exist", async () => {
    vi.mocked(db.getUserSettings).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.getSettings();
    expect(result).toBeNull();
  });

  it("returns settings when they exist", async () => {
    const mockSettings = {
      id: 1,
      userId: 42,
      partnerName: "지수",
      speakingStyle: "귀엽고 장난스러운 말투",
      firstMessageAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(db.getUserSettings).mockResolvedValueOnce(mockSettings);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.getSettings();
    expect(result?.partnerName).toBe("지수");
    expect(result?.speakingStyle).toBe("귀엽고 장난스러운 말투");
  });
});

describe("chat.saveSettings", () => {
  it("saves partner name and speaking style", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.saveSettings({
      partnerName: "민준",
      speakingStyle: "따뜻하고 감성적인 말투",
    });
    expect(result.success).toBe(true);
    expect(db.upsertUserSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        partnerName: "민준",
        speakingStyle: "따뜻하고 감성적인 말투",
      })
    );
  });

  it("rejects empty partner name", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.chat.saveSettings({ partnerName: "", speakingStyle: "" })
    ).rejects.toThrow();
  });
});

describe("chat.getMessages", () => {
  it("returns empty array when no messages", async () => {
    vi.mocked(db.getMessagesByUserId).mockResolvedValueOnce([]);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.getMessages();
    expect(result).toEqual([]);
  });

  it("returns messages for the user", async () => {
    const mockMessages = [
      {
        id: 1,
        userId: 42,
        role: "user" as const,
        content: "안녕!",
        messageType: "text" as const,
        createdAt: new Date(),
      },
      {
        id: 2,
        userId: 42,
        role: "assistant" as const,
        content: "안녕~ 보고 싶었어 💕",
        messageType: "text" as const,
        createdAt: new Date(),
      },
    ];
    vi.mocked(db.getMessagesByUserId).mockResolvedValueOnce(mockMessages);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.getMessages();
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("안녕!");
    expect(result[1].role).toBe("assistant");
  });
});

describe("chat.sendMessage - saves messages to DB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getMessagesByUserId).mockResolvedValue([]);
    vi.mocked(db.insertMessage).mockResolvedValue({ insertId: 1 } as any);
    vi.mocked(db.getUserSettings).mockResolvedValue(null);
  });

  it("saves user message to DB with correct role", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await caller.chat.sendMessage({ content: "오늘 뭐 해?", messageType: "text" });
    expect(db.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        role: "user",
        content: "오늘 뭐 해?",
        messageType: "text",
      })
    );
  });

  it("saves AI reply to DB with assistant role", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await caller.chat.sendMessage({ content: "보고싶어", messageType: "text" });
    const calls = vi.mocked(db.insertMessage).mock.calls;
    const assistantCall = calls.find((c) => c[0].role === "assistant");
    expect(assistantCall).toBeDefined();
    expect(assistantCall![0].content).toBe("테스트 AI 답장이에요 💕");
  });

  it("AI reply createdAt is in the future (scheduled)", async () => {
    const before = new Date();
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.sendMessage({ content: "잘 자", messageType: "text" });
    expect(new Date(result.replyAt).getTime()).toBeGreaterThan(before.getTime());
  });
});

describe("chat.sendMessage - reply timing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.getMessagesByUserId).mockResolvedValue([]);
    vi.mocked(db.insertMessage).mockResolvedValue({ insertId: 1 } as any);
  });

  it("uses 3-minute delay when no firstMessageAt (first message ever)", async () => {
    vi.mocked(db.getUserSettings).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.sendMessage({ content: "안녕!", messageType: "text" });
    // 3 minutes = 180000ms
    expect(result.delayMs).toBe(180000);
    expect(db.setFirstMessageAt).toHaveBeenCalledWith(42, expect.any(Date));
  });

  it("uses 3-minute delay within first week", async () => {
    const recentFirst = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    vi.mocked(db.getUserSettings).mockResolvedValueOnce({
      id: 1,
      userId: 42,
      partnerName: "지수",
      speakingStyle: "",
      firstMessageAt: recentFirst,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.sendMessage({ content: "잘 잤어?", messageType: "text" });
    expect(result.delayMs).toBe(180000);
  });

  it("uses random delay (1s–30min) after first week", async () => {
    const oldFirst = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
    vi.mocked(db.getUserSettings).mockResolvedValueOnce({
      id: 1,
      userId: 42,
      partnerName: "지수",
      speakingStyle: "",
      firstMessageAt: oldFirst,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.chat.sendMessage({ content: "오늘 뭐 했어?", messageType: "text" });
    expect(result.delayMs).toBeGreaterThanOrEqual(1000);
    expect(result.delayMs).toBeLessThanOrEqual(30 * 60 * 1000);
  });
});
