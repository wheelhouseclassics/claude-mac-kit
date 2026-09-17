#!/usr/bin/env python3
"""
UserPromptSubmit hook: auto-convert any document path mentioned in the prompt
(e.g. a file dragged into Claude Code) to Markdown, so Claude can read the cheap
.md version instead of the heavy binary file.

Design:
- Path detection is stdlib-only and runs on every prompt (near-zero cost).
- MarkItDown is imported ONLY when a convertible path is actually found.
- Never blocks the prompt: any error -> exit 0 with no output.
- Output folder: $AUTO_MD_OUT_DIR, default ~/md-converted.
"""

import sys
import os
import json
import re

OUT_DIR = os.environ.get("AUTO_MD_OUT_DIR") or os.path.expanduser("~/md-converted")

# Document types worth converting. Plain-text types (.md/.txt/.json) are skipped
# (already cheap). Images are skipped (Claude reads them visually).
EXTS = (
    "pdf", "docx", "doc", "pptx", "ppt",
    "xlsx", "xls", "csv", "html", "htm",
    "epub", "rtf", "odt", "odp", "ods",
)
_EXT_RE = "|".join(EXTS)


def find_paths(text):
    """Return candidate file paths found in the prompt text."""
    found = []
    # 1) Quoted paths (handles spaces): "/Users/me/My File.pdf" or '...'
    for m in re.findall(r'["\']([^"\']+?\.(?:%s))["\']' % _EXT_RE, text, re.IGNORECASE):
        found.append(m)
    # 2) Unquoted POSIX paths without spaces: /Users/me/file.pdf or ~/Downloads/file.pdf
    for m in re.findall(r'(?<![\w\'"])((?:~|/)[^\s"\']+?\.(?:%s))(?![\w])' % _EXT_RE, text, re.IGNORECASE):
        found.append(m)
    # 3) Unquoted drive-letter paths without spaces (kept so the hook also works on a Windows build machine)
    for m in re.findall(r'(?<![\'"])([A-Za-z]:[\\/][^\s"\']+?\.(?:%s))' % _EXT_RE, text, re.IGNORECASE):
        found.append(m)
    # Dedup, preserve order
    seen, out = set(), []
    for p in found:
        p = p.strip()
        if p and p not in seen:
            seen.add(p)
            out.append(p)
    return out


def convert(src):
    """Convert src to a .md in OUT_DIR. Returns the .md path or None."""
    src = os.path.expanduser(src)
    if not os.path.isfile(src):
        return None
    os.makedirs(OUT_DIR, exist_ok=True)
    base = os.path.splitext(os.path.basename(src))[0]
    dst = os.path.join(OUT_DIR, base + ".md")

    # Reuse existing conversion if it's newer than the source.
    try:
        if os.path.isfile(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
            return dst
    except OSError:
        pass

    from markitdown import MarkItDown  # imported only when needed
    result = MarkItDown().convert(src)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(result.text_content)
    return dst


def main():
    try:
        data = json.loads(sys.stdin.read() or "{}")
    except Exception:
        return
    if not isinstance(data, dict):
        return
    prompt = data.get("prompt", "") or ""
    paths = find_paths(prompt)
    if not paths:
        return

    mappings = []
    for src in paths:
        try:
            dst = convert(src)
            if dst:
                mappings.append((src, dst))
        except Exception:
            # Silently skip a file that fails to convert; never block the prompt.
            continue

    if not mappings:
        return

    lines = [
        "Auto-converted document(s) to Markdown to save context. "
        "Prefer reading the .md version below over the original binary file:"
    ]
    for src, dst in mappings:
        lines.append("- %s  ->  %s" % (src, dst))

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": "\n".join(lines),
        }
    }))


if __name__ == "__main__":
    main()
