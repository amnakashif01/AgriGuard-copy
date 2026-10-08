"""Prepare the free Space upload folder. No network, accounts or billed resources."""
from pathlib import Path
import argparse
import shutil

parser = argparse.ArgumentParser()
parser.add_argument("output", type=Path)
args = parser.parse_args()
source = Path(__file__).resolve().parent
target = args.output.resolve()
target.mkdir(parents=True, exist_ok=False)
for name in ["space_app.py", "contract.py", "engine.py"]:
    shutil.copy2(source / name, target / name)
shutil.copy2(source / "requirements.zerogpu.txt", target / "requirements.txt")
shutil.copy2(source / "README.zerogpu.md", target / "README.md")
print(f"Free ZeroGPU upload files prepared at {target}; nothing deployed or purchased.")
