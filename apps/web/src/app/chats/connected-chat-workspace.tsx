"use client";

import { useState } from "react";

import {
  chatSettingAction,
  deleteChatMessageAction,
  loadChatDetailsAction,
  loadChatMessagesFromAction,
  loadOlderChatMessagesAction,
  refreshChatListAction,
  reportChatAction,
  saveChatAttachmentToDocumentsAction,
  searchChatAction,
  sendChatMessageAction,
  syncChatAction,
} from "@/app/chats/actions";
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
};

/** Client entry point: assembles the browser realtime adapter for the view. */
export function ConnectedChatWorkspace({ model }: { readonly model: ChatPageModel }) {
  const [realtime] = useState(createChatRealtime);

  return <ChatWorkspace model={model} actions={actions} realtime={realtime} />;
}
