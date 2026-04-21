import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  BellRing,
  Copy,
  Heart,
  KeyRound,
  LogOut,
  RotateCcw,
  Save,
  Send,
  Sparkles,
} from "lucide-react";

type PreviewMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
};

const PREVIEW_EXAMPLES = [
  "오늘 유난히 보고 싶어",
  "지금 많이 지쳤어. 한마디만 해줘",
  "잘 자기 전에 다정하게 말해줘",
];

const PROMPT_TEMPLATES = [
  {
    label: "다정한 연인",
    value:
      "내가 직접 말하는 것처럼 다정하고 따뜻하게 말해줘. 보고 싶다는 표현과 안심시키는 말을 자주 해주고, 부담스럽지 않게 자연스럽게 애정을 전해줘.",
  },
  {
    label: "장난기 있는 연인",
    value:
      "친한 연인처럼 장난기 있고 귀엽게 말해줘. 가끔은 가볍게 놀리되, 상대가 지쳐 있거나 힘들어 보이면 바로 다정하게 감싸주는 톤으로 답해줘.",
  },
  {
    label: "차분한 위로형",
    value:
      "감정이 흔들릴 때 조용히 옆에서 안아주는 사람처럼 말해줘. 과하게 들뜨지 않고 차분하고 진심 어린 문장으로 위로해주고, 안정감을 주는 표현을 사용해줘.",
  },
  {
    label: "애교 많은 연인",
    value:
      "귀엽고 애교 있는 연인처럼 말해줘. 사랑스럽고 말랑한 표현을 자주 쓰되, 너무 과하지 않게 실제 연인과 대화하는 느낌으로 자연스럽게 답해줘.",
  },
  {
    label: "든든한 응원형",
    value:
      "상대를 믿고 응원해 주는 든든한 연인처럼 말해줘. 불안할 때는 안정감을 주고, 중요한 순간에는 용기를 북돋아 주는 문장으로 답해줘.",
  },
];

const SHARE_MESSAGE_VARIANTS = [
  {
    label: "기본형",
    build: (code: string) =>
      `내가 만든 롱디롱 챗봇이야.\n코드 ${code} 를 입력하면 바로 대화할 수 있어 :)`,
  },
  {
    label: "다정형",
    build: (code: string) =>
      `너 생각하면서 챗봇 하나 만들었어.\n롱디롱에서 코드 ${code} 입력하면 바로 만날 수 있어. 천천히 들어와줘 :)`,
  },
  {
    label: "짧은형",
    build: (code: string) =>
      `롱디롱 코드 ${code}\n입력하면 내가 만든 챗봇이랑 바로 대화할 수 있어!`,
  },
];

