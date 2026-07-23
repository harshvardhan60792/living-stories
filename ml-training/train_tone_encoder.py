"""Plan 3 Tasks 3 + 6 — fine-tune MiniLM into a 14-label multi-label tone
classifier, push to the HF Hub, then export + quantize to int8 ONNX.

RUN THIS ON KAGGLE (GPU T4). It is one end-to-end script: train -> push ->
export ONNX -> push. A killed session loses no progress because the trainer
checkpoints to the Hub every epoch (push_to_hub=True) and can resume.

BEFORE RUNNING, set the two constants in the CONFIG block below (HF_REPO and
your HF token via Kaggle Secrets), then: Run All.

Datasets used (public, auto-downloaded by `datasets`):
  - go_emotions            (28 labels)
  - empathetic_dialogues   (32 labels)
  - daily_dialog           (emotions + dialogue acts)
Plus authored gap examples: ml-training/data/tone_seed.jsonl (5 labels the
public datasets can't reach: deceptive, evasive, threatening, cold, defiant).
The taxonomy mapping lives in taxonomy.py (same folder) — upload it alongside
this file, or paste its TAXONOMY / TONE_LABELS in if running as a notebook.
"""

import json
import os

import numpy as np
import torch
from datasets import Dataset, load_dataset
from huggingface_hub import login
from sklearn.metrics import f1_score
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
)

from taxonomy import TAXONOMY, TONE_LABELS, map_label

# ----------------------------- CONFIG (EDIT ME) -----------------------------
BASE_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
HF_REPO = "YOUR_HF_USERNAME/living-stories-tone-encoder"  # <-- change this
SEED_PATH = "tone_seed.jsonl"   # upload ml-training/data/tone_seed.jsonl next to this script
EPOCHS = 3
BATCH_SIZE = 64
MAX_LEN = 64
# On Kaggle: add your HF token as a Secret named HF_TOKEN (Add-ons -> Secrets),
# then this reads it. Locally, set the env var HF_TOKEN instead.
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
# ---------------------------------------------------------------------------

L2I = {label: i for i, label in enumerate(TONE_LABELS)}
NUM_LABELS = len(TONE_LABELS)


def multihot(labels):
    v = np.zeros(NUM_LABELS, dtype=np.float32)
    for lab in labels:
        v[L2I[lab]] = 1.0
    return v


def rows_from_source(name, text_field, label_field):
    """Yield {text, labels[]} rows from one HF dataset, applying the taxonomy."""
    ds = load_dataset(name, split="train")
    for ex in ds:
        text = ex[text_field]
        raw = ex[label_field]
        raw_list = raw if isinstance(raw, list) else [raw]
        mapped = []
        for r in raw_list:
            # go_emotions labels are ints; others are strings — normalize to the
            # string label the TAXONOMY dict keys on.
            key = ds.features[label_field].feature.int2str(r) if isinstance(r, int) else r
            tgt = map_label(name if name in TAXONOMY else _alias(name), key)
            if tgt:
                mapped.append(tgt)
        if mapped:
            yield {"text": text, "labels": sorted(set(mapped))}


def _alias(hf_name):
    return {"go_emotions": "go_emotions",
            "empathetic_dialogues": "empathetic_dialogues",
            "daily_dialog": "daily_dialog"}[hf_name]


def load_seed(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def build_dataset():
    rows = []
    # NOTE: field names below are for the canonical HF versions; if a load fails
    # on a KeyError, print ds.features once and adjust text_field/label_field.
    rows += list(rows_from_source("go_emotions", "text", "labels"))
    rows += list(rows_from_source("empathetic_dialogues", "utterance", "context"))
    rows += list(rows_from_source("daily_dialog", "dialog", "emotion"))
    rows += list(load_seed(SEED_PATH))
    print(f"total rows after taxonomy + seed: {len(rows)}")
    return Dataset.from_list(rows)


def main():
    if HF_TOKEN:
        login(token=HF_TOKEN)
    else:
        print("WARNING: no HF token found — push_to_hub will fail. Set HF_TOKEN.")

    tok = AutoTokenizer.from_pretrained(BASE_MODEL)
    ds = build_dataset()

    def encode(batch):
        enc = tok(batch["text"], truncation=True, max_length=MAX_LEN, padding=False)
        enc["labels"] = [multihot(l).tolist() for l in batch["labels"]]
        return enc

    ds = ds.map(encode, batched=True, remove_columns=ds.column_names)
    split = ds.train_test_split(test_size=0.1, seed=42)

    model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=NUM_LABELS,
        problem_type="multi_label_classification",
        id2label={i: l for l, i in L2I.items()},
        label2id=L2I,
    )

    def metrics(pred):
        probs = torch.sigmoid(torch.tensor(pred.predictions))
        preds = (probs > 0.5).int().numpy()
        return {"micro_f1": f1_score(pred.label_ids, preds, average="micro", zero_division=0),
                "macro_f1": f1_score(pred.label_ids, preds, average="macro", zero_division=0)}

    args = TrainingArguments(
        output_dir="tone-encoder-out",
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        learning_rate=2e-5,
        eval_strategy="epoch",
        save_strategy="epoch",
        logging_steps=50,
        push_to_hub=True,
        hub_model_id=HF_REPO,
        hub_strategy="every_save",   # checkpoint to Hub each epoch (resume-safe)
        report_to="none",
    )

    trainer = Trainer(
        model=model, args=args,
        train_dataset=split["train"], eval_dataset=split["test"],
        compute_metrics=metrics,
    )
    trainer.train()
    print("eval:", trainer.evaluate())
    trainer.push_to_hub()          # final model + tokenizer to the Hub
    tok.push_to_hub(HF_REPO)

    export_onnx(HF_REPO)


def export_onnx(repo):
    """Task 6: export the fine-tuned classifier to int8 ONNX and push it back."""
    from optimum.onnxruntime import ORTModelForSequenceClassification, ORTQuantizer
    from optimum.onnxruntime.configuration import AutoQuantizationConfig

    ort_model = ORTModelForSequenceClassification.from_pretrained(repo, export=True)
    ort_model.save_pretrained("tone-encoder-onnx")
    tok = AutoTokenizer.from_pretrained(repo)
    tok.save_pretrained("tone-encoder-onnx")

    quantizer = ORTQuantizer.from_pretrained("tone-encoder-onnx")
    qconfig = AutoQuantizationConfig.avx512_vnni(is_static=False, per_channel=False)
    quantizer.quantize(save_dir="tone-encoder-onnx", quantization_config=qconfig)

    # push ONNX artifacts (incl. model_quantized.onnx) into an `onnx/` subfolder
    ort_model.push_to_hub("tone-encoder-onnx", repository_id=repo)
    print(f"ONNX pushed to {repo}. transformers.js can load it with "
          f'pipeline("text-classification", "{repo}", {{ dtype: "q8" }}).')


if __name__ == "__main__":
    main()
