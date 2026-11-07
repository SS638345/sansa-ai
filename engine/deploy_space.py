"""Creates or updates the SANSA engine Hugging Face Space with the HF_TOKEN secret.

Prints the Space URL as the last line. Used by .github/workflows/engine-deploy.yml
and by the Pages build (with --url-only) to find the engine address.
"""
import os
import sys

from huggingface_hub import HfApi

SPACE_NAME = os.environ.get("SPACE_NAME", "sansa-engine")
api = HfApi(token=os.environ["HF_TOKEN"])
user = api.whoami()["name"]
repo = f"{user}/{SPACE_NAME}"


def space_url() -> str:
    try:
        host = api.space_info(repo).host
        if host:
            return host.rstrip("/")
    except Exception:
        pass
    sub = f"{user}-{SPACE_NAME}".lower().replace("_", "-").replace(".", "-")
    return f"https://{sub}.hf.space"


if "--url-only" in sys.argv:
    # Only when the Space exists, so the website never points at a missing engine.
    try:
        api.space_info(repo)
    except Exception:
        sys.exit(0)
    print(space_url())
    sys.exit(0)

here = os.path.dirname(os.path.abspath(__file__))
api.create_repo(repo, repo_type="space", space_sdk="docker", exist_ok=True)
commit = api.upload_file(path_or_fileobj=os.path.join(here, "space", "Dockerfile"), path_in_repo="Dockerfile",
                         repo_id=repo, repo_type="space", commit_message="SANSA engine Dockerfile")
api.upload_file(path_or_fileobj=os.path.join(here, "README.md"), path_in_repo="README.md",
                repo_id=repo, repo_type="space", commit_message="SANSA engine README")
# The Dockerfile clones this GitHub repo, so rebuild without cache to pick up engine changes.
api.restart_space(repo, factory_reboot=True)
print(f"Space: https://huggingface.co/spaces/{repo}")
print(space_url())
