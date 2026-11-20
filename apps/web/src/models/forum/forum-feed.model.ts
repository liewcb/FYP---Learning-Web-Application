/**
 * "For you" ranking for the forum: a small, explainable content-based
 * recommender.
 *
 *   score = relevance × freshness
 *   relevance = base + topic match + study-buddy boost + popularity
 *   freshness = 0.5 ^ (age in hours / 72)       (halves every 3 days)
 *
 * Topic match compares a post's topics with the viewer's interest profile,
 * built from topics they follow and the topics of posts they wrote,
 * commented on or upvoted (recent activity counts more). Every ranked post
 * keeps the main reason it was chosen, which the page shows to the student.
 */

import type { ForumFeedReason } from "@/models/forum/forum.model";

export type InterestSource = "followed" | "posted" | "commented" | "upvoted";

export interface InterestSignal {
  readonly topic: string;
  readonly source: InterestSource;
  readonly occurredAt: string;
}

/** The lightweight facts needed to rank a post before it is fully loaded. */
export interface FeedCandidate {
  readonly id: number;
  readonly authorId: string;
  readonly topics: readonly string[];
  readonly createdAt: string;
  readonly upvoteCount: number;
  readonly commentCount: number;
}

export interface FeedContext {
  readonly viewerId: string;
  readonly buddyIds: ReadonlySet<string>;
  readonly followedTopics: ReadonlySet<string>;
  /** Topic -> interest weight between 0 and 1. */
  readonly interests: ReadonlyMap<string, number>;
  readonly now: Date;
}

export interface RankedCandidate {
  readonly candidate: FeedCandidate;
  readonly score: number;
  readonly reason: ForumFeedReason;
}

export const feedWeights = {
  /** Interest weight per signal before ageing. */
  signal: { followed: 3, posted: 2, commented: 1.5, upvoted: 1 } as Record<InterestSource, number>,
  /** Activity-based interest halves every 30 days; follows do not age. */
  interestHalfLifeDays: 30,
  /** Everyone gets a little relevance so new topics can still surface. */
  base: 0.15,
  topicMatch: 1.2,
  buddy: 0.8,
  popularity: 0.6,
  /** Upvotes + 2 × comments at which popularity is maxed out. */
  popularitySaturation: 20,
  freshnessHalfLifeHours: 72,
  /** No more than this many posts in a row from one author. */
  maxRunPerAuthor: 2,
} as const;

const dayMs = 24 * 60 * 60 * 1000;
const hourMs = 60 * 60 * 1000;

/** Turns follows and activity into topic weights scaled to 0-1. */
export function buildInterestProfile(
  signals: readonly InterestSignal[],
  now: Date,
): Map<string, number> {
  const totals = new Map<string, number>();

  for (const signal of signals) {
    const base = feedWeights.signal[signal.source];
    const ageDays = Math.max(0, (now.getTime() - Date.parse(signal.occurredAt)) / dayMs);
    const ageing =
      signal.source === "followed" || Number.isNaN(ageDays)
        ? 1
        : 0.5 ** (ageDays / feedWeights.interestHalfLifeDays);

    totals.set(signal.topic, (totals.get(signal.topic) ?? 0) + base * ageing);
  }

  const strongest = Math.max(0, ...totals.values());
  const profile = new Map<string, number>();

  if (strongest > 0) {
    for (const [topic, total] of totals) {
      profile.set(topic, total / strongest);
    }
  }

  return profile;
}

/**
 * Best-matching topic counts fully, the second half, the third a quarter, so
 * a post cannot score highly just by listing many topics.
 */
function topicMatch(
  topics: readonly string[],
  interests: ReadonlyMap<string, number>,
): { readonly value: number; readonly topic: string | null } {
  const matches = topics
    .map((topic) => ({ topic, weight: interests.get(topic) ?? 0 }))
    .filter((match) => match.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const value = matches.reduce((total, match, index) => total + match.weight * 0.5 ** index, 0);

  return { value, topic: matches[0]?.topic ?? null };
}

export function popularity(candidate: Pick<FeedCandidate, "upvoteCount" | "commentCount">): number {
  const engagement = candidate.upvoteCount + 2 * candidate.commentCount;

  return Math.min(1, Math.log1p(engagement) / Math.log1p(feedWeights.popularitySaturation));
}

export function freshness(createdAt: string, now: Date): number {
  const ageHours = Math.max(0, (now.getTime() - Date.parse(createdAt)) / hourMs);

  return Number.isNaN(ageHours) ? 0 : 0.5 ** (ageHours / feedWeights.freshnessHalfLifeHours);
}

export function scoreCandidate(candidate: FeedCandidate, context: FeedContext): RankedCandidate {
  const match = topicMatch(candidate.topics, context.interests);
  const isBuddy = context.buddyIds.has(candidate.authorId);
  const popular = popularity(candidate);
  const relevance =
    feedWeights.base +
    feedWeights.topicMatch * match.value +
    (isBuddy ? feedWeights.buddy : 0) +
    feedWeights.popularity * popular;
  const score = relevance * freshness(candidate.createdAt, context.now);

  // The reason names the strongest contribution, in the order a student
  // would find most meaningful.
  const topicPart = feedWeights.topicMatch * match.value;
  const buddyPart = isBuddy ? feedWeights.buddy : 0;
  let reason: ForumFeedReason;

  if (match.topic && topicPart >= buddyPart) {
    reason = context.followedTopics.has(match.topic)
      ? { kind: "followed_topic", topic: match.topic }
      : { kind: "interest_topic", topic: match.topic };
  } else if (isBuddy) {
    reason = { kind: "buddy" };
  } else if (popular >= 0.4) {
    reason = { kind: "popular" };
  } else {
    reason = { kind: "recent" };
  }

  return { candidate, score, reason };
}

/**
 * Ranks the viewer's candidates, leaves out their own posts (they are under
 * "My posts") and avoids long runs from a single author.
 */
export function rankFeed(
  candidates: readonly FeedCandidate[],
  context: FeedContext,
  limit: number,
): RankedCandidate[] {
  const ranked = candidates
    .filter((candidate) => candidate.authorId !== context.viewerId)
    .map((candidate) => scoreCandidate(candidate, context))
    .sort((a, b) => b.score - a.score || b.candidate.id - a.candidate.id);

  const result: RankedCandidate[] = [];
  const remaining = [...ranked];

  while (result.length < limit && remaining.length > 0) {
    const recentAuthors = result
      .slice(-feedWeights.maxRunPerAuthor)
      .map((item) => item.candidate.authorId);
    const blockedAuthor =
      recentAuthors.length === feedWeights.maxRunPerAuthor &&
      recentAuthors.every((author) => author === recentAuthors[0])
        ? recentAuthors[0]
        : null;
    const index = remaining.findIndex((item) => item.candidate.authorId !== blockedAuthor);
    const [next] = remaining.splice(index === -1 ? 0 : index, 1);

    result.push(next);
  }

  return result;
}

export function describeFeedReason(reason: ForumFeedReason, authorName: string): string {
  switch (reason.kind) {
    case "followed_topic":
      return `Because you follow #${reason.topic}`;
    case "interest_topic":
      return `Because you have been active in #${reason.topic}`;
    case "buddy":
      return `From your study buddy ${authorName}`;
    case "popular":
      return "Popular with other students";
    case "recent":
      return "New in the forum";
  }
}
