const fs = require('fs');

let text = fs.readFileSync('app.js', 'utf8');

// 1. Add vert4_bg1 to BG_STYLES
if (!text.includes("key: 'vert4_bg1'")) {
  text = text.replace(
    "{ key: 'vert4_bg2',      label: 'Template 2',          thumb: null }",
    "{ key: 'vert4_bg1',      label: 'Template 1',          thumb: null },\n    { key: 'vert4_bg2',      label: 'Template 2',          thumb: null }"
  );
}

// 2. Clear deco when color is picked
text = text.replace(
  "state.frame.color = clone.dataset.color;\n        state.frame.bg = 'none';",
  "state.frame.color = clone.dataset.color;\n        state.frame.bg = 'none';\n        state.frame.deco = 'none';"
);
text = text.replace(
  "state.frame.color = newColor;\n        state.frame.bg = 'none';",
  "state.frame.color = newColor;\n        state.frame.bg = 'none';\n        state.frame.deco = 'none';"
);

// Clear deco when a style is picked in edit screen
text = text.replace(
  "state.frame.bg = style.key;\n        renderEditCanvas();",
  "state.frame.bg = style.key;\n        state.frame.deco = 'none';\n        renderEditCanvas();"
);

// Also in custom template upload
text = text.replace(
  "state.frame.bg = key;\n        renderEditCanvas();",
  "state.frame.bg = key;\n        state.frame.deco = 'none';\n        renderEditCanvas();"
);

// 3. Remove requestFullscreen
const fullscreenRegex = /if\s*\(\s*el\.requestFullscreen\s*\)\s*\{[\s\S]*?el\.webkitRequestFullscreen\(\);\s*\}/m;
text = text.replace(fullscreenRegex, "// Fullscreen auto-transition removed per user request.");
text = text.replace("fullscreenAttempted = true;", "// fullscreenAttempted = true; removed");
text = text.replace("let fullscreenAttempted = false;", "// let fullscreenAttempted = false; removed");

// 4. Update preloadBackgrounds URLs
text = text.replace(
  "'https://res.cloudinary.com/dv1t8m7k/image/upload/v1784012757/vert4_template_deco_01_scqvmr.png'", // just in case it already has this
  "''"
);
text = text.replace(
  "'https://res.cloudinary.com/dv1t8m7k/image/upload/v1784008120/vert4_template_deco_01_wq4jtw.png'",
  "'https://res.cloudinary.com/dv1t8m7k/image/upload/v1784012757/vert4_template_deco_01_scqvmr.png'"
);
text = text.replace(
  "'https://res.cloudinary.com/dv1t8m7k/image/upload/v1784008119/vert4_template_02_phgfmj.png'",
  "'https://res.cloudinary.com/dv1t8m7k/image/upload/v1784008121/vert4_template_deco_02_gxvmmn.png'"
);

fs.writeFileSync('app.js', text, 'utf8');
console.log('app.js successfully patched via node script.');
