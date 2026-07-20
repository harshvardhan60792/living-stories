import { MeterState, Role, ROLES } from "../state/storyTypes";

export function renderMeters(container: HTMLElement, labels: Record<Role, string | null>, state: MeterState): void {
  container.innerHTML = "";
  for (const r of ROLES) {
    const label = labels[r];
    if (!label) continue; // hidden meter
    const row = document.createElement("div");
    row.className = "meter";
    row.dataset.role = r;
    row.innerHTML = `<span class="label">${label}</span>
      <div class="track"><div class="fill" style="width:${Math.round(state[r])}%"></div></div>`;
    container.appendChild(row);
  }
}
