// The welcome story's words and small decisions (T76; design: data/crew-boards/onboarding, DeNon's
// pick A, "On Home", 2026-11-09). Pure: no Herdr imports, so `node tests/test_welcome.mjs` reads it.
// Fixed text, with the head pal's and the owner's names filled in. Seven screens, one message each.

export const BEATS = ["hello", "pal", "hire", "home", "talk", "charge", "done"];

// Which brain the head pal gets when the owner hasn't picked: Claude Code, Antigravity, Codex, then
// whatever else is installed, in Herdr's order.
const BRAIN_ORDER = ["claude", "antigravity", "agy", "codex"];
export function pickBrain(agents) {
  const on = (agents ?? []).filter((a) => a && a.installed);
  for (const k of BRAIN_ORDER) { const hit = on.find((a) => a.key === k); if (hit) return hit; }
  return on[0] ?? null;
}

// The approval gate holds Claude Code and Antigravity CLI pals (README "The approval gate"), and
// only when the helpers (hooks) are installed.
export const gated = (key, helpers = true) => Boolean(helpers) && ["claude", "antigravity", "agy"].includes(String(key ?? "").toLowerCase());

// "weather-app" → "Weather App" (the same rule as bin/crewwelcome.py pal_name).
export function palName(folder) {
  const base = String(folder ?? "").replace(/\/+$/, "").split("/").pop() ?? "";
  const words = base.replace(/^\.+/, "").split(/[-_.\s]+/).filter(Boolean);
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") || "My Project";
}

// "2 hours ago", "yesterday", "3 days ago", "Mar 4": when a folder last changed.
export function when(at, now = Date.now()) {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 3600) return "changed just now";
  if (s < 86400) { const h = Math.floor(s / 3600); return `changed ${h} hour${h === 1 ? "" : "s"} ago`; }
  if (s < 2 * 86400) return "yesterday";
  if (s < 30 * 86400) return `${Math.floor(s / 86400)} days ago`;
  const d = new Date(at);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]} ${d.getDate()}`;
}

// One screen's words. ctx: { head, owner, brain (the head pal's, a name or null), brains (installed
// names), folders (count), pal (the first pal's name, once hired or picked), hired (bool),
// pals (how many pals there already are, on a replay), palBrain (key), helpers (bool) }.
export function beat(id, ctx = {}) {
  const head = ctx.head || "Orchestrator";
  const pal = ctx.pal || null;
  switch (id) {
    case "hello":
      return {
        say: `Hello, I'm ${head === "Orchestrator" ? "the Orchestrator" : head}.`,
        more: "I'm the pal that oversees every other pal. I have a bird's-eye view of every project and its context, and I can go in and talk to any pal for you.",
        fine: ctx.brain ? `I'll call you ${ctx.owner || "you"} · running on ${ctx.brain}` : `I'll call you ${ctx.owner || "you"}`,
        go: "Show me around",
      };
    case "pal":
      return {
        say: "A pal is a project with a brain.",
        more: "Give me a folder and a coding agent, and that's a pal. It works in that project and remembers what it learns there. Its tabs are topics, so one pal can fix a bug and build a feature at the same time.",
        go: "Got it",
      };
    case "hire":
      if (!(ctx.brains ?? []).length) return {
        say: "I need a brain before I can hire anyone.",
        more: "A brain is a coding agent, such as Claude Code, Antigravity CLI, Codex, Gemini CLI or opencode. Install one and sign in to it, then press Check again.",
        go: "Check again", check: true, alt: "Not now",
      };
      if (ctx.hired && pal) return {
        say: `${pal} is hired.`,
        more: `It's in the sidebar now, getting to know its project. Click it any time to see its terminal.`,
        go: "Next",
      };
      if (ctx.pals > 0) return {
        say: `You have ${ctx.pals} pal${ctx.pals === 1 ? "" : "s"}. Hire another?`,
        more: ctx.folders ? "These look like projects you've worked on lately that don't have a pal yet." : "Pick a project folder and I'll set a pal up in it.",
        go: pal ? `Hire ${pal}` : "Choose a folder…", alt: "Not now", list: true,
      };
      return {
        say: "Let's hire your first pal.",
        more: ctx.folders ? "These look like projects you've worked on lately. Pick one and I'll set it up." : "I didn't find a project folder in the usual places. Choose one and I'll set a pal up in it.",
        go: pal ? `Hire ${pal}` : "Choose a folder…", alt: "Not now", list: true,
      };
    case "home":
      return {
        say: "This page is Home.",
        more: "When a pal needs a decision from you, it lands here, one at a time, with what each choice does and my pick. When nothing's waiting, it says \"All caught up\". Click me in the sidebar, or press Ctrl+Shift+H, to come back.",
        go: "Next",
      };
    case "talk":
      return {
        say: "Ask me anything, in plain words.",
        more: "I have a terminal of my own. Press T on Home and type. I can tell you what every pal is doing, hire one, or go and ask a pal something for you.",
        chips: ["what's everyone working on?", "hire a pal for my website", pal ? `ask ${pal} why the tests fail` : "ask a pal why the tests fail"],
        go: "Next",
      };
    case "charge":
      return gated(ctx.palBrain, ctx.helpers !== false) ? {
        say: "The big moves wait for you.",
        more: "Before a pal pushes code, publishes, deploys or messages someone, it stops and asks. Only your click lets it through. I can't approve it, and no other pal can.",
        fine: "This covers Claude Code and Antigravity CLI pals.",
        go: "Good",
      } : {
        say: "You stay in charge.",
        more: ctx.helpers === false
          ? "The approval gate isn't installed here (the helpers were skipped), so pals don't stop before a push, a release or a deploy. Run the installer without --no-helpers to turn it on."
          : "Claude Code and Antigravity CLI pals stop and ask before they push code, publish, deploy or message someone, and only your click lets it through. Other brains aren't covered by that gate yet, so keep an eye on what they run.",
        go: "Good",
      };
    default:
      return {
        say: "That's it. You're set.",
        more: (ctx.hired && pal ? `${pal} is reading its project now. ` : "Hire your first pal whenever you like: the + at the bottom of the sidebar. ")
          + "I'll be up here in the sidebar. To see this again, open the gear menu and pick Welcome tour.",
        go: ctx.hired && pal ? `Go to ${pal}` : "Done", alt: ctx.hired && pal ? "Stay on Home" : null,
      };
  }
}

// The settings mark ("welcome" in crew-settings.json): "new" (a first install: the tour starts by
// itself), "open" (replayed from the menu), "done", "skipped". No mark: an install from before the
// tour, which never starts it by itself.
export const pending = (w) => Boolean(w && (w.state === "new" || w.state === "open"));
export const beatAt = (w) => Math.min(BEATS.length - 1, Math.max(0, Number.isInteger(w?.beat) ? w.beat : 0));
