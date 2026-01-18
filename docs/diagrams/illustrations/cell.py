# ILLUSTRATION: cell
# DESCRIPTION: Biological cell with organelles including nucleus, mitochondria, and ribosomes
# TOPICS: biology, cell, organelle, nucleus, mitochondria, life, microscopy

# Cell with organelles - NOT just an oval!
def create_cell():
    """Create a biological cell with organelles."""
    cell = VGroup()
    
    # Cytoplasm (inner fill)
    cytoplasm = Ellipse(width=3.8, height=2.3, color=YELLOW_A, fill_opacity=0.2, stroke_width=0)
    cell.add(cytoplasm)
    
    # Cell membrane (outer boundary)
    cell_membrane = Ellipse(width=4, height=2.5, color=YELLOW_E, stroke_width=3)
    cell.add(cell_membrane)
    
    # Nucleus
    nucleus = Circle(radius=0.5, color=PURPLE, fill_opacity=0.6)
    nucleus.shift(LEFT * 0.5)
    cell.add(nucleus)
    
    # Nucleolus (inside nucleus)
    nucleolus = Circle(radius=0.15, color=DARK_BROWN, fill_opacity=0.8)
    nucleolus.move_to(nucleus.get_center())
    cell.add(nucleolus)
    
    # Mitochondria (bean shapes)
    mito1 = Ellipse(width=0.5, height=0.25, color=ORANGE, fill_opacity=0.7)
    mito1.shift(RIGHT * 1 + UP * 0.5)
    mito2 = Ellipse(width=0.4, height=0.2, color=ORANGE, fill_opacity=0.7)
    mito2.shift(RIGHT * 0.5 + DOWN * 0.6)
    cell.add(mito1, mito2)
    
    # Ribosomes (small dots scattered in cytoplasm)
    ribosomes = VGroup(*[
        Dot(radius=0.03, color=BLUE).shift(
            np.random.uniform(-1.5, 1.5) * RIGHT + np.random.uniform(-0.8, 0.8) * UP
        ) for _ in range(15)
    ])
    cell.add(ribosomes)
    
    return cell

# Usage
cell = create_cell()
cell.scale(1.5)
cell.move_to(get_content_center())
self.play(FadeIn(cell), run_time=2.0)
