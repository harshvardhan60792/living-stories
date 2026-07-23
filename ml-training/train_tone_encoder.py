"""Plan 3 Tasks 3 + 6 — fine-tune MiniLM into a 14-label multi-label tone
classifier, push to the HF Hub, then export + quantize to int8 ONNX.

RUN THIS ON KAGGLE (GPU T4). It is one end-to-end script: train -> push ->
export ONNX -> push. A killed session loses no progress because the trainer
checkpoints to the Hub every epoch (push_to_hub=True) and can resume.

BEFORE RUNNING, set the two constants in the CONFIG block below (HF_REPO and
your HF token via Kaggle Secrets), then: Run All.

Datasets used (public, auto-downloaded by `datasets`):
  - go_emotions            (28 labels) — REQUIRED; reaches 9 of the 14 tone labels
  - empathetic_dialogues   (32 labels) — best-effort (redundant volume)
  - daily_dialog           (emotions + acts) — best-effort (redundant volume)
The last two ship script loaders that modern `datasets` refuses to run; build_dataset
wraps them in try/except and the run still completes on go_emotions alone.
Plus authored gap examples: ml-training/data/tone_seed.jsonl (the 5 labels no public
dataset reaches: deceptive, evasive, threatening, cold, defiant). go_emotions + this
seed = full 14-label coverage, so the two best-effort sources are optional.
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
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
)

from taxonomy import TAXONOMY, TONE_LABELS, map_label

# ----------------------------- CONFIG (EDIT ME) -----------------------------
BASE_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
HF_REPO = "Harsh-ag26/living-stories-tone-encoder"  # <-- change this
SEED_PATH = "tone_seed.jsonl"   # upload ml-training/data/tone_seed.jsonl next to this script
EPOCHS = 3
BATCH_SIZE = 64
MAX_LEN = 64
# On Kaggle: add your HF token as a Secret named HF_TOKEN (Add-ons -> Secrets),
# then this reads it. Locally, set the env var HF_TOKEN instead.
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
if not HF_TOKEN:
    # Kaggle secrets are NOT always exported as env vars — pull it directly from the
    # secret store (secret must be named HF_TOKEN and attached to the notebook).
    try:
        from kaggle_secrets import UserSecretsClient
        HF_TOKEN = UserSecretsClient().get_secret("HF_TOKEN")
        os.environ["HF_TOKEN"] = HF_TOKEN
        print("HF_TOKEN loaded from Kaggle secret store.")
    except Exception as e:
        print(f"could not load HF_TOKEN from Kaggle secrets: {e}")
# ---------------------------------------------------------------------------

L2I = {label: i for i, label in enumerate(TONE_LABELS)}
NUM_LABELS = len(TONE_LABELS)


def multihot(labels):
    v = np.zeros(NUM_LABELS, dtype=np.float32)
    for lab in labels:
        v[L2I[lab]] = 1.0
    return v


# DailyDialog emotion ints -> label names (parquet/script both use this order).
DD_EMO = {0: "no_emotion", 1: "anger", 2: "disgust", 3: "fear",
          4: "happiness", 5: "sadness", 6: "surprise"}


def _int2key(ds, field, r, taxo_name):
    """Turn a raw label (int or str) into the string key the TAXONOMY dict uses."""
    if not isinstance(r, int):
        return r
    # daily_dialog parquet loses ClassLabel names -> use the fixed emotion map.
    if taxo_name == "daily_dialog":
        return DD_EMO.get(r)
    feat = ds.features[field]
    inner = getattr(feat, "feature", feat)   # Sequence(ClassLabel) or ClassLabel
    return inner.int2str(r) if hasattr(inner, "int2str") else r


def rows_from_source(name, text_field, label_field, taxo_name=None, config=None, **load_kw):
    """Yield {text, labels[]} rows from one HF dataset, applying the taxonomy.

    daily_dialog rows carry PARALLEL lists (dialog[] + emotion[]); flatten them
    utterance-by-utterance. Everything else is one (text, label(s)) per row.
    `config` is the dataset config name (2nd positional arg to load_dataset).
    """
    taxo_name = taxo_name or name.split("/")[-1]
    ds = (load_dataset(name, config, split="train", **load_kw) if config
          else load_dataset(name, split="train", **load_kw))

    for ex in ds:
        text = ex[text_field]
        raw = ex[label_field]
        # Parallel-list datasets (daily_dialog): text is a list of utterances,
        # label is the equal-length list of per-utterance labels.
        if isinstance(text, list) and isinstance(raw, list) and len(text) == len(raw):
            pairs = zip(text, raw)
        else:
            pairs = [(text, raw)]
        for t, r in pairs:
            raw_list = r if isinstance(r, list) else [r]
            mapped = []
            for one in raw_list:
                key = _int2key(ds, label_field, one, taxo_name)
                if key is None:
                    continue
                tgt = map_label(taxo_name, key)
                if tgt:
                    mapped.append(tgt)
            if mapped:
                yield {"text": t, "labels": sorted(set(mapped))}


def load_seed(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


# Each source is best-effort: go_emotions + tone_seed.jsonl ALONE cover all 14
# labels (go_emotions reaches 9, the seed supplies the other 5). empathetic_dialogues
# and daily_dialog are redundant VOLUME (they map only to labels go_emotions already
# reaches), and as of 2026 their HF repos ship script loaders that the `datasets`
# library refuses to run ("Dataset scripts are no longer supported"), with parquet
# auto-convert disabled. So they are wrapped in try/except: if they load, great; if
# not, the run still completes with full label coverage. Re-add a working mirror here
# any time — the loader handles ints/strs and parallel-list (daily_dialog) shapes.
# go_emotions: use the FULLY-NAMESPACED id + explicit "simplified" config. The bare
# id "go_emotions" is rejected by newer `datasets` ("Invalid HF URI ... Repository id
# must ..."); the namespaced id + pinned config works on every datasets version.
SOURCES = [
    ("google-research-datasets/go_emotions", "text", "labels",
     {"config": "simplified"}),                                # required, version-proof
    ("empathetic_dialogues", "utterance", "context", {}),      # best-effort
    ("daily_dialog", "dialog", "emotion", {}),                 # best-effort
]


def build_dataset():
    rows = []
    for name, tf, lf, kw in SOURCES:
        try:
            got = list(rows_from_source(name, tf, lf, **kw))
            rows += got
            print(f"  {name}: +{len(got)} rows")
        except Exception as e:
            print(f"  {name}: SKIPPED ({type(e).__name__}: {str(e)[:120]})")
    seed = list(load_seed(SEED_PATH))
    rows += seed
    print(f"  {SEED_PATH}: +{len(seed)} rows")
    print(f"total rows after taxonomy + seed: {len(rows)}")
    if not rows:
        raise RuntimeError("no training rows — every source failed AND seed empty")
    return Dataset.from_list(rows)


class WeightedTrainer(Trainer):
    """Trainer with per-label pos_weight in the BCE loss (see main() for why)."""

    def __init__(self, *args, pos_weight=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.pos_weight = pos_weight

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        logits = outputs.logits
        loss_fct = torch.nn.BCEWithLogitsLoss(pos_weight=self.pos_weight.to(logits.device))
        loss = loss_fct(logits, labels)
        return (loss, outputs) if return_outputs else loss


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

    # Multi-label + sparse positives (~7% positive rate/label) collapses plain BCE:
    # loss keeps falling from the majority-negative signal while true positives never
    # cross the 0.5 threshold (observed: micro/macro F1 exactly 0.0 for 3 straight
    # epochs). pos_weight[j] = neg/pos per label counteracts the imbalance.
    train_labels = np.array(split["train"]["labels"], dtype=np.float32)
    pos = train_labels.sum(axis=0)
    neg = train_labels.shape[0] - pos
    pos_weight = torch.tensor(np.clip(neg / np.clip(pos, 1, None), 1.0, 20.0), dtype=torch.float32)
    print("pos_weight per label:", dict(zip(TONE_LABELS, pos_weight.tolist())))

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

    trainer = WeightedTrainer(
        model=model, args=args,
        train_dataset=split["train"], eval_dataset=split["test"],
        compute_metrics=metrics,
        data_collator=DataCollatorWithPadding(tok),  # dynamic pad: rows vary in length (padding=False above)
        pos_weight=pos_weight,
    )
    trainer.train()
    print("eval:", trainer.evaluate())
    trainer.push_to_hub()          # final model + tokenizer to the Hub
    tok.push_to_hub(HF_REPO)

    export_onnx(HF_REPO)


def export_onnx(repo):
    """Task 6: export the fine-tuned classifier to int8 ONNX and push it back.

    Manual export (not `optimum`) — Kaggle's preinstalled optimum build imports
    `is_tf_available` from transformers.utils, which newer transformers removed
    (ImportError). onnx/onnxruntime themselves are unaffected, so export by hand.
    """
    from huggingface_hub import HfApi
    from onnxruntime.quantization import QuantType, quantize_dynamic

    model = AutoModelForSequenceClassification.from_pretrained(repo)
    tok = AutoTokenizer.from_pretrained(repo)
    model.eval()

    out_dir = "tone-encoder-onnx"
    os.makedirs(out_dir, exist_ok=True)
    dummy = tok("hello world", return_tensors="pt")
    torch.onnx.export(
        model,
        (dummy["input_ids"], dummy["attention_mask"]),
        f"{out_dir}/model.onnx",
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "logits": {0: "batch"},
        },
        opset_version=14,
    )
    quantize_dynamic(f"{out_dir}/model.onnx", f"{out_dir}/model_quantized.onnx",
                      weight_type=QuantType.QUInt8)

    # tokenizer/config already live at repo root (pushed in main()); push only the
    # ONNX weights into an onnx/ subfolder, matching transformers.js's expected layout.
    HfApi().upload_folder(folder_path=out_dir, repo_id=repo, path_in_repo="onnx",
                           allow_patterns=["*.onnx"])
    print(f"ONNX pushed to {repo}/onnx. transformers.js can load it with "
          f'pipeline("text-classification", "{repo}", {{ dtype: "q8" }}).')


if __name__ == "__main__":
    main()
