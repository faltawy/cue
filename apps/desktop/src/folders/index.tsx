import { Trans } from "@lingui/react/macro";

import { FolderSimple } from "@anlg/ui/components/icons";

import { FolderEditor } from "./folder-editor";
import { useActiveFolderPath } from "./selection";

import { useFolderPaths } from "~/session/queries";
import { StandardContentWrapper } from "~/shared/main";
import { EmptyState } from "~/shared/ui/empty-state";

export function TabContentFolders() {
  return (
    <StandardContentWrapper>
      <div className="h-full">
        <FoldersMain />
      </div>
    </StandardContentWrapper>
  );
}

export function FoldersMain() {
  const folders = useFolderPaths();
  const activeFolder = useActiveFolderPath(folders);

  if (!activeFolder) {
    return (
      <EmptyState
        icon={FolderSimple}
        title={<Trans>No folders yet</Trans>}
        description={
          <Trans>
            Create a folder from the sidebar to group related notes and files.
          </Trans>
        }
      />
    );
  }

  return <FolderEditor key={activeFolder} folderPath={activeFolder} />;
}
