import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Heart, KeyRound, Sparkles } from "lucide-react";

interface OnboardingProps {
  onComplete: () => void;
}

type Mode = "create" | "join";

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { user, logout } = useAuth();
  const [mode, setMode] = useState<Mode>("create");
  const [botName, setBotName] = useState("");
  const [identityPrompt, setIdentityPrompt] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const createProfile = trpc.bot.createProfile.useMutation({
    onSuccess: () => {
      onComplete();
    },
  });

  const joinByCode = trpc.bot.joinByCode.useMutation({
    onSuccess: () => {
      onComplete();
    },
  });

  const isSubmitting = createProfile.isPending || joinByCode.isPending;
  const errorMessage = createProfile.error?.message ?? joinByCode.error?.message ?? "";

  const handleInviteCodeChange = (value: string) => {
    setInviteCode(value.toUpperCase().replace(/\s+/g, ""));
  };

  const handleJoinCodeChange = (value: string) => {
    setJoinCode(value.toUpperCase().replace(/\s+/g, ""));
  };

  const handleCreate = async () => {
    if (!botName.trim() || !identityPrompt.trim() || !inviteCode.trim()) return;
    await createProfile.mutateAsync({
      botName: botName.trim(),
      identityPrompt: identityPrompt.trim(),
      inviteCode: inviteCode.trim(),
    });
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    await joinByCode.mutateAsync({
      inviteCode: joinCode.trim(),
    });
  };

  const handleRelogin = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      await logout();
      window.location.href = "/";
    } catch (error) {
      console.error(error);
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#121212] px-6 py-8 sm:py-10">
      <div className="flex min-h-[500px] w-full max-w-sm flex-col rounded-[30px] border border-white/10 bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <div className="mb-6">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setMode("create")}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                mode === "create"
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-500"
              }`}
            >
              챗봇 만들기
            </button>
            <button
              type="button"
              onClick={() => setMode("join")}
              className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                mode === "join"
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-500"
              }`}
            >
              코드 입력
            </button>
          </div>
        </div>

        {mode === "create" ? (
          <div className="flex flex-1 flex-col justify-between">
            <div className="space-y-4">
              <div className="mb-5">
                <h2 className="mb-1 text-lg font-bold text-gray-800">
                  챗봇의 아이덴티티를 만들어 주세요
                </h2>
                <p className="text-sm text-gray-500">
                  연인에게 전할 마음을 챗봇으로 담아보세요.
                </p>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="챗봇 이름 예: 밤편지, 자기봇"
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-gray-50"
                  maxLength={30}
                />

                <textarea
                  placeholder="이 챗봇이 어떤 마음으로 말해주면 좋을지 적어주세요. 예: 내가 직접 말하는 것처럼 다정하고 솔직하게, 보고 싶다는 표현을 자주 해 줘."
                  value={identityPrompt}
                  onChange={(e) => setIdentityPrompt(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-gray-50 resize-none"
                  rows={5}
                  maxLength={1000}
                />

                <input
                  type="text"
                  placeholder="연인에게 보낼 코드(비번) 입력"
                  value={inviteCode}
                  onChange={(e) => handleInviteCodeChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-gray-50"
                  maxLength={32}
                />
              </div>

              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-sm font-medium text-gray-800">코드 작성 안내</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  짧고 기억하기 쉬운 영문/숫자 조합을 추천해요.
                  <br />
                  대소문자는 자동으로 맞춰지고, 이미 같은 코드는 만들 수 없어요.
                </p>
              </div>
            </div>

            {errorMessage ? (
              <p className="mt-4 text-sm text-red-500 leading-relaxed">{errorMessage}</p>
            ) : null}

            <button
              type="button"
              onClick={handleCreate}
              disabled={!botName.trim() || !identityPrompt.trim() || !inviteCode.trim() || isSubmitting}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 font-bold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {isSubmitting ? "만드는 중..." : "챗봇 만들기"}
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-between">
            <div className="space-y-4">
              <div className="mb-5">
                <h2 className="mb-1 text-lg font-bold text-gray-800">
                  연인이 공유한 코드를 입력해 주세요
                </h2>
                <p className="text-sm text-gray-500">
                  코드를 입력하면 바로 대화를 시작할 수 있어요.
                </p>
              </div>

              <input
                type="text"
                placeholder="초대 코드 입력"
                value={joinCode}
                onChange={(e) => handleJoinCodeChange(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-gray-50"
                maxLength={32}
              />

              <div className="rounded-2xl bg-gray-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <Heart className="mt-0.5 h-4 w-4 shrink-0 fill-pink-400 text-pink-400" />
                  <p className="text-xs leading-relaxed text-gray-500">
                    코드는 대소문자 구분 없이 확인돼요. 공백 없이 그대로 입력하면 됩니다.
                  </p>
                </div>
              </div>
            </div>

            {errorMessage ? (
              <p className="mt-4 text-sm text-red-500 leading-relaxed">{errorMessage}</p>
            ) : null}

            <button
              type="button"
              onClick={handleJoin}
              disabled={!joinCode.trim() || isSubmitting}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 font-bold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              {isSubmitting ? "연결 중..." : "챗봇 입장하기"}
            </button>
          </div>
        )}
      </div>

      {user ? (
        <button
          type="button"
          onClick={handleRelogin}
          disabled={isLoggingOut}
          className="mt-5 text-sm text-gray-400 underline-offset-4 transition hover:text-gray-200 hover:underline disabled:opacity-50"
        >
          {isLoggingOut ? "로그아웃 중..." : "다른 계정으로 로그인"}
        </button>
      ) : null}
    </div>
  );
}
