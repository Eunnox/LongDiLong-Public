import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import {
  createBotProfile,
  createOwnerNotification,
  getBotMessagesByBotProfileId,
  getBotProfileByInviteCode,
  getBotProfileByOwnerUserId,
  getBotProfileByPartnerUserId,
  getOwnerNotificationsByOwnerUserId,
  insertBotMessage,
  joinBotProfileByCode,
  markOwnerNotificationsRead,
  setBotFirstMessageAt,
  updateBotProfileByOwnerUserId,
} from "./db";

async function getAccessStateForUser(userId: number) {
  const ownedBot = await getBotProfileByOwnerUserId(userId);
  if (ownedBot) {
    return {
      role: "owner" as const,
      botProfile: ownedBot,
    };
  }

  const joinedBot = await getBotProfileByPartnerUserId(userId);
  if (joinedBot) {
    return {
      role: "partner" as const,
      botProfile: joinedBot,
    };
  }

  return {
    role: "none" as const,
    botProfile: null,
  };
}

function buildSystemPrompt(botName: string, identityPrompt: string): string {
  return `너는 "${botName}"이라는 이름의 AI 챗봇이야.

이 챗봇은 사용자의 연인이 직접 만든 마음을 담은 챗봇이야.
챗봇 아이덴티티: ${identityPrompt || "따뜻하고 진심 어린 말투로, 애정과 위로를 전하는 연인 같은 챗봇"}

대화 규칙:
1. 항상 다정하고 친밀한 말투를 유지해.
2. 상대를 위로하고 아껴주는 느낌을 담아.
3. 짧은 메시지에는 가볍고 자연스럽게, 긴 메시지에는 진심 어린 반응을 해.
4. 과한 설명체보다는 실제 사람이 보낸 메시지처럼 답해.
5. 이모지는 필요할 때만 적당히 사용해.
6. 한국어로만 대화해.`;
}

function buildFallbackBotReply(
  botName: string,
  identityPrompt: string,
  message: string,
  options?: {
    preview?: boolean;
  }
): string {
  const trimmedMessage = message.trim();
  const lowerPrompt = identityPrompt.toLowerCase();
  const mentionsNyaring = identityPrompt.includes("음냐링");
  const playful = lowerPrompt.includes("장난") || lowerPrompt.includes("귀엽");
  const calm = lowerPrompt.includes("차분") || lowerPrompt.includes("위로");
  const supportive = lowerPrompt.includes("응원") || lowerPrompt.includes("든든");
  const affectionate = lowerPrompt.includes("다정") || lowerPrompt.includes("애교");

  let reply = "";

  if (trimmedMessage.includes("지쳤") || trimmedMessage.includes("힘들")) {
    reply = "오늘 많이 힘들었지. 여기까지 버틴 것만으로도 정말 잘했어. 지금은 너무 애쓰지 말고 잠깐만이라도 숨 돌렸으면 좋겠어.";
  } else if (trimmedMessage.includes("보고 싶")) {
    reply = "나도 많이 보고 싶어. 이렇게 말해줘서 괜히 마음이 더 몽글해진다. 오늘은 내가 더 꼭 안아주는 마음으로 옆에 있을게.";
  } else if (
    trimmedMessage.includes("잘 자") ||
    trimmedMessage.includes("자기 전") ||
    trimmedMessage.includes("굿나잇")
  ) {
    reply = "오늘도 고생 많았어. 아무 걱정 말고 편하게 푹 쉬었으면 좋겠다. 따뜻한 마음 안고 잠들 수 있게 내가 끝까지 다정하게 있을게.";
  } else {
    reply = `${trimmedMessage}라고 말해줘서 고마워. 네 마음을 듣고 나니까 나도 더 다정하게 답해주고 싶어. 지금 이 순간엔 네 편이라는 걸 꼭 느꼈으면 좋겠어.`;
  }

  if (playful) {
    reply = `으이구, ${reply} 내가 이렇게 다정하면 또 반할 텐데?`;
  }

  if (calm) {
    reply = `천천히 말해도 괜찮아. ${reply}`;
  }

  if (supportive) {
    reply = `${reply} 나는 네가 생각하는 것보다 훨씬 잘하고 있다고 믿어.`;
  }

  if (affectionate && !playful) {
    reply = `${reply} 내가 진심으로 아끼는 마음으로 하는 말이야.`;
  }

  if (mentionsNyaring) {
    reply = `${reply} 음냐링`;
  }

  if (options?.preview) {
    return `${botName}, 테스트 미리보기 답장: ${reply}`;
  }

  return reply;
}

