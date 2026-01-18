# ILLUSTRATION: cloud
# DESCRIPTION: Fluffy cloud made of overlapping circles
# TOPICS: weather, cloud, sky, nature, atmosphere, rain

def create_cloud(width=2.0, color=WHITE):
    """Create a fluffy cloud."""
    cloud = VGroup()
    
    # Multiple overlapping circles for fluffy effect
    circles = [
        (0, 0, 0.4),
        (-0.35, 0.05, 0.35),
        (0.35, 0.05, 0.35),
        (-0.2, 0.2, 0.3),
        (0.2, 0.2, 0.3),
        (0, 0.15, 0.35),
    ]
    
    for x, y, r in circles:
        c = Circle(
            radius=width * r,
            fill_color=color,
            fill_opacity=0.95,
            stroke_width=0
        ).shift(np.array([x * width, y * width, 0]))
        cloud.add(c)
    
    return cloud

# Usage
cloud = create_cloud(width=2.5, color=WHITE)
cloud.move_to(get_content_center() + UP * 1)
self.play(FadeIn(cloud, shift=LEFT*0.5), run_time=1.0)
