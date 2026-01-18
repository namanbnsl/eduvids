# ILLUSTRATION: moon
# DESCRIPTION: Realistic moon with crescent or full phase, craters and shading
# TOPICS: astronomy, moon, lunar, space, night, crescent, phases

def create_moon(phase="crescent", radius=1.0):
    """Create a realistic moon with craters and shading."""
    moon = VGroup()
    
    if phase == "full":
        # Full moon with craters
        moon_body = Circle(radius=radius, fill_color="#E8E8E8", fill_opacity=1, stroke_color=GRAY, stroke_width=1)
        moon.add(moon_body)
        
        # Add craters
        crater_positions = [(0.3, 0.4, 0.15), (-0.2, -0.3, 0.2), (0.4, -0.2, 0.1), (-0.4, 0.2, 0.12)]
        for cx, cy, cr in crater_positions:
            crater = Circle(
                radius=radius * cr,
                fill_color="#CCCCCC",
                fill_opacity=0.6,
                stroke_color="#AAAAAA",
                stroke_width=1
            ).move_to(np.array([cx * radius, cy * radius, 0]))
            moon.add(crater)
    else:
        # Crescent moon
        outer = Circle(radius=radius, fill_color="#F5F5DC", fill_opacity=1, stroke_width=0)
        # Create shadow circle offset to create crescent effect
        shadow = Circle(
            radius=radius * 0.85,
            fill_color="#1E1E1E",  # Match background
            fill_opacity=1,
            stroke_width=0
        ).shift(RIGHT * radius * 0.4)
        moon.add(outer, shadow)
        
        # Add subtle glow
        glow = Circle(radius=radius * 1.15, fill_color="#F5F5DC", fill_opacity=0.1, stroke_width=0)
        moon.add_to_back(glow)
    
    return moon

# Quick crescent moon
moon_quick = VGroup(
    Arc(radius=1, angle=PI, fill_color="#F5F5DC", fill_opacity=1, stroke_width=0).rotate(PI/2),
    Arc(radius=0.7, angle=PI, fill_color="#1E1E1E", fill_opacity=1, stroke_width=0).rotate(PI/2).shift(RIGHT * 0.2)
)

# Usage
moon = create_moon(phase="crescent", radius=1.0)
moon.move_to(get_content_center())
self.play(FadeIn(moon), run_time=1.5)
