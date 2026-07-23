"""Plan 3 Task 5 — train the state-update head (agent-executable, CPU, no GPU).

Learns a linear map  (14-dim tone distribution, 4-dim current state) -> 4-dim Δstate,
replacing LinearHead's hand-picked matrix in src/engine/scorer.ts with a fitted one.

Ground truth is the AUTHORED design-intent table ml-training/data/tone_intent.json
(each of the 14 TONE_LABELS -> its intended Δmeter), augmented with the per-text rows
in ml-training/data/labels.jsonl (same authored deltas, tagged onto real pack text).
Neither source encodes any dependence of Δ on the *current* state — that is a deliberate
design property of Layer-1 tone scoring (a tone means the same move regardless of where
the meters sit). So the fit here learns tone->Δ weights and leaves the state->Δ block at
zero: honest, because no training signal teaches state-dependence. If a future dataset
adds state-conditioned deltas, this same script picks them up with no shape change.

Output: ml-training/artifacts/state_head_weights.json — consumed by a LearnedStateHead
TypeScript class (Task 8) with the identical delta(tone, state) signature as LinearHead.
Shipped as plain weight JSON (not ONNX): the map is a 14x4 matrix, far too small to
justify an onnxruntime round-trip (spec §4.2's "ONNX" is the fallback for a non-linear
head, not a requirement for a linear one).
"""

import json
import pathlib

import numpy as np

HERE = pathlib.Path(__file__).parent
DATA = HERE / "data"
ARTIFACTS = HERE / "artifacts"

TONE_LABELS = [
    "empathetic", "aggressive", "deceptive", "reassuring", "defiant", "cold",
    "submissive", "curious", "threatening", "apologetic", "dismissive", "sincere",
    "evasive", "calm",
]
ROLES = ["RAPPORT", "VOLATILITY", "PRESSURE", "INSIGHT"]

TONE_IDX = {t: i for i, t in enumerate(TONE_LABELS)}
ROLE_IDX = {r: i for i, r in enumerate(ROLES)}


def onehot(tone: str) -> np.ndarray:
    v = np.zeros(len(TONE_LABELS), dtype=np.float64)
    v[TONE_IDX[tone]] = 1.0
    return v


def delta_vec(delta: dict) -> np.ndarray:
    v = np.zeros(len(ROLES), dtype=np.float64)
    for role, val in delta.items():
        v[ROLE_IDX[role]] = val
    return v


def load_rows() -> tuple[np.ndarray, np.ndarray]:
    """Build (X tone one-hot, Y Δstate) from the intent table + labels.jsonl."""
    intent = json.loads((DATA / "tone_intent.json").read_text())["intent"]
    xs, ys = [], []
    # one row per authored tone (the primary ground truth)
    for tone, delta in intent.items():
        xs.append(onehot(tone))
        ys.append(delta_vec(delta))
    # augment with per-text pack rows (same authored deltas on real surface text)
    for line in (DATA / "labels.jsonl").read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        xs.append(onehot(row["tone"]))
        ys.append(delta_vec(row["delta"]))
    return np.array(xs), np.array(ys)


def fit(X: np.ndarray, Y: np.ndarray, ridge: float = 1e-3) -> np.ndarray:
    """Ridge-regularized least squares: W (14x4) minimizing ||X·W - Y||² + λ||W||²."""
    n_features = X.shape[1]
    A = X.T @ X + ridge * np.eye(n_features)
    B = X.T @ Y
    return np.linalg.solve(A, B)


def main() -> None:
    X, Y = load_rows()
    W_tone = fit(X, Y)  # (14, 4)

    # Report fit quality against the authored intent (first 14 rows).
    pred = X @ W_tone
    mae = float(np.mean(np.abs(pred - Y)))
    print(f"rows={len(X)}  tone->delta MAE={mae:.3f}")

    ARTIFACTS.mkdir(exist_ok=True)
    out = {
        "_doc": (
            "Plan 3 Task 5 learned state head. delta = tone(14) · W_tone + state(4) · "
            "W_state + bias. W_state is zeros by design (no state-conditioned training "
            "signal); kept in the schema so a future retrain can populate it without a "
            "shape change. Consumed by src/engine LearnedStateHead (Task 8)."
        ),
        "toneLabels": TONE_LABELS,
        "roles": ROLES,
        "W_tone": [[round(v, 4) for v in row] for row in W_tone.tolist()],
        "W_state": [[0.0] * len(ROLES) for _ in ROLES],
        "bias": [0.0] * len(ROLES),
        "fit": {"rows": len(X), "mae": round(mae, 4), "ridge": 1e-3},
    }
    (ARTIFACTS / "state_head_weights.json").write_text(json.dumps(out, indent=2))
    print(f"wrote {ARTIFACTS / 'state_head_weights.json'}")


if __name__ == "__main__":
    main()
