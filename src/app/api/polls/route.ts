import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { polls, options } from "@/db/schema";

const EXPIRY_HOURS: Record<string, number> = {
  "1h": 1,
  "24h": 24,
  "7d": 168,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, options: optionTexts, expiresIn } = body;

    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }
    if (!Array.isArray(optionTexts) || optionTexts.length < 2 || optionTexts.length > 10) {
      return NextResponse.json({ error: "2-10 options required" }, { status: 400 });
    }

    // s3-poll-expiry: calculate expiry timestamp from duration key
    let expiresAt: Date | null = null;
    if (expiresIn && expiresIn !== "never" && EXPIRY_HOURS[expiresIn]) {
      expiresAt = new Date(Date.now() + EXPIRY_HOURS[expiresIn] * 60 * 60 * 1000);
    }

    const [poll] = await db
      .insert(polls)
      .values({ question: question.trim(), expiresAt })
      .returning();

    const inserted = await db
      .insert(options)
      .values(optionTexts.map((t: string) => ({ pollId: poll.id, text: t.trim() })))
      .returning();

    return NextResponse.json(
      {
        id: poll.id,
        question: poll.question,
        expiresAt: poll.expiresAt,
        options: inserted.map((o) => ({ id: o.id, text: o.text })),
        createdAt: poll.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating poll:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
