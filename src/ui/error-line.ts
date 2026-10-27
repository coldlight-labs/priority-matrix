/** A hidden field error line; set its text and unhide it to show a message. */
export function errorLine(id: string): HTMLElement {
  const p = document.createElement("p");
  p.id = id;
  p.className = "field-error";
  p.setAttribute("role", "alert");
  p.hidden = true;
  return p;
}
