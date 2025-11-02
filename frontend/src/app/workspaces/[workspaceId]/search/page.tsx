"use client";

import SearchView from "@/components/search/SearchView";

type WorkspaceSearchPageProps = {
  params: {
    workspaceId: string;
  };
};

export default function WorkspaceSearchPage({
  params,
}: WorkspaceSearchPageProps) {
  return <SearchView workspaceId={params.workspaceId} />;
}
