"""
@author zhangyueting
@date 2026-06-12
使用 Playwright 无头 Chromium 将 HTML 打印为 PDF。
"""
import sys
from playwright.sync_api import sync_playwright

HTML = "file:///D:/用例管理平台/用户手册.html"
PDF = "D:/用例管理平台/用户手册.pdf"

with sync_playwright() as p:
    browser = None
    for ch in ("msedge", "chrome"):
        try:
            browser = p.chromium.launch(headless=True, channel=ch)
            print("using channel:", ch)
            break
        except Exception as e:
            print("channel", ch, "failed:", str(e)[:80])
    if browser is None:
        browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto(HTML, wait_until="networkidle")
    page.pdf(
        path=PDF,
        format="A4",
        print_background=True,
        margin={"top": "14mm", "bottom": "14mm", "left": "12mm", "right": "12mm"},
    )
    browser.close()
print("PDF_OK", PDF)
