/**
 * Study recommendations (Take Quiz use case, steps 8-10).
 *
 * After an attempt, every question is linked to the topic it was generated
 * from: its grounding sentences are matched against the sentences that
 * content analysis grouped into each topic. Topic accuracy then shows the
 * student's strengths and weaknesses, and simple rules turn the score into
 * next steps. No extra AI call is needed, so the recommendation is instant
 * and explainable.
 */

export type MasteryLevel = "mastered" | "on_track" | "needs_review";

/** Score bands for the advice. */
export const masteryThresholds = { mastered: 85, onTrack: 60 } as const;
/** A topic below this accuracy is listed as one to revise. */
export const weakTopicThreshold = 70;

export interface RecommendationQuestion {
  readonly position: number;
  readonly isCorrect: boolean;
  /** Text of the sentences the question was generated from. */
  readonly sourceSentences: readonly string[];
  /** Positions in the sentence list sent to the generator (older quizzes only have these). */
  readonly sourceSentenceIndexes: readonly number[];
}

export interface RecommendationTopic {
  readonly label: string;
  readonly keywords: readonly string[];
  readonly sentenceIndexes: readonly number[];
  readonly sentences: readonly string[];
}

/** What the recommendation needs to know about the quiz's source material. */
export interface RecommendationContext {
  readonly quizId: number;
  readonly documentId: number;
  readonly topics: readonly RecommendationTopic[];
  /** Important sentences from content analysis, most important first. */
  readonly importantSentences: readonly string[];
  /** Sentence count of the analysis, used to trust index matching on older quizzes. */
  readonly analysisSentenceCount: number | null;
  /** Score of the previous attempt at the same quiz, if any. */
  readonly previousPercentage: number | null;
}

export interface TopicPerformance {
  readonly label: string;
  readonly keywords: readonly string[];
  readonly correct: number;
  readonly total: number;
  readonly percentage: number;
  /** Sentences worth re-reading for this topic. */
  readonly keySentences: readonly string[];
}

export interface StudyRecommendation {
  readonly level: MasteryLevel;
  readonly headline: string;
  readonly summary: string;
  readonly steps: readonly string[];
  readonly weakTopics: readonly TopicPerformance[];
  readonly strongTopics: readonly TopicPerformance[];
  readonly missedPositions: readonly number[];
  readonly links: {
    readonly revise?: string;
    readonly retake?: string;
    readonly newQuiz?: string;
  };
}

/** The use case's confirmation message (M2). */
export const recommendationNotice =
  "Quiz completed. Your result and study recommendation are displayed below.";