function formatPreviewTime(date: Date) {
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const period = hours < 12 ? "오전" : "오후";
  const normalizedHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${period} ${normalizedHour}:${minutes}`;
}

export default function OwnerDashboard() {
  const { logout } = useAuth();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.bot.getOwnerDashboard.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const [botNameDraft, setBotNameDraft] = useState("");
  const [identityPromptDraft, setIdentityPromptDraft] = useState("");
  const [previewInput, setPreviewInput] = useState("");
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([]);
  const [saveFeedback, setSaveFeedback] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [shareFeedback, setShareFeedback] = useState("");
  const [selectedShareVariant, setSelectedShareVariant] = useState(
    SHARE_MESSAGE_VARIANTS[0].label
  );
  const previewEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data) return;
    setBotNameDraft(data.botProfile.botName);
    setIdentityPromptDraft(data.botProfile.identityPrompt ?? "");
  }, [data]);

  useEffect(() => {
    previewEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [previewMessages]);

  useEffect(() => {
    if (!saveFeedback) return;

    const timer = window.setTimeout(() => {
      setSaveFeedback("");
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [saveFeedback]);

  useEffect(() => {
    if (!copyFeedback) return;

    const timer = window.setTimeout(() => {
      setCopyFeedback("");
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [copyFeedback]);

  useEffect(() => {
    if (!shareFeedback) return;

    const timer = window.setTimeout(() => {
      setShareFeedback("");
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [shareFeedback]);

  const markRead = trpc.bot.markNotificationsRead.useMutation({
    onSuccess: async () => {
      await utils.bot.getOwnerDashboard.invalidate();
    },
  });

  const updateProfile = trpc.bot.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.bot.getOwnerDashboard.invalidate();
      setSaveFeedback("프롬프트를 저장했어요.");
    },
  });

  const previewReply = trpc.bot.previewReply.useMutation({
    onSuccess: (result, variables) => {
      const now = new Date();
      setPreviewMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "user",
          content: variables.message,
          createdAt: now,
        },
        {
          id: Date.now() + 1,
          role: "assistant",
          content: result.reply,
          createdAt: new Date(),
        },
      ]);
      setPreviewInput("");
    },
  });

  const handleLogout = async () => {
    await logout();
    window.location.href = "/";
  };

  const handleSaveProfile = async () => {
    if (!botNameDraft.trim() || !identityPromptDraft.trim()) return;

    await updateProfile.mutateAsync({
      botName: botNameDraft.trim(),
      identityPrompt: identityPromptDraft.trim(),
    });
  };

  const handlePreviewSend = async () => {
    if (!botNameDraft.trim() || !identityPromptDraft.trim() || !previewInput.trim()) return;

    await previewReply.mutateAsync({
      botName: botNameDraft.trim(),
      identityPrompt: identityPromptDraft.trim(),
      message: previewInput.trim(),
      history: previewMessages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });
  };

  const handlePreviewExample = (message: string) => {
    setPreviewInput(message);
  };

  const handleApplyTemplate = (template: string) => {
    setIdentityPromptDraft(template);
  };

  const handleResetDrafts = () => {
    if (!data) return;
    setBotNameDraft(data.botProfile.botName);
    setIdentityPromptDraft(data.botProfile.identityPrompt ?? "");
    setSaveFeedback("저장된 프롬프트로 되돌렸어요.");
  };

  const handleCopyInviteCode = async () => {
    if (!data) return;

    try {
      await navigator.clipboard.writeText(data.botProfile.inviteCode);
      setCopyFeedback("코드를 복사했어요.");
    } catch (error) {
      console.error(error);
      setCopyFeedback("복사에 실패했어요. 다시 시도해 주세요.");
    }
  };

  const selectedShareTemplate =
    SHARE_MESSAGE_VARIANTS.find((variant) => variant.label === selectedShareVariant) ??
    SHARE_MESSAGE_VARIANTS[0];
  const shareMessage = selectedShareTemplate.build(data?.botProfile.inviteCode ?? "");

  const handleCopyShareMessage = async () => {
    if (!data) return;

    try {
      await navigator.clipboard.writeText(shareMessage);
      setShareFeedback("공유 문구를 복사했어요.");
    } catch (error) {
      console.error(error);
      setShareFeedback("공유 문구 복사에 실패했어요.");
    }
  };

  const handlePreviewKeyDown = async (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await handlePreviewSend();
    }
  };

  const isSaveDisabled =
    !data ||
    !botNameDraft.trim() ||
    !identityPromptDraft.trim() ||
    (botNameDraft.trim() === data.botProfile.botName &&
      identityPromptDraft.trim() === (data.botProfile.identityPrompt ?? ""));

  if (isLoading || !data) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#121212] px-6 text-white">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#121212] px-6 py-10 text-white">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.22em] text-gray-500">
              OWNER DASHBOARD
            </p>
            <h1 className="mt-1 text-3xl font-bold">{data.botProfile.botName}</h1>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white p-6 text-gray-900 shadow-xl">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-bold">챗봇 다듬기</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            공유 전에 이름과 프롬프트를 수정하고, 아래 테스트 대화로 반응을 먼저 확인해 보세요.
          </p>

          <div className="mt-5 space-y-3">
            <input
              type="text"
              value={botNameDraft}
              onChange={(e) => setBotNameDraft(e.target.value)}
              placeholder="챗봇 이름"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-yellow-400"
              maxLength={30}
            />

            <textarea
              value={identityPromptDraft}
              onChange={(e) => setIdentityPromptDraft(e.target.value)}
              placeholder="이 챗봇이 어떤 마음으로 말해주면 좋을지 적어주세요."
              className="min-h-[140px] w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-yellow-400"
              maxLength={1000}
            />

            <div className="flex flex-wrap gap-2">
              {PROMPT_TEMPLATES.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => handleApplyTemplate(template.value)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleResetDrafts}
              disabled={!data || updateProfile.isPending}
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              되돌리기
            </button>

            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={isSaveDisabled || updateProfile.isPending}
              className="inline-flex items-center gap-2 rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {updateProfile.isPending ? "저장 중..." : "프롬프트 저장"}
            </button>

            {saveFeedback ? (
              <p className="text-sm font-medium text-emerald-600">{saveFeedback}</p>
            ) : null}
          </div>

          {updateProfile.error ? (
            <p className="mt-3 text-sm text-red-500">{updateProfile.error.message}</p>
          ) : null}
        </div>

        <div className="rounded-3xl border border-white/10 bg-white p-6 text-gray-900 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">챗봇 테스트</h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-500">
                실제 공유 전, 지금 프롬프트로 답변 톤을 바로 확인할 수 있어요.
              </p>
            </div>
            {previewMessages.length > 0 ? (
              <button
                type="button"
                onClick={() => setPreviewMessages([])}
                className="text-sm text-gray-500 underline-offset-4 hover:underline"
              >
                테스트 초기화
              </button>
            ) : null}
          </div>

          <div className="mt-5 overflow-hidden rounded-[28px] border border-gray-100 shadow-inner">
            <div className="chat-header flex items-center gap-3 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-300 to-rose-400 text-sm font-bold text-white">
                {botNameDraft.trim().charAt(0) || "롱"}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {botNameDraft.trim() || "테스트 챗봇"}
                </p>
                <p className="text-xs text-gray-500">공유 전 미리보기 채팅</p>
              </div>
            </div>

            <div className="chat-bg min-h-[260px] px-4 py-4">
              {previewMessages.length === 0 ? (
                <div className="flex min-h-[228px] flex-col items-center justify-center text-center">
                  <p className="text-sm leading-relaxed text-gray-700">
                    챗봇에게 말을 걸어 보세요.
                    <br />
                    답변이 원하는 느낌인지 확인한 뒤 저장하면 돼요.
                  </p>

                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {PREVIEW_EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => handlePreviewExample(example)}
                        className="rounded-full bg-white/90 px-3 py-2 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-white"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {previewMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {message.role === "user" ? (
                        <div className="max-w-[80%]">
                          <div className="bubble-me px-4 py-3 text-sm leading-relaxed text-gray-900">
                            {message.content}
                          </div>
                          <p className="mt-1 px-1 text-right text-[11px] text-gray-500">
                            {formatPreviewTime(message.createdAt)}
                          </p>
                        </div>
                      ) : (
                        <div className="max-w-[80%]">
                          <p className="mb-1 px-1 text-xs font-medium text-gray-700">
                            {botNameDraft.trim() || "테스트 챗봇"}
                          </p>
                          <div className="bubble-other px-4 py-3 text-sm leading-relaxed text-gray-900">
                            {message.content}
                          </div>
                          <p className="mt-1 px-1 text-[11px] text-gray-500">
                            {formatPreviewTime(message.createdAt)}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={previewEndRef} />
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {PREVIEW_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handlePreviewExample(example)}
                className="rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
              >
                {example}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
            <textarea
              value={previewInput}
              onChange={(e) => setPreviewInput(e.target.value)}
              onKeyDown={handlePreviewKeyDown}
              placeholder="예: 오늘 유난히 보고 싶어 라고 보내면 어떻게 답할지 테스트해 보세요."
              className="min-h-[88px] flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-yellow-400"
              maxLength={2000}
            />
            <button
              type="button"
              onClick={handlePreviewSend}
              disabled={
                !botNameDraft.trim() ||
                !identityPromptDraft.trim() ||
                !previewInput.trim() ||
                previewReply.isPending
              }
              className="inline-flex h-[56px] items-center justify-center rounded-2xl bg-gray-900 px-5 text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 sm:h-[88px]"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>

          {previewReply.error ? (
            <p className="mt-3 text-sm text-red-500">{previewReply.error.message}</p>
          ) : null}

          <p className="mt-3 text-xs leading-relaxed text-gray-400">
            이 테스트 대화는 미리보기용이라 실제 채팅에는 저장되지 않고, 새로고침하면 초기화돼요.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white p-6 text-gray-900 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <KeyRound className="h-4 w-4" />
              연인에게 공유할 코드
            </div>
            <button
              type="button"
              onClick={handleCopyInviteCode}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
            >
              <Copy className="h-3.5 w-3.5" />
              복사
            </button>
          </div>
          <div className="mt-3 rounded-2xl bg-gray-50 px-4 py-4 text-center text-2xl font-bold tracking-[0.2em]">
            {data.botProfile.inviteCode}
          </div>
          <p className="mt-3 text-sm text-gray-500 leading-relaxed">
            이 코드를 연인에게 보내면, 연인은 이 챗봇과 대화를 시작할 수 있어요.
          </p>
          {copyFeedback ? (
            <p className="mt-3 text-sm font-medium text-emerald-600">{copyFeedback}</p>
          ) : null}

          <div className="mt-5 rounded-2xl bg-gray-50 p-4">
            <div className="flex flex-wrap gap-2">
              {SHARE_MESSAGE_VARIANTS.map((variant) => (
                <button
                  key={variant.label}
                  type="button"
                  onClick={() => setSelectedShareVariant(variant.label)}
                  className={`rounded-full px-3 py-2 text-xs font-medium transition ${
                    selectedShareVariant === variant.label
                      ? "bg-gray-900 text-white"
                      : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {variant.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-800">공유용 문구</p>
              <button
                type="button"
                onClick={handleCopyShareMessage}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
              >
                <Copy className="h-3.5 w-3.5" />
                문구 복사
              </button>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">
              {shareMessage}
            </p>
            {shareFeedback ? (
              <p className="mt-3 text-sm font-medium text-emerald-600">{shareFeedback}</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white p-6 text-gray-900 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">현재 연결 상태</p>
              <p className="mt-1 text-lg font-semibold">
                {data.botProfile.partnerUserId ? "연인이 연결되어 있어요" : "아직 연결 전이에요"}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-2 text-xs font-medium text-pink-600">
              <Heart className="h-4 w-4 fill-pink-400 text-pink-400" />
              {data.botProfile.partnerUserId ? "연결됨" : "대기 중"}
            </div>
          </div>
          <p className="mt-3 text-sm text-gray-500 leading-relaxed">
            채팅 내용은 볼 수 없고, 연인이 고양이 버튼을 눌렀을 때만 알림을 받을 수 있어요.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white p-6 text-gray-900 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-bold">고양이 알림</h2>
            </div>
            {data.unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => markRead.mutate()}
                disabled={markRead.isPending}
                className="text-sm text-gray-500 underline-offset-4 hover:underline disabled:opacity-50"
              >
                모두 읽음 처리
              </button>
            ) : null}
          </div>

          {data.notifications.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">아직 도착한 알림이 없어요.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {data.notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`rounded-2xl px-4 py-3 ${
                    notification.readAt ? "bg-gray-50" : "bg-amber-50"
                  }`}
                >
                  <p className="text-sm font-medium text-gray-800">
                    연인이 고양이 버튼으로 신호를 보냈어요
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(notification.createdAt).toLocaleString("ko-KR")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
