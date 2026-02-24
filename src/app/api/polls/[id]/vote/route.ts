import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { options, votes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pollId } = await params;
    const body = await req.json();
    const { optionId } = body;
    if (!optionId) {
      return NextResponse.json({ error: "optionId is required" }, { status: 400 });
    }
    const [option] = await db.select().from(options).where(eq(options.id, optionId));
    if (!option || option.pollId !== pollId) {
      return NextResponse.json({ error: "Invalid option for this poll" }, { status: 400 });
    }
    const voterIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    await db.insert(votes).values({ optionId, voterIp });
    const results = await db.select({
      id: options.id, text: options.text,
      votes: sql<number>`count(${votes.id})::int`,
    }).from(options)
      .leftJoin(votes, eq(votes.optionId, options.id))
      .where(eq(options.pollId, pollId))
      .groupBy(options.id, options.text);
    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Error voting:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
