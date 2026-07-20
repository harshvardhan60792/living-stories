import { StoryManifestEntry } from "../state/storyTypes";

export function renderMenu(container: HTMLElement, entries: StoryManifestEntry[], onPick: (id: string) => void): void {
  container.innerHTML = "<h1>Living Stories</h1>";
  for (const e of entries) {
    const card = document.createElement("button");
    card.className = "story-card choice";
    card.innerHTML = `<strong>${e.title}</strong> — <em>${e.genre}</em><br><span>${e.blurb}</span>`;
    card.onclick = () => onPick(e.id);
    container.appendChild(card);
  }
}
