# ILLUSTRATION: water_drop
# DESCRIPTION: Realistic water droplet with highlight reflection
# TOPICS: water, liquid, rain, drop, nature, chemistry, physics

def create_water_drop(height=1.5, color=BLUE):
    """Create a realistic water droplet."""
    drop = VGroup()
    
    # Main drop shape using bezier-like construction
    # Approximate with ellipse + triangle top
    body = Ellipse(width=height*0.6, height=height*0.7, fill_color=color, fill_opacity=0.8, stroke_width=0)
    body.shift(DOWN * height * 0.15)
    
    # Pointed top
    top = Polygon(
        LEFT * height * 0.1,
        RIGHT * height * 0.1,
        UP * height * 0.5,
        fill_color=color, fill_opacity=0.8, stroke_width=0
    )
    top.shift(UP * height * 0.1)
    
    # Highlight reflection
    highlight = Ellipse(width=height*0.15, height=height*0.25, fill_color=WHITE, fill_opacity=0.6, stroke_width=0)
    highlight.shift(UP * height * 0.05 + LEFT * height * 0.1)
    
    drop.add(body, top, highlight)
    return drop

# Usage
drop = create_water_drop(height=2.0, color=BLUE)
drop.move_to(get_content_center())
self.play(FadeIn(drop, shift=DOWN*0.5), run_time=1.0)
