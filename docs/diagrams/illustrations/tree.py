# ILLUSTRATION: tree
# DESCRIPTION: Simple but nice-looking tree with trunk and layered foliage
# TOPICS: nature, tree, plant, forest, environment, biology, ecology

def create_tree(height=2.5):
    """Create a simple but nice-looking tree."""
    tree = VGroup()
    
    # Trunk
    trunk = Rectangle(width=height*0.15, height=height*0.35, fill_color="#8B4513", fill_opacity=1, stroke_width=0)
    trunk.shift(DOWN * height * 0.25)
    tree.add(trunk)
    
    # Foliage layers (3 triangles)
    for i, (w, h, y) in enumerate([(0.8, 0.4, 0.15), (0.65, 0.35, 0.35), (0.5, 0.3, 0.5)]):
        layer = Polygon(
            LEFT * height * w * 0.5,
            RIGHT * height * w * 0.5,
            UP * height * h,
            fill_color=GREEN, fill_opacity=0.9, stroke_width=0
        )
        layer.shift(UP * height * y)
        # Slightly different green shades
        layer.set_fill(["#228B22", "#32CD32", "#2E8B57"][i], opacity=0.9)
        tree.add(layer)
    
    return tree

# Usage
tree = create_tree(height=3.0)
tree.move_to(get_content_center())
self.play(FadeIn(tree, shift=UP*0.5), run_time=1.5)
