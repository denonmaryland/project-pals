// Your call (T235, DeNon 2026-11-16: "remove [the Decisions page] completely and make Project Pals
// just terminal focused"). A small dialog over the terminal with what only the owner decides, one at
// a time: Home asks and logins (`pal home ask` / `login`), commands held for approval, relayed taps
// being held, Desk cards waiting on the owner, proposals (and Dream proposals), the idea partner's
// drafts, trusted helpers that need a click, topics asking the owner, and topics that look stuck.
//
// It opens from its toasts, the header's amber "Your call · N" pill, the command bar's "Your call"
// and Ctrl+Shift+A (crew-header.decide).
//
// What you see, top to bottom, at a fixed 520 x 480 (nothing jumps; the context scrolls, and sentences
// wrap rather than cut off, so their boxes grow and the context gives up the room):
// - "Your call", "2 of 5", L Later (skip to the next), ×.
// - Who asks (pet, Pal #topic, a tag), how long ago.
// - The question (17/600, two lines), then its context: the body, the command and its diff, links.
// - The asker's recommendation and its why (or "No recommendation").
// - The options as rows (40 px at least: what an option does wraps), numbered 1-9; the recommended one lit.
// - "T Open <asker>'s terminal" (it closes the dialog and puts the keyboard there), and the keys.
// Nothing waiting: "Nothing needs you" and the head pal's terminal.
//
// The owner-only rule (T235's hard requirement): a decision runs only from a real click or key
// press in this dialog, through ownerCli (the one-time click token for exactly that command line:
// owner_gate, its receipts and the trusted-helper refusal are unchanged). nextCommand accepts only
// "focus": `herdr-app do crew-decide.<anything>` from a pal or a helper decides nothing, and opening
// the dialog (crew-header.decide, mod.open) only shows it. There is no terminal fallback: a pal can
// type into a terminal as well as a person can.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, shared, notify, exec, appHome, home as homeDir, readTextFile, props, openOverlay, closeOverlay, nextCommand } from "herdr";
import {
  ds, tone, scrollArea, keyCap, channelName, botOf, headName, owner as ownerName, ownerCli, crewCli, loadOps, loadDesk, blockedReports,
  wantsTo, petOf, petReady, petEl, petState, mascotEl, mood, openTerminal, openProposal, findChannel, homeData, homeAge, HOME_FILE,
  openDrop, editProps, draftTarget, targetLabel, PARTNER_NAME, ownerQueue,
} from "./crew.js";
import { helperNeed, tapNeed } from "./helperlog.js";

const ICON = "mods/crew-roster/icons";
export const SIZE = { w: 520, h: 480 };
const short = (name) => String(name ?? "").split(" - ")[0];
const clip = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

export default class CrewDecide extends View {
  init(_props, cx) {
    this.home = homeData(null);
    this.ops = { approvals: [], proposals: [], tasks: [], routines: [], stalled: {}, daemon: true };
    this.cards = [];
    this.reports = {};
    this.busy = {};
    this.shown = {};      // Dream proposals whose whole text was loaded: id → { text, sha }
    this.loaded = false;
    this.loading = false;
    this.mode = null;     // null, or "parked" (what you parked: Unpark / Drop)
    this.at = 0;          // which item shows
    this.atKey = null;    // …by key, so a refresh keeps it
    this.handle = cx.focus_handle();
    this.focused = false;
    // Only "focus" (Herdr's, when a popup over it closes). Never a decision: see the top of the file.
    cx.spawn(async (cx) => { for (;;) { const c = await nextCommand(); if (c === "focus") this.focusSoon(cx); } });
    this.reload(cx);
    cx.timer.every(3000, (cx) => this.reload(cx));
    cx.timer.every(60000, (cx) => cx.notify());   // ages stay true
  }

  close() { try { closeOverlay(props()?.overlay); } catch {} }

