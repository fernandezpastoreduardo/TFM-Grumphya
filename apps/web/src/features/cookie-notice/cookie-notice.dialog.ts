export function closeCookieDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}
