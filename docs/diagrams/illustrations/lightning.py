# ILLUSTRATION: lightning
# DESCRIPTION: Jagged lightning bolt with glow effect
# TOPICS: weather, lightning, electricity, storm, thunder, energy, power

def create_lightning(height=3.0, color=YELLOW):
    """Create a jagged lightning bolt."""
    points = [
        UP * height * 0.5,
        UP * height * 0.2 + RIGHT * 0.3,
        UP * height * 0.25 + LEFT * 0.1,
        DOWN * height * 0.1 + RIGHT * 0.2,
        DOWN * height * 0.05 + LEFT * 0.2,
        DOWN * height * 0.5,
    ]
    bolt = Polygon(*points, fill_color=color, fill_opacity=1, stroke_color=WHITE, stroke_width=2)
    
    # Add glow
    glow = bolt.copy()
    glow.set_fill(color, opacity=0.3)
    glow.set_stroke(width=0)
    glow.scale(1.15)
    
    return VGroup(glow, bolt)

# Usage
lightning = create_lightning(height=4.0, color=YELLOW)
lightning.move_to(get_content_center())
self.play(FadeIn(lightning, scale=1.5), run_time=0.3)
self.play(lightning.animate.set_opacity(0.5), run_time=0.1)
self.play(lightning.animate.set_opacity(1), run_time=0.1)
