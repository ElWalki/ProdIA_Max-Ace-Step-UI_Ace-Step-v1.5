import torch, os

td = r"D:\espacios de trabajo\vscode\acestep\ACE-Step-1.5_\datasets\preprocessed_tensors"
broken = ['0d041ebb.pt', '10890d0e.pt', '121da836.pt', '9cb3850f.pt', 'f7c72cf8.pt']

for p in broken:
    path = os.path.join(td, p)
    d = torch.load(path, map_location="cpu", weights_only=False)
    m = d.get("metadata", {})
    old_inst = m.get("is_instrumental", False)
    m["is_instrumental"] = True
    d["metadata"] = m
    torch.save(d, path)
    print(f"FIXED: {p} -> is_instrumental: {old_inst} -> True (cap: {m.get('caption','?')[:60]})")

print(f"\nDone! Fixed {len(broken)} tensors.")