function normalise(sentence: string): string {
  return sentence.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function list(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";

  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export function masteryLevel(percentage: number): MasteryLevel {
  if (percentage >= masteryThresholds.mastered) return "mastered";
  if (percentage >= masteryThresholds.onTrack) return "on_track";

  return "needs_review";
}

/** Index of the topic a question came from, or null when it cannot be told. */
export function topicForQuestion(
  question: RecommendationQuestion,
  topics: readonly RecommendationTopic[],
  analysisSentenceCount: number | null,
): number | null {
  let best: number | null = null;
  let bestScore = 0;
  const sources = question.sourceSentences.map(normalise);

  topics.forEach((topic, index) => {
    let score = 0;

    if (sources.length > 0) {
      const topicSentences = new Set(topic.sentences.map(normalise));
      score = sources.filter((sentence) => topicSentences.has(sentence)).length;
    } else if (
      analysisSentenceCount !== null &&
      question.sourceSentenceIndexes.length > 0 &&
      question.sourceSentenceIndexes.every((value) => value < analysisSentenceCount)
    ) {
      // Older quizzes stored positions only. They line up with the analysis
      // when both were made from the same sentence list.
      const indexes = new Set(topic.sentenceIndexes);
      score = question.sourceSentenceIndexes.filter((value) => indexes.has(value)).length;
    }

    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });

  return best;
}

function keySentencesFor(
  topic: RecommendationTopic,
  missed: readonly RecommendationQuestion[],
  importantSentences: readonly string[],
): string[] {
  const inTopic = new Set(topic.sentences.map(normalise));
  const important = importantSentences.filter((sentence) => inTopic.has(normalise(sentence)));
  const fromMissed = missed.flatMap((question) => question.sourceSentences);
  const chosen: string[] = [];

  for (const sentence of [...important, ...fromMissed, ...topic.sentences]) {
    if (chosen.length >= 2) break;
    if (!chosen.some((existing) => normalise(existing) === normalise(sentence))) {
      chosen.push(sentence);
    }
  }

  return chosen;
}

function topicPerformance(
  questions: readonly RecommendationQuestion[],
  context: RecommendationContext,
): TopicPerformance[] {
  const grouped = new Map<number, RecommendationQuestion[]>();

  for (const question of questions) {
    const topic = topicForQuestion(question, context.topics, context.analysisSentenceCount);

    if (topic !== null) {
      grouped.set(topic, [...(grouped.get(topic) ?? []), question]);
    }
  }

  return [...grouped.entries()].map(([index, topicQuestions]) => {
    const topic = context.topics[index];
    const correct = topicQuestions.filter((question) => question.isCorrect).length;

    return {
      label: topic.label,
      keywords: topic.keywords,
      correct,
      total: topicQuestions.length,
      percentage: Math.round((correct / topicQuestions.length) * 100),
      keySentences: keySentencesFor(
        topic,
        topicQuestions.filter((question) => !question.isCorrect),
        context.importantSentences,
      ),
    };
  });
}

/** Rule-based recommendation from one graded attempt. */
export function buildStudyRecommendation(
  questions: readonly RecommendationQuestion[],
  percentage: number,
  context: RecommendationContext | null,
): StudyRecommendation {
  const level = masteryLevel(percentage);
  const missed = questions.filter((question) => !question.isCorrect);
  const topics = context ? topicPerformance(questions, context) : [];
  const weakTopics = topics
    .filter((topic) => topic.percentage < weakTopicThreshold)
    .sort((a, b) => a.percentage - b.percentage || b.total - a.total);
  const strongTopics = topics
    .filter((topic) => topic.percentage === 100)
    .sort((a, b) => b.total - a.total);
  const weakLabels = weakTopics.slice(0, 3).map((topic) => topic.label);
  const missedCount = missed.length;
  const steps: string[] = [];
  let headline: string;

  if (level === "mastered") {
    headline = "You have a strong grasp of this material.";
    if (weakLabels.length > 0) {
      steps.push(`Give ${list(weakLabels)} a quick re-read; it is the only area you slipped on.`);
    }
    steps.push("Generate a new quiz on Hard difficulty to stretch yourself.");
    steps.push("Move on to your next document, and come back to this one in a week to keep it fresh.");
  } else if (level === "on_track") {
    headline = "Good progress, with a few gaps to close.";
    steps.push(
      weakLabels.length > 0
        ? `Re-read the key sentences for ${list(weakLabels)} below.`
        : "Re-read the key sentences from your content analysis.",
    );
    if (missedCount > 0) {
      steps.push(`Read the explanation for the ${missedCount} ${missedCount === 1 ? "question" : "questions"} you missed.`);
    }
    steps.push("Retake this quiz in a day or two to lock it in.");
  } else {
    headline = "This material needs another look before you move on.";
    steps.push("Open the document's content analysis and read its key terms and important sentences first.");
    if (weakLabels.length > 0) {
      steps.push(`Focus your revision on ${list(weakLabels)}.`);
    }
    if (missedCount > 0) {
      steps.push(`Go through the explanations for the ${missedCount} questions you missed.`);
    }
    steps.push(`Retake the quiz after revising. Aim for at least ${masteryThresholds.onTrack}%.`);
  }

  const previous = context?.previousPercentage ?? null;
  const trend =
    previous === null
      ? ""
      : percentage > previous
        ? ` That is up ${percentage - previous} points on your last attempt.`
        : percentage < previous
          ? ` That is down ${previous - percentage} points on your last attempt.`
          : " That matches your last attempt.";
  const strengths =
    strongTopics.length > 0
      ? ` Strong on ${list(strongTopics.slice(0, 3).map((topic) => topic.label))}.`
      : "";

  return {
    level,
    headline,
    summary: `You scored ${percentage}%.${trend}${strengths}`,
    steps,
    weakTopics,
    strongTopics,
    missedPositions: missed.map((question) => question.position),
    links: context
      ? {
          revise: `/documents/${context.documentId}`,
          retake: `/quizzes?quizId=${context.quizId}`,
          newQuiz: `/quizzes?documentId=${context.documentId}`,
        }
      : {},
  };
}
