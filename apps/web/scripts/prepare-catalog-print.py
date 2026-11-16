# /// script
# requires-python = ">=3.11"
# dependencies = ["pypdf==6.11.0"]
# ///
"""Prepare a preflighted A5 catalog for Mixam US. Run with uv run this-file.py INPUT OUTPUT_DIR."""

import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ContentStream, RectangleObject

PROFILE_URL = "https://registry.color.org/profile-registry/profiles/GRACoL2006_Coated1v2.icc"
PROFILE_HASH = "7f822b354f3f4081e3b1dadd381c9f16d583257d1574e583be7d0e3433a6b45b"
WIDTH, HEIGHT = 148 / 25.4 * 72 + 18, 210 / 25.4 * 72 + 18


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def text_pages(path):
    # White, one-point diagnostic markers can change extraction order after
    # conversion. Compare the complete visible text, not those hidden markers.
    pages = run("pdftotext", "-layout", str(path), "-").split("\f")[:-1]
    return [re.sub(r"\s+", "", re.sub(r"(?:CATALOG-END|TRAINING-PLAN)-[A-Za-z0-9-]+", "", p)) for p in pages]


def inspect_resources(resources, reader, visited):
    if not resources:
        return
    resources = resources.get_object()
    for space in resources.get("/ColorSpace", {}).get_object().values() if "/ColorSpace" in resources else []:
        value = space.get_object()
        if str(value) in ("/DeviceRGB", "/CalRGB"):
            raise ValueError("RGB resource in print output")
        if isinstance(value, list) and value[0] == "/ICCBased" and value[1].get_object().get("/N") != 4:
            raise ValueError("Non-CMYK ICC resource in print output")
    for reference in resources.get("/XObject", {}).get_object().values() if "/XObject" in resources else []:
        identity = str(reference)
        if identity in visited:
            continue
        visited.add(identity)
        obj = reference.get_object()
        if obj.get("/ColorSpace") == "/DeviceRGB":
            raise ValueError("RGB image in print output")
        if obj.get("/Subtype") == "/Form":
            inspect_stream(obj, reader)
            inspect_resources(obj.get("/Resources"), reader, visited)


def inspect_stream(stream, reader):
    if stream:
        for operands, operator in ContentStream(stream, reader).operations:
            if operator in (b"rg", b"RG") or (operator in (b"cs", b"CS") and "/DeviceRGB" in operands):
                raise ValueError("RGB painting operator in print output")


def validate(path, expected_pages):
    reader = PdfReader(path, strict=True)
    if reader.is_encrypted or len(reader.pages) != expected_pages:
        raise ValueError("Unexpected page count or encryption")
    intent = reader.trailer["/Root"]["/OutputIntents"][0].get_object()
    profile = intent["/DestOutputProfile"].get_object().get_data()
    if hashlib.sha256(profile).hexdigest() != PROFILE_HASH:
        raise ValueError("Incorrect output color profile")
    visited = set()
    for page in reader.pages:
        for actual, expected in [(page.mediabox, [0, 0, WIDTH, HEIGHT]), (page.bleedbox, [0, 0, WIDTH, HEIGHT]), (page.trimbox, [9, 9, WIDTH - 9, HEIGHT - 9])]:
            if any(abs(float(a) - b) > 0.001 for a, b in zip(actual, expected)):
                raise ValueError("Incorrect A5 trim/bleed geometry")
        if page.get("/Annots"):
            raise ValueError("Interactive annotations remain in print output")
        inspect_stream(page.get_contents(), reader)
        inspect_resources(page.get("/Resources"), reader, visited)
    fonts = run("pdffonts", str(path)).splitlines()[2:]
    if not fonts or any(line.split()[-5] != "yes" for line in fonts if line.strip()):
        raise ValueError("Print output contains an unembedded font")
    namespace = {"x": "http://www.w3.org/1999/xhtml"}
    pages = ET.fromstring(run("pdftotext", "-bbox-layout", str(path), "-")).findall(".//x:page", namespace)
    if len(pages) != expected_pages:
        raise ValueError("Unable to inspect every final page boundary")
    for number, page in enumerate(pages, 1):
        left, right = (52.2, 27) if number % 2 else (27, 52.2)
        for word in page.findall(".//x:word", namespace):
            if (word.text or "").startswith(("CATALOG-END-", "TRAINING-PLAN-")):
                continue
            x, y, end_x, end_y = [float(word.attrib[key]) for key in ("xMin", "yMin", "xMax", "yMax")]
            if x < left - 0.15 or end_x > WIDTH - right + 0.15 or y < 26.85 or end_y > HEIGHT - 26.85:
                raise ValueError(f"Final print text enters punch/quiet area on page {number}")
    return {"pages": expected_pages, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size, "fonts_embedded": True, "rgb_operators": False, "trim_mm": [148, 210], "bleed_in": 0.125, "output_profile": "GRACoL2006_Coated1v2"}


