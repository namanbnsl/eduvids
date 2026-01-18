# ILLUSTRATION: heart
# DESCRIPTION: Heart shape using circles and triangle
# TOPICS: love, heart, emotion, health, biology, cardiology, valentine

def create_heart(size=1.0, color=RED):
    """Create a heart shape."""
    # Two circles for top curves + triangle for bottom
    heart = VGroup()
    
    left_curve = Circle(radius=size*0.35, fill_color=color, fill_opacity=1, stroke_width=0)
    left_curve.shift(UP * size * 0.15 + LEFT * size * 0.25)
    
    right_curve = Circle(radius=size*0.35, fill_color=color, fill_opacity=1, stroke_width=0)
    right_curve.shift(UP * size * 0.15 + RIGHT * size * 0.25)
    
    bottom = Polygon(
        LEFT * size * 0.55,
        RIGHT * size * 0.55,
        DOWN * size * 0.6,
        fill_color=color, fill_opacity=1, stroke_width=0
    )
    bottom.shift(DOWN * size * 0.05)
    
    heart.add(bottom, left_curve, right_curve)
    return heart

# Usage
heart = create_heart(size=1.5, color=RED)
heart.move_to(get_content_center())
self.play(FadeIn(heart, scale=0.5), run_time=1.0)
