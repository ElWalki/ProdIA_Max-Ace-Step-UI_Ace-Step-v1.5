"""
Standalone dataset preprocessor for ACE-Step LoRA training.

Converts labeled audio samples from a dataset JSON into pre-computed
tensor files (.pt) suitable for training. This script loads the VAE and
text encoder independently, so it does NOT require the Gradio app to be
running.

Usage:
    python preprocess_dataset.py --dataset /path/to/dataset.json --output /path/to/tensors [--json]

The --json flag makes the script output a final JSON summary line to stdout.
"""

import argparse
import json
import os
import sys

def main():
    parser = argparse.ArgumentParser(description="Preprocess dataset to tensors for LoRA training")
    parser.add_argument("--dataset", required=True, help="Path to dataset JSON file")
    parser.add_argument("--output", required=True, help="Output directory for tensor files")
    parser.add_argument("--max-duration", type=float, default=240.0, help="Max audio duration in seconds")
    parser.add_argument("--json", action="store_true", help="Output JSON summary")
    args = parser.parse_args()

    if not os.path.exists(args.dataset):
        print(f"Error: Dataset file not found: {args.dataset}", file=sys.stderr)
        sys.exit(1)

    # Add ACE-Step root to path for imports
    ace_step_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    # Walk up to find ACE-Step-1.5 directory
    for candidate in [
        os.path.join(ace_step_root, "ACE-Step-1.5"),
        os.path.join(os.path.dirname(ace_step_root), "ACE-Step-1.5"),
        os.getcwd(),
    ]:
        if os.path.isdir(candidate) and os.path.isdir(os.path.join(candidate, "acestep")):
            ace_step_root = candidate
            break

    if ace_step_root not in sys.path:
        sys.path.insert(0, ace_step_root)

    try:
        from acestep.training.dataset_builder import DatasetBuilder
    except ImportError as e:
        print(f"Error: Could not import ACE-Step modules: {e}", file=sys.stderr)
        print("Make sure this script is run from the ACE-Step-1.5 directory or with the correct Python environment.", file=sys.stderr)
        sys.exit(1)

    # Load dataset JSON
    print(f"Loading dataset: {args.dataset}")
    with open(args.dataset, "r") as f:
        dataset_data = json.load(f)

    # Reconstruct DatasetBuilder from JSON
    builder = DatasetBuilder()
    builder.load_from_dict(dataset_data)

    labeled_count = sum(1 for s in builder.samples if s.labeled)
    total_count = len(builder.samples)
    print(f"Dataset loaded: {total_count} samples, {labeled_count} labeled")

    if labeled_count == 0:
        msg = "No labeled samples found. Please label samples before preprocessing."
        print(f"Warning: {msg}", file=sys.stderr)
        if args.json:
            print(json.dumps({"status": "error", "message": msg, "labeled": 0, "total": total_count}))
        sys.exit(1)

    # Load models for preprocessing
    print("Loading models for preprocessing (this may take a moment)...")
    try:
        from acestep.pipeline_ace_step import ACEStepPipeline

        checkpoint_dir = os.path.join(ace_step_root, "checkpoints")
        if not os.path.isdir(checkpoint_dir):
            checkpoint_dir = os.path.join(ace_step_root, "checkpoints", "ACE-Step-v1.5")

        pipe = ACEStepPipeline(checkpoint_dir=checkpoint_dir)
        pipe.load_checkpoint()

        # Create a minimal dit_handler-like object for preprocess_to_tensors
        class DitHandlerProxy:
            def __init__(self, pipeline):
                self.model = pipeline.dit
                self.vae = pipeline.vae
                self.text_encoder = pipeline.text_encoder
                self.text_tokenizer = pipeline.text_tokenizer
                self.silence_latent = getattr(pipeline, "silence_latent", None)
                self.device = pipeline.device
                self.dtype = pipeline.dtype

        handler = DitHandlerProxy(pipe)
    except Exception as e:
        # If pipeline loading fails, try a simpler approach
        print(f"Warning: Could not load full pipeline: {e}", file=sys.stderr)
        print("Preprocessing requires model access. Please use the Gradio UI for preprocessing.", file=sys.stderr)
        if args.json:
            print(json.dumps({
                "status": "error",
                "message": f"Model loading failed: {str(e)}. Use Gradio UI preprocess instead.",
                "labeled": labeled_count,
                "total": total_count,
            }))
        sys.exit(1)

    # Run preprocessing
    os.makedirs(args.output, exist_ok=True)
    print(f"Preprocessing to: {args.output}")

    def progress_cb(msg):
        print(f"  {msg}")

    output_paths, status = builder.preprocess_to_tensors(
        dit_handler=handler,
        output_dir=args.output,
        max_duration=args.max_duration,
        progress_callback=progress_cb,
    )

    print(f"Done: {status}")
    print(f"Output files: {len(output_paths)}")

    if args.json:
        print(json.dumps({
            "status": "complete",
            "message": status,
            "output_files": len(output_paths),
            "output_dir": args.output,
            "labeled": labeled_count,
            "total": total_count,
        }))


if __name__ == "__main__":
    main()
