// The Chief's dashboard (crew-boards/chief/design.md, A · Split deck; DeNon's pick 2026-11-09): the
// right side of the Chief's pop-up (Ctrl+Shift+J), beside its terminal. Stage 1, "Factory":
//   - Chief's read: its priorities.md and watch.md (the only model words here, labelled as such);
//   - a strip: working, stuck, needs you, held, next release;
//   - every awake pal (not the Chief) with its topics: status, #topic, what it's on; a click opens it;
//   - what needs you and what's stuck (the roster's crew.needs; Open Home);
//   - shipping: public, installed here, next;
//   - what the Chief handed to the head pal, with each card's status.
// Like Home, numbers and states come from data, never from a model. It reads only while open (files
// every 4 s, the Desk every 10 s).
//
// The keyboard: Herdr can't put it in a window's terminal from code (spike, 2026-11-09), and
// pane.focus on the Chief's terminal would show its hidden space. So this mod takes it on open: the
// "Ask the Chief" field sends each line into the Chief's terminal (hc send), as if typed there.
// Clicking the terminal works too. props: { size, compact, overlay }.

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { theme, props, shared, setShared, agents, readTextFile, appHome, hc, notify } from "herdr";
import {
  ds, tone, scrollArea, withoutChief, botOf, crew, chiefOf, chiefTerminal, petOf, petReady, petEl, petState, mascotEl, mood,
  statusColor, channelName, taskTitle, homeData, jsonLines, HOME_FILE, INSTALLS_FILE, loadOps, loadDesk, showHome,
  openTerminal, closeChief, resizeChief, wakeChief, ownerCli, headName, CHIEF_NAME, pebble,
} from "./crew.js";

const ICON = "mods/crew-roster/icons";
const short = (name) => String(name ?? "").split(" - ")[0];
const clip = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const hhmm = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const ago = (ms) => { if (!ms) return ""; const m = Math.max(0, Math.round((Date.now() - ms) / 60000)); return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

// The list items of a notes file ("- …", "1. …"), at most n.
export function notesItems(text, n = 5) {
  return String(text ?? "").split("\n").map((l) => l.match(/^\s*(?:[-*]|\d+[.)])\s+(.+)$/)?.[1]?.trim()).filter(Boolean).slice(0, n);
}

const WHY = { question: "Asks you", approval: "Approval", stuck: "Stuck", proposal: "Proposal", card: "Card" };
const OPEN = ["queued", "seen", "working", "later", "blocked", "held", "sorting", "needs you"];

export default class CrewChief extends View {
  init(_props, cx) {
    this.home = homeData(null);
    this.install = {};
    this.update = {};
    this.installs = [];
    this.priorities = [];
    this.watch = [];
    this.ops = { approvals: [], proposals: [], stalled: {} };
    this.cards = [];
    this.deskAt = 0;
    this.readAt = 0;
    this.loading = false;
    this.busy = false;
    this.handle = cx.focus_handle();
    this.ask = InputState.new({ placeholder: `Ask ${chiefOf()?.name ?? "the Chief"}…  (Enter sends it to its terminal)` });
    this.ask.on("submit", (_e, cx) => this.send(cx));
    // The keyboard comes here when the pop-up opens (a window's mod may focus itself; its terminal
    // can't be given it from code).
    this.ask.focus();
    cx.timer.after(250, () => { try { this.ask.focus(); } catch { /* closed */ } });
    // A window kept over a restart or a layout switch comes back with a new id: say which it is, so
    // Ctrl+Shift+J closes this one.
    const id = props()?.overlay;
    const st = shared("crew.chief.win") ?? {};
    if (id && st.id !== id) setShared("crew.chief.win", { ...st, id, size: props()?.size ?? st.size ?? "split" });
    this.reload(cx, true);
    cx.timer.every(4000, (cx) => {
      // Woken (or hired) while open: rebuild the window around its terminal.
      if (!this.hadTerminal && chiefTerminal()) { resizeChief(props()?.size ?? "split"); return; }
      this.reload(cx);
    });
    this.hadTerminal = Boolean(chiefTerminal());
  }

