import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { AppError } from "@openzhiyu/shared/errors";
import { isTauriMode } from "@/lib/env/constants";
import { generateHashedPassword } from "./utils";
import { db } from "./client";
import {
  survey,
  type Survey,
  user,
  type User,
  userSubscriptions,
} from "./schema";

export type UserType = "guest" | "regular" | "basic" | "pro" | "team";

export async function getUserByEmail(email: string) {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    console.error(error);
    throw new AppError(
      "bad_request:database",
      `Failed to get user by email. ${error}`,
    );
  }
}

export async function getUser(email: string): Promise<Array<User>> {
  return getUserByEmail(email);
}

export async function getUserById(id: string): Promise<User | null> {
  try {
    const [record] = await db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1);

    return record ?? null;
  } catch (error) {
    console.error(error);
    throw new AppError(
      "bad_request:database",
      `Failed to get user by id. ${error}`,
    );
  }
}

export type UserProfile = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
};

export async function getUserProfile(
  userId: string,
): Promise<UserProfile | null> {
  try {
    const profile = await getUserById(userId);
    if (!profile) return null;

    return {
      id: profile.id,
      email: profile.email,
      name: profile.name ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      hasPassword: Boolean(profile.password),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      lastLoginAt: profile.lastLoginAt ?? null,
    };
  } catch (error) {
    console.error(error);
    throw new AppError(
      "bad_request:database",
      `Failed to get user profile. ${error}`,
    );
  }
}

export async function updateUserProfile(
  userId: string,
  updates: {
    name?: string | null;
    avatarUrl?: string | null;
  },
) {
  const now = new Date();
  const payload: Partial<User> & { updatedAt: Date } = { updatedAt: now };

  if (updates.name !== undefined) {
    const normalized = updates.name?.trim() ?? null;
    payload.name = normalized ? normalized.slice(0, 64) : null;
  }

  if (updates.avatarUrl !== undefined) {
    const normalized = updates.avatarUrl?.trim() ?? null;
    payload.avatarUrl = normalized && normalized.length > 0 ? normalized : null;
  }

  if (Object.keys(payload).length === 1) {
    return getUserById(userId);
  }

  try {
    const [record] = await db
      .update(user)
      .set(payload)
      .where(eq(user.id, userId))
      .returning();
    return record ?? null;
  } catch (error) {
    console.error(error);
    throw new AppError(
      "bad_request:database",
      `Failed to update user profile. ${error}`,
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);
  const now = new Date();
  const userId = crypto.randomUUID();

  try {
    return await db
      .insert(user)
      .values({
        id: userId,
        email,
        password: hashedPassword,
        name: email.split("@")[0] ?? email,
        createdAt: now,
        updatedAt: now,
        sessionVersion: 1,
      })
      .returning();
  } catch (error) {
    console.error(error);
    throw new AppError(
      "bad_request:database",
      `Failed to create user. ${error}`,
    );
  }
}

function isShadowUser(userId: string): boolean {
  return userId.startsWith("cloud_");
}

function getCloudUserId(userId: string): string {
  return isShadowUser(userId) ? userId.substring(6) : userId;
}

export async function getUserTypeForService(userId: string): Promise<UserType> {
  try {
    if (isTauriMode() && isShadowUser(userId)) {
      const cloudUserId = getCloudUserId(userId);

      try {
        const cloudUrl =
          process.env.CLOUD_API_URL || process.env.NEXT_PUBLIC_CLOUD_API_URL;

        if (cloudUrl) {
          const response = await fetch(
            `${cloudUrl}/api/user-subscriptions/${cloudUserId}`,
          );

          if (response.ok) {
            const data = await response.json();
            if (data.subscription) {
              const plan = data.subscription.planName?.toLowerCase() ?? "";
              if (plan.includes("team")) return "team";
              if (plan.includes("pro")) return "pro";
              if (plan.includes("basic")) return "basic";
            }
          }
        }
      } catch (cloudError) {
        console.error(
          "[getUserTypeForService] Failed to fetch cloud subscription:",
          cloudError,
        );
      }
    }

    const [activeSubscription] = await db
      .select({
        planName: userSubscriptions.planName,
        endDate: userSubscriptions.endDate,
      })
      .from(userSubscriptions)
      .where(
        and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.isActive, true),
          or(
            isNull(userSubscriptions.endDate),
            gt(userSubscriptions.endDate, new Date()),
          ),
        ),
      )
      .limit(1);

    if (!activeSubscription) {
      return "regular";
    }

    const plan = activeSubscription.planName?.toLowerCase() ?? "";
    if (plan.includes("team")) return "team";
    if (plan.includes("pro")) return "pro";
    if (plan.includes("basic")) return "basic";

    return "regular";
  } catch (error) {
    console.error("Failed to resolve user type for service refresh:", error);
    throw new AppError(
      "bad_request:database",
      `Failed to resolve user type for service refresh. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function getLatestSurveyByUserId(
  userId: string,
): Promise<Survey | null> {
  const [latestSurvey] = await db
    .select()
    .from(survey)
    .where(eq(survey.userId, userId))
    .orderBy(desc(survey.submittedAt))
    .limit(1);

  return latestSurvey ?? null;
}
