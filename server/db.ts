import { eq, asc, or, isNull, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  type InsertUser,
  users,
  messages,
  userSettings,
  type InsertMessage,
  type InsertUserSettings,
  botProfiles,
  type InsertBotProfile,
  botMessages,
  type InsertBotMessage,
  ownerNotifications,
  type InsertOwnerNotification,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import fs from "node:fs/promises";
import path from "node:path";

type LocalUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

type LocalUserSettings = {
  id: number;
  userId: number;
  partnerName: string;
  speakingStyle: string;
  firstMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type LocalMessage = {
  id: number;
  userId: number;
  role: "user" | "assistant";
  content: string;
  messageType: "text" | "gif";
  createdAt: Date;
};

type LocalBotProfile = {
  id: number;
  ownerUserId: number;
  botName: string;
  identityPrompt: string;
  inviteCode: string;
  partnerUserId: number | null;
  firstMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type LocalBotMessage = {
  id: number;
  botProfileId: number;
  role: "user" | "assistant";
  content: string;
  messageType: "text" | "gif";
  createdAt: Date;
};

type LocalOwnerNotification = {
  id: number;
  botProfileId: number;
  ownerUserId: number;
  partnerUserId: number;
  type: "cat_ping";
  createdAt: Date;
  readAt: Date | null;
};

type LocalStore = {
  users: LocalUser[];
  userSettings: LocalUserSettings[];
  messages: LocalMessage[];
  botProfiles: LocalBotProfile[];
  botMessages: LocalBotMessage[];
  ownerNotifications: LocalOwnerNotification[];
  nextIds: {
    user: number;
    userSettings: number;
    message: number;
    botProfile: number;
    botMessage: number;
    ownerNotification: number;
  };
};

const LOCAL_STORE_PATH = path.resolve(import.meta.dirname, "..", ".local-dev-data.json");
const EMPTY_STORE: LocalStore = {
  users: [],
  userSettings: [],
  messages: [],
  botProfiles: [],
  botMessages: [],
  ownerNotifications: [],
  nextIds: {
    user: 1,
    userSettings: 1,
    message: 1,
    botProfile: 1,
    botMessage: 1,
    ownerNotification: 1,
  },
};

function normalizeInviteCodeValue(inviteCode: string) {
  return inviteCode.trim().toUpperCase();
}

function cloneEmptyStore(): LocalStore {
  return {
    users: [],
    userSettings: [],
    messages: [],
    botProfiles: [],
    botMessages: [],
    ownerNotifications: [],
    nextIds: { ...EMPTY_STORE.nextIds },
  };
}

function reviveDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

async function readLocalStore(): Promise<LocalStore> {
  try {
    const raw = await fs.readFile(LOCAL_STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as {
      users?: Array<Omit<LocalUser, "createdAt" | "updatedAt" | "lastSignedIn"> & {
        createdAt: string;
        updatedAt: string;
        lastSignedIn: string;
      }>;
      userSettings?: Array<Omit<LocalUserSettings, "createdAt" | "updatedAt" | "firstMessageAt"> & {
        createdAt: string;
        updatedAt: string;
        firstMessageAt: string | null;
      }>;
      messages?: Array<Omit<LocalMessage, "createdAt"> & { createdAt: string }>;
      botProfiles?: Array<Omit<LocalBotProfile, "createdAt" | "updatedAt" | "firstMessageAt"> & {
        createdAt: string;
        updatedAt: string;
        firstMessageAt: string | null;
      }>;
      botMessages?: Array<Omit<LocalBotMessage, "createdAt"> & { createdAt: string }>;
      ownerNotifications?: Array<Omit<LocalOwnerNotification, "createdAt" | "readAt"> & {
        createdAt: string;
        readAt: string | null;
      }>;
      nextIds?: LocalStore["nextIds"];
    };

    return {
      users: (parsed.users ?? []).map((user) => ({
        ...user,
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(user.updatedAt),
        lastSignedIn: new Date(user.lastSignedIn),
      })),
      userSettings: (parsed.userSettings ?? []).map((settings) => ({
        ...settings,
        createdAt: new Date(settings.createdAt),
        updatedAt: new Date(settings.updatedAt),
        firstMessageAt: reviveDate(settings.firstMessageAt),
      })),
      messages: (parsed.messages ?? []).map((message) => ({
        ...message,
        createdAt: new Date(message.createdAt),
      })),
      botProfiles: (parsed.botProfiles ?? []).map((profile) => ({
        ...profile,
        createdAt: new Date(profile.createdAt),
        updatedAt: new Date(profile.updatedAt),
        firstMessageAt: reviveDate(profile.firstMessageAt),
      })),
      botMessages: (parsed.botMessages ?? []).map((message) => ({
        ...message,
        createdAt: new Date(message.createdAt),
      })),
      ownerNotifications: (parsed.ownerNotifications ?? []).map((notification) => ({
        ...notification,
        createdAt: new Date(notification.createdAt),
        readAt: reviveDate(notification.readAt),
      })),
      nextIds: {
        ...EMPTY_STORE.nextIds,
        ...(parsed.nextIds ?? {}),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("no such file")) {
      return cloneEmptyStore();
    }
    console.warn("[Database] Failed to read local dev store:", error);
    return cloneEmptyStore();
  }
}

async function writeLocalStore(store: LocalStore): Promise<void> {
  await fs.writeFile(
    LOCAL_STORE_PATH,
    JSON.stringify(store, null, 2),
    "utf-8"
  );
}

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    const now = new Date();
    const existing = store.users.find((entry) => entry.openId === user.openId);

    if (existing) {
      if (user.name !== undefined) existing.name = user.name ?? null;
      if (user.email !== undefined) existing.email = user.email ?? null;
      if (user.loginMethod !== undefined) existing.loginMethod = user.loginMethod ?? null;
      if (user.role !== undefined) existing.role = user.role;
      if (user.lastSignedIn !== undefined) existing.lastSignedIn = user.lastSignedIn;
      existing.updatedAt = now;
    } else {
      const role =
        user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
      store.users.push({
        id: store.nextIds.user++,
        openId: user.openId,
        name: user.name ?? null,
        email: user.email ?? null,
        loginMethod: user.loginMethod ?? null,
        role,
        createdAt: now,
        updatedAt: now,
        lastSignedIn: user.lastSignedIn ?? now,
      });
    }

    await writeLocalStore(store);
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    return store.users.find((user) => user.openId === openId);
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function getMessagesByUserId(userId: number) {
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    return store.messages
      .filter((message) => message.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  return db.select().from(messages).where(eq(messages.userId, userId)).orderBy(asc(messages.createdAt));
}

export async function insertMessage(msg: InsertMessage) {
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    store.messages.push({
      id: store.nextIds.message++,
      userId: msg.userId,
      role: msg.role,
      content: msg.content,
      messageType: msg.messageType ?? "text",
      createdAt: msg.createdAt ?? new Date(),
    });
    await writeLocalStore(store);
    return { insertId: store.nextIds.message - 1 };
  }
  const result = await db.insert(messages).values(msg);
  return result;
}

// ─── User Settings ────────────────────────────────────────────────────────────

export async function getUserSettings(userId: number) {
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    return store.userSettings.find((settings) => settings.userId === userId) ?? null;
  }
  const result = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function upsertUserSettings(settings: InsertUserSettings) {
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    const now = new Date();
    const existing = store.userSettings.find((entry) => entry.userId === settings.userId);
    const partnerName = settings.partnerName ?? "자기야";

    if (existing) {
      existing.partnerName = partnerName;
      existing.speakingStyle = settings.speakingStyle ?? "";
      existing.firstMessageAt = settings.firstMessageAt ?? null;
      existing.updatedAt = now;
    } else {
      store.userSettings.push({
        id: store.nextIds.userSettings++,
        userId: settings.userId,
        partnerName,
        speakingStyle: settings.speakingStyle ?? "",
        firstMessageAt: settings.firstMessageAt ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }

    await writeLocalStore(store);
    return;
  }
  await db.insert(userSettings).values(settings).onDuplicateKeyUpdate({
    set: {
      partnerName: settings.partnerName,
      speakingStyle: settings.speakingStyle,
      firstMessageAt: settings.firstMessageAt,
      updatedAt: new Date(),
    },
  });
}

export async function setFirstMessageAt(userId: number, date: Date) {
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    const existing = store.userSettings.find((settings) => settings.userId === userId);

    if (existing) {
      existing.firstMessageAt = date;
      existing.updatedAt = new Date();
    } else {
      store.userSettings.push({
        id: store.nextIds.userSettings++,
        userId,
        partnerName: "자기야",
        speakingStyle: "",
        firstMessageAt: date,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await writeLocalStore(store);
    return;
  }
  await db.update(userSettings).set({ firstMessageAt: date }).where(eq(userSettings.userId, userId));
}

// ─── Bot Profiles ────────────────────────────────────────────────────────────

export async function getBotProfileByOwnerUserId(ownerUserId: number) {
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    return store.botProfiles.find((profile) => profile.ownerUserId === ownerUserId) ?? null;
  }

  const result = await db
    .select()
    .from(botProfiles)
    .where(eq(botProfiles.ownerUserId, ownerUserId))
    .limit(1);
  return result[0] ?? null;
}

export async function getBotProfileByPartnerUserId(partnerUserId: number) {
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    return store.botProfiles.find((profile) => profile.partnerUserId === partnerUserId) ?? null;
  }

  const result = await db
    .select()
    .from(botProfiles)
    .where(eq(botProfiles.partnerUserId, partnerUserId))
    .limit(1);
  return result[0] ?? null;
}

export async function getBotProfileByInviteCode(inviteCode: string) {
  const normalizedInviteCode = normalizeInviteCodeValue(inviteCode);
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    return (
      store.botProfiles.find(
        (profile) => normalizeInviteCodeValue(profile.inviteCode) === normalizedInviteCode
      ) ?? null
    );
  }

  const result = await db
    .select()
    .from(botProfiles)
    .where(eq(botProfiles.inviteCode, normalizedInviteCode))
    .limit(1);
  return result[0] ?? null;
}

export async function createBotProfile(profile: InsertBotProfile) {
  const normalizedInviteCode = normalizeInviteCodeValue(profile.inviteCode);
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    const now = new Date();
    const nextProfile: LocalBotProfile = {
      id: store.nextIds.botProfile++,
      ownerUserId: profile.ownerUserId,
      botName: profile.botName,
      identityPrompt: profile.identityPrompt ?? "",
      inviteCode: normalizedInviteCode,
      partnerUserId: profile.partnerUserId ?? null,
      firstMessageAt: profile.firstMessageAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    store.botProfiles.push(nextProfile);
    await writeLocalStore(store);
    return nextProfile;
  }

  await db.insert(botProfiles).values({
    ...profile,
    inviteCode: normalizedInviteCode,
  });
  return getBotProfileByOwnerUserId(profile.ownerUserId);
}

export async function updateBotProfileByOwnerUserId(
  ownerUserId: number,
  updates: Partial<Pick<InsertBotProfile, "botName" | "identityPrompt" | "inviteCode" | "partnerUserId" | "firstMessageAt">>
) {
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    const existing = store.botProfiles.find((profile) => profile.ownerUserId === ownerUserId);
    if (!existing) return null;

    if (updates.botName !== undefined) existing.botName = updates.botName;
    if (updates.identityPrompt !== undefined) existing.identityPrompt = updates.identityPrompt;
    if (updates.inviteCode !== undefined) {
      existing.inviteCode = normalizeInviteCodeValue(updates.inviteCode);
    }
    if (updates.partnerUserId !== undefined) existing.partnerUserId = updates.partnerUserId ?? null;
    if (updates.firstMessageAt !== undefined) existing.firstMessageAt = updates.firstMessageAt ?? null;
    existing.updatedAt = new Date();
    await writeLocalStore(store);
    return existing;
  }

  const updateSet: Record<string, unknown> = {};
  if (updates.botName !== undefined) updateSet.botName = updates.botName;
  if (updates.identityPrompt !== undefined) updateSet.identityPrompt = updates.identityPrompt;
  if (updates.inviteCode !== undefined) {
    updateSet.inviteCode = normalizeInviteCodeValue(updates.inviteCode);
  }
  if (updates.partnerUserId !== undefined) updateSet.partnerUserId = updates.partnerUserId ?? null;
  if (updates.firstMessageAt !== undefined) updateSet.firstMessageAt = updates.firstMessageAt ?? null;
  updateSet.updatedAt = new Date();

  await db
    .update(botProfiles)
    .set(updateSet)
    .where(eq(botProfiles.ownerUserId, ownerUserId));

  return getBotProfileByOwnerUserId(ownerUserId);
}

export async function joinBotProfileByCode(inviteCode: string, partnerUserId: number) {
  const profile = await getBotProfileByInviteCode(inviteCode);
  if (!profile) return null;
  if (profile.partnerUserId && profile.partnerUserId !== partnerUserId) {
    throw new Error("이미 연인이 연결된 초대 코드입니다.");
  }

  return updateBotProfileByOwnerUserId(profile.ownerUserId, {
    partnerUserId,
  });
}

// ─── Bot Messages ────────────────────────────────────────────────────────────

export async function getBotMessagesByBotProfileId(botProfileId: number) {
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    return store.botMessages
      .filter((message) => message.botProfileId === botProfileId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  return db
    .select()
    .from(botMessages)
    .where(eq(botMessages.botProfileId, botProfileId))
    .orderBy(asc(botMessages.createdAt));
}

export async function insertBotMessage(message: InsertBotMessage) {
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    const nextMessage: LocalBotMessage = {
      id: store.nextIds.botMessage++,
      botProfileId: message.botProfileId,
      role: message.role,
      content: message.content,
      messageType: message.messageType ?? "text",
      createdAt: message.createdAt ?? new Date(),
    };
    store.botMessages.push(nextMessage);
    await writeLocalStore(store);
    return nextMessage;
  }

  await db.insert(botMessages).values(message);
  return { ok: true as const };
}

export async function setBotFirstMessageAt(ownerUserId: number, date: Date) {
  return updateBotProfileByOwnerUserId(ownerUserId, {
    firstMessageAt: date,
  });
}

// ─── Owner Notifications ─────────────────────────────────────────────────────

export async function createOwnerNotification(notification: InsertOwnerNotification) {
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    const nextNotification: LocalOwnerNotification = {
      id: store.nextIds.ownerNotification++,
      botProfileId: notification.botProfileId,
      ownerUserId: notification.ownerUserId,
      partnerUserId: notification.partnerUserId,
      type: notification.type,
      createdAt: new Date(),
      readAt: notification.readAt ?? null,
    };
    store.ownerNotifications.push(nextNotification);
    await writeLocalStore(store);
    return nextNotification;
  }

  await db.insert(ownerNotifications).values(notification);
  return { ok: true as const };
}

export async function getOwnerNotificationsByOwnerUserId(ownerUserId: number) {
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    return store.ownerNotifications
      .filter((notification) => notification.ownerUserId === ownerUserId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  return db
    .select()
    .from(ownerNotifications)
    .where(eq(ownerNotifications.ownerUserId, ownerUserId))
    .orderBy(desc(ownerNotifications.createdAt));
}

export async function markOwnerNotificationsRead(ownerUserId: number) {
  const db = await getDb();
  if (!db) {
    const store = await readLocalStore();
    const now = new Date();
    store.ownerNotifications
      .filter((notification) => notification.ownerUserId === ownerUserId && !notification.readAt)
      .forEach((notification) => {
        notification.readAt = now;
      });
    await writeLocalStore(store);
    return;
  }

  await db
    .update(ownerNotifications)
    .set({ readAt: new Date() })
    .where(and(eq(ownerNotifications.ownerUserId, ownerUserId), isNull(ownerNotifications.readAt)));
}
