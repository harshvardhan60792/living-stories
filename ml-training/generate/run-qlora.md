# LoRA generator fine-tune — Kaggle recipe (Plan 4 Part B, T7)

Only run if the Task-4 few-shot baseline (100% on THE SEVENTH GUEST) proves
inadequate on a real unaided 3B. Needs: Kaggle notebook w/ **P100 16 GB**, a HF
account, and an adapter repo `Harsh-ag26/living-stories-generator-lora` (create it
or let `push_to_hub` create it).

**HF_TOKEN secret:** add it under Add-ons -> Secrets, then **tick the checkbox
to attach it to this notebook** (adding it isn't enough — Kaggle secrets are
opt-in per notebook) and restart the session before running.

**No bitsandbytes.** P100 is Pascal (sm_60); bitsandbytes' compiled kernels
require compute capability 7.0+ (Volta+) and fail with `named symbol not found`
on P100. `train_generator.py` uses plain fp16 + LoRA instead — no 4-bit
quantization, no `bitsandbytes` package needed. Qwen2.5-3B fp16 (~6 GB) fits
P100's 16 GB fine.

## Cells

```bash
# 1. deps (no bitsandbytes — see note above)
!pip install -U "transformers>=4.44" "trl>=0.9" peft accelerate datasets
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
