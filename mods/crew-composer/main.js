// Project Pals composer: message the shown channel, or any pal's channel with "@Pal#channel text".
// One component in both layout modes: a box with the prompt, then a control row (attach, the
// channel's brain and model, its permission mode, mic, voice, send). Only its width differs:
// 720 px centred in Focus, the full column in Pro. Mic and voice are visual only for now (no
// dictation backend yet); the brain and permission chips say what the channel runs with.
// It pastes into that channel's terminal with `hc send` (Enter included). A channel that's
// waiting on you isn't typed into: answer its question in the terminal.
//
// Attachments: the paperclip (recent files), dropping files on the box, or pasting an image.
// Each is copied to ~/.config/herdr-app/data/crew-attachments and sent as its path on its own
// line after the message, which Claude Code, Codex, Grok and the rest read as an attached file.

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { spaces, panes, terminals, theme, hc, notify, exec, appHome, openOverlay, shared, setShared, readTextFile } from "herdr";
import { owner, channelName, leadPane, a, shownRoom, roomMembers, roomTargets, appendRoomLog, deliverToRoom, tone, botOf, layoutMode, ds } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const STORE = "data/crew-attachments";
const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;

export default class CrewComposer extends View {
  init(_props, cx) {
    // One field per channel or room, each saying where it goes ("Message #pricing"); switching
    // keeps what you'd typed in each, like drafts.
    this.inputs = new Map();
    this.labels = new Map(); // key → the label its field was made with
    this.fallback = this.make("Message");
    this.ensure();
    // Fields can't be made while drawing, so a light check makes one when you switch somewhere new.
    cx.timer.every(200, (cx) => { if (this.ensure()) cx.notify(); });
    this.files = []; // { path (absolute, in the store), rel (for image()), name, image }
    this.sending = false;
    this.lastPick = shared("crew.attach.add")?.nonce ?? null;
    // The shown channel's model, as its agent reports it (crew-statusline), for the brain chip.
    this.model = null;
    const meta = (cx) => cx.spawn(async (cx) => {
      const tab = spaces().find((s) => s.active)?.tabs.find((x) => x.active);
      const term = tab ? leadPane(tab.id, panes())?.terminal : null;
      let m = null;
      try { m = term ? JSON.parse((await readTextFile(`${appHome()}/data/crew-status/${term}.json`)) ?? "null")?.model?.display_name ?? null : null; } catch { m = null; }
      if (m !== this.model) { this.model = m; cx.notify(); }
    });
    meta(cx);
    cx.timer.every(4000, (cx) => meta(cx));
  }

  // The brain and permission chips: what the shown channel runs, and whether it asks first.
  brainChips(t, d) {
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((x) => x.active);
    if (!space || !tab || shownRoom()) return [];
    const bot = botOf(space);
    if (!bot?.awake) return [];
    const term = leadPane(tab.id, panes())?.terminal;
    const argv = (terminals().find((x) => x.address === term)?.argv ?? []).join(" ");
    const bypass = /--dangerously-skip-permissions|--dangerously-bypass-approvals-and-sandbox|--yolo/.test(argv);
    // The boards' chips: 28 px r4 #2E2E30; the brain's 8 px swatch (Claude's #D97757), its name
    // 13/500 and model 13 #808082; the permission mode with an amber shield; each with a chevron.
    const chip = (id, kids, tip) => h_flex().id(id).flex_none().h(28).px(8).gap(6).items_center().rounded(d.r.sm).bg(d.ctl).tooltip(tip).children(kids);
    const caret = () => svg(`${ICON}/ds-chevron-down.svg`).size(12).flex_none().text_color(d.fg2);
    const claude = /claude/i.test(bot.harness ?? bot.harnessName ?? "");
    return [
      chip("cmp-brain", [
        div().size(8).flex_none().rounded(2).bg(claude ? d.claude : t.accent),
        div().text_size(13).line_height("16px").font_weight(500).text_color(d.fg1).child(bot.harnessName ?? "Agent"),
        ...(this.model ? [div().text_size(13).line_height("16px").text_color(d.fg2).child(this.model)] : []),
        caret(),
      ], "What this channel runs"),
      chip("cmp-perm", [
        svg(`${ICON}/ds-shield.svg`).size(13).flex_none().text_color(d.warn),
        div().text_size(13).line_height("16px").font_weight(500).text_color(d.fg1).child(bypass ? "Bypass" : "Ask first"),
        caret(),
      ], bypass ? "Runs without asking (permissions bypassed)" : "Asks before risky actions"),
    ];
  }

  // Where a message goes now, and that place's field.
  where() {
    const room = shownRoom();
    if (room) return { key: `room:${room.id}`, label: `Message #${room.name}` };
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((x) => x.active);
    return tab ? { key: `tab:${tab.id}`, label: `Talk to ${botOf(space)?.name ?? space.name} in #${channelName(tab)}…` } : { key: "none", label: "Message" };
  }

