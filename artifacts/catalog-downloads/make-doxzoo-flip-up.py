"""Make flip-up interior and complete Doxzoo derivatives; preserve original files."""
from pathlib import Path
from pypdf import PdfReader, PdfWriter

root = Path(__file__).resolve().parent
source = root / 'gradientpeak-complete-catalog-a5-top-bound-upload-interior-duplex.pdf'
destination = root / 'gradientpeak-catalog-a5-doxzoo-flip-up-interior.pdf'
reader = PdfReader(source)
assert len(reader.pages) == 90
writer = PdfWriter()
for index, page in enumerate(reader.pages):
    if index % 2 == 1:
        page.rotate(180)
        # Bake the rotation into artwork rather than relying on viewer metadata.
        page.transfer_rotation_to_content()
    writer.add_page(page)
writer.add_metadata({'/Title': 'GradientPeak A5 — Doxzoo flip-up interior',
                     '/Subject': '90 interior faces; even interior faces rotated 180 degrees. Covers supplied separately.'})
with destination.open('wb') as output:
    writer.write(output)

original = PdfReader(source)
result = PdfReader(destination)
assert len(result.pages) == len(original.pages)
for index, (before, after) in enumerate(zip(original.pages, result.pages)):
    # Rotation changes inferred word spacing in PDF extraction, not glyph content.
    assert ''.join(before.extract_text().split()) == ''.join(after.extract_text().split()), index
    assert after.rotation == 0, index
    for attribute in ('mediabox', 'trimbox', 'bleedbox', 'cropbox'):
        assert all(abs(float(a) - float(b)) < 0.001
                   for a, b in zip(getattr(before, attribute), getattr(after, attribute))), (index, attribute)
    if before.get_contents() is None:
        assert after.get_contents() is None, index
        continue  # The final duplex parity face is intentionally blank.
    if index % 2 == 0:
        assert before.get_contents().get_data() == after.get_contents().get_data(), index
    else:
        assert before.get_contents().get_data() != after.get_contents().get_data(), index
print(destination)
print('Verified 90 faces, identical text/order/page boxes; 45 reverse faces rotated, 45 front faces unchanged.')

# Doxzoo's Cover Tool moves first/last pages to separate cover stock.
# Do not add inside-cover blanks to the body: that would shift duplex parity.
covers = PdfReader(root / 'gradientpeak-complete-catalog-a5-top-bound-upload-cover-4-face.pdf')
assert len(covers.pages) == 4
complete = PdfWriter()
complete.add_page(covers.pages[0])
for page in result.pages:
    complete.add_page(page)
complete.add_page(covers.pages[3])
complete.add_metadata({'/Title': 'GradientPeak complete catalog — Doxzoo flip-up',
                       '/Subject': 'Move first and last pages to covers in Doxzoo. Body is 90 duplex faces with reverse faces rotated; no further rotation.'})
full_path = root / 'gradientpeak-complete-catalog-a5-doxzoo-flip-up.pdf'
with full_path.open('wb') as output:
    complete.write(output)
full = PdfReader(full_path)
assert len(full.pages) == len(result.pages) + 2
for index, page in enumerate(result.pages):
    included = full.pages[index + 1]
    assert included.extract_text() == page.extract_text(), index
    if page.get_contents() is not None:
        assert included.get_contents().get_data() == page.get_contents().get_data(), index
for target, source_page in [(full.pages[0], covers.pages[0]), (full.pages[-1], covers.pages[3])]:
    assert target.get_contents().get_data() == source_page.get_contents().get_data()
print(full_path)
print('Verified complete file: front cover + 90 interior faces + back cover = 92 pages.')
