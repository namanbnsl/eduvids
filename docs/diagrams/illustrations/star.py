# ILLUSTRATION: star
# DESCRIPTION: Twinkling star shape with pointed rays
# TOPICS: astronomy, star, space, night, sky, decoration

def create_star(radius=0.5, num_points=5, color=YELLOW, inner_ratio=0.4):
    """Create a star shape with pointed rays."""
    points = []
    for i in range(num_points * 2):
        angle = i * PI / num_points - PI / 2  # Start from top
        r = radius if i % 2 == 0 else radius * inner_ratio
        points.append(r * np.array([np.cos(angle), np.sin(angle), 0]))
    
    star = Polygon(*points, fill_color=color, fill_opacity=1, stroke_color=WHITE, stroke_width=1)
    return star

# Quick 5-point star
star_quick = Polygon(
    *[((1 if i % 2 == 0 else 0.4) * np.array([np.cos(i * PI/5 - PI/2), np.sin(i * PI/5 - PI/2), 0])) for i in range(10)],
    fill_color=YELLOW, fill_opacity=1, stroke_width=1
)

# Multiple stars for a night sky
def create_star_field(num_stars=20, area_width=12, area_height=6):
    """Create a field of random stars."""
    stars = VGroup()
    for _ in range(num_stars):
        size = np.random.uniform(0.05, 0.2)
        x = np.random.uniform(-area_width/2, area_width/2)
        y = np.random.uniform(-area_height/2, area_height/2)
        star = create_star(radius=size, color=WHITE)
        star.move_to(np.array([x, y, 0]))
        stars.add(star)
    return stars

# Usage
star = create_star(radius=0.8, num_points=5, color=YELLOW)
star.move_to(get_content_center())
self.play(FadeIn(star, scale=0.5), run_time=1.0)
