from PIL import Image, ImageDraw

def create_strip_guide():
    # Canvas size: 600 x 1800
    img = Image.new("RGBA", (600, 1800), (255, 255, 255, 180)) # Semi-transparent white
    draw = ImageDraw.Draw(img)
    
    # Photo dimensions
    pw, ph = 540, 380
    padding = 30
    gap = 15
    
    for i in range(4):
        x = padding
        y = padding + i * (ph + gap)
        # Clear the photo slot (make it fully transparent)
        draw.rectangle([x, y, x + pw, y + ph], fill=(0, 0, 0, 0), outline=(255, 0, 100, 255), width=2)
        # Add slot labels
        draw.text((x + 10, y + 10), f"PHOTO {i+1} ({pw}x{ph})", fill=(255, 0, 100, 255))
        
    img.save("guide_strip.png")
    print("Saved guide_strip.png")

def create_grid_guide():
    # Canvas size: 1200 x 1200
    img = Image.new("RGBA", (1200, 1200), (255, 255, 255, 180))
    draw = ImageDraw.Draw(img)
    
    # Photo dimensions
    pw, ph = 560, 400
    padding = 40
    gap = 20
    
    # 가로 중앙 정렬 계산
    total_w = pw * 2 + gap
    start_x = (1200 - total_w) // 2 # (1200 - 1140) // 2 = 30
    
    slots = [
        (start_x, padding),
        (start_x + pw + gap, padding),
        (start_x, padding + ph + gap),
        (start_x + pw + gap, padding + ph + gap)
    ]
    
    for i, (x, y) in enumerate(slots):
        draw.rectangle([x, y, x + pw, y + ph], fill=(0, 0, 0, 0), outline=(255, 0, 100, 255), width=3)
        draw.text((x + 15, y + 15), f"PHOTO {i+1} ({pw}x{ph})", fill=(255, 0, 100, 255))
        
    img.save("guide_grid.png")
    print("Saved guide_grid.png")

if __name__ == "__main__":
    create_strip_guide()
    create_grid_guide()
