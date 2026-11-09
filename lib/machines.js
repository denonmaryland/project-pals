// Which computer a pal works on (DeNon 2026-11-08): this computer, or a machine Herdr reaches over
// ssh (`hc machine ls`: macbookey, peecee, maybe a rented server later). Pure (no Herdr imports),
// so node tests can cover it (tests/test_machines.mjs). install.sh copies this file into every mod
// next to crew.js, which re-exports it.
//
// A machine entry, as the roster publishes them (shared "crew.machines", from `hc machine ls --json`):
//   { name, host, target, via, state: "connected" | ..., temporary }   (another machine)
//   { name: null, host: "denonomarchy", local: true, kind: "laptop" | "desktop", state: "connected" } (this one)
// A pal's record keeps where its new topics start (`machine`, null for this computer), the folder
// there (`folder`), the folder it had on each machine it worked on (`folders`, keyed by machineKey),
// and its other open spaces (`also`: after a move, the topics still running on the old machine).

export const machineKey = (name) => name ?? "";
export const sameMachine = (x, y) => (x ?? null) === (y ?? null);
export const machineLabel = (name) => name ?? "this computer";

// Tailscale hands out 100.64.0.0/10 (100.64.x.x - 100.127.x.x) and *.ts.net names.
export function isTailscale(target) {
  const host = String(target ?? "").replace(/^[^@]*@/, "").replace(/:\d+$/, "");
  if (/\.ts\.net$/i.test(host)) return true;
  const m = host.match(/^100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  return Boolean(m) && Number(m[1]) >= 64 && Number(m[1]) <= 127;
}

// How Herdr reaches it, in words: "this computer", "SSH via Tailscale", "SSH", "via <command>".
export function connectionOf(m) {
  if (!m || m.local) return "this computer";
  if (m.via) return `via ${String(m.via === true ? "a command" : m.via).split(" ")[0]}`;
  return isTailscale(m.target) ? "SSH via Tailscale" : "SSH";
}

// laptop / desktop / server: a saved choice (settings.machineKinds[name]) wins; this computer says
// itself (a battery: laptop); others go by their names; anything else is a server.
export const MACHINE_KINDS = ["laptop", "desktop", "server"];
export function machineKind(m, kinds = {}) {
  const set = kinds?.[machineKey(m?.name)];
  if (MACHINE_KINDS.includes(set)) return set;
  if (m?.local) return m.kind === "desktop" ? "desktop" : m.kind === "laptop" ? "laptop" : "desktop";
  const s = `${m?.name ?? ""} ${m?.host ?? ""}`.toLowerCase();
  if (/macbook|laptop|notebook|thinkpad|xps|zenbook|framework|book\b/.test(s)) return "laptop";
  if (/desktop|\bpc\b|peecee|tower|imac|workstation|mac-?mini|studio/.test(s)) return "desktop";
  return "server";
}
export const kindIcon = (kind) => `ds-${MACHINE_KINDS.includes(kind) ? kind : "server"}`;

// Is it up? "connected", "offline", or whatever hc says ("needs login", "connecting").
export function machineState(m) {
  if (!m) return { word: "unknown", up: false };
  if (m.local) return { word: "connected", up: true };
  const st = String(m.state ?? "unknown").replace(/_/g, " ");
  return { word: st, up: st === "connected" };
}

// Every machine to choose from: this computer first, then the added ones in hc's order.
export function machineList(published) {
  const list = Array.isArray(published?.list) ? published.list : [];
  const local = published?.local ?? { name: null, local: true, host: null, state: "connected" };
  return [{ ...local, name: null, local: true }, ...list.filter((m) => m && m.name)];
}
export const machineEntry = (published, name) => machineList(published).find((m) => sameMachine(m.name, name)) ?? (name ? { name, host: null, state: "unknown" } : machineList(published)[0]);

// Where the project probably is on another machine: the folder it had there before, else the same
// path under that machine's home ("/home/denon/Projects/x" → "/Users/mrmaryland/Projects/x").
export function guessFolder(folder, fromHome, toHome, remembered = null) {
  if (remembered) return remembered;
  const f = String(folder ?? "");
  if (!f) return toHome ?? "";
  const from = String(fromHome ?? "").replace(/\/$/, "");
  if (from && toHome && (f === from || f.startsWith(from + "/"))) return String(toHome).replace(/\/$/, "") + f.slice(from.length);
  return f;
}

// A pal's record after a move to machine `to` with `folder`: the old folder is remembered for its
// machine, so moving back offers it again. Spaces stay as they are (terminals can't move).
export function movedRecord(rec, to, folder) {
  const folders = { ...(rec.folders ?? {}) };
  if (rec.folder) folders[machineKey(rec.machine)] = rec.folder;
  folders[machineKey(to)] = folder;
  return { ...rec, machine: to ?? null, folder, folders };
}

// The pal list's machine tag: Rich detail and Table show it by default, other looks when you turn
// it on ("palMachine": true / false in crew-settings.json; unset: the look's default). Only pals on
// another machine get one: no tag means this computer.
export const MACHINE_TAG_LOOKS = ["rich", "table"];
export const machineTagOn = (settings, look) => (typeof settings?.palMachine === "boolean" ? settings.palMachine : MACHINE_TAG_LOOKS.includes(look));
