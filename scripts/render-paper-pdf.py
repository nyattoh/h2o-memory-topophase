from __future__ import annotations

import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "paper" / "h2o-memory-new-ai-memory-architecture-v0.2.0-alpha.md"
OUTPUT = ROOT / "output" / "pdf" / "h2o-memory-new-ai-memory-architecture-v0.2.0-alpha.pdf"
FONT = Path(r"C:\Windows\Fonts\NotoSansJP-VF.ttf")


def inline(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    return re.sub(r"(https?://[^\s]+)", r"<link href='\1' color='#155F8A'>\1</link>", text)


def footer(canvas, doc) -> None:  # noqa: ANN001
    canvas.saveState()
    canvas.setFont("H2O", 7.5)
    canvas.setFillColor(colors.HexColor("#53636E"))
    canvas.drawString(18 * mm, 11 * mm, "H2O Memory TopoPhase - v0.2.0-alpha")
    canvas.drawRightString(192 * mm, 11 * mm, str(doc.page))
    canvas.restoreState()


def styles() -> dict[str, ParagraphStyle]:
    sample = getSampleStyleSheet()
    body = ParagraphStyle(
        "Body", parent=sample["BodyText"], fontName="H2O", fontSize=9.1,
        leading=13.2, alignment=TA_JUSTIFY, textColor=colors.HexColor("#17252E"), spaceAfter=5,
    )
    return {
        "body": body,
        "title": ParagraphStyle(
            "Title", parent=body, fontSize=20, leading=25, alignment=TA_CENTER,
            textColor=colors.HexColor("#0B4F6C"), spaceAfter=10,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle", parent=body, fontSize=12, leading=17, alignment=TA_CENTER,
            textColor=colors.HexColor("#3B5967"), spaceAfter=12,
        ),
        "author": ParagraphStyle(
            "Author", parent=body, alignment=TA_CENTER, fontSize=9.4, leading=13, spaceAfter=14,
        ),
        "h1": ParagraphStyle(
            "H1", parent=body, fontSize=14, leading=18, textColor=colors.HexColor("#0B4F6C"),
            spaceBefore=11, spaceAfter=5, keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "H2", parent=body, fontSize=11, leading=15, textColor=colors.HexColor("#246A73"),
            spaceBefore=8, spaceAfter=4, keepWithNext=True,
        ),
        "abstract": ParagraphStyle(
            "Abstract", parent=body, fontSize=8.7, leading=12.7, leftIndent=7 * mm,
            rightIndent=7 * mm, backColor=colors.HexColor("#F2F7F8"),
            borderColor=colors.HexColor("#C8DDE3"), borderWidth=0.5, borderPadding=7, spaceAfter=8,
        ),
        "bullet": ParagraphStyle(
            "Bullet", parent=body, leftIndent=6 * mm, firstLineIndent=-4 * mm,
            bulletIndent=1 * mm, spaceAfter=3,
        ),
        "code": ParagraphStyle(
            "Code", parent=body, fontName="Courier", fontSize=8.2, leading=11,
            leftIndent=5 * mm, backColor=colors.HexColor("#F5F6F7"), borderPadding=6,
        ),
        "ref": ParagraphStyle(
            "Reference", parent=body, fontSize=8.2, leading=11.5,
            leftIndent=4 * mm, alignment=TA_LEFT,
        ),
    }


def build_story() -> list:
    style = styles()
    story: list = []
    paragraph: list[str] = []
    code_lines: list[str] = []
    table_rows: list[list[str]] = []
    in_code = False
    abstract_mode = False
    title_seen = False

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            story.append(Paragraph(inline(" ".join(row.strip() for row in paragraph)), style["abstract" if abstract_mode else "body"]))
            paragraph = []

    def flush_table() -> None:
        nonlocal table_rows
        if not table_rows:
            return
        data = [[Paragraph(inline(cell), style["body"]) for cell in row] for row in table_rows]
        table = Table(data, colWidths=[37 * mm, 44 * mm, 88 * mm], repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DDECEF")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0B4F6C")),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#9DB6BF")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.extend([table, Spacer(1, 3 * mm)])
        table_rows = []

    for raw in SOURCE.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if line.startswith("```"):
            flush_paragraph()
            if in_code:
                story.append(Paragraph("<br/>".join(inline(row) for row in code_lines), style["code"]))
                code_lines = []
            in_code = not in_code
            continue
        if in_code:
            code_lines.append(line)
            continue
        if line.startswith("|"):
            flush_paragraph()
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            if not all(set(cell) <= {"-", ":", " "} for cell in cells):
                table_rows.append(cells)
            continue
        if table_rows:
            flush_table()
        if not line:
            flush_paragraph()
            continue
        if line.startswith("# "):
            flush_paragraph()
            title_seen = True
            story.append(Paragraph(inline(line[2:]), style["title"]))
            continue
        if line.startswith("**新しい"):
            story.append(Paragraph(inline(line.strip("*")), style["subtitle"]))
            continue
        if title_seen and (line.startswith(("Ryoko ", "Independent ", "ORCID:", "Version:")) or re.match(r"\d+ September 2026", line)):
            paragraph.append(line.replace("  ", ""))
            if re.match(r"\d+ September 2026", line):
                story.append(Paragraph("<br/>".join(inline(row) for row in paragraph), style["author"]))
                paragraph = []
            continue
        if line.startswith("## "):
            flush_paragraph()
            heading = line[3:]
            abstract_mode = heading in {"Abstract", "日本語要旨"}
            story.append(Paragraph(inline(heading), style["h1"]))
            continue
        if line.startswith("### "):
            flush_paragraph()
            abstract_mode = False
            story.append(Paragraph(inline(line[4:]), style["h2"]))
            continue
        if re.match(r"^\d+\. ", line):
            flush_paragraph()
            target = style["ref"] if "http" in line else style["bullet"]
            story.append(Paragraph(inline(line), target))
            continue
        if line.startswith("- "):
            flush_paragraph()
            story.append(Paragraph(inline(line[2:]), style["bullet"], bulletText="-"))
            continue
        paragraph.append(line.replace("  ", " "))

    flush_paragraph()
    flush_table()
    return story


def main() -> None:
    pdfmetrics.registerFont(TTFont("H2O", str(FONT)))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(OUTPUT), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=17 * mm, bottomMargin=18 * mm,
        title="Towards a New AI Memory Architecture", author="Ryoko Sakakibara",
        subject="H2O Memory TopoPhase v0.2.0-alpha technical report",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="paper", frames=frame, onPage=footer)])
    doc.build(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    main()
