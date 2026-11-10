// The bar of a pop-out window (T70, bin/crewpopout.py): a second Herdr window that shows one topic's
// live terminal under this 30 px bar, so the window manager can float it, pin it to every workspace
// and resize it. It runs in the pop-out's own small app home, not the main one, so it reads nothing
// of the crew's state: everything comes in props { pal, topic, space, tab, home, key, terminal }
// (`home`: the main app home, where the owner's click tokens and the pal command's data live).
//
// Pin: pins or unpins this one window (Hyprland; Omarchy's Super+O works on it too). Open topic:
// shows the topic in the main Herdr window and closes this one. ×: closes the window; the pal keeps
// running. Size, place and pin are remembered per topic by the watcher beside the window.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, props, run, exec, home, readTextFile, writeTextFile, notify } from "herdr";
import { ds, tone } from "./crew.js";

const ICON = "mods/crew-roster/icons";

// The owner's click for exactly these arguments, written where the main install's pal command reads
// it (bin/crewlib.py owner_gate), then the command, pointed at the main app home.
export async function ownerPal(mainHome, args) {
  const nonce = Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  const dir = `${mainHome}/data/crew-clicks`;
  await exec("mkdir", ["-p", dir]);
  await writeTextFile(`${dir}/${nonce}.json`, JSON.stringify({ args, at: Date.now() }), null);
  const r = await exec("env", [`HERDR_APP_HOME=${mainHome}`, `${home()}/.local/bin/pal`, ...args, "--click", nonce]);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n").slice(-2).join(" ") || "pal failed");
  return r.stdout.trim();
}

export default class CrewPopoutBar extends View {
  init(_props, cx) {
    this.pinned = false;
    this.busy = false;
    // What's remembered for this topic, kept current: the watcher beside the window saves the pin
    // every 2 s, so a pin made with Super+O shows here too.
    const load = async (cx) => { if (!this.busy && await this.load()) cx.notify(); };
    cx.spawn(load);
    cx.timer.every(3000, (cx) => { load(cx); });
  }

  // True when the remembered pin differs from what the bar shows.
  async load() {
    const p = props() ?? {};
    try {
      const store = JSON.parse(await readTextFile(`${p.home}/data/crew-popout.json`));
      const pinned = Boolean(store?.[p.key]?.pinned);
      if (pinned === this.pinned) return false;
      this.pinned = pinned;
      return true;
    } catch { return false; }
  }

  async pin(cx) {
    const p = props() ?? {};
    if (this.busy) return;
    this.busy = true;
    try {
      this.pinned = (await ownerPal(p.home, ["popout", "pin", p.key])) === "pinned";
    } catch (e) {
      notify({ title: "Couldn't pin it", body: `${String(e?.message ?? e)} Omarchy's Super+O pins a window too.`, level: "warning", timeout: 7000 });
    }
    this.busy = false;
    cx.notify();
  }

  async dock() {
    const p = props() ?? {};
    const main = (cmd, args) => exec("env", [`HERDR_APP_HOME=${p.home}`, "herdr-app", "do", cmd, JSON.stringify(args)]);
    try {
      if (p.space) await main("space.select", { id: p.space });
      if (p.tab) await main("tab.select", { id: p.tab });
    } catch { /* the main window is closed: just close this one */ }
    run("window.close");
  }

  render() {
    const d = ds(tone(theme()));
    const p = props() ?? {};
    const stop = (el) => el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
    const btn = (id, tip) => stop(h_flex().id(id).h(22).px(7).flex_none().items_center().gap(5).rounded(d.r.sm).cursor_pointer()
      .tooltip(tip).hover((s) => s.bg(d.hover)));
    return h_flex().id("popout-bar").size_full().items_center().gap(8).pl(10).pr(5).bg(d.bg1).border_b_1().border_color(d.line).text_color(d.fg1)
      .child(svg(`${ICON}/ds-terminal.svg`).size(12).flex_none().text_color(d.iconOn))
      .child(div().flex_none().max_w(180).truncate().text_size(12.5).font_weight(600).child(p.pal ?? "Pal"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_family(d.mono).text_color(d.fg2).child(p.topic ? `#${p.topic}` : ""))
      .child(btn("popout-pin", this.pinned ? "Pinned: on every workspace. Click to unpin" : "Pin: keep it on every workspace")
        .when(this.pinned, (el) => el.bg(d.sel))
        .on_click((_e, cx) => this.pin(cx))
        .child(svg(`${ICON}/pin.svg`).size(11).flex_none().text_color(this.pinned ? d.infoText : d.fg3))
        .child(div().text_size(12).text_color(this.pinned ? d.fg1 : d.fg2).child(this.pinned ? "Pinned" : "Pin")))
      .child(btn("popout-dock", "Show this topic in the main window and close this one")
        .on_click(() => this.dock())
        .child(div().text_size(12).text_color(d.fg2).child("Open topic")))
      .child(stop(div().id("popout-x").size(22).flex_none().flex().items_center().justify_center().rounded(d.r.sm).cursor_pointer()
        .tooltip("Close the window (the pal keeps running)").hover((s) => s.bg(d.hover)).on_click(() => run("window.close"))
        .child(svg(`${ICON}/x.svg`).size(10).text_color(d.fg3))));
  }
}
