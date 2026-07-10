import re

with open('app.js', 'r', encoding='utf-8') as f:
    app = f.read()

def replace_border(match):
    return f"""      if ({match.group(1)}) {{
        ctx.save();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 5;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);
        ctx.restore();
      }}"""

# Search for the old pattern with lineWidth = 10
app = re.sub(r'      if \(([^)]+)\) {\s*ctx\.strokeStyle = \'#[a-fA-F0-9]+\';\s*ctx\.lineWidth = 10;\s*ctx\.strokeRect\(pos\.x, pos\.y, pos\.width, pos\.height\);\s*}', replace_border, app)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(app)

print("Border updated")
