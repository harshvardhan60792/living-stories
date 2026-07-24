# LoRA generator fine-tune — Kaggle recipe (Plan 4 Part B, T7)

Only run if the Task-4 few-shot baseline (100% on THE SEVENTH GUEST) proves
inadequate on a real unaided 3B. Needs: Kaggle notebook w/ **GPU T4** (see
warning), a HF account, and an adapter repo `Harsh-ag26/living-stories-generator-lora`
(create it or let `push_to_hub` create it).

**USE T4, NOT P100.** Kaggle's current PyTorch build has no Pascal (sm_60)
kernels, so the P100 dies with `no kernel image is available for execution on
the device` on the first CUDA op — unusable regardless of our code. The T4
(Turing, sm_75) is supported. Settings -> Accelerator -> **GPU T4 x2**.

**HF_TOKEN secret:** add it under Add-ons -> Secrets, then **tick the checkbox
to attach it to this notebook** (adding it isn't enough — Kaggle secrets are
opt-in per notebook) and restart the session before running.

**No bitsandbytes.** Plain fp16 + LoRA — no 4-bit quantization, no
`bitsandbytes` needed. Qwen2.5-3B fp16 (~6 GB) fits one 16 GB T4.

## Cells

```bash
# 0. Settings -> Accelerator -> GPU T4 x2 (NOT P100)
# 1. deps (no bitsandbytes; drop the stale torchao that breaks peft LoRA dispatch)
!pip install -U "transformers>=4.44" "trl>=0.9" peft accelerate datasets
!pip uninstall -y torchao
```

```bash
# 2. fetch scripts + exemplars (SHA-pin the raw URLs to dodge GitHub CDN staleness)
!wget -q https://raw.githubusercontent.com/harshvardhan60792/living-stories/main/ml-training/prepare_light_sft.py
!wget -q https://raw.githubusercontent.com/harshvardhan60792/living-stories/main/ml-training/train_generator.py
!wget -q https://raw.githubusercontent.com/harshvardhan60792/living-stories/main/ml-training/generate/exemplars.jsonl
```

```bash
# 3. build SFT set (LIGHT best-effort; exemplars carry the schema, upsampled x5)
!python prepare_light_sft.py --exemplars exemplars.jsonl --out sft.jsonl
```

```bash
# 4. train + push adapter (resumes from Hub if a prior session checkpointed)
!python train_generator.py
```

## After

Confirm the adapter landed at `Harsh-ag26/living-stories-generator-lora`. Then
**Task 8**: point `run-fewshot.ts`'s `lm` callback at base Qwen2.5-3B + this
adapter, regenerate THE SEVENTH GUEST, compare validator pass-rate against the
100% few-shot baseline. Keep the fine-tune only if it measurably beats it.
```
