"""Offline completeness tests for the taxonomy mapping (Plan 3 Task 1).

Run: python -m pytest ml-training/tests/  (or) python ml-training/tests/test_taxonomy.py
No `datasets` install required — validates the mapping against the recorded
SOURCE_LABELS, not against a live dataset download.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from taxonomy import (  # noqa: E402
    TONE_LABELS, SOURCE_LABELS, TAXONOMY, EXPECTED_GAPS,
    map_label, reachable_targets, unreachable_targets,
)


def test_every_source_label_has_a_mapping_entry():
    """No source label may be missing — a KeyError at train time is unacceptable."""
    for dataset, labels in SOURCE_LABELS.items():
        mapped = set(TAXONOMY[dataset].keys())
        recorded = set(labels)
        assert mapped == recorded, (
            f"{dataset}: mapping keys != recorded labels; "
            f"missing={recorded - mapped}, extra={mapped - recorded}"
        )


def test_all_targets_are_valid_tone_labels():
    valid = set(TONE_LABELS) | {None}
    for dataset, m in TAXONOMY.items():
        for label, target in m.items():
            assert target in valid, f"{dataset}:{label} -> {target!r} not a TONE_LABEL"


def test_unreachable_targets_match_documented_gaps():
    """If a mapping edit covers or uncovers a target, force a conscious EXPECTED_GAPS update."""
    assert unreachable_targets() == EXPECTED_GAPS, (
        f"unreachable={unreachable_targets()} but EXPECTED_GAPS={EXPECTED_GAPS}; "
        "update the mapping or the documented gap set deliberately."
    )


def test_map_label_roundtrip():
    assert map_label("go_emotions", "caring") == "empathetic"
    assert map_label("empathetic_dialogues", "furious") == "aggressive"
    assert map_label("daily_dialog", "question") == "curious"
    assert map_label("go_emotions", "amusement") is None


def test_most_targets_are_reachable():
    """Sanity: the datasets should cover the large majority of the taxonomy."""
    assert len(reachable_targets()) >= len(TONE_LABELS) - len(EXPECTED_GAPS)


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"\n{len(fns)} passed")
