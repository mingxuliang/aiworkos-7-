/**
 * Global store for files staged from Material Center to be attached to the next chat message.
 */
import { create } from 'zustand';

export interface PendingChatFile {
  /** Unique identifier (file id or llm-output id as string). */
  id: string;
  filename: string;
  /** Accessible URL sent to the backend (MinIO or /api/files/.../download). */
  url: string;
  mimeType: string;
  size: number;
}

interface PendingChatFilesState {
  files: PendingChatFile[];
  addFile: (file: PendingChatFile) => void;
  removeFile: (id: string) => void;
  clear: () => void;
}

export const usePendingChatFilesStore = create<PendingChatFilesState>((set) => ({
  files: [],
  addFile: (file) =>
    set((state) => ({
      files: state.files.some((f) => f.id === file.id)
        ? state.files
        : [...state.files, file],
    })),
  removeFile: (id) =>
    set((state) => ({ files: state.files.filter((f) => f.id !== id) })),
  clear: () => set({ files: [] }),
}));
