"""Plan 3 Task 1 — map source-dataset emotion labels onto the game's 14 TONE_LABELS.

TONE_LABELS must stay in sync with src/engine/scorer.ts.

The SOURCE_LABELS lists below are the canonical label sets for each dataset as
documented on their HF dataset cards. They are recorded here so the mapping is
completeness-checkable OFFLINE (no `datasets` install needed). Before training
(Task 4, on Kaggle) re-verify them against the actually-installed dataset
version — HF label spellings/order can drift between revisions.

Mapping philosophy: map each source label to exactly one TONE_LABELS entry, or
to None (dropped) when there is no honest fit. Dropping a label is fine;
silently mis-mapping it is not. Some target labels are UNREACHABLE from these
emotion datasets (see EXPECTED_GAPS) — that is a real finding, not a bug: those
classes need another data source or synthetic examples.
"""

from typing import Optional

TONE_LABELS = [
    "empathetic", "aggressive", "deceptive", "reassuring", "defiant", "cold",
    "submissive", "curious", "threatening", "apologetic", "dismissive", "sincere",
    "evasive", "calm",
]

# Canonical source label sets (verify against installed dataset version at train time).
SOURCE_LABELS = {
    "go_emotions": [
        "admiration", "amusement", "anger", "annoyance", "approval", "caring",
        "confusion", "curiosity", "desire", "disappointment", "disapproval",
        "disgust", "embarrassment", "excitement", "fear", "gratitude", "grief",
        "joy", "love", "nervousness", "optimism", "pride", "realization",
        "relief", "remorse", "sadness", "surprise", "neutral",
    ],
    "empathetic_dialogues": [
        "afraid", "angry", "annoyed", "anticipating", "anxious", "apprehensive",
        "ashamed", "caring", "confident", "content", "devastated", "disappointed",
        "disgusted", "embarrassed", "excited", "faithful", "furious", "grateful",
        "guilty", "hopeful", "impressed", "jealous", "joyful", "lonely",
        "nostalgic", "prepared", "proud", "sad", "sentimental", "surprised",
        "terrified", "trusting",
    ],
    # DailyDialog carries both an emotion label and a dialogue-act label; both are
    # useful signal (acts reach "curious" that pure emotion labels miss).
    "daily_dialog": [
        # emotions
        "no_emotion", "anger", "disgust", "fear", "happiness", "sadness", "surprise",
        # dialogue acts
        "inform", "question", "directives", "commissive",
    ],
}

TAXONOMY = {
    "go_emotions": {
        "admiration": "sincere", "amusement": None, "anger": "aggressive",
        "annoyance": "dismissive", "approval": "reassuring", "caring": "empathetic",
        "confusion": None, "curiosity": "curious", "desire": None,
        "disappointment": None, "disapproval": "dismissive", "disgust": "dismissive",
        "embarrassment": None, "excitement": None, "fear": "submissive",
        "gratitude": "sincere", "grief": None, "joy": None, "love": "empathetic",
        "nervousness": None, "optimism": "reassuring", "pride": None,
        "realization": None, "relief": "calm", "remorse": "apologetic",
        "sadness": None, "surprise": None, "neutral": "calm",
    },
    "empathetic_dialogues": {
        "afraid": "submissive", "angry": "aggressive", "annoyed": "dismissive",
        "anticipating": None, "anxious": None, "apprehensive": None,
        "ashamed": "apologetic", "caring": "empathetic", "confident": "calm",
        "content": "calm", "devastated": None, "disappointed": None,
        "disgusted": "dismissive", "embarrassed": "apologetic", "excited": None,
        "faithful": "sincere", "furious": "aggressive", "grateful": "sincere",
        "guilty": "apologetic", "hopeful": "reassuring", "impressed": None,
        "jealous": None, "joyful": None, "lonely": None, "nostalgic": None,
        "prepared": None, "proud": None, "sad": None, "sentimental": None,
        "surprised": None, "terrified": "submissive", "trusting": "sincere",
    },
    "daily_dialog": {
        "no_emotion": "calm", "anger": "aggressive", "disgust": "dismissive",
        "fear": "submissive", "happiness": None, "sadness": None, "surprise": None,
        "inform": None, "question": "curious", "directives": None, "commissive": None,
    },
}

# TONE_LABELS that NOTHING in these datasets maps to. Documented so a mapping edit
# that accidentally covers/uncovers one trips the test and forces a conscious update.
# IMPORTANT FINDING (Plan 3 Task 1): 5 of 14 targets are unreachable from these
# emotion corpora. deceptive/evasive/threatening describe INTENT/manipulation, and
# cold/defiant describe stance/attitude — none are "felt emotions" the datasets label.
# A tone encoder trained only on these three datasets will be blind to these 5 classes.
# Mitigation (later): add synthetic/authored examples for them, or lean on DailyDialog
# dialogue-acts + a few hand-written seed lines. Surfaced, not hidden.
EXPECTED_GAPS = {"deceptive", "evasive", "threatening", "cold", "defiant"}


def map_label(dataset: str, label: str) -> Optional[str]:
    """Map a source (dataset, label) to a TONE_LABELS entry, or None if dropped."""
    return TAXONOMY[dataset][label]


def reachable_targets() -> set:
    """The set of TONE_LABELS that at least one source label maps to."""
    return {t for m in TAXONOMY.values() for t in m.values() if t is not None}


def unreachable_targets() -> set:
    """TONE_LABELS that no source label maps to."""
    return set(TONE_LABELS) - reachable_targets()
