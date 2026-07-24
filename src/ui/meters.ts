import { MeterState, Role, ROLES } from "../state/storyTypes";
import { band } from "../state/meters";

type Bands = Partial<Record<Role, [string, string, string]>>;
const DEFAULT_BANDS: [string, string, string] = ["Low", "Rising", "High"];

/** The diegetic word for a meter's current value ("Wary" / "Softening" / …). */
export function bandWord(role: Role, value: number, bands?: Bands): string {
  const words = bands?.[role] ?? DEFAULT_BANDS;
  return words[band(value) === "low" ? 0 : band(value) === "mid" ? 1 : 2];
}

export function renderMeters(
  container: HTMLElement,
  labels: Record<Role, string | null>,
  state: MeterState,
  bands?: Bands,
): void {
  container.innerHTML = "";
  for (const r of ROLES) {
    const label = labels[r];
    if (!label) continue; // hidden meter
    const row = document.createElement("div");
    row.className = "meter";
    row.dataset.role = r;
    // The feeling-word leads; a slim bar trails as a quiet at-a-glance trend.
    row.innerHTML =
      `<div class="meter-head"><span class="label">${label}</span>` +
      `<span class="meter-state">${bandWord(r, state[r], bands)}</span></div>` +
      `<div class="track"><div class="fill" style="width:${Math.round(state[r])}%"></div></div>`;
    container.appendChild(row);
  }
}
