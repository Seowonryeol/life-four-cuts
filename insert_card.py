with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# The grid22 card closing tag is </button>
# Insert grid22v right after the grid22 </button>
old_grid22_end = """              <button class="layout-card" data-layout="grid22" aria-pressed="false" id="layout-grid22">
                <div class="layout-icon layout-icon-grid22">
                  <div></div><div></div><div></div><div></div>
                </div>
                <span>2×2 격자<br><small>Grid 2×2</small></span>
              </button>"""

new_grid22_end = """              <button class="layout-card" data-layout="grid22" aria-pressed="false" id="layout-grid22">
                <div class="layout-icon layout-icon-grid22">
                  <div></div><div></div><div></div><div></div>
                </div>
                <span>2×2 격자<br><small>Grid 2×2</small></span>
              </button>
              <button class="layout-card" data-layout="grid22v" aria-pressed="false" id="layout-grid22v">
                <div class="layout-icon layout-icon-grid22">
                  <div style="height:120%;"></div><div style="height:120%;"></div><div style="height:120%;"></div><div style="height:120%;"></div>
                </div>
                <span>세로 2×2<br><small>Portrait 2×2</small></span>
              </button>"""

if 'grid22v' not in html:
    if old_grid22_end in html:
        html = html.replace(old_grid22_end, new_grid22_end)
        print('grid22v card inserted.')
    else:
        print('ERROR: exact match not found. Trying simpler search...')
        # Try finding just the closing part
        target = '              </button>\n            </div>'
        idx = html.rfind('data-layout="grid22"')
        end_idx = html.find('</button>', idx)
        if end_idx > 0:
            insert_at = end_idx + len('</button>')
            new_card = """
              <button class="layout-card" data-layout="grid22v" aria-pressed="false" id="layout-grid22v">
                <div class="layout-icon layout-icon-grid22">
                  <div style="height:120%;"></div><div style="height:120%;"></div><div style="height:120%;"></div><div style="height:120%;"></div>
                </div>
                <span>세로 2×2<br><small>Portrait 2×2</small></span>
              </button>"""
            html = html[:insert_at] + new_card + html[insert_at:]
            print('grid22v card inserted (fallback method).')
        else:
            print('ERROR: Could not find insertion point.')
else:
    print('grid22v already in HTML.')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('index.html written.')
