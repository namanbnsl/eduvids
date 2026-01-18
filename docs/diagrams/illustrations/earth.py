# ILLUSTRATION: earth
# DESCRIPTION: Earth planet with continents, oceans, and atmosphere
# TOPICS: astronomy, earth, planet, geography, space, globe, world

def create_earth(radius=1.0):
    """Create Earth with continents and atmosphere."""
    earth = VGroup()
    
    # Atmosphere glow
    atmosphere = Circle(radius=radius * 1.08, fill_color=BLUE, fill_opacity=0.15, stroke_width=0)
    earth.add(atmosphere)
    
    # Ocean base
    ocean = Circle(radius=radius, fill_color="#1E90FF", fill_opacity=1, stroke_width=0)
    earth.add(ocean)
    
    # Simplified continents (use ellipses)
    # North America-ish
    continent1 = Ellipse(width=radius*0.6, height=radius*0.5, fill_color=GREEN, fill_opacity=0.9, stroke_width=0)
    continent1.shift(UP * radius * 0.3 + LEFT * radius * 0.3)
    # Europe/Africa-ish
    continent2 = Ellipse(width=radius*0.4, height=radius*0.8, fill_color=GREEN, fill_opacity=0.9, stroke_width=0)
    continent2.shift(RIGHT * radius * 0.2)
    # Australia-ish
    continent3 = Ellipse(width=radius*0.3, height=radius*0.2, fill_color=GREEN, fill_opacity=0.9, stroke_width=0)
    continent3.shift(DOWN * radius * 0.4 + RIGHT * radius * 0.4)
    
    earth.add(continent1, continent2, continent3)
    
    # Ice caps
    ice_north = Arc(radius=radius, angle=PI*0.4, fill_color=WHITE, fill_opacity=0.9, stroke_width=0)
    ice_north.rotate(PI*0.3).shift(UP * radius * 0.7)
    earth.add(ice_north)
    
    return earth

# Usage
earth = create_earth(radius=1.5)
earth.move_to(get_content_center())
self.play(FadeIn(earth), run_time=1.5)