  reload(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      const read = async (f) => { try { return await readTextFile(`${appHome()}/${f}`); } catch { return null; } };
      try { this.home = homeData(await read(HOME_FILE)); } catch {}
      try { this.ops = await loadOps(); } catch {}
      try { this.reports = await blockedReports(this.reports); } catch {}
      try { this.cards = (await loadDesk(true)).cards; } catch {}
      this.loaded = true;
      this.loading = false;
      cx.notify();
    });
  }

  // Everyone's, whichever factory shows (as the sidebar Inbox was): what waits on you is never hidden
  // by a switch, and the header's pill counts the same list (Codex T235 P2).
  list() {
    return ownerQueue({ ops: this.ops, items: this.home.items, cards: this.cards, needs: shared("crew.needs"), reports: this.reports, onFloor: () => true });
  }
  parked() { return this.home.items.filter((x) => x.status === "parked").sort((x, y) => (y.parked_at ?? y.at) - (x.parked_at ?? x.at)); }

  // A decision: as the owner, with a click token (ownerCli). Called only from on_click and on_key_down.
  act(key, args, what, cx) {
    if (this.busy[key]) return;
    this.busy[key] = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const out = await ownerCli(args);
        if (what) notify({ title: what, body: clip(out.trim().split("\n").slice(-1)[0], 200), level: "success", timeout: 2500 });
      } catch (e) { notify({ title: "That didn't work", body: clip(e.message ?? e, 220), level: "warning", timeout: 6000 }); }
      delete this.busy[key];
      this.loading = false;
      this.reload(cx);
    });
  }

  locate(spec) { const f = findChannel(spec ?? ""); return f.error ? null : f; }
  // A topic's terminal with the keyboard in it; the dialog closes so you can type.
  openTopic(spec) {
    const f = this.locate(spec);
    if (!f) return notify({ title: `${short(spec) || "That pal"} isn't open`, body: "Wake it from the sidebar first.", level: "info", timeout: 2500 });
    this.close();
    openTerminal(f.space, f.tab ?? null);
  }
  copy(text) {
    exec("wl-copy", [text], { timeout: 3000 })
      .then((r) => notify(r.code === 0 ? { title: "Copied", body: text, level: "success", timeout: 2000 } : { title: "Couldn't copy", body: "wl-copy isn't working here; select the command instead.", level: "warning", timeout: 4000 }))
      .catch(() => notify({ title: "Couldn't copy", body: "wl-copy isn't installed.", level: "warning", timeout: 4000 }));
  }

  // Load a Dream proposal's whole text: Approve stays off until it's shown, and is bound to its digest
  // (review H5), so a different text can't be approved in its place.
  showDream(p, cx) {
    if (this.busy[`show-${p.id}`]) return;
    this.busy[`show-${p.id}`] = true;
    cx.spawn(async (cx) => {
      try { const j = JSON.parse(await crewCli(["proposal", "show", p.id])); this.shown[p.id] = { text: j.text ?? "", sha: j.text_sha }; }
      catch (e) { notify({ title: "Couldn't load it", body: clip(e.message ?? e, 200), level: "warning" }); }
      delete this.busy[`show-${p.id}`];
      cx.notify();
    });
  }

  // What one item shows and does: { tag, who, topic, sub, title, body, mono, diff, links, rec, options }.
  // Each option is { label, does, run(cx), off? }.
  spec(n) {
    const d = this.d;
    const recs = this.home.recs ?? {};
    const topicOf = (spec) => (spec && spec.includes("#") ? spec : null);
    const o = (label, does, go, extra = {}) => ({ label, does, run: go, ...extra });
    const owner = (args, what) => (cx) => this.act(n.key, args, what, cx);
    const later = (cx) => this.act(n.key, ["home", "park", n.x?.id], null, cx);
    if (n.kind === "approval") {
      const ap = n.ap, r = recs[ap.id];
      return { tag: ["Approval", d.err], who: ap.bot, topic: ap.channel ? `${ap.bot}#${ap.channel}` : null, sub: `held ${homeAge(n.at)} ago · rule ${ap.rule ?? "?"} · ${ap.id}`,
        title: `${short(ap.bot)} wants to ${wantsTo(ap.why || ap.rule)}`, mono: ap.command, diff: ap.diff ?? null,
        rec: r ? { option: r.option === "approve" ? "Approve" : "Decline", why: r.why, by: r.by } : null,
        options: [o("Decline", ap.terminal === "shell" ? "The command stays refused" : "The command is refused; the pal is told", owner(["deny", ap.id, "--inbox"], `Declined for ${short(ap.bot)}`)),
          o("Approve", ap.diff ? "Lets exactly this edit through, once" : "Lets exactly this command run, once", owner(["approve", ap.id, "--inbox"], `Approved for ${short(ap.bot)}`))] };
    }
    if (n.kind === "ask") {
      const x = n.x;
      // A program owner step (x.authorization) is answered with the question as shown bound to it.
      const opts = (x.options ?? []).map((label, i) => o(label, [x.does?.[i], x.authorization?.commands?.[i]?.command, x.authorization?.commands?.[i] ? `For ${x.authorization.bot}#${x.authorization.channel} · ${x.authorization.commands[i].guard_context.cwd}${x.authorization.commands[i].land_tip ? ` · commit ${x.authorization.commands[i].land_tip}` : ""}` : null].filter(Boolean).join("\n"), owner(["home", "answer", x.id, label, ...(x.authorization ? ["--approval-snapshot", JSON.stringify({ authorization: x.authorization, options: x.options ?? null, title: x.title ?? null, body: x.body ?? null, does: x.does ?? null, by: x.by ?? null, recommend: x.recommend ?? null, why: x.why ?? null, links: x.links ?? null, images: x.images ?? null })] : [])], `You picked: ${label}`)));
      if (!opts.length && x.by) opts.push(o(`Answer in #${(x.by.split("#")[1] ?? "topic")}`, "Opens the topic's terminal so you can reply there", () => this.openTopic(x.by)));
      opts.push(o("Park", "Decide later; it stays parked until its asker brings it back", later, { quiet: true }));
      return { tag: ["Decision", d.warnText], who: x.by, topic: topicOf(x.by) ?? x.topic, sub: `asked ${homeAge(n.at)} ago`, title: x.title, body: x.body,
        links: x.links, files: x.images, rec: x.recommend ? { option: x.recommend, why: x.why, by: x.by } : null, options: opts };
    }
    if (n.kind === "login") {
      const x = n.x, topic = x.topic ?? x.by, ch = (topic ?? "").split("#")[1];
      return { tag: ["Login", d.infoText], who: x.by, topic, sub: `asked ${homeAge(n.at)} ago`, title: x.title, mono: x.command,
        body: ch ? `Type it in #${ch}'s terminal: the ! runs it there.` : null,
        options: [o(ch ? `Open #${ch}` : "Open the topic", "Its terminal, ready to type in", () => this.openTopic(topic)), o("Copy", "Copies the command", () => this.copy(x.command)),
          o("Park", "Later; it stays parked until its asker brings it back", later, { quiet: true })] };
    }
    if (n.kind === "question") {
      const spec = `${n.space.name}#${channelName(n.tab)}`;
      return { tag: ["Question", d.warnText], who: n.space.name, topic: spec, sub: `waiting ${homeAge(n.at)}`, title: `${short(n.space.name)} asks you in #${channelName(n.tab)}`,
        body: n.msg ? n.msg : "A prompt is waiting in its terminal.", options: [o(`Open #${channelName(n.tab)}`, "Answer it in its terminal", () => this.openTopic(spec))] };
    }
    if (n.kind === "desk") {
      const c = n.c, r = recs[c.id];
      return { tag: ["Message", d.warnText], who: c.from_kind === "owner" ? null : c.from, topic: topicOf(c.from), sub: `${c.id} · ${c.kind ?? "card"} · ${homeAge(n.at)} ago`,
        title: c.title || "(no title)", body: [c.body, c.result ? `Result: ${c.result}` : null].filter(Boolean).join("\n\n"), files: c.attachments,
        rec: r && r.option === "done" ? { option: "Done", why: r.why, by: r.by } : null,
        options: [o("Done", "Closes the card; the sender sees it", owner(["desk", "done", c.id, "closed in Your call"], "Closed"))] };
    }
    if (n.kind === "unreadable") {
      const c = n.c;
      return { tag: ["Can't read", d.err], who: null, topic: null, sub: `${c.id} · in ${c.to ?? "your tray"}`, title: "A card for you can't be read",
        body: `${c.title ?? ""}: ${c.unreadable}. Nothing can be done with it here until it's repaired; ${headName()} can look at it.`,
        options: [o(`Open ${headName()}'s terminal`, "Ask it to look at the card", () => this.terminal(null))] };
    }
    if (n.kind === "draft") {
      const c = n.c;
      return { tag: ["Draft", d.infoText], who: String(c.from ?? PARTNER_NAME).split("#")[0], topic: null, sub: `${c.id} · for ${targetLabel(draftTarget(c.to))} · ${homeAge(n.at)} ago`,
        title: c.title || "(no title)", body: c.body ?? "", files: c.attachments,
        options: [o("Send", "Goes out as your card, to where it suggests", owner(["desk", "send-draft", c.id, "--to", draftTarget(c.to), "--json"], "Sent as yours")),
          o("Edit…", "Opens it in the quick-drop to change first", () => { this.close(); openDrop(editProps(c)); }),
          o("Discard", "Drops the draft; nothing is sent", owner(["desk", "discard", c.id], "Discarded"))] };
    }
    if (n.kind === "dream") {
      const p = n.p, m = p.meta ?? {}, shown = this.shown[p.id];
      const what = { skill: `New skill: ${m.name}`, tool: "A tool to build (a task)", process: "A process change (a task)", context: `Context for ${m.pal ?? "a pal"} (a brain note)` }[m.kind] ?? "A fix";
      return { tag: [`Dream · ${m.kind ?? "fix"}`, "#B79CF7"], who: p.by, topic: topicOf(p.by), sub: `${p.id} · ${m.pattern ?? ""} · ${homeAge(n.at)} ago`, title: what,
        body: [`${m.summary ?? ""} · ${m.count ?? 0}x, ${m.pals?.length ?? 0} pal(s), ~${m.minutes ?? 0}m lost`, ...(m.quotes ?? []).map((q) => `“${q}”`), p.note ?? null].filter(Boolean).join("\n"),
        mono: shown ? shown.text : null,
        options: [shown ? o("Approve", "Writes it through its kind's writer, exactly this text", owner(["proposal", "accept", p.id, "--text-sha", shown.sha], "Approved"))
          : o("Show the whole proposal", "Needed before Approve", (cx) => this.showDream(p, cx)),
        o("Decline", "Nothing is written; it rests 30 days", owner(["proposal", "decline", p.id], "Declined"))] };
    }
    if (n.kind === "proposal") {
      const p = n.p;
      return { tag: ["Proposal", "#B79CF7"], who: p.by, topic: topicOf(p.by), sub: `${p.id} · ${homeAge(n.at)} ago`,
        title: `${short(p.by)} proposes a change to ${p.kind === "mission" ? "its mission" : p.file ?? "a file"}`, body: p.note,
        options: [o("View", "Shows the change, to accept or decline", () => { this.close(); openProposal(p); }),
          o("Decline", "The pal is told", owner(["proposal", "decline", p.id], "Declined"))] };
    }
    if (n.kind === "tap") {
      const h = n.h, tn = tapNeed(h);
      return { tag: [tn.outward ? "Outward tap" : "Tap", tn.outward ? d.err : "#B79CF7"], who: null, topic: h.by && h.by.includes("#") ? h.by : null,
        sub: `tapped by ${h.helper}, relayed from you · ${tn.goes}`, title: tn.title, body: tn.sub,
        options: [o("Stop", "It doesn't run; the item is yours to answer", owner(["taps", "stop", h.id], "Stopped: it did not run")),
          o("Let it go now", tn.outward ? "Runs at once. It can't be undone" : "Runs at once", owner(["taps", "now", h.id], "Let through"))] };
    }
    if (n.kind === "helper") {
      const h = n.h, hn = helperNeed(h);
      const opts = [];
      if (hn.fix) opts.push(o(hn.fix.label, hn.fix.does, owner(["settings", "trust-helper", h.name, hn.fix.action], hn.fix.action === "on" ? `${h.name} is trusted` : `${h.name} has a new key`)));
      opts.push(o("Trusted helpers", "Opens the sheet: the switch, the key, the record", () => { this.close(); openOverlay({ mod: "crew-helpers", kind: "dialog", width: 560 }); }));
      if (hn.off) opts.push(o(hn.off.label, hn.off.does, owner(["settings", "trust-helper", h.name, "off"], `${h.name} is off`)));
      return { tag: ["Helper", d.warnText], who: null, topic: null, sub: `a trusted helper · ${homeAge(n.at)} ago`, title: hn.title, body: hn.sub,
        rec: hn.fix ? { option: hn.fix.label, why: "Only your click turns a helper on or gives it a key", by: "Project Pals" } : null, options: opts };
    }
    const st = n.st;
    return { tag: ["Stuck", d.warnText], who: st.bot, topic: `${st.bot}#${st.channel}`, sub: `no progress for ${homeAge(st.since)}`,
      title: `${short(st.bot)} looks stuck in #${st.channel}`, body: "It's working, but its screen hasn't changed.",
      options: [o(`Open #${st.channel}`, "Look at its terminal", () => this.openTopic(`${st.bot}#${st.channel}`))] };
  }

  // Which item shows: the one we were on, by key; else the same position (the next one slid in).
  current(list) {
    if (!list.length) return null;
    let i = this.atKey ? list.findIndex((n) => n.key === this.atKey) : -1;
    if (i < 0) i = Math.min(this.at, list.length - 1);
    this.at = i; this.atKey = list[i].key;
    return list[i];
  }
  next(list) {
    if (list.length < 2) return;
    this.at = (this.at + 1) % list.length;
    this.atKey = list[this.at].key;
  }

  // The asker's terminal (or the head pal's), with the keyboard in it.
  terminal(sp) {
    const f = (sp?.topic && this.locate(sp.topic)) || (sp?.who && this.locate(sp.who)) || null;
    this.close();
    if (f) openTerminal(f.space, f.tab ?? null); else openTerminal();
  }

  // Keys (real presses in this dialog only): 1-9 pick, Enter the recommended, L later, T terminal, Esc.
  key(e, list, cx) {
    const k = e.keystroke;
    if (this.mode === "parked") { if (k === "escape") { this.mode = null; cx.stop_propagation(); cx.notify(); } return; }
    const n = this.current(list);
    const sp = n ? this.spec(n) : null;
    if (k === "escape") this.close();
    else if (k === "t") this.terminal(sp);
    else if (!n) return;
    else if (k === "l") this.next(list);
    else if (/^[1-9]$/.test(k)) { const op = sp.options[Number(k) - 1]; if (op && !this.busy[n.key]) op.run(cx); }
    else if (k === "enter") { const op = sp.rec && sp.options.find((x) => x.label.toLowerCase() === String(sp.rec.option).toLowerCase()); if (op && !this.busy[n.key]) op.run(cx); }
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  face(name, status, w, t) {
    const f = name ? this.locate(name) : null;
    const bot = f ? botOf(f.space) : { name: name ?? headName(), harness: null, awake: true };
    const h = Math.round(w * 108 / 138);
    const p = petOf(bot);
    const m = mood(status, true);
    return div().w(w).h(h).flex_none().flex().items_center().justify_center()
      .child(p && petReady(p) ? petEl(p, petState(bot, m), w, h, { open: true }) : mascotEl(bot, m, Math.min(h, 28), t));
  }

  tag(d, word, color) {
    return div().flex_none().h(16).px(5).flex().items_center().rounded(3).border_1().border_color(color + "66")
      .text_size(9.5).line_height("14px").font_weight(600).text_color(color).child(String(word).toUpperCase());
  }

  // Give the dialog the keyboard after a render, never during one (Herdr refuses focus() in render).
  focusSoon(cx) { cx.timer.after(0, () => { try { this.handle.focus(); } catch {} }); }

  empty(d, t) {
    const head = headName();
    return v_flex().id("decide-empty").flex_1().min_h(0).items_center().justify_center().gap(8)
      .child(this.face(head, "idle", 96, t))
      .child(div().pt(4).text_size(16).line_height("22px").font_weight(600).text_color(d.fg1).child(this.loaded ? "Nothing needs you" : "Looking…"))
      .child(div().text_size(12.5).line_height("18px").text_color(d.fg2).child(`${head} puts decisions here, and tells you when one comes up.`))
      .child(h_flex().id("decide-head").mt(6).h(26).px(9).flex_none().items_center().gap(7).rounded(5).cursor_pointer()
        .border_1().border_color(d.lineMid).hover((s) => s.bg(d.hover))
        .on_click(() => this.terminal(null))
        .child(svg(`${ICON}/ds-terminal.svg`).size(12).flex_none().text_color(d.iconOn))
        .child(div().text_size(12).text_color(d.body).child(`Open ${head}'s terminal`))
        .child(keyCap(d, "T")));
  }

  // Attachments (an ask's images, a card's or draft's files): each a chip that opens it, before you act.
  files(d, list) {
    const path = (a) => `${appHome()}/data/${String(a).replace(/^data\//, "")}`;
    return h_flex().flex_wrap().gap(6).children(list.slice(0, 8).map((a, j) => h_flex().id(`dc-f-${j}`).h(24).px(8).flex_none().items_center().gap(6).rounded(5)
      .bg(d.raised).border_1().border_color(d.line).cursor_pointer().hover((s) => s.border_color(d.lineMid)).tooltip(String(a))
      .on_click(() => exec("xdg-open", [path(a)]).catch(() => {}))
      .child(svg(`${ICON}/paperclip.svg`).size(11).flex_none().text_color(d.fg2))
      .child(div().text_size(11.5).text_color(d.infoText).child(clip(String(a).split("/").pop(), 40)))));
  }

  topBar(d, left, right) {
    return h_flex().h(36).flex_none().items_center().gap(10).px(16).border_b_1().border_color(d.line)
      .children(left).child(div().flex_1()).children(right)
      .child(div().id("decide-x").size(24).flex_none().flex().items_center().justify_center().rounded(d.r.xs).cursor_pointer()
        .tooltip("Close (Esc)").hover((s) => s.bg(d.hover)).on_click(() => this.close())
        .child(svg(`${ICON}/x.svg`).size(11).text_color(d.fg3)));
  }

  parkedLink(d) {
    const n = this.parked().length;
    if (!n) return [];
    return [h_flex().id("decide-parked").h(24).px(6).flex_none().items_center().rounded(d.r.xs).cursor_pointer().hover((s) => s.bg(d.hover))
      .on_click((_e, cx) => { this.mode = this.mode === "parked" ? null : "parked"; cx.notify(); })
      .child(div().text_size(12).text_color(this.mode === "parked" ? d.fg1 : d.fg2).child(`Parked · ${n}`))];
  }

  // What you parked: Unpark puts it back in the queue, Drop closes it (your click either way).
  parkedView(d) {
    const list = this.parked();
    const btn = (id, label, args, what, key) => h_flex().id(id).h(24).px(8).flex_none().items_center().rounded(5).border_1().border_color(d.lineMid)
      .when(!this.busy[key], (el) => el.cursor_pointer().hover((s) => s.bg(d.hover)).on_click((_e, cx) => this.act(key, args, what, cx)))
      .when(Boolean(this.busy[key]), (el) => el.opacity(0.5))
      .child(div().text_size(12).text_color(d.body).child(label));
    const rows = v_flex().gap(4).children(list.map((x) => h_flex().id(`decide-park-${x.id}`).min_h(40).py(6).px(10).gap(8).items_center().rounded(6).bg(d.raised).border_1().border_color(d.line)
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().text_size(13).font_weight(600).text_color(d.fg1).child(x.title ?? ""))
        .child(div().text_size(11.5).text_color(d.fg2).child(`${x.kind} · from ${short(String(x.by ?? "?").split("#")[0])} · parked ${homeAge(x.parked_at ?? x.at)} ago`)))
      .child(btn(`decide-unpark-${x.id}`, "Unpark", ["home", "unpark", x.id], "Back in Your call", `park-${x.id}`))
      .child(btn(`decide-drop-${x.id}`, "Drop", ["home", "drop", x.id], "Dropped", `park-${x.id}`))));
    return v_flex().size_full()
      .child(this.topBar(d, [div().flex_none().text_size(13).font_weight(600).text_color(d.fg1).child("Parked")], this.parkedLink(d)))
      .child(scrollArea(d, "decide-parked-list", v_flex().p(16).child(list.length ? rows : div().text_size(12.5).text_color(d.fg3).child("Nothing parked."))).flex_1().min_h(0));
  }

  item(d, t, list) {
    const n = this.current(list);
    const sp = this.spec(n);
    const total = list.length, i = this.at;
    const busy = Boolean(this.busy[n.key]);
    const top = this.topBar(d, [div().flex_none().text_size(13).font_weight(600).text_color(d.fg1).child("Your call"),
      div().flex_none().text_size(12).text_color(d.fg2).child(`${i + 1} of ${total}`)], [...this.parkedLink(d),
      h_flex().id("decide-later").h(24).px(6).flex_none().items_center().gap(6).rounded(d.r.xs)
        .when(total > 1, (el) => el.cursor_pointer().hover((s) => s.bg(d.hover)).on_click((_e, cx) => { this.next(list); cx.notify(); }))
        .tooltip("The next one; this one waits (L)")
        .child(keyCap(d, "L")).child(div().text_size(12).text_color(total > 1 ? d.fg2 : d.fg4).child("Later"))]);
    const whoName = sp.who ? short(sp.who.split("#")[0]) : ownerName();
    const whoTopic = sp.topic && sp.topic.includes("#") ? `#${sp.topic.split("#")[1]}` : "";
    const who = h_flex().min_h(44).flex_none().items_center().gap(10)
      .child(this.face(sp.who ? sp.who.split("#")[0] : headName(), n.kind === "approval" || n.kind === "question" || n.kind === "stuck" ? "blocked" : "idle", 44, t))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().gap(6).items_center().min_w(0)
          .child(div().flex_none().text_size(12.5).font_weight(600).text_color(d.fg1).child(whoName))
          .child(div().min_w(0).truncate().text_size(12.5).text_color(d.fg2).child(whoTopic))
          .child(this.tag(d, sp.tag[0], sp.tag[1])))
        .child(div().min_w(0).text_size(11.5).text_color(d.fg2).child(sp.sub ?? "")));
    // Everything you decide on scrolls together (Codex T235 P1): the whole question, its context, the
    // recommendation and every option with all it does. Nothing is cut off or pushed out of the dialog.
    const title = div().id("decide-title").text_size(17).line_height("23px").font_weight(600).text_color(d.fg1).child(sp.title ?? "");
    const body = v_flex().id("decide-body").gap(8).pr(10).child(who).child(title);
    if (sp.body) body.child(v_flex().gap(3).children(String(sp.body).split("\n").map((l, j) => div().id(`dc-b-${j}`).text_size(13).line_height("19px").text_color(d.body).child(l || " "))));
    if (sp.mono) body.child(div().px(10).py(7).rounded(5).bg(d.inset).border_1().border_color(d.lineMid).text_size(11.5).line_height("17px").font_family(d.mono).text_color(d.fg1).child(sp.mono));
    if (sp.diff) body.child(v_flex().px(10).py(6).rounded(5).bg(d.inset).border_1().border_color(d.lineMid)
      .children(String(sp.diff).split("\n").map((l, j) => div().id(`dc-d-${j}`).text_size(11.5).line_height("17px").font_family(d.mono)
        .text_color(l.startsWith("+") && !l.startsWith("+++") ? d.ok : l.startsWith("-") && !l.startsWith("---") ? d.err : d.fg2).child(l || " "))));
    if (sp.links?.length) body.child(h_flex().flex_wrap().gap(6).children(sp.links.map((u, j) => h_flex().id(`dc-l-${j}`).h(24).px(8).flex_none().items_center().rounded(5)
      .bg(d.raised).border_1().border_color(d.line).cursor_pointer().hover((s) => s.border_color(d.lineMid))
      .on_click(() => exec("xdg-open", [u.startsWith("~/") ? `${homeDir()}/${u.slice(2)}` : u]).catch(() => {}))
      .child(div().text_size(11.5).text_color(d.infoText).child(clip(u.replace(/^https?:\/\//, "").replace(homeDir(), "~"), 52))))));
    if (sp.files?.length) body.child(this.files(d, sp.files));
    const rec = sp.rec;
    body.child(h_flex().id("decide-rec").min_h(34).py(6).flex_none().items_center().gap(8).px(10).rounded(5).border_1()
      .border_color(rec ? "#4CA1F255" : d.line).bg(rec ? "#4CA1F20D" : "#00000000")
      .child(div().flex_none().text_size(10.5).font_weight(600).text_color(rec ? d.infoText : d.fg4).child(rec ? "RECOMMENDED" : "NO RECOMMENDATION"))
      .child(rec ? div().flex_1().min_w(0).text_size(12).text_color(d.body)
          .child(`${rec.option}${rec.why ? ` · ${short((rec.by ?? "").split("#")[0]) || "The asker"}: ${rec.why}` : ""}`)
        : div().flex_1().min_w(0).text_size(12).text_color(d.fg4).child("The asker didn't pick one. Open its terminal if you're unsure.")));
    const opts = v_flex().id("decide-opts").flex_none().gap(4);
    sp.options.slice(0, 9).forEach((op, j) => {
      const on = rec && op.label.toLowerCase() === String(rec.option).toLowerCase();
      opts.child(h_flex().id(`decide-o-${j}`).min_h(40).py(6).flex_none().px(10).gap(8).items_center().rounded(6)
        .bg(on ? "#26364A" : d.raised).border_1().border_color(on ? "#4CA1F288" : d.line)
        .when(!busy, (el) => el.cursor_pointer().hover((s) => s.border_color(on ? "#4CA1F2" : d.lineStrong)).on_click((_e, cx) => { op.run(cx); cx.notify(); }))
        .when(busy, (el) => el.opacity(0.5))
        .child(keyCap(d, String(j + 1)))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(h_flex().gap(8).items_center().min_w(0)
            .child(div().min_w(0).text_size(13).font_weight(600).text_color(op.quiet ? d.fg2 : d.fg1).child(op.label))
            .when(Boolean(on), (el) => el.child(this.tag(d, "Recommended", d.infoText))))
          .when(Boolean(op.does), (el) => el.children(String(op.does).split("\n").map((l, k) => div().id(`decide-o-${j}-${k}`).min_w(0).text_size(11.5).line_height("16px")
            .when(k > 0, (x) => x.font_family(d.mono)).text_color(on ? "#C9DCEF" : d.fg2).child(l))))));
    });
    body.child(opts);
    const termWho = sp.topic ? `${short(sp.topic.split("#")[0])}${sp.topic.includes("#") ? ` #${sp.topic.split("#")[1]}` : ""}` : headName();
    const foot = h_flex().h(44).px(16).flex_none().items_center().gap(8).border_t_1().border_color(d.lineSoft)
      .child(h_flex().id("decide-term").h(26).px(8).flex_none().items_center().gap(6).rounded(5).cursor_pointer()
        .border_1().border_color(d.lineMid).hover((s) => s.bg(d.hover)).on_click(() => this.terminal(sp))
        .child(keyCap(d, "T")).child(div().max_w(220).truncate().text_size(12).text_color(d.body).child(`Open ${termWho}'s terminal`)))
      .child(div().flex_1())
      .child(div().flex_none().text_size(11).text_color(d.fg3).child(rec ? "1–9 pick · Enter recommended · Esc" : "1–9 pick · Esc"));
    return v_flex().id(`decide-${n.key}`).size_full()
      .child(top)
      .child(scrollArea(d, `decide-ctx-${n.key}`, body.pt(12).px(16).pb(12)).flex_1().min_h(0))
      .child(foot);
  }

  render(cx) {
    const t = tone(theme());
    const d = ds(t);
    this.d = d;
    if (!this.focused) { this.focused = true; this.focusSoon(cx); }
    const list = this.list();
    const root = v_flex().id("crew-decide").w(SIZE.w).h(SIZE.h).bg(d.bg1).text_color(d.fg1)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, list, cx))
      .on_mouse_down("left", () => this.handle.focus());
    if (this.mode === "parked") return root.child(this.parkedView(d));
    if (!list.length) return root.child(this.topBar(d, [div().flex_none().text_size(13).font_weight(600).text_color(d.fg1).child("Your call")], this.parkedLink(d)))
      .child(this.empty(d, t));
    return root.child(this.item(d, t, list));
  }
}
