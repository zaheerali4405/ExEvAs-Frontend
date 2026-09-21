// AntD marks a Form.Item's tooltip with a question mark, which reads as
// "something is unclear" rather than "here is more detail". Every tooltip in
// the app goes through this helper instead, so they all carry the same
// italic "i" marker.
//
// Usage: tooltip={infoTip("...")} — a null/undefined title yields undefined,
// so a conditional tooltip simply doesn't render its marker.
const INFO_ICON = (
  <span
    style={{
      fontStyle: "italic",
      fontWeight: 700,
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: 13,
      lineHeight: 1,
      color: "#8c8c8c",
      cursor: "help",
    }}
  >
    i
  </span>
);

export function infoTip(title) {
  if (!title) return undefined;
  return { title, icon: INFO_ICON };
}
