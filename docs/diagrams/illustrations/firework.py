# ILLUSTRATION: firework
# DESCRIPTION: Firework explosion with colorful sparks
# TOPICS: celebration, firework, explosion, festival, party, light, event

def create_firework(center=ORIGIN, radius=2.0, num_sparks=16, colors=None):
    """Create a firework explosion with colorful sparks."""
    if colors is None:
        colors = [RED, YELLOW, ORANGE, PINK, CYAN, GREEN]
    
    firework = VGroup()
    
    # Central flash
    flash = Circle(radius=radius * 0.15, fill_color=WHITE, fill_opacity=1, stroke_width=0)
    firework.add(flash)
    
    # Spark trails
    for i in range(num_sparks):
        angle = i * TAU / num_sparks + np.random.uniform(-0.1, 0.1)
        length = radius * np.random.uniform(0.7, 1.0)
        color = colors[i % len(colors)]
        
        # Main spark line
        end_point = length * np.array([np.cos(angle), np.sin(angle), 0])
        spark = Line(
            ORIGIN + 0.2 * end_point / length,  # Start slightly from center
            end_point,
            stroke_width=3,
            color=color
        )
        firework.add(spark)
        
        # Spark tip (dot)
        tip = Dot(end_point, radius=0.06, color=color)
        firework.add(tip)
        
        # Secondary smaller sparks
        for j in range(2):
            sub_angle = angle + np.random.uniform(-0.3, 0.3)
            sub_length = length * np.random.uniform(0.3, 0.6)
            sub_end = sub_length * np.array([np.cos(sub_angle), np.sin(sub_angle), 0])
            sub_spark = Line(
                0.3 * end_point,
                sub_end,
                stroke_width=1.5,
                color=color,
                stroke_opacity=0.7
            )
            firework.add(sub_spark)
    
    firework.move_to(center)
    return firework

# Quick firework burst
firework_quick = VGroup(*[
    Line(ORIGIN, 1.5 * np.array([np.cos(i * TAU/12), np.sin(i * TAU/12), 0]),
         stroke_width=3, color=[RED, YELLOW, ORANGE, PINK][i % 4])
    for i in range(12)
])

# Usage
firework = create_firework(center=get_content_center(), radius=2.5)
self.play(FadeIn(firework, scale=0.1), run_time=0.5)