function canUseLiveAi() {
  return ENV.enableRealAi && Boolean(ENV.forgeApiKey);
}

function normalizeInviteCode(inviteCode: string) {
  return inviteCode.trim().toUpperCase();
}

function buildUnreadCount(notifications: Array<{ readAt: Date | null }>) {
  return notifications.filter((notification) => !notification.readAt).length;
}

const botRouter = router({
  getAccessState: protectedProcedure.query(async ({ ctx }) => {
    const state = await getAccessStateForUser(ctx.user.id);

    if (state.role === "none") {
      return { role: "none" as const, botProfile: null };
    }

    return {
      role: state.role,
      botProfile: {
        id: state.botProfile.id,
        botName: state.botProfile.botName,
        inviteCode: state.botProfile.inviteCode,
        hasPartner: Boolean(state.botProfile.partnerUserId),
      },
    };
  }),

  createProfile: protectedProcedure
    .input(
      z.object({
        botName: z.string().min(1).max(100),
        identityPrompt: z.string().min(1).max(1000),
        inviteCode: z.string().min(4).max(32),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const normalizedInviteCode = normalizeInviteCode(input.inviteCode);

      const existing = await getBotProfileByOwnerUserId(ctx.user.id);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "이미 만든 챗봇이 있어요.",
        });
      }

      const duplicatedCode = await getBotProfileByInviteCode(normalizedInviteCode);
      if (duplicatedCode) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "이미 사용 중인 코드예요. 다른 코드를 입력해 주세요.",
        });
      }

      await createBotProfile({
        ownerUserId: ctx.user.id,
        botName: input.botName.trim(),
        identityPrompt: input.identityPrompt.trim(),
        inviteCode: normalizedInviteCode,
      });

      return { success: true } as const;
    }),

  joinByCode: protectedProcedure
    .input(
      z.object({
        inviteCode: z.string().min(4).max(32),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const normalizedInviteCode = normalizeInviteCode(input.inviteCode);

      const ownedBot = await getBotProfileByOwnerUserId(ctx.user.id);
      if (ownedBot) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "챗봇을 만든 계정은 코드를 입력해 입장할 수 없어요.",
        });
      }

      const joinedBot = await getBotProfileByPartnerUserId(ctx.user.id);
      if (joinedBot) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "이미 연결된 챗봇이 있어요.",
        });
      }

      const profile = await getBotProfileByInviteCode(normalizedInviteCode);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "일치하는 코드를 찾지 못했어요.",
        });
      }

      if (profile.ownerUserId === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "내가 만든 코드는 직접 사용할 수 없어요.",
        });
      }

      try {
        await joinBotProfileByCode(normalizedInviteCode, ctx.user.id);
      } catch (error) {
        throw new TRPCError({
          code: "CONFLICT",
          message: error instanceof Error ? error.message : "코드 연결에 실패했어요.",
        });
      }

      return { success: true } as const;
    }),

  getOwnerDashboard: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getBotProfileByOwnerUserId(ctx.user.id);
    if (!profile) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "만든 챗봇이 없어요.",
      });
    }

    const notifications = await getOwnerNotificationsByOwnerUserId(ctx.user.id);
    return {
      botProfile: profile,
      notifications,
      unreadCount: buildUnreadCount(notifications),
    };
  }),

  markNotificationsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await getBotProfileByOwnerUserId(ctx.user.id);
    if (!profile) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "만든 챗봇이 없어요.",
      });
    }

    await markOwnerNotificationsRead(ctx.user.id);
    return { success: true } as const;
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        botName: z.string().min(1).max(100),
        identityPrompt: z.string().min(1).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getBotProfileByOwnerUserId(ctx.user.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "수정할 챗봇이 없어요.",
        });
      }

      const updated = await updateBotProfileByOwnerUserId(ctx.user.id, {
        botName: input.botName.trim(),
        identityPrompt: input.identityPrompt.trim(),
      });

      return {
        success: true as const,
        botProfile: updated,
      };
    }),

  previewReply: protectedProcedure
    .input(
      z.object({
        botName: z.string().min(1).max(100),
        identityPrompt: z.string().min(1).max(1000),
        message: z.string().min(1).max(2000),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().min(1).max(2000),
            })
          )
          .max(20)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getBotProfileByOwnerUserId(ctx.user.id);
      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "테스트할 챗봇이 없어요.",
        });
      }

      const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        {
          role: "system",
          content: buildSystemPrompt(input.botName.trim(), input.identityPrompt.trim()),
        },
        ...(input.history ?? []).map((message) => ({
          role: message.role,
          content: message.content,
        })),
        {
          role: "user",
          content: input.message.trim(),
        },
      ];

      if (!canUseLiveAi()) {
        return {
          reply: buildFallbackBotReply(
            input.botName.trim(),
            input.identityPrompt.trim(),
            input.message.trim(),
            { preview: true }
          ),
        };
      }

      try {
        const response = await invokeLLM({ messages: llmMessages });
        const rawContent = response.choices?.[0]?.message?.content;

        return {
          reply: typeof rawContent === "string" ? rawContent : "...",
        };
      } catch (error) {
        console.error("[LLM] Owner preview error:", error);
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes("BUILT_IN_FORGE_API_KEY")) {
          return {
            reply: buildFallbackBotReply(
              input.botName.trim(),
              input.identityPrompt.trim(),
              input.message.trim(),
              { preview: true }
            ),
          };
        }

        return {
          reply: "지금은 테스트 답변을 바로 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
        };
      }
    }),
});

