# ILLUSTRATION: sun
# DESCRIPTION: Realistic sun with glow, corona, and rays
# TOPICS: astronomy, sun, solar, space, star, light, day, weather

def create_sun(radius=1.0):
    """Create a realistic sun with glow, corona, and rays."""
    sun = VGroup()
    
    # Outer glow (soft gradient effect)
    for i in range(5, 0, -1):
        glow = Circle(
            radius=radius + i * 0.15,
            fill_color=YELLOW,
            fill_opacity=0.08 * (6 - i),
            stroke_width=0
        )
        sun.add(glow)
    
    # Main sun body with gradient effect
    sun_core = Circle(radius=radius, fill_color=YELLOW, fill_opacity=1, stroke_width=0)
    sun_inner = Circle(radius=radius * 0.7, fill_color=ORANGE, fill_opacity=0.3, stroke_width=0)
    sun.add(sun_core, sun_inner)
    
    # Sun rays (triangular)
    num_rays = 12
    for i in range(num_rays):
        angle = i * TAU / num_rays
        ray = Polygon(
            radius * 1.1 * np.array([np.cos(angle - 0.08), np.sin(angle - 0.08), 0]),
            radius * 1.1 * np.array([np.cos(angle + 0.08), np.sin(angle + 0.08), 0]),
            radius * 1.5 * np.array([np.cos(angle), np.sin(angle), 0]),
            fill_color=YELLOW,
            fill_opacity=0.9,
            stroke_width=0
        )
        sun.add(ray)
    
    return sun

# Quick sun (simpler version)
sun_quick = VGroup(
    Circle(radius=0.8, fill_color=YELLOW, fill_opacity=1, stroke_width=0),
    *[Line(ORIGIN, 1.3 * np.array([np.cos(i * TAU/8), np.sin(i * TAU/8), 0]), 
           stroke_width=4, color=YELLOW) for i in range(8)]
)

# Usage
sun = create_sun(radius=1.2)
sun.move_to(get_content_center())
self.play(FadeIn(sun), run_time=1.5)
