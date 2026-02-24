import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { polls, options } from "@/db/schema";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, options: optionTexts } = body;
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }
    if (!Array.isArray(optionTexts) || optionTexts.length < 2 || optionTexts.length > 10) {
      return NextResponse.json({ error: "2-10 options required" }, { status: 400 });
    }
    const [poll] = await db.insert(polls).values({ question: question.trim() }).returning();
    const inserted = await db.insert(options).values(
      optionTexts.map((t: string) => ({ pollId: poll.id, text: t.trim() }))
    ).returning();
    return NextResponse.json({ id: poll.id, question: poll.question, options: inserted.map((o) => ({ id: o.id, text: o.text })), createdAt: poll.createdAt }, { status: 201 });
  } catch (error) {
    console.error("Error creating poll:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
