"use client";

import { useState } from "react";

import {
  chatSettingAction,
  createGroupChatAction,
  deleteChatMessageAction,
  groupCommandAction,
  loadChatDetailsAction,
  loadChatMessagesFromAction,
  loadGroupMembersAction,
  loadOlderChatMessagesAction,
  refreshChatListAction,
  reportChatAction,
  respondToGroupInviteAction,
  saveChatAttachmentToDocumentsAction,
  searchChatAction,
  sendChatMessageAction,
  syncChatAction,
} from "@/app/chats/actions";
import { openVideoCallAction } from "@/app/calls/actions";
import { submitReportAction } from "@/app/reports/actions";
import { createChatRealtime } from "@/lib/dependencies/client";
import type { ChatPageModel } from "@/models/chat/chat.model";
import { ChatWorkspace, type ChatActions } from "@/views/chat/chat-workspace.view";

const actions: ChatActions = {
  send: sendChatMessageAction,
  remove: deleteChatMessageAction,
  sync: syncChatAction,
  loadOlder: loadOlderChatMessagesAction,
  loadFrom: loadChatMessagesFromAction,
  refreshList: refreshChatListAction,
  saveToDocuments: saveChatAttachmentToDocumentsAction,
  applySetting: chatSettingAction,
  report: reportChatAction,
  loadDetails: loadChatDetailsAction,
  search: searchChatAction,
  createGroup: createGroupChatAction,
  respondToInvite: respondToGroupInviteAction,
  groupCommand: groupCommandAction,
  loadMembers: loadGroupMembersAction,
  openCall: openVideoCallAction,
  reportMessage: submitReportAction,
};

/** Client entry point: assembles the browser realtime adapter for the view. */
export function ConnectedChatWorkspace({ model }: { readonly model: ChatPageModel }) {
  const [realtime] = useState(createChatRealtime);

  return <ChatWorkspace model={model} actions={actions} realtime={realtime} />;
}
