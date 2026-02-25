import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { polls, options, votes } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

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

    // Verify option belongs to this poll
    const [option] = await db.select().from(options).where(eq(options.id, optionId));
    if (!option || option.pollId !== pollId) {
      return NextResponse.json({ error: "Invalid option for this poll" }, { status: 400 });
    }

    // Fetch poll for expiry check
    const [poll] = await db.select().from(polls).where(eq(polls.id, pollId));
    if (!poll) {
      return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    }

    // s3-poll-expiry: block votes on expired polls
    if (poll.expiresAt && new Date() > poll.expiresAt) {
      return NextResponse.json(
        { error: "poll_expired", message: "This poll has expired" },
        { status: 410 }
      );
    }

    const voterIp = getClientIp(req);

    // s3-duplicate-vote-block: block duplicate votes from same IP
    const existing = await db
      .select({ id: votes.id })
      .from(votes)
      .innerJoin(options, eq(votes.optionId, options.id))
      .where(and(eq(options.pollId, pollId), eq(votes.voterIp, voterIp)))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "already_voted", message: "You have already voted on this poll" },
        { status: 409 }
      );
    }

    await db.insert(votes).values({ optionId, voterIp });

    const results = await db
      .select({
        id: options.id,
        text: options.text,
        votes: sql<number>`count(${votes.id})::int`,
      })
      .from(options)
      .leftJoin(votes, eq(votes.optionId, options.id))
      .where(eq(options.pollId, pollId))
      .groupBy(options.id, options.text);

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Error voting:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
