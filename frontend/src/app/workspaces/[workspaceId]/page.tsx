"use client";

import WorkspacePage from "@/components/WorkspacePage";

type WorkspaceRoutePageProps = {
  params: {
    workspaceId: string;
  };
};

export default function WorkspaceRoutePage({ params }: WorkspaceRoutePageProps) {
  return <WorkspacePage initialWorkspaceId={params.workspaceId} />;
}
