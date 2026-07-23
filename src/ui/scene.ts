import { StoryNode } from "../state/storyTypes";

interface SceneOpts {
  text: string;
  npcResponse?: string;
  stanceId?: string; // matched dialogue stance, surfaced subtly for debugging
  node: StoryNode;
  onChoice(id: string): void;
  onText(text: string): void;
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

  if (opts.node.type === "action") {
    for (const c of opts.node.choices) {
      const b = document.createElement("button");
      b.className = "choice";
      b.textContent = c.text;
      b.onclick = () => opts.onChoice(c.id);
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
    container.appendChild(input);
    for (const s of opts.node.stances) {
      const chip = document.createElement("button");
      chip.className = "choice chip";
      chip.textContent = s.anchorPhrasings[0] ?? s.id;
      chip.onclick = () => opts.onChoice(s.id);
      container.appendChild(chip);
    }
  }
}
