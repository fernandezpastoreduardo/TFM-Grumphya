import { BUTTON_TEXT } from "./user-delete.constants";

export function getConfirmButtonText(isDeleting: boolean): string {
  return isDeleting ? BUTTON_TEXT.DELETING : BUTTON_TEXT.CONFIRM;
}

export function openDeleteDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

export function closeDeleteDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}