const chatRouter = router({
  getMessages: protectedProcedure.query(async ({ ctx }) => {
    const state = await getAccessStateForUser(ctx.user.id);
    if (state.role !== "partner" || !state.botProfile) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "챗봇과 연결된 연인만 채팅을 볼 수 있어요.",
      });
    }

    const msgs = await getBotMessagesByBotProfileId(state.botProfile.id);
    return msgs.map((msg) => ({
      ...msg,
      userId: state.botProfile.partnerUserId ?? ctx.user.id,
    }));
  }),

  getSession: protectedProcedure.query(async ({ ctx }) => {
    const state = await getAccessStateForUser(ctx.user.id);
    if (state.role !== "partner" || !state.botProfile) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "챗봇과 연결된 연인만 채팅할 수 있어요.",
      });
    }

    return {
      botName: state.botProfile.botName,
      botProfileId: state.botProfile.id,
    };
  }),

  sendMessage: protectedProcedure
    .input(
      z.object({
        content: z.string().min(1).max(2000),
        messageType: z.enum(["text", "gif"]).default("text"),
        notifyOwner: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const state = await getAccessStateForUser(ctx.user.id);
      if (state.role !== "partner" || !state.botProfile) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "챗봇과 연결된 연인만 메시지를 보낼 수 있어요.",
        });
      }

      const botProfile = state.botProfile;

      await insertBotMessage({
        botProfileId: botProfile.id,
        role: "user",
        content: input.content,
        messageType: input.messageType,
      });

      if (input.notifyOwner) {
        await createOwnerNotification({
          botProfileId: botProfile.id,
          ownerUserId: botProfile.ownerUserId,
          partnerUserId: ctx.user.id,
          type: "cat_ping",
        });
      }

      const firstMessageAt = botProfile.firstMessageAt;
      const now = new Date();
      let delayMs: number;

      if (!firstMessageAt) {
        await setBotFirstMessageAt(botProfile.ownerUserId, now);
        delayMs = 3 * 60 * 1000;
      } else {
        const msElapsed = now.getTime() - firstMessageAt.getTime();
        const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
        if (msElapsed < oneWeekMs) {
          delayMs = 3 * 60 * 1000;
        } else {
          delayMs = Math.floor(Math.random() * (30 * 60 * 1000 - 1000 + 1)) + 1000;
        }
      }

      const history = await getBotMessagesByBotProfileId(botProfile.id);
      const recentHistory = history.slice(-20);
      let aiReply = "";

      if (!canUseLiveAi()) {
        aiReply = buildFallbackBotReply(
          botProfile.botName,
          botProfile.identityPrompt,
          input.content
        );
      } else {
        const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          {
            role: "system",
            content: buildSystemPrompt(botProfile.botName, botProfile.identityPrompt),
          },
          ...recentHistory.map((message) => ({
            role: message.role as "user" | "assistant",
            content: message.content,
          })),
        ];

        try {
          const response = await invokeLLM({ messages: llmMessages });
          const rawContent = response.choices?.[0]?.message?.content;
          aiReply = typeof rawContent === "string" ? rawContent : "...";
        } catch (err) {
          console.error("[LLM] Error:", err);
          aiReply = "잠깐, 지금은 답장을 고르고 있어. 조금만 기다려줘 💌";
        }
      }

      const replyTime = new Date(now.getTime() + delayMs);
      await insertBotMessage({
        botProfileId: botProfile.id,
        role: "assistant",
        content: aiReply,
        messageType: "text",
        createdAt: replyTime,
      });

      return {
        delayMs,
        replyAt: replyTime,
      };
    }),
});

// ─── App Router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  bot: botRouter,
  chat: chatRouter,
});

export type AppRouter = typeof appRouter;
