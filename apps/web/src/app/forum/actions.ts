"use server";

import { revalidatePath } from "next/cache";

import {
  createForumController,
  createProfileController,
  createReportController,
} from "@/lib/dependencies/server";
import type {
  ForumCommentFormState,
  ForumEditFormState,
  ForumReportFormState,
  ForumThreadFormState,
  ForumThreadFormValues,
} from "@/models/forum/forum.model";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function positiveId(formData: FormData, name: string): number | null {
  const value = Number(field(formData, name));

  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function currentViewer() {
  const profiles = await createProfileController();

  return profiles.currentViewer();
}

export async function createForumThreadAction(
  _previous: ForumThreadFormState,
  formData: FormData,
): Promise<ForumThreadFormState> {
  const values: ForumThreadFormValues = {
    title: field(formData, "title"),
    content: field(formData, "content"),
  };
  const attachments = formData
    .getAll("attachments")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const viewer = await currentViewer();

  if (!viewer) {
    return { error: "Your session expired. Sign in and try again.", values };
  }

  const forum = await createForumController();
  const state = await forum.createThread({
    authorId: viewer.id,
    values,
    attachments,
  });

  if (state.notice) {
    revalidatePath("/forum");
  }

  return state;
}

export async function addForumCommentAction(
  _previous: ForumCommentFormState,
  formData: FormData,
): Promise<ForumCommentFormState> {
  const content = field(formData, "content");
  const threadId = positiveId(formData, "threadId");
  const viewer = await currentViewer();

  if (!viewer) {
    return { error: "Your session expired. Sign in and try again.", value: content };
  }

  if (threadId === null) {
    return { error: "The discussion could not be identified.", value: content };
  }

  const forum = await createForumController();
  const state = await forum.addComment({ threadId, authorId: viewer.id, content });

  if (state.notice) {
    revalidatePath("/forum");
  }

  return state;
}

export async function toggleForumUpvoteAction(formData: FormData): Promise<void> {
  const threadId = positiveId(formData, "threadId");
  const viewer = await currentViewer();

  if (!viewer || threadId === null) {
    return;
  }

  const forum = await createForumController();
  await forum.toggleUpvote(threadId, viewer.id);
  revalidatePath("/forum");
}

export async function deleteForumThreadAction(formData: FormData): Promise<void> {
  const threadId = positiveId(formData, "threadId");
  const viewer = await currentViewer();

  if (!viewer || threadId === null) {
    return;
  }

  const forum = await createForumController();
  await forum.deleteThread(threadId);
  revalidatePath("/forum");
}

export async function deleteForumCommentAction(formData: FormData): Promise<void> {
  const commentId = positiveId(formData, "commentId");
  const viewer = await currentViewer();

  if (!viewer || commentId === null) {
    return;
  }

  const forum = await createForumController();
  await forum.deleteComment(commentId);
  revalidatePath("/forum");
}

export async function reportForumContentAction(
  _previous: ForumReportFormState,
  formData: FormData,
): Promise<ForumReportFormState> {
  const viewer = await currentViewer();

  if (!viewer) {
    return { error: "Your session expired. Sign in and try again." };
  }

  const threadId = positiveId(formData, "threadId");
  const commentId = positiveId(formData, "commentId");

  if ((threadId === null) === (commentId === null)) {
    return { error: "Choose a post or a comment to report." };
  }

  const reports = await createReportController();
  const state = await reports.submit({
    targetType: threadId !== null ? "forum_thread" : "forum_comment",
    targetId: threadId ?? commentId,
    targetUserId: null,
    reason: field(formData, "category"),
    details: field(formData, "details"),
  });

  if (state.notice) {
    revalidatePath("/admin/forum");
    revalidatePath("/admin/report-review");
  }

  return state;
}

export async function editForumThreadAction(
  _previous: ForumEditFormState,
  formData: FormData,
): Promise<ForumEditFormState> {
  const viewer = await currentViewer();
  const threadId = positiveId(formData, "threadId");

  if (!viewer) {
    return { error: "Your session expired. Sign in and try again." };
  }

  if (threadId === null) {
    return { error: "This post could not be found." };
  }

  const state = await (await createForumController()).editThread({
    threadId,
    authorId: viewer.id,
    values: { title: field(formData, "title"), content: field(formData, "content") },
  });

  if (state.notice) {
    revalidatePath("/forum");
  }

  return state;
}

export async function editForumCommentAction(
  _previous: ForumEditFormState,
  formData: FormData,
): Promise<ForumEditFormState> {
  const viewer = await currentViewer();
  const commentId = positiveId(formData, "commentId");

  if (!viewer) {
    return { error: "Your session expired. Sign in and try again." };
  }

  if (commentId === null) {
    return { error: "This comment could not be found." };
  }

  const state = await (await createForumController()).editComment({
    commentId,
    authorId: viewer.id,
    content: field(formData, "content"),
  });

  if (state.notice) {
    revalidatePath("/forum");
  }

  return state;
}
