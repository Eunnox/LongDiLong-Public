import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import Onboarding from "./Onboarding";
import Chat from "./Chat";
import OwnerDashboard from "./OwnerDashboard";
import loginBg from "@/assets/images/main-emoji.png";
import mainUi from "../assets/images/ldl_main.png";


declare global {

  interface ImportMetaEnv {
    readonly VITE_GOOGLE_CLIENT_ID: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export default function Home() {
  const { user, loading, refresh } = useAuth();
  const [googleLoginState, setGoogleLoginState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [googleLoginMessage, setGoogleLoginMessage] = useState(
    "구글 로그인 버튼을 준비하고 있어요."
  );

  const {
    data: accessState,
    isLoading: accessStateLoading,
    refetch: refetchAccessState,
  } = trpc.bot.getAccessState.useQuery(undefined, {
      enabled: !!user,
      refetchOnWindowFocus: false,
    });

  const handleOnboardingComplete = () => {
    refetchAccessState();
  };

  const handleGoogleLogin = async (response: { credential?: string }) => {
    if (!response?.credential) {
      setGoogleLoginState("error");
      setGoogleLoginMessage("구글 인증 정보를 받지 못했어요. 다시 시도해 주세요.");
      return;
    }

    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          credential: response.credential,
        }),
      });

      let payload: { message?: string; detail?: string } | null = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (!res.ok) {
        throw new Error(
          payload?.detail
            ? `${payload.message || "구글 로그인에 실패했습니다."} (${payload.detail})`
            : payload?.message || "구글 로그인에 실패했습니다."
        );
      }

      await refresh();
    } catch (error) {
      console.error("Google login error:", error);
      setGoogleLoginState("error");
      setGoogleLoginMessage(
        error instanceof Error
          ? error.message
          : "구글 로그인 처리 중 오류가 발생했어요."
      );
    }
  };

  useEffect(() => {
    if (user) return;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const scriptId = "google-gsi-script";
    let cancelled = false;
    let pollTimer: number | undefined;
    let failTimer: number | undefined;
    const errorMessage = new URLSearchParams(window.location.search).get(
      "googleAuthError"
    );

    if (errorMessage) {
      setGoogleLoginState("error");
      setGoogleLoginMessage(errorMessage);
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (!clientId) {
      setGoogleLoginState("error");
      setGoogleLoginMessage("VITE_GOOGLE_CLIENT_ID 설정이 없어 구글 로그인을 표시할 수 없어요.");
      return;
    }

    const initializeGoogleLogin = () => {
      if (cancelled) return true;
      const googleClient = (window as any).google;
      if (!googleClient?.accounts?.id) {
        return false;
      }

      const buttonContainer = document.getElementById("google-login-button");
      if (!buttonContainer) {
        return false;
      }

      buttonContainer.innerHTML = "";

      googleClient.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleLogin,
      });

      googleClient.accounts.id.renderButton(buttonContainer, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "pill",
        width: 260,
      });

      window.setTimeout(() => {
        if (cancelled) return;

        if (buttonContainer.childElementCount === 0) {
          setGoogleLoginState("error");
          setGoogleLoginMessage(
            `현재 주소(${window.location.origin})가 이 Google 클라이언트 ID에 허용되지 않아 구글 로그인 버튼을 표시할 수 없어요.`
          );
          return;
        }

        setGoogleLoginState("ready");
        setGoogleLoginMessage("");
      }, 0);

      return true;
    };

    const schedulePolling = () => {
      pollTimer = window.setInterval(() => {
        if (initializeGoogleLogin()) {
          if (pollTimer) window.clearInterval(pollTimer);
          if (failTimer) window.clearTimeout(failTimer);
        }
      }, 250);

      failTimer = window.setTimeout(() => {
        if (pollTimer) window.clearInterval(pollTimer);
        const buttonContainer = document.getElementById("google-login-button");
        if (!(window as any).google?.accounts?.id) {
          setGoogleLoginState("error");
          setGoogleLoginMessage(
            "구글 로그인 스크립트를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요."
          );
        } else if (!buttonContainer?.childElementCount) {
          setGoogleLoginState("error");
          setGoogleLoginMessage(
            `현재 주소(${window.location.origin})가 이 Google 클라이언트 ID에 허용되지 않아 구글 로그인 버튼을 표시할 수 없어요.`
          );
        }
      }, 5000);
    };

    const existingScript = document.getElementById(
      scriptId
    ) as HTMLScriptElement | null;
    if (existingScript) {
      if (!initializeGoogleLogin()) {
        schedulePolling();
      }
      return () => {
        cancelled = true;
        if (pollTimer) window.clearInterval(pollTimer);
        if (failTimer) window.clearTimeout(failTimer);
      };
    }

    setGoogleLoginState("loading");
    setGoogleLoginMessage("구글 로그인 버튼을 준비하고 있어요.");

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!initializeGoogleLogin()) {
        schedulePolling();
      }
    };
    script.onerror = () => {
      setGoogleLoginState("error");
      setGoogleLoginMessage("구글 로그인 스크립트를 불러오지 못했어요. 네트워크를 확인해 주세요.");
    };

    document.body.appendChild(script);

    return () => {
      cancelled = true;
      if (pollTimer) window.clearInterval(pollTimer);
      if (failTimer) window.clearTimeout(failTimer);
    };
  }, [refresh, user]);

  // Loading state
  if (loading || (user && accessStateLoading)) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#121212] px-6">
        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 rounded-full flex items-center justify-center m-5">
            {/* <h1 className="text-4xl">🤍</h1> */}
            <img src={loginBg} alt="login background" />
            {/* <Heart className="w-12 h-12 text-red-[300 fill-red-300" /> */}
          </div>
          <h1 className="text-3xl font-bold text-gray-100">롱디롱</h1>
          <p className="text-gray-400 mt-2 text-center text-sm leading-relaxed">
            롱디 애인의 마음과 대화하는 AI 챗봇
          </p>
          {/* <p className="text-gray-600 mt-2 text-center text-sm leading-relaxed">
            롱디 연애 중인 당신을 위한 AI 파트너 채팅
          </p> */}
        </div>

        <div className="bg-[#ffffff] rounded-3xl shadow-xl w-full max-w-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-2 text-center">지금 바로 대화하기</h2>
          <div className="flex min-h-[52px] items-center justify-center">
            <div id="google-login-button" />
          </div>
          {googleLoginState !== "ready" ? (
            <p className="mt-3 text-center text-sm text-gray-500">
              {googleLoginMessage}
            </p>
          ) : null}
          {googleLoginState === "error" ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 w-full rounded-2xl bg-gray-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-gray-800"
            >
              다시 시도
            </button>
          ) : null}
        </div>

        <p className="text-xs text-gray-500 mt-6 text-center">
          Long Distance Couple AI Chatbot <br />
          Developed by <a href="https://github.com/Eunnox">Eunnox</a>
        </p>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#121212] px-6">
        <div className="flex flex-col items-center mb-10">
          <div className="w-32 h-32 rounded-full flex items-center justify-center m-5">
            {/* <h1 className="text-4xl">🤍</h1> */}
            <img src={loginBg} alt="login background" />
            {/* <Heart className="w-12 h-12 text-red-[300 fill-red-300" /> */}
          </div>
          <h1 className="text-3xl font-bold text-gray-100">롱디롱</h1>
          <p className="text-gray-400 mt-2 text-center text-sm leading-relaxed">
            롱디 애인의 마음과 대화하는 AI 챗봇
          </p>
          {/* <p className="text-gray-600 mt-2 text-center text-sm leading-relaxed">
            롱디 연애 중인 당신을 위한 AI 파트너 채팅
          </p> */}
        </div>

        <div className="bg-[#ffffff] rounded-3xl shadow-xl w-full max-w-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-2 text-center">지금 바로 대화하기</h2>
          <div className="flex min-h-[52px] items-center justify-center">
            <div id="google-login-button" />
          </div>
          {googleLoginState !== "ready" ? (
            <p className="mt-3 text-center text-sm text-gray-500">
              {googleLoginMessage}
            </p>
          ) : null}
          {googleLoginState === "error" ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 w-full rounded-2xl bg-gray-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-gray-800"
            >
              다시 시도
            </button>
          ) : null}
        </div>

        <p className="text-xs text-gray-500 mt-6 text-center">
          Long Distance Couple AI Chatbot <br />
          Developed by <a href="https://github.com/Eunnox">Eunnox</a>
        </p>
      </div>
    );
  }

  if (!accessState || accessState.role === "none") {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (accessState.role === "owner") {
    return <OwnerDashboard />;
  }

  return <Chat partnerName={accessState.botProfile?.botName ?? "자기야"} />;
}
