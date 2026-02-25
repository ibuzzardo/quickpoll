import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { polls, options, votes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pollId } = await params;
    const [poll] = await db.select().from(polls).where(eq(polls.id, pollId));
    if (!poll) {
      return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }
    const results = await db.select({
      id: options.id, text: options.text,
      votes: sql<number>`count(${votes.id})::int`,
    }).from(options)
      .leftJoin(votes, eq(votes.optionId, options.id))
      .where(eq(options.pollId, pollId))
      .groupBy(options.id, options.text);
    const totalVotes = results.reduce((sum, r) => sum + (r.votes || 0), 0);
    return NextResponse.json({
      id: poll.id,
      question: poll.question,
      expiresAt: poll.expiresAt,
      createdAt: poll.createdAt,
      totalVotes,
      options: results.map((r) => ({ id: r.id, text: r.text, votes: r.votes || 0 })),
    });
  } catch (error) {
    console.error("Error fetching poll:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
