"""Resume the Meshy stages without resubmitting paid jobs; keep signed URLs local."""
import argparse
import json
import pathlib
import shutil
import subprocess
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORK = ROOT / ".aeon-assets"
WORK.mkdir(exist_ok=True)
STATE = WORK / "pipeline.json"


def cli(*args):
    command = shutil.which("meshy.cmd") or shutil.which("meshy")
    if not command:
        raise RuntimeError("Install the Meshy CLI and run meshy auth login first.")
    process = subprocess.run([command, *args, "--no-update-check"], capture_output=True, text=True, encoding="utf-8")
    if process.returncode:
        # Meshy API errors do not need the signed asset URLs in stdout.
        raise RuntimeError(process.stderr.strip()[:1200])
    return json.loads(process.stdout)


def save(state):
    STATE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def wait(resource, task_id):
    while True:
        task = cli(resource, "get", task_id)
        (WORK / f"{resource}-task.json").write_text(json.dumps(task, indent=2), encoding="utf-8")
        print(resource, task.get("status"), task.get("progress"), flush=True)
        if task["status"] == "SUCCEEDED":
            return task
        if task["status"] in ("FAILED", "CANCELED"):
            raise RuntimeError(str(task.get("task_error", "Task failed")))
        time.sleep(12)


def download(url, name):
    destination = WORK / name
    if destination.exists() and destination.stat().st_size > 100:
        return
    with urllib.request.urlopen(url, timeout=180) as response:
        temporary = destination.with_suffix(".download")
        with temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
        temporary.replace(destination)
    print("Downloaded", name, destination.stat().st_size, "bytes", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", help="Existing image-to-3d task ID")
    args = parser.parse_args()
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    if args.task:
        if state.get("generation") and state["generation"] != args.task:
            raise RuntimeError("A different generation is already recorded. Use a separate workspace.")
        state["generation"] = args.task
        save(state)
    if not state.get("generation"):
        raise RuntimeError("Pass --task with the existing Meshy image-to-3d task ID.")
    model = wait("image-to-3d", state["generation"])
    download(model["model_urls"]["glb"], "source.glb")
    if model.get("thumbnail_url"):
        download(model["thumbnail_url"], "meshy-preview.png")
    if not state.get("rigging"):
        rig = cli("rigging", "create", "--input-task-id", state["generation"], "--height-meters", "1.7", "--async", "--operation-id", f"aeon-fox-rig-{state['generation']}")
        state["rigging"] = rig["task_id"]
        save(state)
    rig = wait("rigging", state["rigging"])
    result = rig["result"]
    download(result["rigged_character_glb_url"], "rigged.glb")
    download(result["basic_animations"]["walking_glb_url"], "walking.glb")
    print("Meshy stages complete. Run prepare_assets.py in Blender next.", flush=True)


if __name__ == "__main__":
    main()
