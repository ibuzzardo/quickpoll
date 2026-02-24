"use client";

import { useState, useEffect, use } from "react";

interface PollOption {
  id: string;
  text: string;
  votes: number;
}

interface Poll {
  id: string;
  question: string;
  totalVotes: number;
  options: PollOption[];
}

export default function PollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [voted, setVoted] = useState(false);
  const [error, setError] = useState("");

  const fetchPoll = async () => {
    try {
      const res = await fetch(`/api/polls/${id}`);
      if (!res.ok) throw new Error("Poll not found");
      const data = await res.json();
      setPoll(data);
    } catch {
      setError("Failed to load poll");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPoll();
  }, [id]);

  const handleVote = async (optionId: string) => {
    setVoting(true);
    try {
      const res = await fetch(`/api/polls/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });

      if (!res.ok) throw new Error("Failed to vote");

      const data = await res.json();
      setPoll((prev) =>
        prev
          ? {
              ...prev,
              totalVotes: data.results.reduce(
                (sum: number, r: { votes: number }) => sum + r.votes,
                0
              ),
              options: data.results.map((r: { optionId: string; text: string; votes: number }) => ({
                id: r.optionId,
                text: r.text,
                votes: r.votes,
              })),
            }
          : null
      );
      setVoted(true);
    } catch {
      setError("Failed to vote");
    } finally {
      setVoting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading poll...</p>
      </div>
    );
  }

  if (error || !poll) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-600">{error || "Poll not found"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{poll.question}</h1>
        <p className="text-sm text-gray-500 mb-8">
          {poll.totalVotes} vote{poll.totalVotes !== 1 ? "s" : ""}
        </p>

        <div className="space-y-4">
          {poll.options.map((option) => {
            const pct =
              poll.totalVotes > 0
                ? Math.round((option.votes / poll.totalVotes) * 100)
                : 0;

            return (
              <div key={option.id} className="relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">
                    {option.text}
                  </span>
                  <span className="text-sm text-gray-500">
                    {option.votes} ({pct}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-8 relative overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                  {!voted && (
                    <button
                      onClick={() => handleVote(option.id)}
                      disabled={voting}
                      className="absolute inset-0 w-full h-full bg-transparent hover:bg-blue-100/30 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center text-sm font-medium text-transparent hover:text-blue-700"
                    >
                      Vote
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {voted && (
          <p className="mt-6 text-center text-green-600 font-medium">
            Thanks for voting!
          </p>
        )}

        <div className="mt-8 text-center">
          <a
            href="/create"
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            Create your own poll
          </a>
        </div>
      </div>
    </div>
  );
}
