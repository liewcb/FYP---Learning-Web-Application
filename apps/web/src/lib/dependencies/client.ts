import type { ChatRealtime } from "@/interfaces/services/chat-realtime.interface";
import { createClient } from "@/lib/supabase/client";
import { SupabaseChatRealtime } from "@/lib/supabase/realtime/supabase-chat-realtime";

/** Browser-side dependencies, assembled by client entry points under app/. */
export function createChatRealtime(): ChatRealtime {
  return new SupabaseChatRealtime(createClient());
}
