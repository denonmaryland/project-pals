// The profile panel's project tabs (stage 2 of docs/profiles/proposal.md): Mission, Brain and
// AGENTS.md. Everything is read and written through the `pal` command (crewbrain.py,
// crewagents.py, crewproposals.py), so the CLI and the panel agree. A project's files are written
// only on the owner's Write click, after a diff, by `pal agents apply` (backup + hash check).

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, EditorState, Editor, TextView, InputState, Input } from "gpui-base";
import { exec, appHome, writeTextFile, readTextFile, notify, shared, setShared } from "herdr";
import { crewCli, openPanel, panelState, panelTab, setPanelSize, panelFull, pebble } from "./crew.js";

const ICON = "mods/crew-roster/icons";
const slugOf = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";

// ─── state and loading ─────────────────────────────────────────────────────────────────────────

export function initProject(view, cx) {
  view.brain = null; view.brainFor = null;
  view.agentsInfo = null; view.agentsFor = null;
  view.proposals = [];
  view.brainFile = null;      // the Brain tab's open file: { file, text, sha } or null (the list)
  view.edit = null;           // { kind: "mission" | "brain" | "agents", file, sha, label }
  view.review = null;         // { file, rows, staged, expect, note, proposal, label }
  view.deep = null;           // the deep check's findings (null: not run), or "running"
  view.backups = null;
  view.editor = EditorState.new({ language: "markdown", soft_wrap: true, font_family: "JetBrains Mono", font_size: 12, folding: false });
  view.viewer = EditorState.new({ language: "markdown", soft_wrap: true, font_family: "JetBrains Mono", font_size: 12, folding: false, readonly: true });
  view.note = InputState.new({ placeholder: "What this change is for (goes in the brain's change log)" });
  cx.timer.every(8000, (cx) => { if (view.isOpen() && ["mission", "brain"].includes(panelTab())) loadBrain(view, cx, true); });
  cx.timer.every(15000, (cx) => { if (view.isOpen() && panelTab() === "agents" && !view.edit && !view.review) loadAgents(view, cx, true); });
  cx.timer.every(5000, (cx) => { if (view.isOpen()) loadProposals(view, cx); });
  // A proposal opened from the Inbox (shared crew.panel.proposal): straight to its review.
  cx.timer.every(300, (cx) => {
    const pid = panelState().proposal;
    if (pid && pid !== view.proposalSeen && view.isOpen()) { view.proposalSeen = pid; openProposal(view, cx, pid); }
  });
}

// The shown pal changed, or the tab opened: what to (re)load.
export function ensureProject(view, cx, bot) {
  const tab = panelTab();
  if (["mission", "brain"].includes(tab) && view.brainFor !== bot.name && !view.brainLoading) loadBrain(view, cx);
  if (tab === "agents" && view.agentsFor !== bot.name && !view.agentsLoading) loadAgents(view, cx);
}

export function loadBrain(view, cx, quiet = false) {
  const s = view.shown();
  if (!s) return;
  const name = s.bot.name;
  view.brainLoading = true;
  cx.spawn(async (cx) => {
    try {
      const b = JSON.parse(await crewCli(["brain", "ls", name, "--json"]));
      if (view.shown()?.bot.name === name) {
        if (view.brainFor !== name) { view.brainFile = null; view.edit = null; view.review = null; }
        view.brain = b; view.brainFor = name;
      }
    } catch (e) { if (!quiet) notify({ title: "Couldn't read the brain", body: String(e.message ?? e).slice(0, 200), level: "warning" }); view.brainFor = name; }
    view.brainLoading = false;
    cx.notify();
  });
}

export function loadAgents(view, cx, quiet = false) {
  const s = view.shown();
  if (!s) return;
  const name = s.bot.name;
  view.agentsLoading = true;
  cx.spawn(async (cx) => {
    try {
      const a = JSON.parse(await crewCli(["agents", "show", name, "--json"]));
      if (view.shown()?.bot.name === name) {
        if (view.agentsFor !== name) { view.deep = null; view.backups = null; view.edit = null; view.review = null; }
        view.agentsInfo = a; view.agentsFor = name;
      }
    } catch (e) { if (!quiet) view.agentsInfo = { error: String(e.message ?? e) }; view.agentsFor = name; }
    view.agentsLoading = false;
    cx.notify();
  });
}

function loadProposals(view, cx) {
  cx.spawn(async (cx) => {
    try { view.proposals = JSON.parse(await crewCli(["proposals", "ls", "--json"])); } catch {}
    cx.notify();
  });
}

// ─── staging, diffs and writes ────────────────────────────────────────────────────────────────

async function stage(text, label) {
  const dir = `${appHome()}/data/crew-staged`;
  await exec("mkdir", ["-p", dir]);
  const path = `${dir}/${Date.now()}-${slugOf(label)}.md`;
  await writeTextFile(path, text, null);
  return path;
}

