import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function shouldRedirectAfterGoogleLogin(req: Request): boolean {
  const accept = req.headers.accept ?? "";
  const fetchDest = req.headers["sec-fetch-dest"];
  return accept.includes("text/html") || fetchDest === "document";
}

function buildGoogleErrorRedirect(message: string): string {
  const url = new URL("/", "http://local");
  url.searchParams.set("googleAuthError", message);
  return `${url.pathname}${url.search}`;
}

function getReadableGoogleAuthMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "구글 로그인 처리 중 알 수 없는 오류가 발생했습니다.";
  }

  const message = error.message;

  if (message.includes("Missing GOOGLE_CLIENT_ID")) {
    return "서버에 GOOGLE_CLIENT_ID 설정이 없어 구글 로그인을 검증할 수 없습니다.";
  }

  if (message.includes("Missing JWT_SECRET")) {
    return "서버에 JWT_SECRET 설정이 없어 로그인 세션을 만들 수 없습니다.";
  }

  if (message.includes("Zero-length key is not supported")) {
    return "서버의 JWT_SECRET 값이 비어 있어 로그인 세션 생성에 실패했습니다.";
  }

  if (message.includes("Wrong recipient")) {
    return "구글 클라이언트 ID가 현재 앱 설정과 일치하지 않습니다.";
  }

  if (message.includes("Token used too early")) {
    return "구글 인증 토큰의 시간이 맞지 않습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (message.includes("Token expired")) {
    return "구글 인증 토큰이 만료되었습니다. 다시 로그인해 주세요.";
  }

  if (message.includes("Invalid token signature")) {
    return "구글 인증 토큰 서명 검증에 실패했습니다.";
  }

  return "구글 로그인 처리 중 오류가 발생했습니다.";
}

async function signInUser(
  req: Request,
  res: Response,
  user: {
    openId: string;
    name?: string | null;
    email?: string | null;
    loginMethod?: string | null;
  }
) {
  await db.upsertUser({
    openId: user.openId,
    name: user.name || null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    lastSignedIn: new Date(),
  });

  const sessionToken = await sdk.createSessionToken(user.openId, {
    name: user.name || "",
    expiresInMs: ONE_YEAR_MS,
  });

  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, sessionToken, {
    ...cookieOptions,
    maxAge: ONE_YEAR_MS,
  });
}

export function registerOAuthRoutes(app: Express) {
  app.post("/api/auth/google", async (req: Request, res: Response) => {
    try {
      const { credential } = req.body;

      if (!credential) {
        return res.status(400).json({
          ok: false,
          message: "credential이 없습니다.",
        });
      }

      const googleUser = await sdk.verifyGoogleCredential(credential);

      if (!googleUser?.openId) {
        return res.status(400).json({
          ok: false,
          message: "구글 사용자 식별값이 없습니다.",
        });
      }

      await signInUser(req, res, {
        openId: googleUser.openId,
        name: googleUser.name || null,
        email: googleUser.email ?? null,
        loginMethod: "google",
      });

      if (shouldRedirectAfterGoogleLogin(req)) {
        return res.redirect(302, "/");
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error("Google auth error:", error);
      const message = getReadableGoogleAuthMessage(error);

      if (shouldRedirectAfterGoogleLogin(req)) {
        return res.redirect(302, buildGoogleErrorRedirect(message));
      }

      return res.status(500).json({
        ok: false,
        message,
        detail:
          !ENV.isProduction && error instanceof Error ? error.message : undefined,
      });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await signInUser(req, res, {
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
      });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
