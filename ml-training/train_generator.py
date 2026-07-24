"""Plan 4 Task 6 — LoRA fine-tune Qwen2.5-3B-Instruct to emit story-node JSON.

Only run this if the Task-4 few-shot dry-run was inadequate. Qwen2.5-3B in
plain fp16 (NO bitsandbytes quantization) + LoRA (r16/a32) + adamw_torch, TRL
SFTTrainer, seq len ~1536. Pushes the LoRA adapter to the Hub every N steps and
at the end, so a killed Kaggle session can `resume_from_checkpoint` from the
Hub next run (Kaggle has no persistence — spec §11).

NOTE: bitsandbytes 4-bit (nf4) requires CUDA compute capability >=7.0
(Volta+). Kaggle's free-tier P100 is Pascal (sm_60) and cannot run bnb's
compiled kernels at all ("named symbol not found" is the tell) — so this
script deliberately skips quantization. 3B in fp16 is ~6 GB weights + LoRA
overhead, which fits P100's 16 GB without it. If your Kaggle GPU is a T4/A100
instead (Volta+), 4-bit would work, but plain fp16 LoRA is simpler and this
model comfortably fits either way — no need to re-add bnb.

Kaggle cells:
    !pip install -U "transformers>=4.44" "trl>=0.9" peft accelerate datasets
    # add HF_TOKEN as a Kaggle secret AND tick it "attached" for this notebook
    # (Add-ons -> Secrets -> check the box next to HF_TOKEN, then restart session)
    !python prepare_light_sft.py --exemplars exemplars.jsonl --out sft.jsonl
    !python train_generator.py
"""
import os

BASE = "Qwen/Qwen2.5-3B-Instruct"
HF_REPO = "Harsh-ag26/living-stories-generator-lora"
SFT_PATH = os.environ.get("SFT_PATH", "sft.jsonl")
MAXLEN = 1536

HF_TOKEN = os.environ.get("HF_TOKEN")
if not HF_TOKEN:
    try:
        from kaggle_secrets import UserSecretsClient
        HF_TOKEN = UserSecretsClient().get_secret("HF_TOKEN")
        os.environ["HF_TOKEN"] = HF_TOKEN
    except Exception as e:
        print(f"no HF_TOKEN in env or Kaggle secrets: {e}")


def main():
    import torch
    from datasets import load_dataset
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import LoraConfig
    from trl import SFTConfig, SFTTrainer

    tok = AutoTokenizer.from_pretrained(BASE, token=HF_TOKEN)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token

    # Plain fp16, no bitsandbytes — see module docstring (P100 can't run bnb kernels).
    model = AutoModelForCausalLM.from_pretrained(
        BASE, torch_dtype=torch.float16, device_map="auto", token=HF_TOKEN
    )
    model.config.use_cache = False

    lora = LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
    )

    ds = load_dataset("json", data_files=SFT_PATH, split="train")

    cfg = SFTConfig(
        output_dir="out",
        num_train_epochs=3,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=16,
        learning_rate=2e-4,
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        logging_steps=10,
        save_steps=50,
        save_total_limit=2,
        bf16=False, fp16=True,
        optim="adamw_torch",  # not paged_adamw_8bit — that's bnb too, unusable on P100
        max_seq_length=MAXLEN,
        packing=False,
        gradient_checkpointing=True,
        report_to="none",
        # survive a Kaggle kill: mirror checkpoints to the Hub as we go.
        push_to_hub=True,
        hub_model_id=HF_REPO,
        hub_strategy="checkpoint",
        hub_token=HF_TOKEN,
    )

    trainer = SFTTrainer(model=model, args=cfg, train_dataset=ds,
                         peft_config=lora, processing_class=tok)

    # Resume from the Hub if a prior session left a checkpoint there.
    resume = os.path.isdir("out") and any(p.startswith("checkpoint-") for p in os.listdir("out"))
    trainer.train(resume_from_checkpoint=resume or None)

    trainer.save_model("out/final")
    trainer.push_to_hub()
    print(f"adapter pushed -> {HF_REPO}")


if __name__ == "__main__":
    main()