// A unified diff (git diff --no-index) → rows: { kind: "add" | "del" | "ctx" | "hunk", text, n }.
async function diffRows(fromPath, toPath) {
  const r = await exec("git", ["diff", "--no-index", "--no-color", "-U3", "--", fromPath ?? "/dev/null", toPath]);
  const rows = [];
  let n = 0, add = 0, del = 0;
  for (const raw of r.stdout.split("\n")) {
    if (raw.startsWith("diff --git") || raw.startsWith("index ") || raw.startsWith("--- ") || raw.startsWith("+++ ") || raw.startsWith("new file") || raw.startsWith("\\")) continue;
    if (raw.startsWith("@@")) { n = Number(raw.match(/\+(\d+)/)?.[1] ?? 1); rows.push({ kind: "hunk", text: raw.replace(/^@@[^@]*@@\s?/, "") }); continue; }
    if (raw.startsWith("+")) { rows.push({ kind: "add", text: raw.slice(1), n: n++ }); add++; }
    else if (raw.startsWith("-")) { rows.push({ kind: "del", text: raw.slice(1) }); del++; }
    else if (raw.startsWith(" ")) rows.push({ kind: "ctx", text: raw.slice(1), n: n++ });
  }
  return { rows, add, del };
}

// Open the review for a project file: the diff of `text` against what's there now.
function startReview(view, cx, { file, text, expect, label, proposal = null, note = "" }) {
  const s = view.shown();
  const folder = view.agentsInfo?.folder ?? s?.bot.folder;
  if (!folder) return;
  cx.spawn(async (cx) => {
    try {
      const staged = await stage(text, `${s.bot.name}-${file}`);
      const cur = `${folder}/${file}`;
      const exists = (await readTextFile(cur).catch(() => null)) !== null;
      const d = await diffRows(exists ? cur : null, staged);
      view.review = { file, staged, expect, label, proposal, created: !exists, ...d };
      view.note.set_value(note);
      view.edit = null;
    } catch (e) { notify({ title: "Couldn't make the diff", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
    cx.notify();
  });
}

function writeReview(view, cx) {
  const s = view.shown();
  const r = view.review;
  if (!s || !r || view.writing) return;
  view.writing = true;
  cx.spawn(async (cx) => {
    try {
      const args = ["agents", "apply", s.bot.name, r.file, "--from", r.staged, "--expect", r.expect];
      const note = view.note.value().trim();
      if (note) args.push("--note", note);
      if (r.proposal) args.push("--proposal", r.proposal);
      await crewCli(args);
      notify({ title: `Wrote ${r.file}`, body: "Backed up first. Not committed: ask the pal to commit it.", level: "success", timeout: 3500 });
      view.review = null;
      setShared("crew.panel", { ...panelState(), proposal: null });
      loadAgents(view, cx);
      loadBrain(view, cx, true);
    } catch (e) { notify({ title: `Didn't write ${r.file}`, body: String(e.message ?? e).slice(0, 240), level: "warning", timeout: 6000 }); }
    view.writing = false;
    cx.notify();
  });
}

function openProposal(view, cx, pid) {
  cx.spawn(async (cx) => {
    try {
      const p = JSON.parse(await crewCli(["proposal", "show", pid]));
      if (p.kind === "agents") {
        openPanel("agents");
        view.agentsFor = null;
        startReview(view, cx, { file: p.file, text: p.text, expect: p.base ?? "none", label: `${p.by}'s proposal`, proposal: pid, note: p.note ?? "" });
      } else if (p.kind === "mission") {
        openPanel("mission");
        view.missionProposal = p;
      }
    } catch (e) { notify({ title: "Couldn't open the proposal", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
    cx.notify();
  });
}

function decline(view, cx, pid) {
  cx.spawn(async (cx) => {
    try { await crewCli(["proposal", "decline", pid]); notify({ title: "Declined", body: "The pal is told.", level: "info", timeout: 2500 }); } catch (e) { notify({ title: "Couldn't decline it", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
    if (view.review?.proposal === pid) view.review = null;
    if (view.missionProposal?.id === pid) view.missionProposal = null;
    setShared("crew.panel", { ...panelState(), proposal: null });
    loadProposals(view, cx);
    cx.notify();
  });
}

// ─── pieces ───────────────────────────────────────────────────────────────────────────────────

const label10 = (d, text) => div().text_size(10).line_height("14px").font_family(d.mono).font_weight(500).text_color(d.fg3).child(text.toUpperCase());

function section(d, id, title, body, act) {
  return v_flex().id(`pp-${id}`).flex_none().py(14).border_t_1().border_color(d.line)
    .child(h_flex().items_center().gap(8).mb(8).child(label10(d, title)).child(div().flex_1()).when(Boolean(act), (el) => el.child(act)))
    .child(body);
}

function link(d, id, text, act) {
  return div().id(id).text_size(11).line_height("14px").font_weight(500).text_color(d.fg2).cursor_pointer()
    .hover((s) => s.text_color(d.fg1)).on_click((_e, cx) => { act(cx); cx.notify(); }).child(text);
}

// The dialog kit's pebbles: Cancel / Decline plain, the action (Save, Write, Accept) primary.
function button(d, id, text, act, { solid = false, disabled = false } = {}) {
  return pebble(d, { id, label: text, primary: solid, disabled, onClick: (cx) => act(cx) });
}

function tag(d, text, tone) {
  const c = { info: [d.infoText, "#4CA1F255"], warn: [d.warnText, "#E8AA0A55"], ok: [d.okHi, "#34D09855"], error: [d.err, "#F06C6C55"] }[tone] ?? [d.fg2, d.lineMid];
  return div().h(16).px(5).flex().flex_none().items_center().rounded(d.r.xs).border_1().border_color(c[1])
    .text_size(10).font_family(d.mono).font_weight(500).text_color(c[0]).child(text);
}

function check(d, item, onClick) {
  return h_flex().id(`ck-${slugOf(item.text)}`).items_start().gap(8).py(3).cursor_pointer()
    .on_click((_e, cx) => { onClick(cx); cx.notify(); })
    .child(div().mt(2).size(12).flex_none().rounded(3).border_1().border_color(item.done ? d.ok : d.lineStrong).when(item.done, (el) => el.bg(d.ok)))
    .child(div().flex_1().min_w(0).text_size(12).line_height("16px").text_color(item.done ? d.fg2 : d.body).child(item.text));
}

function logRows(d, lines, n) {
  return v_flex().children(lines.slice(0, n).map((l, i) => {
    const m = l.match(/^(\d{4})-(\d\d)-(\d\d)(?:\s+(#\S+))?(?:\s+\(([^)]*)\))?(?:\s+·\s+([^:]+))?:\s*([\s\S]*)$/);
    const when = m ? `${m[2]}-${m[3]}` : "";
    const who = m ? (m[4] ?? m[5] ?? m[6] ?? "") : "";
    return h_flex().min_h(28).items_center().gap(10).when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
      .child(div().w(36).flex_none().text_size(10).font_family(d.mono).text_color(d.fg3).child(when))
      .when(Boolean(who), (el) => el.child(div().w(76).flex_none().truncate().text_size(10).font_family(d.mono).text_color(d.fg2).child(who)))
      .child(div().flex_1().min_w(0).text_size(12).line_height("16px").text_color(d.body).child(m ? m[7] : l));
  }));
}

// The editor for a file: Cancel, and Save (brain files) or Review (project files).
function editorView(view, d, onSave, saveLabel) {
  return v_flex().gap(10)
    .child(div().h(view.full ? 520 : 380).rounded(d.r.md).border_1().border_color(d.lineMid).bg(d.inset).overflow_hidden()
      .child(Editor.new(view.editor).size_full()))
    .child(h_flex().gap(8)
      .child(button(d, "pp-cancel", "Cancel", () => { view.edit = null; }))
      .child(div().flex_1())
      .child(button(d, "pp-save", saveLabel, (cx) => onSave(cx), { solid: true })));
}

function reviewView(view, d) {
  const r = view.review;
  const rows = v_flex().rounded(d.r.md).border_1().border_color(d.line).overflow_hidden()
    .child(h_flex().h(30).px(10).gap(8).items_center().bg(d.raised).border_b_1().border_color(d.line)
      .child(div().text_size(12).font_weight(500).text_color(d.fg1).child(r.file))
      .when(r.created, (el) => el.child(tag(d, "new file", "info")))
      .child(div().flex_1())
      .child(div().text_size(11).font_family(d.mono).text_color(d.okHi).child(`+${r.add}`))
      .child(div().text_size(11).font_family(d.mono).text_color(d.fg3).child(`−${r.del}`)));
  if (!r.rows.length) rows.child(div().p(10).text_size(12).text_color(d.fg3).child("No change."));
  for (const row of r.rows.slice(0, 400)) {
    const bg = row.kind === "add" ? "#34D09814" : row.kind === "del" ? "#F06C6C14" : null;
    const fg = row.kind === "add" ? "#B9F0D6" : row.kind === "del" ? "#F5B5B5" : row.kind === "hunk" ? d.fg3 : d.fg2;
    rows.child(h_flex().min_h(20).items_start().when(Boolean(bg), (el) => el.bg(bg))
      .child(div().w(34).flex_none().pr(8).text_right().text_size(11).line_height("20px").font_family(d.mono).text_color(d.fg4).child(row.n != null ? String(row.n) : ""))
      .child(div().w(12).flex_none().text_size(11).line_height("20px").font_family(d.mono).text_color(fg).child(row.kind === "add" ? "+" : row.kind === "del" ? "−" : ""))
      .child(div().flex_1().min_w(0).text_size(11).line_height("20px").font_family(d.mono).text_color(fg).child(row.text || " ")));
  }
  if (r.rows.length > 400) rows.child(div().p(8).text_size(11).text_color(d.fg3).child(`${r.rows.length - 400} more lines`));
  return v_flex().gap(10)
    .child(div().text_size(12).text_color(d.fg2).child(r.label ? `Review · ${r.label}` : "Review"))
    .child(rows)
    .child(div().h(30).px(10).flex().items_center().rounded(d.r.sm).bg(d.inset).border_1().border_color(d.lineMid)
      .child(Input.new(view.note).w_full().text_size(12).text_color(d.fg1)))
    .child(h_flex().gap(8).items_center()
      .child(r.proposal ? button(d, "pp-decline", "Decline", (cx) => decline(view, cx, r.proposal)) : button(d, "pp-rcancel", "Cancel", () => { view.review = null; }))
      .child(div().flex_1())
      .child(button(d, "pp-write", view.writing ? "Writing…" : `Write ${r.file}`, (cx) => writeReview(view, cx), { solid: true, disabled: view.writing || !r.rows.length })))
    .child(div().text_size(11).line_height("15px").text_color(d.fg3)
      .child("Backed up first to data/crew-backups/agents-files/. Not committed: ask the pal to commit it."));
}

function proposalCard(view, d, p, onView) {
  return v_flex().id(`pp-prop-${p.id}`).gap(6).p(10).rounded(d.r.md).border_1().border_color("#4CA1F255").bg(d.bg0)
    .child(h_flex().items_center().gap(8)
      .child(tag(d, p.kind === "mission" ? "mission" : p.file, "info"))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(d.fg1).child(`${p.by} proposes a change`)))
    .when(Boolean(p.note), (el) => el.child(div().text_size(12).line_height("16px").text_color(d.body).child(p.note)))
    .child(h_flex().gap(8)
      .child(button(d, `pp-pdecl-${p.id}`, "Decline", (cx) => decline(view, cx, p.id)))
      .child(div().flex_1())
      .child(button(d, `pp-pview-${p.id}`, "View", (cx) => onView(cx), { solid: true })));
}

// ─── Mission ─────────────────────────────────────────────────────────────────────────────────

export function missionTab(view, space, bot, d, full) {
  view.full = full;
  const b = view.brain?.mission_text !== undefined && view.brainFor === bot.name ? view.brain : null;
  const body = v_flex().px(16).pb(24);
  const props = view.proposals.filter((p) => p.kind === "mission" && p.pal === bot.name);
  if (!b) return body.child(div().py(16).text_size(12).text_color(d.fg3).child("Reading the brain…"));
  if (view.edit?.kind === "mission") {
    return body.child(section(d, "medit", "Edit the mission", editorView(view, d, (cx) => saveMission(view, cx, bot, b), "Save")));
  }
  // A mission proposal opened from the Inbox: its text beside Decline / Accept.
  const mp = view.missionProposal && view.missionProposal.pal === bot.name ? view.missionProposal : null;
  if (mp) {
    return body.child(section(d, "mprop", `${mp.by} proposes this mission`, v_flex().gap(10)
      .child(div().p(10).rounded(d.r.md).border_1().border_color(d.line).text_size(12).text_color(d.body).child(TextView.markdown("pp-mprop", mp.text)))
      .child(h_flex().gap(8)
        .child(button(d, "pp-mdecl", "Decline", (cx) => decline(view, cx, mp.id)))
        .child(div().flex_1())
        .child(button(d, "pp-maccept", "Accept", (cx) => acceptMission(view, cx, mp), { solid: true })))));
  }
  const m = b.mission;
  if (props.length) body.child(v_flex().pt(14).gap(8).children(props.map((p) => proposalCard(view, d, p, (cx) => { view.missionProposal = { ...p, text: null }; openProposal(view, cx, p.id); }))));
  if (!b.mission_text) {
    body.child(section(d, "mnone", "Mission", v_flex().gap(10)
      .child(div().text_size(13).line_height("18px").text_color(d.body).child(`No mission yet. Write what ${bot.name} is for, its goals, its focus and when it's done; every new session starts with it.`))
      .child(h_flex().child(button(d, "pp-mwrite", "Write the mission", () => editMission(view, b), { solid: true })))));
    return body;
  }
  const card = v_flex().p(14).rounded(d.r.lg).border_1().border_color(d.line).bg(d.bg0)
    .child(div().text_size(16).line_height("22px").font_weight(500).text_color(d.fg1).child(m.statement || "(no statement)"));
  const tick = (item) => (cx) => cx.spawn(async (cx) => {
    try { await crewCli(["mission", "tick", item.text, "--pal", bot.name, ...(item.done ? ["--undo"] : [])]); } catch (e) { notify({ title: "Couldn't tick it", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
    loadBrain(view, cx, true);
  });
  const goals = v_flex().child(label10(d, "Goals").mb(4)).children(m.goals.map((g) => check(d, g, tick(g))));
  const done = v_flex().child(label10(d, `Done when · ${m.done_when.filter((x) => x.done).length} of ${m.done_when.length}`).mb(4)).children(m.done_when.map((g) => check(d, g, tick(g))));
  card.child(full ? h_flex().items_start().gap(24).mt(12).child(goals.flex_1()).child(done.flex_1()) : v_flex().gap(12).mt(12).child(goals).child(done));
  card.child(h_flex().items_start().gap(10).mt(12).pt(10).border_t_1().border_color(d.line)
    .child(label10(d, "Focus").mt(1))
    .child(div().flex_1().min_w(0).text_size(12).line_height("16px").text_color(d.body).child(m.focus || "—")));
  body.child(section(d, "mission", "Mission", card, link(d, "pp-medit", "Edit", () => editMission(view, b))));
  body.child(section(d, "mlog", "Latest changes", b.changelog.length ? logRows(d, b.changelog, 3) : div().text_size(12).text_color(d.fg3).child("None yet: the pal logs them with pal brain log."),
    link(d, "pp-mall", "All in Brain →", () => openPanel("brain"))));
  body.child(section(d, "mdec", "Latest decisions", b.decisions.length ? logRows(d, b.decisions.slice(-2).reverse(), 2) : div().text_size(12).text_color(d.fg3).child("None yet.")));
  return body;
}

function editMission(view, b) {
  const tpl = "# Mission\nWhat this pal is for, in a sentence or two.\n\n## Goals\n- [ ] \n\n## Focus\n\n\n## Done when\n- [ ] \n";
  view.editor.set_value(b.mission_text ?? tpl);
  view.edit = { kind: "mission", file: "mission.md", sha: b.mission_sha };
}

function saveMission(view, cx, bot, b) {
  const text = view.editor.value();
  cx.spawn(async (cx) => {
    try {
      const staged = await stage(text, `${bot.name}-mission`);
      await crewCli(["mission", "set", bot.name, "--file", staged, "--expect", view.edit.sha]);
      view.edit = null;
      notify({ title: "Mission saved", body: "New sessions start with it.", level: "success", timeout: 2500 });
    } catch (e) { notify({ title: "Didn't save the mission", body: String(e.message ?? e).slice(0, 240), level: "warning", timeout: 6000 }); }
    loadBrain(view, cx, true);
    cx.notify();
  });
}

function acceptMission(view, cx, p) {
  cx.spawn(async (cx) => {
    try { await crewCli(["proposal", "accept", p.id]); notify({ title: "Mission accepted", body: "The pal is told.", level: "success", timeout: 2500 }); view.missionProposal = null; setShared("crew.panel", { ...panelState(), proposal: null }); }
    catch (e) { notify({ title: "Couldn't accept it", body: String(e.message ?? e).slice(0, 240), level: "warning", timeout: 6000 }); }
    loadBrain(view, cx, true);
    cx.notify();
  });
}

// ─── Brain ───────────────────────────────────────────────────────────────────────────────────

export function brainTab(view, space, bot, d, full) {
  view.full = full;
  const b = view.brain && view.brainFor === bot.name ? view.brain : null;
  const body = v_flex().px(16).pb(24);
  if (!b) return body.child(div().py(16).text_size(12).text_color(d.fg3).child("Reading the brain…"));
  if (view.edit?.kind === "brain") {
    return body.child(section(d, "bedit", `Edit ${view.edit.file}`, editorView(view, d, (cx) => saveBrainFile(view, cx, bot), "Save")));
  }
  if (view.review && view.review.file.startsWith("_Brain/")) return body.child(section(d, "brev", "Review", reviewView(view, d)));
  if (view.edit?.kind === "brain-project") {
    return body.child(section(d, "bpedit", `Edit ${view.edit.file}`, editorView(view, d, (cx) => {
      startReview(view, cx, { file: view.edit.file, text: view.editor.value(), expect: view.edit.sha, label: "your edit" });
    }, "Review")));
  }
  const f = view.brainFile;
  if (f) {
    return body.child(section(d, "bfile", f.file, v_flex().gap(10)
      .child(f.text ? div().p(10).rounded(d.r.md).border_1().border_color(d.line).text_size(12).text_color(d.body).child(TextView.markdown(`pp-bf-${slugOf(f.file)}`, f.text.slice(0, 20000)))
        : div().text_size(12).text_color(d.fg3).child("Empty.")),
      h_flex().gap(12)
        .child(link(d, "pp-bback", "← Files", () => { view.brainFile = null; }))
        .child(link(d, "pp-bedit", "Edit", () => {
          view.editor.set_value(f.text ?? "");
          view.edit = { kind: f.project ? "brain-project" : "brain", file: f.file, sha: f.sha };
        }))));
  }
  const rows = v_flex().rounded(d.r.md).border_1().border_color(d.line);
  let nRows = 0;
  const row = (id, name, desc, count, open) => rows.child(h_flex().id(id).h(40).px(10).gap(10).items_center().cursor_pointer()
    .when(nRows++ > 0, (el) => el.border_t_1().border_color(d.lineSoft))
    .hover((s) => s.bg(d.hover)).on_click((_e, cx) => { open(cx); cx.notify(); })
    .child(v_flex().flex_1().min_w(0)
      .child(div().text_size(13).line_height("18px").font_weight(500).text_color(d.fg1).child(name))
      .child(div().truncate().text_size(11).line_height("14px").text_color(d.fg3).child(desc)))
    .child(div().flex_none().text_size(11).font_family(d.mono).text_color(d.fg3).child(count)));
  const openFile = (file, project = false) => (cx) => cx.spawn(async (cx) => {
    try {
      if (project) {
        const folder = bot.folder;
        const text = await readTextFile(`${folder}/${file}`);
        const info = JSON.parse(await crewCli(["agents", "show", bot.name, "--json"]));
        view.agentsInfo = info; view.agentsFor = bot.name;
        view.brainFile = { file, text, sha: await shaOf(text), project: true };
      } else {
        const r = JSON.parse(await crewCli(["brain", "show", bot.name, file, "--json"]));
        view.brainFile = { file, text: r.text, sha: r.sha };
      }
    } catch (e) { notify({ title: `Couldn't open ${file}`, body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
    cx.notify();
  });
  row("pp-b-dec", "Decisions", "what was decided, why, and who", String(b.decisions.length), openFile("decisions.md"));
  row("pp-b-log", "Change log", "one line per change, newest first", String(b.changelog.length), openFile("changelog.md"));
  if (b.agents_map) row("pp-b-map", "Map", "AGENTS.md has one: its layout section", "→ AGENTS.md", () => openPanel("agents"));
  else row("pp-b-map", "Map", "I need X → read Y", b.files["map.md"]?.exists ? "map.md" : "none yet", openFile("map.md"));
  for (const n of b.notes) row(`pp-b-n-${slugOf(n.name)}`, n.title, n.name, "note", openFile(n.name));
  if (b.project_brain) row("pp-b-pb", "PROJECT_BRAIN.md", "in the project (_Brain/), adopted in place", "project", openFile(b.project_brain, true));
  body.child(section(d, "bfiles", "Brain", rows));
  // Where it lives: pal data (one brain for every channel and worktree) or the project's .pals/.
  const seg = h_flex().rounded(d.r.sm).border_1().border_color(d.lineMid).overflow_hidden();
  for (const [key, text] of [["pal", "Pal data"], ["project", "This project"]]) {
    const on = b.where === key;
    seg.child(div().id(`pp-where-${key}`).h(26).px(12).flex().items_center().when(key === "project", (el) => el.border_l_1().border_color(d.lineMid))
      .when(on, (el) => el.bg(d.sel)).when(!on, (el) => el.cursor_pointer().hover((s) => s.bg(d.hover)).on_click((_e, cx) => {
        cx.spawn(async (cx) => {
          try { const out = await crewCli(["brain", "where", bot.name, key]); notify({ title: "Brain moved", body: out.trim().slice(0, 200), level: "success", timeout: 3500 }); }
          catch (e) { notify({ title: "Couldn't move it", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
          loadBrain(view, cx, true);
        });
      }))
      .text_size(12).font_weight(500).text_color(on ? d.fg1 : d.fg2).child(text));
  }
  body.child(section(d, "bwhere", "Brain lives in", v_flex().gap(8).child(h_flex().child(seg))
    .child(div().text_size(11).line_height("15px").font_family(d.mono).text_color(d.fg3).child(b.dir.replace(/^\/home\/[^/]+/, "~")))
    .child(div().text_size(11).line_height("15px").text_color(d.fg3).child(b.where === "pal"
      ? "One brain for every channel and worktree, never in the repo."
      : "In the project's .pals/, where git and Obsidian see it. Worktree channels read the main folder's."))));
  body.child(section(d, "bwho", "Who writes it", div().text_size(12).line_height("17px").text_color(d.body)
    .child("The pal keeps it current: pal brain log, pal brain decide, pal mission focus. You edit anything here. No rules live here: those go in AGENTS.md.")));
  return body;
}

async function shaOf(text) {
  // The sha the writer compares with (sha256 of the text; "none" for no file).
  if (text === null || text === undefined) return "none";
  const r = await exec("sh", ["-c", 'printf "%s" "$1" | sha256sum | cut -d" " -f1', "sh", text]);
  return r.stdout.trim();
}

function saveBrainFile(view, cx, bot) {
  const e = view.edit;
  const text = view.editor.value();
  cx.spawn(async (cx) => {
    try {
      const staged = await stage(text, `${bot.name}-${e.file}`);
      await crewCli(["brain", "write", bot.name, e.file, "--file", staged, "--expect", e.sha]);
      view.edit = null;
      const r = JSON.parse(await crewCli(["brain", "show", bot.name, e.file, "--json"]));
      view.brainFile = { file: e.file, text: r.text, sha: r.sha };
      notify({ title: `Saved ${e.file}`, level: "success", timeout: 2000 });
    } catch (err) { notify({ title: `Didn't save ${e.file}`, body: String(err.message ?? err).slice(0, 240), level: "warning", timeout: 6000 }); }
    loadBrain(view, cx, true);
    cx.notify();
  });
}

// ─── AGENTS.md ───────────────────────────────────────────────────────────────────────────────

export function agentsTab(view, space, bot, d, full) {
  view.full = full;
  const a = view.agentsInfo && view.agentsFor === bot.name ? view.agentsInfo : null;
  const body = v_flex().px(16).pb(24);
  if (!a) return body.child(div().py(16).text_size(12).text_color(d.fg3).child("Reading the project's agent files…"));
  if (a.error) return body.child(div().py(16).text_size(12).text_color(d.warnText).child(a.error));
  if (view.review && !view.review.file.startsWith("_Brain/")) return body.child(section(d, "arev", "Review", reviewView(view, d)));
  if (view.edit?.kind === "agents") {
    return body.child(section(d, "aedit", `Edit ${view.edit.file}`, editorView(view, d, (cx) => {
      startReview(view, cx, { file: view.edit.file, text: view.editor.value(), expect: view.edit.sha, label: "your edit" });
    }, "Review")));
  }
  if (bot.machine) body.child(div().pt(14).text_size(12).text_color(d.warnText).child(`${bot.name} is on ${bot.machine}: view and lint only for now; edit on this computer.`));
  // Proposals from pals for this project's files.
  const props = view.proposals.filter((p) => p.kind === "agents" && p.pal === bot.name);
  if (props.length) body.child(v_flex().pt(14).gap(8).children(props.map((p) => proposalCard(view, d, p, (cx) => openProposal(view, cx, p.id)))));
  // What Claude Code loads here.
  body.child(section(d, "aloads", "What Claude Code loads here", div().text_size(11).line_height("17px").font_family(d.mono).text_color(d.body)
    .child(a.loads.parts.map((p) => `${p.file} ${p.lines}${p.missing ? " (missing!)" : ""}`).join(" + ") + ` = ${a.loads.total} lines`)));
  // The files.
  const files = v_flex();
  a.files.forEach((f, i) => {
    files.child(h_flex().h(32).items_center().gap(10).when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
      .child(div().w(130).flex_none().text_size(12).font_family(d.mono).text_color(f.exists ? d.fg1 : d.fg3).child(f.file))
      .child(div().flex_1().text_size(12).text_color(d.fg2).child(f.exists ? `${f.lines} lines${f.checked_in ? "" : " · not checked in"}` : "none"))
      .when(f.exists, (el) => el
        .child(link(d, `pp-aview-${slugOf(f.file)}`, "View", () => { view.viewing = view.viewing === f.file ? null : f.file; view.viewer.set_value(a.texts?.[f.file] ?? ""); }))
        .when(!bot.machine, (el) => el.child(link(d, `pp-aedit-${slugOf(f.file)}`, "Edit", () => {
          view.editor.set_value(a.texts?.[f.file] ?? "");
          view.edit = { kind: "agents", file: f.file, sha: f.sha };
        })))));
    if (view.viewing === f.file && f.exists) files.child(div().h(full ? 480 : 320).mb(8).rounded(d.r.md).border_1().border_color(d.line).bg(d.inset).overflow_hidden()
      .child(Editor.new(view.viewer).size_full()));
  });
  body.child(section(d, "afiles", "Files", files));
  // The lint, with its fixes.
  const lint = v_flex().rounded(d.r.md).border_1().border_color(d.line);
  const items = a.lint.length ? a.lint : [{ level: "ok", id: "all clear", msg: `Nothing to fix · ${a.paths_checked} paths checked` }];
  items.forEach((l, i) => {
    lint.child(h_flex().items_start().gap(8).px(10).py(8).when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
      .child(tag(d, l.level, l.level === "error" ? "error" : l.level === "warn" ? "warn" : l.level === "ok" ? "ok" : "info"))
      .child(div().w(84).flex_none().text_size(11).line_height("16px").font_family(d.mono).font_weight(500).text_color(d.fg1).child(l.id))
      .child(div().flex_1().min_w(0).text_size(12).line_height("16px").text_color(d.fg2).child(`${l.file ? l.file + ": " : ""}${l.msg}`))
      .when(Boolean(l.fix) && !bot.machine, (el) => el.child(div().id(`pp-fix-${i}`).h(22).px(8).flex().flex_none().items_center().rounded(d.r.xs)
        .border_1().border_color(d.info).cursor_pointer().hover((s) => s.bg(d.hover))
        .on_click((_e, cx) => { const f = a.files.find((x) => x.file === l.fix.file); startReview(view, cx, { file: l.fix.file, text: l.fix.text, expect: f?.sha ?? "none", label: l.fix.label, note: l.fix.label.toLowerCase() }); })
        .text_size(11).font_weight(500).text_color(d.fg1).child(l.fix.label))));
  });
  const deepLink = view.deep === "running" ? div().text_size(11).text_color(d.fg3).child("Asking Claude…")
    : link(d, "pp-deep", "Deep check (sends these files to Claude)", (cx) => {
      view.deep = "running";
      cx.spawn(async (cx) => {
        try { view.deep = JSON.parse(await crewCli(["agents", "lint", bot.name, "--deep", "--json"])).deep ?? []; }
        catch (e) { view.deep = null; notify({ title: "The deep check didn't run", body: String(e.message ?? e).slice(0, 200), level: "warning" }); }
        cx.notify();
      });
    });
  body.child(section(d, "alint", "Lint", lint, deepLink));
  if (Array.isArray(view.deep)) {
    body.child(section(d, "adeep", "Deep check", view.deep.length ? v_flex().gap(8).children(view.deep.map((x, i) => v_flex().id(`pp-dp-${i}`).gap(4).p(10).rounded(d.r.md).border_1().border_color(d.line)
      .child(div().text_size(12).line_height("16px").text_color(d.fg1).child(x.why ?? ""))
      .child(div().text_size(11).line_height("15px").text_color(d.fg2).child(`“${x.quote_a ?? ""}”`))
      .child(div().text_size(11).line_height("15px").text_color(d.fg2).child(`“${x.quote_b ?? ""}”`))
      .child(div().text_size(10).font_family(d.mono).text_color(d.fg3).child((x.files ?? []).join(" · ")))))
      : div().text_size(12).text_color(d.fg3).child("No conflicting or outdated rules found.")));
  }
  // Backups, and putting one back (through the same review and click).
  const bk = view.backups;
  body.child(section(d, "aback", "Backups", bk === null ? link(d, "pp-bkload", "Show backups", (cx) => cx.spawn(async (cx) => {
    try { view.backups = JSON.parse(await crewCli(["agents", "backups", bot.name, "--json"])); } catch { view.backups = []; }
    cx.notify();
  })) : bk.length ? v_flex().children(bk.slice(0, 10).map((x, i) => h_flex().h(28).items_center().gap(10).when(i > 0, (el) => el.border_t_1().border_color(d.lineSoft))
    .child(div().w(150).flex_none().text_size(11).font_family(d.mono).text_color(d.fg2).child(x.at))
    .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(d.body).child(x.absent ? `${x.file} (didn't exist)` : x.file))
    .when(!x.absent && !bot.machine, (el) => el.child(link(d, `pp-restore-${i}`, "Restore…", (cx) => cx.spawn(async (cx) => {
      const text = await readTextFile(x.path).catch(() => null);
      const f = a.files.find((y) => y.file === x.file);
      if (text !== null) startReview(view, cx, { file: x.file, text, expect: f?.sha ?? "none", label: `restore ${x.at}`, note: `restored the ${x.at} backup` });
    }))))))
    : div().text_size(12).text_color(d.fg3).child("None yet: every write keeps one.")));
  return body;
}

export function agentsBadge(view, bot) {
  const a = view.agentsInfo && view.agentsFor === bot.name ? view.agentsInfo : null;
  if (!a?.lint) return null;
  const err = a.lint.filter((l) => l.level === "error").length, warn = a.lint.filter((l) => l.level === "warn").length;
  if (err) return ["error", String(err)];
  if (warn) return ["warn", String(warn)];
  if (a.lint.some((l) => l.fix)) return ["info", "+"];
  return null;
}
export { tag as badgeTag };