  make(label) {
    const input = InputState.new({ placeholder: label });
    input.on("submit", (_e, cx) => this.send(cx));
    input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    input.on("change", (_e, cx) => cx.notify());
    // A paste with no text: an image on the clipboard.
    input.on("paste_other", (_e, cx) => this.pasteImage(cx));
    return input;
  }

  // Make the field for where you are now, if it's new; true when one was made.
  ensure() {
    const w = this.where();
    const old = this.inputs.get(w.key);
    // Same place, same name: nothing to do. A renamed channel needs a new field, since a field's
    // label is fixed when it's made; what you'd typed moves over.
    if (old && this.labels.get(w.key) === w.label) return false;
    const input = this.make(w.label);
    const carry = old?.value() || this.fallback.value();
    if (carry) input.set_value(carry);
    this.fallback.set_value("");
    this.inputs.set(w.key, input);
    this.labels.set(w.key, w.label);
    if (this.typing) input.focus();
    return true;
  }

  field() { return this.inputs.get(this.where().key) ?? this.fallback; }


  stamp() { return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14); }

  // Copy files into the store so they outlive caches and show as thumbnails.
  add(paths, cx) {
    cx.spawn(async (cx) => {
      const dir = `${appHome()}/${STORE}`;
      for (const src of paths) {
        const name = src.split("/").pop();
        const file = `${this.stamp()}-${Math.random().toString(36).slice(2, 6)}-${name.replace(/[^\w.-]+/g, "_")}`;
        try {
          const r = await exec("sh", ["-c", 'mkdir -p "$1" && cp -- "$2" "$1/$3"', "sh", dir, src, file]);
          if (r.code !== 0) throw new Error(r.stderr.trim());
          this.files.push({ path: `${dir}/${file}`, rel: `${STORE}/${file}`, name, image: IMAGE.test(name) });
        } catch (e) {
          notify({ title: `Couldn't attach ${name}`, body: String(e).slice(0, 160), level: "warning" });
        }
      }
      cx.notify();
    });
  }

  pasteImage(cx) {
    cx.spawn(async (cx) => {
      const dir = `${appHome()}/${STORE}`;
      const file = `${this.stamp()}-pasted.png`;
      try {
        const r = await exec("sh", ["-c",
          'type=$(wl-paste --list-types 2>/dev/null | grep -m1 "^image/") || exit 3; mkdir -p "$1" && wl-paste --type "$type" > "$1/$2"', "sh", dir, file]);
        if (r.code === 3) return notify({ title: "Nothing to paste", body: "The clipboard has no text or image.", level: "info", timeout: 2500 });
        if (r.code !== 0) throw new Error(r.stderr.trim());
        this.files.push({ path: `${dir}/${file}`, rel: `${STORE}/${file}`, name: "Pasted image", image: true });
      } catch (e) {
        notify({ title: "Couldn't paste the image", body: String(e).slice(0, 160), level: "warning" });
      }
      cx.notify();
    });
  }

  // "@Scout#pricing hello" → that pal's channel; else the shown channel.
  target(text) {
    const all = spaces();
    const m = text.match(/^@([^\s#]+)(?:#([^\s]+))?\s+([\s\S]+)$/);
    if (m) {
      const want = m[1].toLowerCase().replace(/[-_]/g, " ");
      const space = all.find((s) => s.name.toLowerCase() === want) ?? all.find((s) => s.name.toLowerCase().startsWith(want));
      if (!space) return { error: `No pal called ${m[1]}` };
      const tab = m[2] ? space.tabs.find((x) => channelName(x).toLowerCase() === m[2].toLowerCase()) : space.tabs.find((x) => x.active) ?? space.tabs[0];
      if (!tab) return { error: `${space.name} has no #${m[2]}` };
      return { space, tab, text: m[3], who: `${space.name} #${channelName(tab)}` };
    }
    const space = all.find((s) => s.active);
    const tab = space?.tabs.find((x) => x.active);
    if (!tab) return { error: "No channel shown" };
    return { space, tab, text, who: `${space.name} #${channelName(tab)}` };
  }

  // In a room: log it, and deliver to the @mentioned members (or everyone).
  sendToRoom(room, raw, cx) {
    const members = roomMembers(room);
    const to = roomTargets(members, raw, true);
    const text = [raw, ...this.files.map((f) => f.path)].filter(Boolean).join("\n");
    this.field().set_value("");
    this.files = [];
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const everyone = !/@[\w.-]/.test(raw);
        await appendRoomLog(room, { at: Date.now(), from: "You", text, kind: "say", to: everyone ? [] : to.map((m) => m.name), everyone });
        // Tell the room view to load it and scroll to it right away.
        setShared("crew.room.sent", Date.now());
        await deliverToRoom(room, to, owner(), text, everyone);
      } catch (e) {
        notify({ title: `Couldn't post to #${room.name}`, body: String(e).slice(0, 160), level: "error" });
      }
      cx.notify();
    });
  }

  send(cx) {
    const raw = this.field().value().trim();
    if ((!raw && !this.files.length) || this.sending) return;
    const room = shownRoom();
    if (room) return this.sendToRoom(room, raw, cx);
    const to = this.target(raw || "");
    if (to.error) { notify({ title: to.error, level: "warning", timeout: 3000 }); return; }
    if (to.tab.status === "blocked") {
      notify({ title: `${to.who} is waiting on you`, body: "Answer its question in the terminal first.", level: "warning", timeout: 4000 });
      return;
    }
    if (this.files.length && to.space.machine) {
      notify({ title: `${to.space.name} runs on ${to.space.machine}`, body: "Attachments stay on this computer for now. Send text only, or remove them.", level: "warning", timeout: 5000 });
      return;
    }
    const pane = leadPane(to.tab.id);
    if (!pane?.terminal) { notify({ title: `${to.who} has no terminal`, level: "warning" }); return; }
    const body = [to.text, ...this.files.map((f) => f.path)].filter(Boolean).join("\n");
    const address = pane.terminal;
    this.sending = true;
    this.field().set_value("");
    this.files = [];
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["send", address, body]);
        if (r.code !== 0) notify({ title: `Couldn't reach ${to.who}`, body: (r.stderr || r.stdout).trim().slice(0, 200), level: "error" });
      } catch (e) {
        notify({ title: `Couldn't reach ${to.who}`, body: String(e).slice(0, 200), level: "error" });
      }
      this.sending = false;
      cx.notify();
    });
  }

  chip(f, i, t) {
    return h_flex().id(`att-${i}`).flex_none().items_center().gap(6).h(26).pl(3).pr(7).rounded(4)
      .bg(a(t.foreground, "0c"))
      .child(f.image ? image(f.rel).w(22).h(22).rounded(6).flex_none()
        : div().size(22).flex_none().rounded(6).flex().items_center().justify_center().bg(a(t.foreground, "10"))
          .child(svg(`${ICON}/file.svg`).size(12).text_color(t.muted)))
      .child(div().max_w(110).truncate().text_size(12).text_color(t.foreground).child(f.name))
      .child(div().id(`att-x-${i}`).cursor_pointer().on_click((_e, cx) => { this.files.splice(i, 1); cx.notify(); })
        .child(svg(`${ICON}/x.svg`).size(11).text_color(t.dim)));
  }

  render(cx) {
    const t = tone(theme());
    // A file picked in the attach popup.
    const pick = shared("crew.attach.add");
    if (pick?.nonce && pick.nonce !== this.lastPick) { this.lastPick = pick.nonce; this.add(pick.paths ?? [], cx); }

    const field = this.field();
    const ready = Boolean(field.value().trim() || this.files.length);
    const d = ds(t);
    const square = (id, icon, size, bg, color, action, tip) => div().id(id).size(28).flex_none().rounded(d.r.sm).flex().items_center().justify_center()
      .cursor_pointer().when(Boolean(bg), (el) => el.bg(bg)).hover((s) => s.opacity(0.85)).on_click(action).when(Boolean(tip), (el) => el.tooltip(tip))
      .child(svg(`${ICON}/${icon}.svg`).size(size).text_color(color));
    const soon = (what) => () => notify({ title: `${what} isn't wired up yet`, body: "Voice input is coming; type for now.", level: "info", timeout: 2500 });
    const focus = layoutMode() === "focus";

    // The boards' composer: one r8 #1A1A1B box with a #3C3C3F edge, 10/12/10 padding, 8 px between
    // the prompt (14/22) and the controls; 720 px centred in Focus (16 px under it), the column's
    // full width in Pro (24 px in, 12 under).
    const card = v_flex().id("crew-compose").w_full().when(focus, (el) => el.w(720).flex_none()).gap(8).py(10).pl(12).pr(10).rounded(d.r.lg)
      .bg(d.composer).border_1().border_color(d.lineStrong)
      .child(h_flex().w_full().min_h(22).items_center().gap(6).flex_wrap()
        .children(this.files.map((f, i) => this.chip(f, i, t)))
        .child(div().flex_1().min_w(80).flex().items_center()
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(Input.new(field).w_full().text_size(14).line_height("22px").text_color(d.body))))
      .child(h_flex().w_full().items_center().gap(6)
        .child(square("crew-attach", "ds-plus", 14, d.ctl, d.body, () => openOverlay({ mod: "crew-attach", kind: "popup", width: 400, height: 440 }), "Attach a file"))
        .children(this.brainChips(t, d))
        .child(div().flex_1())
        .child(square("crew-mic", "ds-mic", 16, null, d.fg2, soon("Dictation"), "Dictate (coming soon)"))
        .child(square("crew-voice", "ds-audio", 15, d.ctl, d.body, soon("Voice mode"), "Voice mode (coming soon)"))
        .child(square("crew-send", "ds-send", 14, d.act, d.actFg, (_e, cx) => this.send(cx), "Send").when(this.sending || !ready, (el) => el.opacity(this.sending ? 0.5 : 0.85))));

    return h_flex().id("crew-composer").size_full().items_end().justify_center().bg(d.bg0).px(focus ? 32 : 24).pb(focus ? 16 : 12)
      .on_drop((e, cx) => this.add(e.paths ?? [], cx))
      .child(card);
  }
}
