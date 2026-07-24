import { StoryPack, ROLES } from "../state/storyTypes";

/**
 * Intro / world-setting screen shown when a story is picked, before the first
 * scene. Sets the premise, previews the four relationship meters, and teaches
 * the non-obvious core mechanic (choices AND free-typed words move hidden
 * meters that steer which ending you reach). "Begin" hands off to the loader.
 */
export function renderIntro(
  container: HTMLElement,
  pack: StoryPack,
  onBegin: () => void,
  onBack: () => void,
): void {
  const meters = ROLES.map((r) => pack.meterLabels[r])
    .filter((l): l is string => typeof l === "string" && l.length > 0)
    .map((l) => `<li class="intro-meter">${esc(l)}</li>`)
    .join("");

  const premise = pack.intro
    ? pack.intro
        .split("\n")
        .filter((p) => p.trim())
        .map((p) => `<p class="intro-premise">${esc(p.trim())}</p>`)
        .join("")
    : "";

  container.innerHTML =
    `<div class="intro">` +
    `<button class="intro-back" id="intro-back">← All stories</button>` +
    `<p class="intro-genre">${esc(pack.genre)}</p>` +
    `<h1 class="intro-title">${esc(pack.title)}</h1>` +
    premise +
    (meters
      ? `<div class="intro-block"><h2 class="intro-h2">The forces at play</h2>` +
        `<ul class="intro-meters">${meters}</ul></div>`
      : "") +
    `<div class="intro-block"><h2 class="intro-h2">How it works</h2>` +
    `<p class="intro-how">Pick a choice — or just <em>type what you want to say</em>. ` +
    `Your words and your choices quietly shift these hidden relationships, and they decide ` +
    `which of several endings you reach. There is no single right path. Every run diverges.</p></div>` +
    `<button class="intro-begin" id="intro-begin">Begin</button>` +
    `</div>`;

  container.querySelector<HTMLButtonElement>("#intro-begin")!.onclick = onBegin;
  container.querySelector<HTMLButtonElement>("#intro-back")!.onclick = onBack;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
