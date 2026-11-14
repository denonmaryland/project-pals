// Review a pal's proposal (Pals Lite, T217): a change a pal wants to its mission or to the project's
// AGENTS.md. It used to open in the profile panel, which Pals Lite deleted; Home's View and the
// Inbox open this dialog instead. It shows what changes (`pal proposal show`: the proposed text and
// a diff against what's there now), then Decline or Accept, each the owner's click with a token
// (ownerCli). Accept passes the reviewed text's sha, so a proposal that changed after it was shown
// is refused (crewproposals.check_reviewed). props: { id }.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, notify, spaces } from "herdr";
import { ds, tone, crewCli, ownerCli, botOf, sheet, sheetHeader, sheetFace, sheetBody, sheetFooter, scrollArea } from "./crew.js";

const clip = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

export default class CrewProposal extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.p = null;
    this.err = null;
    this.busy = false;
    cx.spawn(async (cx) => {
      try { this.p = JSON.parse(await crewCli(["proposal", "show", String(props()?.id ?? "")])); }
      catch (e) { this.err = String(e?.message ?? e); }
      cx.notify();
    });
    cx.timer.after(0, () => { try { this.handle.focus(); } catch { /* not ready */ } });
  }

  close() { closeOverlay(props()?.overlay); }

  decide(accept, cx) {
    const p = this.p;
    if (!p || this.busy) return;
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await ownerCli(accept ? ["proposal", "accept", p.id, ...(p.text_sha ? ["--text-sha", p.text_sha] : [])] : ["proposal", "decline", p.id]);
        notify({ title: accept ? "Accepted" : "Declined", body: "The pal is told.", level: accept ? "success" : "info", timeout: 2500 });
        this.close();
      } catch (e) {
        notify({ title: accept ? "Couldn't accept it" : "Couldn't decline it", body: clip(e?.message ?? e, 240), level: "warning", timeout: 6000 });
        this.busy = false;
        cx.notify();
      }
    });
  }

  render(cx) {
    const t = tone(theme()), d = ds(t);
    const p = this.p;
    const space = p ? spaces().find((s) => s.name === p.pal) : null;
    const bot = space ? botOf(space) : null;
    const what = !p ? "a proposal" : p.kind === "mission" ? "its mission" : p.kind === "agents" ? (p.file ?? "AGENTS.md") : p.kind;
    const pending = p?.status === "pending";
    const body = sheetBody();
    if (!p) {
      body.child(div().text_size(12.5).line_height("18px").text_color(d.fg2).child(this.err ? `Couldn't read it: ${clip(this.err, 200)}` : "Reading the proposal…"));
    } else {
      if (p.note) body.child(div().text_size(12.5).line_height("18px").text_color(d.body).child(`Why: ${clip(p.note, 600)}`));
      if (!pending) body.child(div().text_size(12.5).text_color(d.warnText).child(`Already ${p.status}.`));
      // The diff when there is one (mission, AGENTS.md); else the proposed text itself. All of it,
      // never cut (Codex, Pals Lite review): Accept takes the whole proposal's sha, so every line it
      // covers is in the box, which scrolls.
      const lines = String(p.diff || p.text || "").split("\n");
      const ink = (l) => (l.startsWith("+") && !l.startsWith("+++") ? d.okHi : l.startsWith("-") && !l.startsWith("---") ? d.err : l.startsWith("@@") ? d.infoText : d.body);
      const list = v_flex().py(8).px(10).children(lines.map((l) =>
        div().text_size(12).line_height("18px").font_family(d.mono).text_color(ink(l)).child(l.replace(/^ +/, (m) => " ".repeat(m.length)) || " ")));
      body.child(div().text_size(11.5).text_color(d.fg3).child(`${lines.length} line${lines.length === 1 ? "" : "s"}${lines.length > 18 ? ", all here: scroll to read them" : ""}`));
      body.child(div().h(360).rounded(d.r.md).bg(d.inset).border_1().border_color(d.lineMid).overflow_hidden()
        .child(scrollArea(d, "pr-diff", list).size_full()));
      if (!p.diff && (p.kind === "mission" || p.kind === "agents")) body.child(div().text_size(11.5).text_color(d.fg3).child("The whole proposed text (the current one couldn't be read to compare)."));
    }
    return sheet(d, "crew-proposal", this.handle, (e, cx) => { if (e.key === "escape") { this.close(); cx.stop_propagation(); } })
      .child(sheetHeader(d, { id: "pr", face: bot ? sheetFace(bot, t) : null, title: p ? `${p.by ?? p.pal} proposes a change to ${what}` : "A proposal",
        sub: p ? `${p.pal} · ${p.id}` : null, onClose: () => this.close() }))
      .child(body)
      .child(sheetFooter(d, { id: "pr", hint: pending ? "Accept writes it now; the pal is told either way." : "",
        onCancel: () => (pending && !this.busy ? this.decide(false, cx) : this.close()), cancelLabel: pending ? "Decline" : "Close",
        primary: pending ? "Accept" : null, ready: Boolean(pending && !this.busy), onPrimary: (cx) => this.decide(true, cx) }));
  }
}