  reload(cx, desk = false) {
    if (this.loading) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      const read = async (f) => { try { return await readTextFile(`${appHome()}/${f}`); } catch { return null; } };
      try { this.home = homeData(await read(HOME_FILE)); } catch { /* keep */ }
      try { this.installs = jsonLines(await read(INSTALLS_FILE)).reverse(); } catch { /* keep */ }
      try { this.install = JSON.parse((await read("data/crew-install.json")) ?? "{}") ?? {}; } catch { this.install = {}; }
      try { this.update = JSON.parse((await read("data/crew-update.json")) ?? "{}") ?? {}; } catch { this.update = {}; }
      try { this.priorities = notesItems(await read("data/crew-chief/priorities.md"), 5); } catch { /* keep */ }
      try { this.watch = notesItems(await read("data/crew-chief/watch.md"), 3); } catch { /* keep */ }
      try { this.ops = await loadOps(); } catch { /* keep */ }
      if (desk || Date.now() - this.deskAt > 10000) {
        try { this.cards = (await loadDesk(true)).cards; this.deskAt = Date.now(); } catch { /* keep */ }
      }
      this.readAt = Date.now();
      this.loading = false;
      cx.notify();
    });
  }

  // The Ask field: the line goes into the Chief's terminal, as the owner typing there.
  send(cx) {
    const text = this.ask.value().trim();
    const t = chiefTerminal();
    if (!text) return;
    if (!t) { notify({ title: `${chiefOf()?.name ?? CHIEF_NAME} isn't awake`, body: "Wake it first.", level: "info", timeout: 3000 }); return; }
    this.ask.set_value("");
    cx.spawn(async () => {
      try {
        const r = await hc(["send", t, text]);
        if (r.code !== 0) throw new Error((r.stderr || r.stdout || "hc send failed").trim());
      } catch (e) {
        this.ask.set_value(text);
        notify({ title: "Couldn't send that", body: clip(e.message ?? e, 200), level: "warning", timeout: 5000 });
      }
    });
    cx.notify();
  }

  hire(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try { await ownerCli(["hire", "--chief"]); notify({ title: `Hired the ${CHIEF_NAME}`, body: "It starts in its pop-up; give it a few seconds.", level: "success", timeout: 4000 }); }
      catch (e) { notify({ title: `Couldn't hire the ${CHIEF_NAME}`, body: clip(e.message ?? e, 220), level: "warning", timeout: 6000 }); }
      this.busy = false;
      cx.notify();
    });
  }

  // ── what the dashboard shows ─────────────────────────────────────────────────────────────────
  chiefName() { return chiefOf()?.name ?? CHIEF_NAME; }
  handed() {
    const me = this.chiefName().toLowerCase();
    return this.cards.filter((k) => String(k.from ?? "").toLowerCase().split("#")[0] === me)
      .sort((x, y) => (Date.parse(y.created ?? "") || 0) - (Date.parse(x.created ?? "") || 0)).slice(0, 5);
  }
  counts() {
    const all = withoutChief();
    const ids = new Set(all.map((s) => s.id));
    const working = agents().filter((a) => a.status === "working" && ids.has(a.space)).length;
    const needs = shared("crew.needs") ?? {};
    const held = this.cards.filter((k) => k.status === "held").length;
    return { working, stuck: Object.keys(this.ops.stalled ?? {}).length, needs: needs.count ?? 0, held, next: this.home.release?.next ?? null };
  }

  // ── pieces ───────────────────────────────────────────────────────────────────────────────────
  label(d, text, right = null) {
    return h_flex().items_center().gap(8).h(18).flex_none()
      .child(div().flex_1().text_size(11.5).font_weight(500).text_color(d.fg3).child(text))
      .when(Boolean(right), (el) => el.child(right));
  }
  read(d, compact) {
    const items = this.priorities;
    const box = v_flex().relative().flex_none().gap(3).pl(14).pr(12).py(8).rounded(d.r.md).overflow_hidden().bg("#14162A").border_1().border_color("#2E3360")
      .child(div().absolute().left(0).top(0).bottom(0).w(3).bg("#8F9CF7"))
      .child(h_flex().items_center().gap(8)
        .child(div().text_size(10.5).font_weight(600).text_color("#B9C2FA").child(`${this.chiefName().toUpperCase()}'S READ`))
        .child(div().flex_1())
        .when(!compact, (el) => el.child(div().text_size(11).text_color(d.fg3).child("priorities.md · set them by talking to it"))));
    if (!items.length) box.child(div().text_size(12.5).text_color(d.fg2).child(`No priorities yet. Tell ${this.chiefName()} what matters this week.`));
    items.slice(0, compact ? 3 : 5).forEach((x, i) => box.child(div().text_size(12.5).line_height("18px").text_color(d.body).truncate().child(`${i + 1}. ${x}`)));
    if (!compact && this.watch.length) box.child(div().text_size(11.5).line_height("16px").text_color(d.fg3).truncate().child(`Watching: ${this.watch.join(" · ")}`));
    return box;
  }
  strip(d, compact) {
    const c = this.counts();
    const cells = [[String(c.working), "working", d.infoText], [String(c.stuck), "stuck", c.stuck ? d.warnText : d.fg1],
      [String(c.needs), "needs you", c.needs ? d.warnText : d.fg1], [String(c.held), "held", c.held ? d.warnText : d.fg1],
      [c.next ?? "—", "next release", c.next ? d.okHi : d.fg2]];
    if (compact) {
      const row = h_flex().flex_none().gap(6).flex_wrap();
      for (const [n, w, col] of cells) row.child(div().px(6).h(20).flex().items_center().rounded(d.r.xs).border_1().border_color(d.lineMid).text_size(11).text_color(col).child(`${n} ${w}`));
      return row;
    }
    const row = h_flex().flex_none().rounded(d.r.md).border_1().border_color(d.line).overflow_hidden();
    cells.forEach(([n, w, col], i) => row.child(v_flex().flex_1().min_w(0).px(12).py(7).bg(d.raised).when(i > 0, (el) => el.border_l_1().border_color(d.line))
      .child(div().text_size(18).font_weight(600).line_height("22px").text_color(col).truncate().child(n))
      .child(div().text_size(11.5).text_color(d.fg2).child(w))));
    return row;
  }
  face(bot, w, h, t) {
    const p = petOf(bot);
    return div().w(w).h(h).flex_none().child(p && petReady(p) ? petEl(p, petState(bot, mood(null, bot.awake)), w, h, { open: true }) : mascotEl(bot, mood(null, bot.awake), Math.min(h, 22), t));
  }
  pals(d, t) {
    const c = crew();
    const ags = agents();
    const awake = [], asleep = [];
    for (const s of withoutChief()) { const b = botOf(s, c); (b.awake ? awake : asleep).push({ s, b }); }
    const tile = ({ s, b }) => {
      const el = v_flex().flex_1().min_w(0).gap(4).px(10).py(8).rounded(d.r.md).bg(d.raised).border_1().border_color(d.line)
        .child(h_flex().items_center().gap(8)
          .child(this.face(b, 36, 28, t))
          .child(div().flex_1().min_w(0).truncate().text_size(12.5).font_weight(600).text_color(d.fg1).child(short(s.name)))
          .child(div().flex_none().text_size(11).text_color(d.fg3).child(b.god ? "head" : `${s.tabs.length} topic${s.tabs.length === 1 ? "" : "s"}`)));
      const tabs = [...s.tabs].sort((x, y) => (["working", "blocked", "done"].indexOf(x.status) + 1 || 9) - (["working", "blocked", "done"].indexOf(y.status) + 1 || 9)).slice(0, 4);
      for (const tab of tabs) {
        const ag = ags.find((a) => a.tab === tab.id);
        const what = tab.status === "blocked" ? "asks you" : tab.status === "done" ? "done" : (ag ? taskTitle(ag.title, b.name, s.name, channelName(tab)) ?? ag.title : null) ?? (tab.status === "working" ? "working" : "idle");
        el.child(h_flex().id(`cht-${tab.id}`).items_center().gap(7).h(18).rounded(d.r.xs).cursor_pointer().hover((x) => x.bg(d.hover))
          .tooltip(`Open ${short(s.name)} #${channelName(tab)} (leaves the pop-up)`)
          .on_click(() => { closeChief(); openTerminal(s, tab); })
          .child(div().size(7).flex_none().rounded(4).bg(statusColor(tab.status, t)))
          .child(div().flex_none().text_size(11).font_family(d.mono).text_color(d.fg2).child(`#${channelName(tab)}`))
          .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(d.fg2).child(clip(what, 60))));
      }
      if (s.tabs.length > tabs.length) el.child(div().text_size(11).text_color(d.fg4).child(`+${s.tabs.length - tabs.length} more`));
      return el;
    };
    const grid = v_flex().flex_none().gap(8);
    for (let i = 0; i < awake.length; i += 3) {
      const row = h_flex().gap(8).items_start();
      awake.slice(i, i + 3).forEach((x) => row.child(tile(x)));
      for (let k = awake.slice(i, i + 3).length; k < 3; k++) row.child(div().flex_1());
      grid.child(row);
    }
    if (!awake.length) grid.child(div().text_size(12.5).text_color(d.fg2).child("No pal is awake."));
    if (asleep.length) grid.child(div().text_size(11.5).text_color(d.fg3).truncate().child(`Asleep: ${asleep.map((x) => short(x.s.name)).join(", ")}`));
    return [this.label(d, "Pals", div().text_size(11.5).text_color(d.fg3).child(`${awake.length} awake · ${asleep.length} asleep`)), grid];
  }
  rows(d, list) {
    const box = v_flex().flex_none().rounded(d.r.md).border_1().border_color(d.line).overflow_hidden();
    list.forEach((r, i) => box.child(h_flex().h(34).px(12).gap(10).items_center().bg(d.raised).when(i > 0, (el) => el.border_t_1().border_color(d.line)).children(r)));
    return box;
  }
  tag(d, text, tone_ = "warn") {
    const col = { warn: [d.warnText, "#5A4512", "#221B08"], chief: ["#B9C2FA", "#34396A", "#1B1E33"], ok: [d.okHi, "#1E5440", "#0D2219"], plain: [d.fg2, d.lineMid, d.raised] }[tone_];
    return div().flex_none().px(6).h(18).flex().items_center().rounded(d.r.xs).border_1().border_color(col[1]).bg(col[2]).text_size(10.5).font_weight(500).text_color(col[0]).child(text);
  }
  needs(d) {
    const items = (shared("crew.needs")?.items ?? []).slice(0, 4);
    const out = [this.label(d, "Needs you and stuck", div().id("chief-open-home").text_size(11.5).text_color(d.info).cursor_pointer().on_click(() => { closeChief(); showHome(); }).child("Open Home ›"))];
    if (!items.length) out.push(div().text_size(12.5).text_color(d.fg2).child("Nothing waits on you."));
    else out.push(this.rows(d, items.map((x) => [this.tag(d, WHY[x.why] ?? x.why), div().flex_1().min_w(0).truncate().text_size(12.5).text_color(d.body).child(x.label ?? "")])));
    return out;
  }
  shipping(d) {
    const last = this.installs[0] ?? {};
    const b = last.build ?? this.install.build ?? {};
    const rel = this.home.release ?? {};
    const cell = (k, v, sub) => v_flex().flex_1().min_w(0).px(12).py(7).bg(d.raised)
      .child(div().text_size(11).text_color(d.fg3).child(k))
      .child(div().text_size(13).font_weight(600).text_color(d.fg1).truncate().child(v))
      .child(div().text_size(11.5).text_color(d.fg2).truncate().child(sub));
    return [this.label(d, "Shipping"), h_flex().flex_none().rounded(d.r.md).border_1().border_color(d.line).overflow_hidden()
      .child(cell("Public · GitHub", this.update.latest ?? "—", this.update.checked ? `checked ${ago(this.update.checked * 1000)} ago` : "not checked"))
      .child(div().w(1).bg(d.line)).child(cell("Installed here", b.hash ? String(b.hash).slice(0, 7) : this.install.version ?? "—", [b.branch, last.at ? hhmm(last.at) : null].filter(Boolean).join(" · ") || (this.install.version ?? "")))
      .child(div().w(1).bg(d.line)).child(cell("Next", rel.next ?? "—", rel.note ?? `${(rel.queued ?? []).length} queued`))];
  }
  handedRows(d) {
    const list = this.handed();
    const out = [this.label(d, `Handed to ${headName()}`)];
    if (!list.length) out.push(div().text_size(12.5).text_color(d.fg2).child(`Nothing yet. When you agree on something, ${this.chiefName()} hands it to ${headName()}#ops as a card.`));
    else out.push(this.rows(d, list.map((k) => [this.tag(d, k.id, "chief"), div().flex_1().min_w(0).truncate().text_size(12.5).text_color(d.body).child(k.title ?? ""),
      this.tag(d, k.status ?? "?", k.status === "done" ? "ok" : OPEN.includes(k.status) && k.status !== "held" ? "plain" : "warn"),
      div().w(36).flex_none().text_size(11.5).text_color(d.fg3).child(ago(Date.parse(k.created ?? "") || 0))])));
    return out;
  }
  askRow(d) {
    return h_flex().h(42).flex_none().px(10).gap(8).items_center().border_t_1().border_color(d.line).bg(d.raised)
      .child(div().flex_1().min_w(0).h(28).px(8).flex().items_center().rounded(d.r.sm).bg(d.inset).border_1().border_color("#3A4180")
        .child(Input.new(this.ask).w_full().text_size(12.5).text_color(d.fg1)))
      .child(div().flex_none().text_size(11).text_color(d.fg4).child("or click its terminal"));
  }
  empty(d, t) {
    const rec = chiefOf();
    const asleep = Boolean(rec);
    return v_flex().size_full().items_center().justify_center().gap(10).px(32).bg(d.bg1)
      .child(this.face(rec ? { ...rec, awake: false } : { name: CHIEF_NAME, awake: false }, 96, 74, t))
      .child(div().text_size(16).font_weight(600).text_color(d.fg1).child(asleep ? `${rec.name} is asleep` : `No ${CHIEF_NAME} yet`))
      .child(div().max_w(420).text_size(12.5).line_height("18px").text_color(d.fg2).text_center()
        .child(asleep ? "Wake it to talk; it opens right here, not in the sidebar."
          : `Your chief of staff, above ${headName()}: it reads the whole crew when you ask, gives you a pick with the why, and hands work to ${headName()}#ops. Nothing is ever sent to it but your words.`))
      .child(pebble(d, { id: "chief-go", label: asleep ? "Wake it" : `Hire the ${CHIEF_NAME}`, primary: true, disabled: this.busy,
        onClick: (cx) => (asleep ? wakeChief() : this.hire(cx)) }));
  }

  render(cx) {
    const t = tone(theme());
    const d = ds(t);
    const p = props() ?? {};
    if (!chiefTerminal()) return this.empty(d, t);
    if (p.compact) {
      return v_flex().id("chief-dash").track_focus(this.handle).size_full().bg(d.bg1).border_b_1().border_color(d.line)
        .child(v_flex().flex_1().min_h(0).gap(6).px(10).py(8).child(this.read(d, true)).child(this.strip(d, true)))
        .child(this.askRow(d));
    }
    const body = v_flex().gap(12).p(14)
      .child(this.read(d, false))
      .child(this.strip(d, false))
      .children(this.pals(d, t))
      .children(this.needs(d))
      .children(this.shipping(d))
      .children(this.handedRows(d));
    return v_flex().id("chief-dash").track_focus(this.handle).size_full().bg(d.bg1).border_l_1().border_color(d.line)
      .child(h_flex().h(34).flex_none().px(14).gap(8).items_center().border_b_1().border_color(d.line)
        .child(div().text_size(12).font_weight(500).text_color(d.fg1).child("Factory"))
        .child(div().flex_1())
        .child(div().text_size(11.5).text_color(d.fg3).child(this.readAt ? `read ${hhmm(this.readAt)} · while open` : "reading…")))
      .child(scrollArea(d, "chief-body", body).flex_1().min_h(0))
      .child(this.askRow(d));
  }
}
