"""Plan 3 Task 5 test — verify the learned state-head artifact.

Pure stdlib (no numpy/pytest needed). Run: python ml-training/tests/test_state_head.py
Asserts the trained weights match the shapes LearnedStateHead (Task 8) expects and that
the fit recovered the authored intent table within tolerance.
"""

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
DATA = HERE.parent / "data"
ARTIFACTS = HERE.parent / "artifacts"

TOL = 0.05  # ridge shrinkage keeps |learned - intent| tiny


def load():
    art = json.loads((ARTIFACTS / "state_head_weights.json").read_text())
    intent = json.loads((DATA / "tone_intent.json").read_text())["intent"]
    return art, intent


def test_shapes():
    art, _ = load()
    assert len(art["toneLabels"]) == 14
    assert art["roles"] == ["RAPPORT", "VOLATILITY", "PRESSURE", "INSIGHT"]
    assert len(art["W_tone"]) == 14 and all(len(r) == 4 for r in art["W_tone"])
    assert len(art["W_state"]) == 4 and all(len(r) == 4 for r in art["W_state"])
    assert len(art["bias"]) == 4


def test_state_block_is_zero():
    # No state-conditioned training signal -> state->Δ must stay zero (honest).
    art, _ = load()
    assert all(v == 0.0 for row in art["W_state"] for v in row)
    assert all(v == 0.0 for v in art["bias"])


def test_recovers_authored_intent():
    art, intent = load()
    roles = art["roles"]
    for i, tone in enumerate(art["toneLabels"]):
        learned = art["W_tone"][i]
        want = intent[tone]
        for j, role in enumerate(roles):
            diff = abs(learned[j] - want.get(role, 0))
            assert diff <= TOL, f"{tone}.{role}: learned {learned[j]} vs intent {want.get(role, 0)}"


def test_fit_quality_reported():
    art, _ = load()
    assert art["fit"]["mae"] < 0.01


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"PASS {fn.__name__}")
    print(f"\n{len(fns)}/{len(fns)} state-head tests pass")
    sys.exit(0)
