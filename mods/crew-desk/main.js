// The Desk view (docs/desk/design.md §11.3): every card on every pal's desk, as the center stack's
// third child (desk-view, beside the topic's terminal and rooms). The header's "Desk N" button and
// the command bar's "Desk" show it; picking a topic in the sidebar goes back (showTabs).
//
// Three columns:
// - left, the desks: Needs you (cards waiting on the owner), To route (no pal yet), Held (due but not
//   delivered, with why), All; then each pal with its open count and, under it, its topic lanes and
//   its pal tray (cards to the pal and no topic). A pal whose space is closed still shows while it
//   has cards.
// - middle, the picked desk's cards grouped by status: an urgency dot (now red, soon amber, low grey),
//   the title, from → to, its age and its last receipt.
// - right, the open card: who it's from (an owner card that doesn't match the ledger is amber,
//   "edited after sending · unverified"), its body, reply, images, the receipts as a timeline, and the
//   owner's actions, each a click (ownerCli): Open topic, Move…, Raise / Lower, Cancel, Confirm as mine
//   (an unverified owner card), Done (a card waiting on the owner).
//
// Data: `pal desk ls --all --json`, read when this view is shown: every 10 s, and whenever the
// header's watch on data/crew-desk publishes new counts (shared "crew.desk"). Hidden, it reads nothing.
// No pals yet: "No pals yet. Cards you drop wait in To route until you hire one." and a Hire button.
//
// Drafts (§13): the idea partner's (MUSE's) cards waiting for the owner's Send, in their own desk
// under Needs you, with a dashed outline. A draft's actions: Send (to its suggestion, or another
// place, at an urgency: `desk send-draft ID --to … --urgency …`, a click), Edit (the quick-drop,
// prefilled; dropping sends the edited text and retires the draft: `--from-draft ID`) and Discard.
// No drafts and no idea partner yet: "Hire an idea partner".

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, spaces, shared, setShared, run, notify, openOverlay } from "herdr";
import { ds, tone, scrollArea, pebble, channelName, loadDesk, deskMode, showTabs, ownerCli, deskSlug, cardAge,
  CARD_OPEN, CARD_STATUS_WORD, URGENCIES, urgencyColor, cardStatusColor, openDrop, partnerOf, PARTNER_NAME, showHome, headSpace, withoutChief } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const LEFT = 232, RIGHT = 400;
const AMBER_FILL = "#E8AA0A1F", AMBER_EDGE = "#E8AA0A47";

