import os
import json
import html
import re

DIRECTORY = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DB_PATH = os.path.join(DIRECTORY, 'data', 'posts.json')

def clean_post_to_markdown(raw_html):
    if not raw_html:
        return ""
    
    # Try using html2text
    try:
        import html2text
        h = html2text.HTML2Text()
        h.ignore_links = False
        h.body_width = 0
        h.single_line_break = False

        # Pre-clean img tags to strip srcset, data-image-meta, etc.
        def clean_img(match):
            attrs = match.group(0)
            src_m = re.search(r'data-orig-file=["\']([^"\']+)["\']', attrs) or re.search(r'src=["\']([^"\']+)["\']', attrs)
            if not src_m:
                return ""
            src = src_m.group(1).split('?')[0]
            alt_m = re.search(r'data-image-title=["\']([^"\']+)["\']', attrs) or re.search(r'alt=["\']([^"\']+)["\']', attrs)
            alt = alt_m.group(1) if alt_m else "Photograph"
            return f'<p><img src="{src}" alt="{alt}" /></p>'

        pre_cleaned = re.sub(r'<img[^>]+>', clean_img, raw_html)
        # Strip wp figure and div wrappers
        pre_cleaned = re.sub(r'</?(figure|div)[^>]*>', '\n', pre_cleaned)
        
        md = h.handle(pre_cleaned)
        # Strip list bullets from standalone markdown images (* ![alt](url) -> ![alt](url))
        md = re.sub(r'^\s*[\*\-]\s+(!\[.*?\]\(.*?\))', r'\1', md, flags=re.MULTILINE)
        # Clean excessive blank lines
        md = re.sub(r'\n{3,}', '\n\n', md).strip()
        return md
    except Exception as e:
        print(f"html2text error: {e}")
        return raw_html

def main():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    with open(DB_PATH, 'r', encoding='utf-8') as f:
        db = json.load(f)

    posts = db.get('posts', [])
    print(f"Processing {len(posts)} posts in {DB_PATH}...")

    updated_count = 0
    for post in posts:
        # 1. Unescape Title & Excerpt
        old_title = post.get('title', '')
        clean_title = html.unescape(old_title)
        post['title'] = clean_title

        if 'excerpt' in post and post['excerpt']:
            post['excerpt'] = html.unescape(post['excerpt'])

        # 2. Generate clean markdown field if not present
        raw_content = post.get('content', '')
        if raw_content:
            clean_md = clean_post_to_markdown(raw_content)
            post['markdown'] = clean_md
            updated_count += 1

    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(db, f, indent=2, ensure_ascii=False)

    print(f"Successfully cleaned titles and generated markdown for {updated_count} posts!")

if __name__ == '__main__':
    main()
