"""
将 TCMP设计思路.md 导出为 .docx 和自包含 .html
复用 export_manual.py 的转换逻辑，仅替换输入/输出路径。
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import export_manual as em  # noqa: E402

em.MD = os.path.join(ROOT, "TCMP设计思路.md")
em.DOCX = os.path.join(ROOT, "TCMP设计思路.docx")
em.HTML = os.path.join(ROOT, "TCMP设计思路.html")

with open(em.MD, "r", encoding="utf-8") as f:
    em.lines = f.read().split("\n")

em.build_docx()
em.build_html()
