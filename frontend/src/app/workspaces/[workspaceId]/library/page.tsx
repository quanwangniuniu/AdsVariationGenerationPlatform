"use client";

import LibraryView from "@/components/library/LibraryView";

type WorkspaceLibraryPageProps = {
  params: {
    workspaceId: string;
  };
};

export default function WorkspaceLibraryPage({
  params,
}: WorkspaceLibraryPageProps) {
  return <LibraryView workspaceId={params.workspaceId} />;
}
