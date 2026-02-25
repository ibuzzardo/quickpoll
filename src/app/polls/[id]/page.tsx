"use client";

import { useState, useEffect, use, useCallback } from "react";

interface PollOption {
  id: string;
  text: string;
  votes: number;
}

interface Poll {
  id: string;
  question: string;
  expiresAt: string | null;
  totalVotes: number;
  options: PollOption[];
}

// s3-error-states: loading skeleton
function PollSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-3/4 mb-3" />
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-8" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="flex justify-between mb-1">
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-4 bg-gray-200 rounded w-16" />
              </div>
              <div className="w-full bg-gray-200 rounded-full h-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// s3-error-states: 404 card
function NotFoundCard() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-md p-8 text-center">
        <div className="text-5xl mb-4">🗳️</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Poll not found</h2>
        <p className="text-gray-500 text-sm mb-6">
          This poll may have been deleted or the link is incorrect.
        </p>
        <a
          href="/create"
          className="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          Create a new poll
        </a>
      </div>
    </div>
  );
}

// s3-error-states: network error card with retry
function NetworkErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-md p-8 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Connection error</h2>
        <p className="text-gray-500 text-sm mb-6">
          Couldn&apos;t load this poll. Please check your connection.
        </p>
        <button
          onClick={onRetry}
          className="inline-block px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// s3-poll-expiry: format expiry timestamp into human-readable label
function formatExpiry(expiresAt: string | null): { label: string; expired: boolean } | null {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt);
  const now = new Date();
  if (now > exp) return { label: "Expired", expired: true };
  const diffMs = exp.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) return { label: `Expires in ${diffDays}d`, expired: false };
  if (diffHours > 0) return { label: `Expires in ${diffHours}h`, expired: false };
  if (diffMins > 0) return { label: `Expires in ${diffMins}m`, expired: false };
  return { label: "Expiring soon", expired: false };
}

export default function PollPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [voted, setVoted] = useState(false);
  const [errorType, setErrorType] = useState<"" | "notfound" | "network">("");
  const [voteMsg, setVoteMsg] = useState("");
  const [copied, setCopied] = useState(false);

  // silent=true for auto-refresh (keeps existing data visible on error)
  const fetchPoll = useCallback(
    async (silent = false) => {
      try {
        const res = await fetch(`/api/polls/${id}`);
        if (res.status === 404) {
          if (!silent) setErrorType("notfound");
          return;
        }
        if (!res.ok) throw new Error("network");
        const data = await res.json();
        setPoll(data);
        if (!silent) setErrorType("");
      } catch {
        if (!silent) setErrorType("network");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    fetchPoll(false);
  }, [fetchPoll]);

  // s3-live-results: auto-refresh every 10s after voting
  useEffect(() => {
    if (!voted) return;
    const interval = setInterval(() => fetchPoll(true), 10000);
    return () => clearInterval(interval);
  }, [voted, fetchPoll]);

  const handleVote = async (optionId: string) => {
    setVoting(true);
    setVoteMsg("");
    try {
      const res = await fetch(`/api/polls/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });

      if (res.status === 409) {
        setVoteMsg("You've already voted on this poll.");
        setVoted(true);
        return;
      }
      if (res.status === 410) {
        setVoteMsg("This poll has expired. Voting is closed.");
        return;
      }
      if (!res.ok) {
        setVoteMsg("Something went wrong. Please try again.");
        return;
      }

      const data = await res.json();
      const newTotal = data.results.reduce(
        (sum: number, r: { votes: number }) => sum + r.votes,
        0
      );
      setPoll((prev) =>
        prev
          ? {
              ...prev,
              totalVotes: newTotal,
              options: data.results.map((r: { id: string; text: string; votes: number }) => ({
                id: r.id,
                text: r.text,
                votes: r.votes,
              })),
            }
          : null
      );
      setVoted(true);
      setVoteMsg("✓ Thanks for voting!");
    } catch {
      setVoteMsg("Network error. Please try again.");
    } finally {
      setVoting(false);
    }
  };

  // s3-shareable-link: copy current URL to clipboard
  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // execCommand fallback for older browsers
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silently fail
    }
  };

  if (loading) return <PollSkeleton />;
  if (errorType === "notfound") return <NotFoundCard />;
  if (errorType === "network") return <NetworkErrorCard onRetry={() => { setLoading(true); fetchPoll(false); }} />;
  if (!poll) return <NotFoundCard />;

  const expiry = formatExpiry(poll.expiresAt);
  const isExpired = expiry?.expired ?? false;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header row: question + share button */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">{poll.question}</h1>
          {/* s3-shareable-link: share button */}
          <button
            onClick={handleShare}
            title="Copy link"
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-600">Copied!</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </>
            )}
          </button>
        </div>

        {/* Meta row: vote count + expiry badge + live indicator */}
        <div className="flex items-center gap-3 mb-6">
          <p className="text-sm text-gray-500">
            {poll.totalVotes} vote{poll.totalVotes !== 1 ? "s" : ""}
          </p>

          {/* s3-poll-expiry: expiry badge */}
          {expiry && (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                expiry.expired
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {expiry.label}
            </span>
          )}

          {/* s3-live-results: live indicator when voted */}
          {voted && !isExpired && (
            <span className="flex items-center gap-1 text-xs font-medium text-green-600">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Live
            </span>
          )}
        </div>

        {/* s3-poll-expiry: expired banner */}
        {isExpired && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            This poll has expired. Voting is closed.
          </div>
        )}

        {/* Options / vote bars */}
        <div className="space-y-4">
          {poll.options.map((option) => {
            const pct =
              poll.totalVotes > 0
                ? Math.round((option.votes / poll.totalVotes) * 100)
                : 0;
            const canVote = !voted && !isExpired && !voting;

            return (
              <div key={option.id} className="relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{option.text}</span>
                  <span className="text-sm text-gray-500">
                    {option.votes} ({pct}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-10 relative overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                  {canVote && (
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

        {/* Vote message */}
        {voteMsg && (
          <p
            className={`mt-5 text-center text-sm font-medium ${
              voteMsg.startsWith("✓") ? "text-green-600" : "text-gray-600"
            }`}
          >
            {voteMsg}
          </p>
        )}

        <div className="mt-8 text-center">
          <a href="/create" className="text-blue-600 hover:text-blue-800 text-sm">
            Create your own poll
          </a>
        </div>
      </div>
    </div>
  );
}