// A receipt as people read it: "routed #docs" → "Routed to #docs"; the rest as they are.
export function receiptWord(status) {
  const m = /^routed (#\S+)$/.exec(status ?? "");
  return m ? `Routed to ${m[1]}` : status ?? "";
}
// A draft's suggestion (its `to`) as `desk send-draft --to` takes it, and as people read it.
export const draftTarget = (to) => (!to || to === "auto" ? "auto" : to === "To route" ? "route" : to);
export const targetLabel = (to) => (to === "auto" ? "Auto (a pal picks it)" : to === "route" ? "To route (I'll pick)" : to.replace("#", " #"));
// The quick-drop's props for Edit: the draft's words, where it suggests, how urgent, its board flag.
export function editProps(c) {
  return { text: [c.title, c.body].filter(Boolean).join("\n\n"), to: draftTarget(c.to), urgency: c.urgency ?? "normal",
    task: c.track === "yes", fromDraft: c.id, drafter: String(c.from ?? PARTNER_NAME).split("#")[0] };
}

// Its second line: who and how, then the note. Triage's reads "by triage: <why>" (the model's reason).
export function receiptLine(r) {
  if (r.via === "triage" && /^routed /.test(r.status ?? "")) return `by triage${r.note ? `: ${r.note}` : ""}`;
  if (r.via === "rules" && /^routed /.test(r.status ?? "")) return `by the rules${r.note ? `: ${r.note}` : ""}`;
  return [r.by, r.via, r.note].filter(Boolean).join(" · ");
}

export default class CrewDesk extends View {
  init(_props, cx) {
    this.cards = [];
    this.counts = {};
    this.err = null;
    this.loaded = false;
    this.pick = "all";
    this.openId = null;
    this.moving = false;
    this.draftTo = null;      // the open draft's Send target (null: its suggestion)
    this.draftUrg = null;     // and urgency (null: its own)
    this.draftPicking = false;
    this.busy = false;
    this.seenAt = null;
    this.shown = false;
    this.loading = false;
    cx.timer.every(10000, (cx) => { if (deskMode()) this.reload(cx); });
  }

  reload(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const { cards, counts } = await loadDesk();
        this.cards = cards; this.counts = counts; this.err = null;
      } catch (e) { this.err = String(e.message ?? e).slice(0, 240); }
      this.loaded = true;
      this.loading = false;
      cx.notify();
    });
  }

  owner() { return shared("crew.settings")?.owner || "you"; }

  pals() {
    const out = withoutChief().map((s) => ({ name: s.name, slug: deskSlug(s.name), space: s, tabs: s.tabs ?? [] }));
    const known = new Set(out.map((p) => p.slug));
    for (const c of this.cards) {
      if (c.tray && !c.tray.startsWith("_") && !known.has(c.tray)) { known.add(c.tray); out.push({ name: c.pal || c.tray, slug: c.tray, space: null, tabs: [] }); }
    }
    return out;
  }

  match(key, c) {
    if (key === "drafts") return c.tray === "_drafts";
    if (c.tray === "_drafts") return false;   // drafts aren't on anyone's desk until they're sent
    if (key === "all") return true;
    if (key === "needs") return c.status === "needs you" || c.tray === "_owner";
    if (key === "route") return c.tray === "_route";
    if (key === "held") return c.status === "held";
    const [kind, rest] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    const [slug, topic] = rest.split("#");
    if (c.tray !== slug) return false;
    if (kind === "pal") return true;
    if (kind === "tray") return !c.topic;
    return (c.topic ?? "").toLowerCase() === (topic ?? "").toLowerCase();
  }

  act(label, args, cx) {
    if (this.busy) return;
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try { await ownerCli(["desk", ...args]); }
      catch (e) { notify({ title: `Couldn't ${label}`, body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
      this.busy = false;
      this.moving = false;
      this.draftPicking = false;
      this.reload(cx);
    });
  }

  openTopic(c) {
    const s = spaces().find((x) => deskSlug(x.name) === c.tray);
    if (!s) return notify({ title: `${c.pal || "That pal"} isn't open`, body: "Wake it from the sidebar first.", level: "info", timeout: 2500 });
    const tab = (s.tabs ?? []).find((t) => channelName(t).toLowerCase() === (c.topic ?? "").toLowerCase()) ?? s.tabs?.find((t) => t.active) ?? s.tabs?.[0];
    run("space.select", { id: s.id });
    if (tab) run("tab.select", { id: tab.id });
    showTabs();
  }

  // The quick-drop's To for the picked desk: a lane is "Pal#topic", a pal (or its tray) "Pal".
  presetTo() {
    const p = this.pick;
    if (!/^(pal|tray|lane):/.test(p)) return null;
    const [slug, topic] = p.slice(p.indexOf(":") + 1).split("#");
    const name = this.pals().find((x) => x.slug === slug)?.name;
    return name ? (topic ? `${name}#${topic}` : name) : null;
  }

  // ── left: the desks ──
  // go: instead of picking this desk (the head pal's desk is Home: Orca's decision 4, via #orca-home).
  deskRow(d, key, label, n, { warn = false, indent = 0, mono = false, go = null, tip = null } = {}) {
    const on = this.pick === key;
    return h_flex().id(`dk-${key}`).h(28).flex_none().items_center().gap(8).pl(10 + indent).pr(10).rounded(d.r.sm).cursor_pointer()
      .when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.hover((s) => s.bg(d.hover)))
      .when(Boolean(tip), (el) => el.tooltip(tip))
      .on_click((_e, cx) => { if (go?.()) return; this.pick = key; this.openId = null; this.moving = false; this.draftPicking = false; cx.notify(); })
      .child(div().flex_1().min_w(0).truncate().text_size(13).when(mono, (el) => el.font_family(d.mono).text_size(12))
        .text_color(on ? d.fg1 : indent ? d.fg2 : d.body).child(label))
      .when(n > 0, (el) => el.child(div().flex_none().text_size(11).font_family(d.mono).text_color(warn ? d.warnText : d.fg3).child(String(n))));
  }

  left(d) {
    const cs = this.cards;
    const count = (key) => cs.filter((c) => this.match(key, c)).length;
    const held = (key) => cs.some((c) => c.status === "held" && this.match(key, c));
    const list = v_flex().gap(1).p(8).pr(12)
      .child(this.deskRow(d, "needs", "Needs you", count("needs"), { warn: true }))
      .child(this.deskRow(d, "drafts", "Drafts", count("drafts")))
      .child(this.deskRow(d, "route", "To route", count("route")))
      .child(this.deskRow(d, "held", "Held", count("held"), { warn: true }))
      .child(this.deskRow(d, "all", "All", cs.length))
      .child(div().h(1).my(6).mx(10).bg(d.lineSoft));
    // (the "all" count leaves drafts out: they aren't on a desk yet)
    const head = headSpace()?.name;
    for (const p of this.pals()) {
      const key = `pal:${p.slug}`;
      // The head pal's desk is Home (its page lists its cards); every other pal keeps its desk here.
      const isHead = Boolean(head) && p.name === head;
      list.child(this.deskRow(d, key, p.name, count(key), { warn: held(key), go: isHead ? () => showHome() : null,
        tip: isHead ? `${p.name}'s desk is Home` : null }));
      const lanes = new Map(p.tabs.map((t) => [channelName(t).toLowerCase(), channelName(t)]));
      for (const c of cs) if (c.tray === p.slug && c.topic && !lanes.has(c.topic.toLowerCase())) lanes.set(c.topic.toLowerCase(), c.topic);
      for (const name of lanes.values()) {
        const lk = `lane:${p.slug}#${name}`;
        const n = count(lk);
        if (n || this.pick === key || this.pick === lk) list.child(this.deskRow(d, lk, `#${name}`, n, { warn: held(lk), indent: 14, mono: true }));
      }
      const tk = `tray:${p.slug}`;
      if (count(tk)) list.child(this.deskRow(d, tk, "to the pal (no topic)", count(tk), { warn: held(tk), indent: 14 }));
    }
    return v_flex().w(LEFT).flex_none().h_full().border_r_1().border_color(d.lineSoft).bg(d.bg1)
      .child(scrollArea(d, "desk-left", list).flex_1().min_h(0));
  }

  // ── middle: the cards ──
  cardRow(d, c) {
    const on = this.openId === c.id;
    const dot = urgencyColor(d, c.urgency);
    const last = c.last ?? (c.receipts ?? []).slice(-1)[0];
    // In To route: a card dropped with Auto is being sorted (crewd's triage); one triage couldn't place
    // waits on you, and its row says why (the last receipt's note).
    const sorting = c.tray === "_route" && c.route === "auto" && c.status === "queued";
    const unplaced = c.tray === "_route" && c.status === "needs you" && last?.note;
    const sub = unplaced ? `waits on you · ${last.note}`
      : [`${c.from_kind === "owner" ? this.owner() : c.from ?? "?"} → ${c.to ?? "?"}`, cardAge(c.created),
        last ? `${receiptWord(last.status)}${last.by ? ` · ${last.by}` : ""}` : null].filter(Boolean).join("  ·  ");
    // A draft (not sent yet) has a dashed outline (design §5's table).
    const draft = c.status === "draft";
    const sub2 = draft ? `${String(c.from ?? "?").split("#")[0]} suggests ${targetLabel(draftTarget(c.to))}  ·  ${cardAge(c.created)}` : sub;
    return v_flex().id(`dc-${c.id}`).flex_none().gap(2).px(10).py(7).rounded(d.r.sm).cursor_pointer()
      .when(draft, (el) => el.border_1().border_dashed().border_color(d.lineMid))
      .when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.hover((s) => s.bg(d.hover)))
      .on_click((_e, cx) => { this.openId = on ? null : c.id; this.moving = false; this.draftTo = null; this.draftUrg = null; this.draftPicking = false; cx.notify(); })
      .child(h_flex().gap(8).items_center()
        .child(div().size(6).flex_none().rounded(3).bg(dot ?? "#00000000"))
        .child(div().flex_1().min_w(0).truncate().text_size(13).line_height("17px").text_color(c.unreadable ? d.warnText : d.fg1)
          .child(c.unreadable ? `Can't read this card: ${c.unreadable}` : c.title || "(no title)"))
        .when(c.status === "held", (el) => el.child(div().flex_none().text_size(11).text_color(d.warnText).child(`held · ${c.held ?? "?"} ${cardAge(c.held_since)}`)))
        .when(sorting, (el) => el.child(div().flex_none().text_size(11).text_color(d.infoText)
          .loop("opacity", { from: 0.45, to: 1, period: 1200 }).child("sorting…")))
        .child(div().flex_none().text_size(11).font_family(d.mono).text_color(d.fg4).child(c.id ?? "")))
      .child(div().pl(14).truncate().text_size(11).line_height("14px").text_color(unplaced ? d.warnText : d.fg3).child(sub2));
  }

  middle(d) {
    const shown = this.cards.filter((c) => this.match(this.pick, c));
    const noPals = !spaces().length;
    const body = v_flex().gap(2).p(10).pr(14);
    if (this.err && !this.cards.length) {
      body.child(div().p(16).text_size(13).line_height("19px").text_color(d.fg2).child(`Couldn't read the desk: ${this.err}`));
    } else if (noPals && !shown.length) {
      body.child(v_flex().pt(48).gap(12).items_center()
        .child(div().text_size(16).font_weight(500).text_color(d.fg1).child("No pals yet"))
        .child(div().max_w(380).text_center().text_size(13).line_height("19px").text_color(d.fg2)
          .child("Cards you drop wait in To route until you hire one."))
        .child(h_flex().gap(8)
          .child(pebble(d, { id: "desk-hire", label: "Hire a pal…", primary: true, onClick: () => openOverlay({ mod: "crew-hire", kind: "dialog", width: 520, modal: true }) }))
          .child(pebble(d, { id: "desk-drop0", label: "Drop a card", onClick: () => openDrop() }))));
    } else if (this.pick === "drafts" && !shown.length) {
      const partner = partnerOf();
      body.child(v_flex().pt(48).gap(12).items_center()
        .child(div().text_size(16).font_weight(500).text_color(d.fg1).child("No drafts"))
        .child(div().max_w(380).text_center().text_size(13).line_height("19px").text_color(d.fg2)
          .child(partner ? `${partner.name}'s drafts show up here.` : "Hire an idea partner to turn your riffs into cards."))
        .when(!partner, (el) => el.child(pebble(d, { id: "desk-hire-partner", label: "Hire an idea partner…", primary: true,
          onClick: () => openOverlay({ mod: "crew-hire", kind: "dialog", width: 520, modal: true, props: { partner: true } }) }))));
    } else if (!shown.length) {
      body.child(div().p(16).text_size(13).text_color(d.fg3).child(this.loaded ? "Nothing here. Every card on this desk is closed." : "Reading the desk…"));
    } else {
      // A file that doesn't parse has no status: its own group, last.
      const group = (c) => (c.unreadable ? "unreadable" : c.status ?? "unreadable");
      const groups = [...CARD_OPEN, ...new Set(shown.map(group).filter((s) => !CARD_OPEN.includes(s)))];
      for (const g of groups) {
        const rows = shown.filter((c) => group(c) === g);
        if (!rows.length) continue;
        body.child(h_flex().pt(8).pb(4).px(10).gap(8).items_center()
          .child(div().text_size(11).font_weight(600).text_color(cardStatusColor(d, g)).child((CARD_STATUS_WORD[g] ?? (g === "unreadable" ? "Can't read" : g)).toUpperCase()))
          .child(div().text_size(11).font_family(d.mono).text_color(d.fg4).child(String(rows.length))));
        for (const c of rows) body.child(this.cardRow(d, c));
      }
    }
    return v_flex().flex_1().min_w(0).h_full().child(scrollArea(d, "desk-mid", body).flex_1().min_h(0));
  }

  // ── right: the open card ──
  fromLine(d, c) {
    const owner = this.owner();
    if (c.from_kind === "owner") {
      return c.verified
        ? div().text_size(12).text_color(d.body).child(`from ${owner} (clicked in Project Pals)${c.drafted_by ? ` · drafted by ${String(c.drafted_by).split("#")[0]}` : ""}${c.passed_note ? ` · ${c.passed_note}` : ""}`)
        : div().px(8).py(4).rounded(d.r.sm).bg(AMBER_FILL).border_1().border_color(AMBER_EDGE).text_size(12).text_color(d.warnText)
          .child(`claims to be from ${owner} · edited after sending · unverified`);
    }
    if (c.status === "draft") return div().text_size(12).text_color(d.body).child(`a draft by ${String(c.from ?? "?").split("#")[0]}: nothing goes out until you Send it`);
    if (c.from_kind === "pal") return div().text_size(12).text_color(d.body).child(`from ${c.from} (a pal${c.relaying ? `, relaying ${c.relaying}: not ${owner}` : ""})`);
    if (c.from_kind === "system") return div().text_size(12).text_color(d.body).child("from Project Pals");
    return div().text_size(12).text_color(d.warnText).child(`from ${c.from ?? "a shell"} (unverified)`);
  }

  text(d, id, s, color) {
    return v_flex().id(id).gap(2).children(String(s ?? "").split("\n").map((l, i) => div().id(`${id}-${i}`).text_size(13).line_height("19px").text_color(color).child(l || " ")));
  }

  right(d) {
    const c = this.cards.find((x) => x.id === this.openId);
    const pane = v_flex().w(RIGHT).flex_none().h_full().border_l_1().border_color(d.lineSoft).bg(d.bg1);
    if (!c) return pane.items_center().justify_center().child(div().text_size(13).text_color(d.fg4).child("Pick a card to read it."));
    const chip = (label, color = d.fg2) => div().flex_none().h(20).px(6).flex().items_center().rounded(3).bg(d.raised).border_1().border_color(d.line)
      .text_size(11).font_weight(500).text_color(color).child(label);
    const ui = URGENCIES.indexOf(c.urgency ?? "normal");
    const open = !["done", "cancelled", "expired"].includes(c.status);
    const waitsOnOwner = c.status === "needs you" || c.tray === "_owner";
    const spacesNow = spaces();
    const hasTopic = spacesNow.some((s) => deskSlug(s.name) === c.tray);
    if (c.status === "draft") return pane.child(scrollArea(d, "desk-right", this.draftPane(d, c)).flex_1().min_h(0));
    const actions = h_flex().flex_wrap().gap(6)
      .when(hasTopic, (el) => el.child(pebble(d, { id: "da-open", label: "Open topic", onClick: () => this.openTopic(c) })))
      .when(open, (el) => el.child(pebble(d, { id: "da-move", label: this.moving ? "Moving…" : "Move…", onClick: (cx) => { this.moving = !this.moving; cx.notify(); } })))
      .when(open && ui < URGENCIES.length - 1, (el) => el.child(pebble(d, { id: "da-up", label: "Raise", tooltip: `to ${URGENCIES[ui + 1]}`,
        onClick: (cx) => this.act("raise it", ["urgency", c.id, URGENCIES[ui + 1]], cx) })))
      .when(open && ui > 0, (el) => el.child(pebble(d, { id: "da-down", label: "Lower", tooltip: `to ${URGENCIES[ui - 1]}`,
        onClick: (cx) => this.act("lower it", ["urgency", c.id, URGENCIES[ui - 1]], cx) })))
      .when(c.from_kind === "owner" && !c.verified, (el) => el.child(pebble(d, { id: "da-confirm", label: "Confirm as mine",
        onClick: (cx) => this.act("confirm it", ["confirm", c.id], cx) })))
      .when(open && waitsOnOwner, (el) => el.child(pebble(d, { id: "da-done", label: "Done", primary: true,
        onClick: (cx) => this.act("close it", ["done", c.id, "closed in the Desk view"], cx) })))
      .when(open, (el) => el.child(pebble(d, { id: "da-cancel", label: "Cancel", onClick: (cx) => this.act("cancel it", ["cancel", c.id], cx) })));
    const moveList = () => {
      const list = v_flex().gap(1).p(4);
      for (const s of spacesNow) for (const t of s.tabs ?? []) {
        const to = `${s.name}#${channelName(t)}`;
        list.child(div().id(`dm-${s.id}-${t.id}`).h(28).flex_none().flex().items_center().px(8).rounded(4).cursor_pointer().hover((st) => st.bg(d.hover))
          .on_click((_e, cx) => this.act("move it", ["pass", c.id, to, "moved in the Desk view"], cx))
          .child(div().truncate().text_size(12).text_color(d.body).child(`${s.name} #${channelName(t)}`)));
      }
      list.child(div().id("dm-route").h(28).flex_none().flex().items_center().px(8).rounded(4).cursor_pointer().hover((st) => st.bg(d.hover))
        .on_click((_e, cx) => this.act("move it", ["pass", c.id, "route", "moved in the Desk view"], cx))
        .child(div().text_size(12).text_color(d.fg2).child("To route")));
      return scrollArea(d, "desk-move", list).max_h(200).rounded(6).bg(d.raised).border_1().border_color(d.line);
    };
    const imgs = (c.attachments ?? []).map((a, i) => div().id(`dimg-${i}`).w(112).h(80).flex_none().rounded(4).overflow_hidden().border_1().border_color(d.line)
      .tooltip(a).child(image(`data/${a}`).w(112).h(80)));
    const timeline = v_flex().gap(0).children((c.receipts ?? []).map((r, i, all) => h_flex().id(`dr-${i}`).gap(10).items_start()
      .child(v_flex().w(8).flex_none().items_center().h_full()
        .child(div().size(7).mt(5).rounded(4).bg(/^routed /.test(r.status ?? "") ? d.infoText : cardStatusColor(d, r.status)))
        .when(i < all.length - 1, (el) => el.child(div().w(1).flex_1().min_h(14).bg(d.line))))
      .child(v_flex().flex_1().min_w(0).pb(8)
        .child(h_flex().gap(6).child(div().text_size(12).font_weight(500).text_color(d.body).child(receiptWord(r.status)))
          .child(div().text_size(11).text_color(d.fg4).child(cardAge(r.at))))
        .child(div().text_size(11).line_height("15px").text_color(d.fg3).child(receiptLine(r))))));
    const body = v_flex().gap(12).p(16).pr(18)
      .child(div().text_size(15).line_height("20px").font_weight(600).text_color(d.fg1).child(c.title || "(no title)"))
      .child(h_flex().flex_wrap().gap(6)
        .child(chip(CARD_STATUS_WORD[c.status] ?? c.status ?? "?", cardStatusColor(d, c.status)))
        .child(chip(c.kind ?? "tell"))
        .when((c.urgency ?? "normal") !== "normal", (el) => el.child(chip(c.urgency, urgencyColor(d, c.urgency) ?? d.fg2)))
        .when(Boolean(c.task), (el) => el.child(chip(c.task)))
        .child(div().flex_none().text_size(11).font_family(d.mono).text_color(d.fg4).child(c.id)))
      .child(v_flex().gap(4)
        .child(this.fromLine(d, c))
        .child(div().text_size(12).text_color(d.fg2).child(`to ${c.to ?? "?"} · ${cardAge(c.created)} ago`)))
      .when(c.status === "held", (el) => el.child(div().px(8).py(5).rounded(d.r.sm).bg(AMBER_FILL).border_1().border_color(AMBER_EDGE)
        .text_size(12).line_height("16px").text_color(d.warnText).child(`Held: ${c.held ?? "?"} · for ${cardAge(c.held_since)}`)))
      .when(Boolean(c.body), (el) => el.child(this.text(d, "dbody", c.body, d.body)))
      .when(c.reply !== null && c.reply !== undefined, (el) => el.child(v_flex().gap(4)
        .child(div().text_size(11).font_weight(600).text_color(d.fg3).child("REPLY"))
        .child(this.text(d, "dreply", c.reply, d.body))))
      .when(Boolean(c.result), (el) => el.child(v_flex().gap(4)
        .child(div().text_size(11).font_weight(600).text_color(d.fg3).child("RESULT"))
        .child(this.text(d, "dresult", c.result, d.body))))
      .when(imgs.length > 0, (el) => el.child(h_flex().flex_wrap().gap(6).children(imgs)))
      .child(actions)
      .when(this.moving, (el) => el.child(moveList()))
      .child(v_flex().gap(6).pt(4)
        .child(div().text_size(11).font_weight(600).text_color(d.fg3).child("RECEIPTS"))
        .child(timeline));
    return pane.child(scrollArea(d, "desk-right", body).flex_1().min_h(0));
  }

  // The open draft: its words, where it would go and how urgently (both changeable), Send / Edit / Discard.
  draftPane(d, c) {
    const to = this.draftTo ?? draftTarget(c.to);
    const urg = this.draftUrg ?? c.urgency ?? "normal";
    const pick = () => {
      const list = v_flex().gap(1).p(4);
      const opt = (id, target) => list.child(div().id(id).h(28).flex_none().flex().items_center().px(8).rounded(4).cursor_pointer()
        .when(target === to, (el) => el.bg(d.sel)).when(target !== to, (el) => el.hover((st) => st.bg(d.hover)))
        .on_click((_e, cx) => { this.draftTo = target; this.draftPicking = false; cx.notify(); })
        .child(div().truncate().text_size(12).text_color(d.body).child(targetLabel(target))));
      opt("dt-auto", "auto");
      opt("dt-route", "route");
      for (const s of withoutChief()) for (const t of s.tabs ?? []) opt(`dt-${s.id}-${t.id}`, `${s.name}#${channelName(t)}`);
      return scrollArea(d, "desk-draft-to", list).max_h(200).rounded(6).bg(d.raised).border_1().border_color(d.line);
    };
    const urgRow = h_flex().h(26).flex_none().items_center().p(2).gap(2).rounded(6).bg(d.raised).border_1().border_color(d.line)
      .children(URGENCIES.map((u) => div().id(`dt-u-${u}`).h(20).px(8).flex().items_center().gap(5).rounded(4).cursor_pointer()
        .when(u === urg, (el) => el.bg(d.sel)).when(u !== urg, (el) => el.hover((st) => st.bg(d.hover)))
        .on_click((_e, cx) => { this.draftUrg = u; cx.notify(); })
        .when(Boolean(urgencyColor(d, u)), (el) => el.child(div().size(6).rounded(3).bg(urgencyColor(d, u))))
        .child(div().text_size(12).font_weight(500).text_color(u === urg ? d.fg1 : d.fg2).child(u[0].toUpperCase() + u.slice(1)))));
    const sendArgs = ["send-draft", c.id, "--to", to, ...(urg !== (c.urgency ?? "normal") ? ["--urgency", urg] : []), "--json"];
    const by = String(c.from ?? PARTNER_NAME).split("#")[0];
    return v_flex().gap(12).p(16).pr(18)
      .child(div().text_size(15).line_height("20px").font_weight(600).text_color(d.fg1).child(c.title || "(no title)"))
      .child(h_flex().flex_wrap().gap(6)
        .child(div().flex_none().h(20).px(6).flex().items_center().rounded(3).border_1().border_dashed().border_color(d.lineMid)
          .text_size(11).font_weight(500).text_color(d.fg2).child("Draft"))
        .when(c.track === "yes", (el) => el.child(div().flex_none().h(20).px(6).flex().items_center().rounded(3).bg(d.raised).border_1().border_color(d.line)
          .text_size(11).font_weight(500).text_color(d.fg2).child("goes on the board")))
        .child(div().flex_none().text_size(11).font_family(d.mono).text_color(d.fg4).child(c.id)))
      .child(this.fromLine(d, c))
      .when(Boolean(c.body), (el) => el.child(this.text(d, "dbody", c.body, d.body)))
      .when((c.attachments ?? []).length > 0, (el) => el.child(h_flex().flex_wrap().gap(6).children((c.attachments ?? []).map((a, i) =>
        div().id(`dimg-${i}`).w(112).h(80).flex_none().rounded(4).overflow_hidden().border_1().border_color(d.line).tooltip(a).child(image(`data/${a}`).w(112).h(80))))))
      .child(v_flex().gap(6)
        .child(div().text_size(11).font_weight(600).text_color(d.fg3).child("SEND TO"))
        .child(div().id("dt-to").h(28).flex().items_center().gap(6).px(8).rounded(6).cursor_pointer().bg(d.raised).border_1()
          .border_color(this.draftPicking ? d.lineStrong : d.line).on_click((_e, cx) => { this.draftPicking = !this.draftPicking; cx.notify(); })
          .child(div().flex_1().min_w(0).truncate().text_size(12).font_weight(500).text_color(d.body).child(targetLabel(to)))
          .child(svg(`${ICON}/${this.draftPicking ? "chevron-down" : "chevron-right"}.svg`).size(10).flex_none().text_color(d.fg3)))
        .when(this.draftPicking, (el) => el.child(pick()))
        .child(urgRow))
      .child(h_flex().flex_wrap().gap(6)
        .child(pebble(d, { id: "da-send", label: this.busy ? "Sending…" : "Send", primary: true, tooltip: `Goes out as yours (${by} drafted it)`,
          onClick: (cx) => this.act("send it", sendArgs, cx) }))
        .child(pebble(d, { id: "da-edit", label: "Edit…", onClick: () => openDrop({ ...editProps(c), to, urgency: urg }) }))
        .child(pebble(d, { id: "da-discard", label: "Discard", onClick: (cx) => this.act("discard it", ["discard", c.id], cx) })));
  }

  render(cx) {
    const t = tone(theme());
    const d = ds(t);
    // Shown: read it now, and again whenever the header saw the desk change.
    const shown = deskMode();
    const at = shared("crew.desk")?.at ?? null;
    if (shown && (!this.loaded || at !== this.seenAt || !this.shown)) { this.seenAt = at; this.reload(cx); }
    this.shown = shown;
    // Another mod asked for a desk (showDesk("needs"), say).
    const ask = shared("crew.desk.pick");
    if (ask) { this.pick = ask; this.openId = null; setShared("crew.desk.pick", null); }
    const n = this.counts ?? {};
    const head = h_flex().h(44).flex_none().px(16).gap(12).items_center().border_b_1().border_color(d.lineSoft).bg(d.bg0)
      .child(svg(`${ICON}/ds-inbox.svg`).size(14).text_color(d.fg2))
      .child(div().text_size(14).font_weight(600).text_color(d.fg1).child("Desk"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(d.fg3)
        .child([`${n.open ?? this.cards.length} open`, n.held ? `${n.held} held` : null, n["needs you"] ? `${n["needs you"]} need you` : null,
          n["to route"] ? `${n["to route"]} to route` : null, n.drafts ? `${n.drafts} draft${n.drafts === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")))
      .child(pebble(d, { id: "desk-drop", label: "Drop a card", onClick: () => openDrop(this.presetTo() ? { to: this.presetTo() } : {}) }))
      .child(div().id("desk-back").size(26).flex_none().flex().items_center().justify_center().rounded(d.r.sm).cursor_pointer()
        .tooltip("Back to the topic").hover((s) => s.bg(d.hover)).on_click(() => showTabs())
        .child(svg(`${ICON}/x.svg`).size(11).text_color(d.fg3)));
    return v_flex().id("crew-desk").size_full().bg(d.bg0).text_color(d.fg1)
      .child(head)
      .child(h_flex().flex_1().min_h(0).w_full().child(this.left(d)).child(this.middle(d)).child(this.right(d)));
  }
}
