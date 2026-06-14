import { useEffect, useState } from "react";
import {
  readUploadedFilesFromStorage,
  UPLOADED_FILES_UPDATED_EVENT,
  type UploadedFile,
} from "@/lib/uploaded-files";

export function useUploadedFiles(): UploadedFile[] {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  useEffect(() => {
    const updateFiles = () => {
      setFiles(readUploadedFilesFromStorage());
    };

    // Initial load
    updateFiles();

    // Listen for updates
    window.addEventListener(UPLOADED_FILES_UPDATED_EVENT, updateFiles);
    return () => {
      window.removeEventListener(UPLOADED_FILES_UPDATED_EVENT, updateFiles);
    };
  }, []);

  return files;
}