def main():
    source = Path(sys.argv[1]).resolve()
    destination = Path(sys.argv[2]).resolve()
    original = PdfReader(source)
    count = len(original.pages)
    if count < 6 or count % 2:
        raise ValueError("Expected an even catalog with four cover pages")
    if original.pages[-2].extract_text().strip():
        raise ValueError("Inside back cover must be blank")
    for page in original.pages:
        if abs(float(page.mediabox.width) - WIDTH) > 0.02 or abs(float(page.mediabox.height) - HEIGHT) > 0.02:
            raise ValueError("Source is not A5 plus bleed")
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="mixam-", dir=destination) as temporary:
        stage = Path(temporary)
        profile = stage / "GRACoL2006_Coated1v2.icc"
        run("curl", "--fail", "--location", "--silent", "--show-error", "--max-time", "60", PROFILE_URL, "-o", str(profile))
        if hashlib.sha256(profile.read_bytes()).hexdigest() != PROFILE_HASH:
            raise ValueError("Downloaded profile checksum changed; review before proceeding")
        # PDF/X conversion flattens interactive annotations; review PDF retains its links.
        prefix = f"""[ /GTS_PDFXVersion (PDF/X-1a:2001) /Trapped /False /DOCINFO pdfmark
[ /_objdef {{icc_PDFX}} /type /stream /OBJ pdfmark
[ {{icc_PDFX}} << /N 4 >> /PUT pdfmark
[ {{icc_PDFX}} ({profile}) (r) file /PUT pdfmark
[ /_objdef {{OutputIntent_PDFX}} /type /dict /OBJ pdfmark
[ {{OutputIntent_PDFX}} << /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier (GRACoL2006_Coated1v2) /Info (GRACoL2006_Coated1v2) /RegistryName (http://www.color.org) /DestOutputProfile {{icc_PDFX}} >> /PUT pdfmark
[ {{Catalog}} << /OutputIntents [ {{OutputIntent_PDFX}} ] >> /PUT pdfmark
<< /EmbedAllFonts true /NeverEmbed [] >> setdistillerparams"""
        converted = stage / "converted.pdf"
        command = ["gs", "-q", "-dBATCH", "-dNOPAUSE", "-dPDFX=1", "-dCompatibilityLevel=1.3", "-dPreserveAnnots=false", "-dShowAnnots=false", "-sDEVICE=pdfwrite", "-sColorConversionStrategy=CMYK", f"-sOutputICCProfile={profile}", f"--permit-file-read={profile}", f"-sOutputFile={converted}", "-c", prefix, "-f", str(source)]
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        if re.search(r"reverting|error", result.stdout + result.stderr, re.IGNORECASE):
            raise ValueError("Ghostscript reported a conversion error or PDF/X fallback")
        writer = PdfWriter(clone_from=converted)
        # This is the press file, not the interactive review edition. Remove
        # navigation references before splitting cover stock from the interior.
        for key in ("/Names", "/Dests", "/Outlines", "/OpenAction", "/PageMode"):
            writer.root_object.pop(key, None)
        for page in writer.pages:
            page.mediabox = RectangleObject([0, 0, WIDTH, HEIGHT])
            page.cropbox = RectangleObject(page.mediabox)
            page.bleedbox = RectangleObject(page.mediabox)
            page.trimbox = RectangleObject([9, 9, WIDTH - 9, HEIGHT - 9])
            page.pop("/ArtBox", None)
        full = stage / "gradientpeak-a5-wireo-mixam-print.pdf"
        writer.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
        writer.write(full)
        before, after = text_pages(source), text_pages(full)
        if before != after:
            with tempfile.NamedTemporaryFile(prefix="catalog-print-failed-", suffix=".pdf", delete=False) as diagnostic:
                diagnostic.write(full.read_bytes())
            mismatches = [i + 1 for i, (a, b) in enumerate(zip(before, after)) if a != b]
            raise ValueError(f"Page text changed during print conversion on pages {mismatches}; diagnostic {diagnostic.name}")
        report = {"source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "ghostscript": run("gs", "--version").strip(), "profile_source": PROFILE_URL, "profile_sha256": PROFILE_HASH, "text_preserved": True, "files": {full.name: validate(full, count)}}
        # Mixam's four cover faces: front, inside front, inside back, back.
        for name, keep in [("cover.pdf", {0, 1, count - 2, count - 1}), ("interior.pdf", set(range(2, count - 2)))]:
            part = PdfWriter(clone_from=full)
            for index in range(count - 1, -1, -1):
                if index not in keep:
                    part.remove_page(index)
            path = stage / name
            part.compress_identical_objects(remove_duplicates=True, remove_unreferenced=True)
            part.write(path)
            report["files"][name] = validate(path, len(keep))
        for name in report["files"]:
            (stage / name).replace(destination / name)
        (destination / "preflight.json").write_text(json.dumps(report, indent=2) + "\n")
        shutil.copyfile(Path(__file__).resolve().parent.parent / "assets/fonts/DEJAVU-LICENSE.txt", destination / "FONT-LICENSE.txt")
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
