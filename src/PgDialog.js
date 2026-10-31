// PG-PGDIALOG-2026-10-31: Press Golf branded dialogs, app-wide.
// Android titles a native window.confirm / window.alert with the site
// address ("press-golf.vercel.app says"), which reads like the wrong app.
// These helpers render the same question inside the app itself, with a
// "Press Golf" header, so no browser popup ever appears.
//   pgConfirm(message, confirmLabel) -> Promise<boolean>
//   pgAlert(message)                 -> Promise that resolves on OK
// Plain DOM (not a React component) so any file can use them without
// wiring dialog state through its component tree.

const PG_THEME = {
  bg: "#080f0a", surface: "#0e1a10", card: "#121e14",
  border: "rgba(123,180,80,0.18)", green: "#7bb450", gold: "#e8b84b",
  red: "#e05050", text: "#e8f0e9", muted: "#6b7f6d",
};

function showPgDialog({ message, confirmLabel, cancelLabel }) {
  const old = document.getElementById("pg-dialog-root");
  if (old) old.remove();
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.id = "pg-dialog-root";
    root.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;";
    const card = document.createElement("div");
    card.style.cssText = "background:" + PG_THEME.card + ";border:1px solid " + PG_THEME.border + ";border-radius:16px;padding:22px;width:100%;max-width:340px;font-family:Georgia,serif;";
    const title = document.createElement("div");
    title.style.cssText = "font-weight:800;font-size:18px;color:" + PG_THEME.text + ";margin-bottom:10px;";
    title.textContent = "⛳ Press Golf";
    const msg = document.createElement("div");
    msg.style.cssText = "font-size:15px;line-height:1.4;color:" + PG_THEME.text + ";margin-bottom:20px;";
    msg.textContent = message;
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:10px;justify-content:flex-end;";
    const finish = (value) => { root.remove(); resolve(value); };
    if (cancelLabel) {
      const cancelBtn = document.createElement("button");
      cancelBtn.style.cssText = "background:" + PG_THEME.surface + ";border:1px solid " + PG_THEME.border + ";color:" + PG_THEME.text + ";font-size:15px;font-weight:700;padding:10px 20px;border-radius:10px;cursor:pointer;";
      cancelBtn.textContent = cancelLabel;
      cancelBtn.onclick = () => finish(false);
      row.appendChild(cancelBtn);
    }
    const okBtn = document.createElement("button");
    const danger = confirmLabel === "Delete" || confirmLabel === "Discard";
    okBtn.style.cssText = "background:" + (danger ? PG_THEME.red : PG_THEME.green) + ";border:1px solid " + (danger ? PG_THEME.red : PG_THEME.green) + ";color:#fff;font-size:15px;font-weight:700;padding:10px 20px;border-radius:10px;cursor:pointer;";
    okBtn.textContent = confirmLabel;
    okBtn.onclick = () => finish(true);
    row.appendChild(okBtn);
    card.appendChild(title);
    card.appendChild(msg);
    card.appendChild(row);
    root.appendChild(card);
    root.onclick = (e) => { if (e.target === root) finish(cancelLabel ? false : true); };
    document.body.appendChild(root);
  });
}

export function pgConfirm(message, confirmLabel) {
  return showPgDialog({ message, confirmLabel: confirmLabel || "OK", cancelLabel: "Cancel" });
}

export function pgAlert(message) {
  return showPgDialog({ message, confirmLabel: "OK", cancelLabel: null });
}
