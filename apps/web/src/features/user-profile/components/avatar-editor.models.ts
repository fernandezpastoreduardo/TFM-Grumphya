export type AvatarEditorDialogProps = {
  avatarUrl: string | null | undefined;
  username: string;
  uploading: boolean;
  uploadError: string;
  onClose: () => void;
  onUpload: (file: File) => Promise<boolean>;
};

export type DragPoint = { x: number; y: number };
