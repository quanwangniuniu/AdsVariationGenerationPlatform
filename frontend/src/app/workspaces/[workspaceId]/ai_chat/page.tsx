"use client";

import AiChatView from "@/components/ai-chat/AiChatView";

type WorkspaceAiChatPageProps = {
  params: {
    workspaceId: string;
  };
};

export default function WorkspaceAiChatPage({
  params,
}: WorkspaceAiChatPageProps) {
  return <AiChatView workspaceId={params.workspaceId} />;
}
