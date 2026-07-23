import { MeterState, Role, StoryNode } from "../state/storyTypes";
import { formatDeltas } from "./deltaPreview";

interface SceneOpts {
  text: string;
  npcResponse?: string;
  stanceId?: string; // matched dialogue stance, surfaced subtly for debugging
  node: StoryNode;
  onChoice(id: string): void;
  onText(text: string): void;
  /** Emotion-read tooltip (T4): predict the meter shift a given source text
   *  would apply, using the already-loaded scorer+head. Optional — absent means
   *  no preview wiring (back-compat). May reject/throw; callers guard. */
  previewFor?(sourceText: string): Promise<Partial<MeterState>>;
  meterLabels?: Record<Role, string | null>;
}

export function renderScene(container: HTMLElement, opts: SceneOpts): void {
  container.innerHTML = "";
  if (opts.npcResponse) {
    const npc = document.createElement("p");
    npc.className = "scene npc";
    npc.textContent = opts.npcResponse;
    if (opts.stanceId) {
      const tag = document.createElement("span");
      tag.className = "routed";
      tag.textContent = `↳ ${opts.stanceId}`;
      npc.appendChild(tag);
    }
    container.appendChild(npc);
  }
  const p = document.createElement("p");
  p.className = "scene";
  p.textContent = opts.text;
  container.appendChild(p);

  // One shared, lazily-shown tooltip for tone/meter previews on this scene.
  const preview = makePreview(opts);

  if (opts.node.type === "action") {
    for (const c of opts.node.choices) {
      const b = document.createElement("button");
      b.className = "choice";
      b.textContent = c.text;
      b.onclick = () => opts.onChoice(c.id);
      preview.attachHover(b, () => c.text);
      container.appendChild(b);
    }
  } else {
    // dialogue node: free-text input + optional suggested-phrasing chips
    const input = document.createElement("input");
    input.className = "freetext";
    input.placeholder = "Say something…";
    input.onkeydown = (e) => {
      if (e.key === "Enter" && input.value.trim()) opts.onText(input.value.trim());
    };
    preview.attachInput(input);
    container.appendChild(input);
    for (const s of opts.node.stances) {
      const chip = document.createElement("button");
      chip.className = "choice chip";
      chip.textContent = s.anchorPhrasings[0] ?? s.id;
      chip.onclick = () => opts.onChoice(s.id);
      // Engine scores a stance chip via its first anchor phrasing — preview that.
      preview.attachHover(chip, () => s.anchorPhrasings[0] ?? "");
      container.appendChild(chip);
    }
  }
  if (preview.el) container.appendChild(preview.el);
}

/** Builds the tooltip element + hover/input wiring. No-op when no previewFor is
 *  supplied. Async previews are token-guarded so a stale resolve can't flash. */
function makePreview(opts: SceneOpts) {
  const previewFor = opts.previewFor;
  const labels = opts.meterLabels;
  if (!previewFor || !labels) {
    return { el: null as HTMLElement | null, attachHover() {}, attachInput() {} };
  }
  const el = document.createElement("div");
  el.className = "tone-preview";
  el.hidden = true;
  let token = 0;

  function hide() {
    token++;
    el.hidden = true;
  }
  async function show(sourceText: string) {
    const text = sourceText.trim();
    if (!text) return hide();
    const mine = ++token;
    el.hidden = false;
    el.textContent = "reading…";
    try {
      const deltas = await previewFor!(text);
      if (mine !== token) return; // superseded by a newer hover/keystroke
      const s = formatDeltas(deltas, labels!);
      el.textContent = s || "no shift";
    } catch {
      if (mine === token) hide();
    }
  }

  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let inputTimer: ReturnType<typeof setTimeout> | undefined;
  return {
    el,
    attachHover(node: HTMLElement, source: () => string) {
      node.addEventListener("mouseenter", () => {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => show(source()), 140);
      });
      node.addEventListener("mouseleave", () => {
        clearTimeout(hoverTimer);
        hide();
      });
    },
    attachInput(node: HTMLInputElement) {
      node.addEventListener("input", () => {
        clearTimeout(inputTimer);
        const v = node.value;
        if (!v.trim()) return hide();
        inputTimer = setTimeout(() => show(v), 300);
      });
      node.addEventListener("blur", () => hide());
    },
  };
}
