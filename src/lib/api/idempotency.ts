import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

type CachedResponse = { status: number; body: unknown } | null;

export function getIdempotencyKey(req: Request): string | null {
  return req.headers.get("idempotency-key");
}

export function hashRequest(method: string, path: string, body: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ method, path, body }))
    .digest("hex");
}

export async function findIdempotentResponse(
  key: string,
  method: string,
  path: string,
  requestHash: string,
): Promise<CachedResponse> {
  const record = await prisma.apiIdempotencyKey.findUnique({ where: { key } });
  if (!record) return null;

  if (record.method !== method || record.path !== path || record.requestHash !== requestHash) {
    return {
      status: 409,
      body: {
        error: {
          code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST",
          message: "Idempotency key already used with a different request payload",
        },
      },
    };
  }

  if (record.responseStatus && record.responseBody) {
    return { status: record.responseStatus, body: record.responseBody };
  }

  return null;
}

export async function reserveIdempotencyKey(
  key: string,
  method: string,
  path: string,
  requestHash: string,
) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    await prisma.apiIdempotencyKey.create({
      data: {
        key,
        method,
        path,
        requestHash,
        expiresAt,
      },
    });
  } catch {
    // ignore unique violations: caller should fetch existing via findIdempotentResponse
  }
}

export async function saveIdempotentResponse(key: string, status: number, body: unknown) {
  await prisma.apiIdempotencyKey.update({
    where: { key },
    data: {
      responseStatus: status,
      responseBody: body as object,
    },
  });
}
