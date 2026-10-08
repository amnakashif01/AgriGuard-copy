"""Run real, labeled image checks after GPU deployment. No synthetic accuracy claim."""
import argparse
import base64
import json
import mimetypes
import os
from pathlib import Path
import statistics
import time
import urllib.error
import urllib.request

from contract import Findings, provenance


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path, help="JSON array of {image,crop,symptoms,expectedDisease}")
    args = parser.parse_args()
    endpoint = os.environ["AGRICHAT_ENDPOINT_URL"]
    token = os.environ["AGRICHAT_API_KEY"]
    if not endpoint.startswith("https://"):
        parser.error("Use the deployed HTTPS endpoint")
    samples = json.loads(args.manifest.read_text())
    if not samples:
        parser.error("Supply real held-out photos and expert-checked labels")
    records = []
    for index, sample in enumerate(samples, 1):
        photo = args.manifest.parent / sample["image"]
        mime = mimetypes.guess_type(photo.name)[0]
        body = {"photoDataUri": f"data:{mime};base64," + base64.b64encode(photo.read_bytes()).decode(),
                "crop": sample["crop"], "symptoms": sample.get("symptoms", ""), "language": "english"}
        request = urllib.request.Request(endpoint, data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
        started = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                data = json.load(response)
            if data.get("inference") != provenance():
                raise ValueError("Unexpected model revision")
            finding = Findings.model_validate(data["diagnosis"])
            accepted = sample["expectedDisease"]
            accepted = accepted if isinstance(accepted, list) else [accepted]
            match = finding.disease.casefold() in [label.casefold() for label in accepted]
            records.append({"sample": index, "seconds": round(time.monotonic() - started, 2),
                            "disease": finding.disease, "expectedDisease": accepted,
                            "labelMatch": match, "expertReviewRequired": finding.expertReviewRequired})
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as error:
            records.append({"sample": index, "seconds": round(time.monotonic() - started, 2),
                            "errorType": type(error).__name__})
    timings = sorted(record["seconds"] for record in records if "errorType" not in record)
    matches = sum(record.get("labelMatch", False) for record in records)
    print(json.dumps({"model": provenance(), "total": len(records), "successfulResponses": len(timings),
                      "exactLabelMatches": matches,
                      "medianSeconds": statistics.median(timings) if timings else None,
                      "records": records,
                      "scope": "This labeled sample only, not general accuracy or full website report latency."}, indent=2))
    return 0 if len(timings) == len(records) and matches == len(records) else 1


if __name__ == "__main__":
    raise SystemExit(main())
