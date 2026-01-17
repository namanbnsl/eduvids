# DIAGRAM_SCHEMA: atom_shells_v1
# DESCRIPTION: Carbon atom with 6 electrons (2 in first shell, 4 in second)
# TOPICS: chemistry, carbon, electron shells

# Create a carbon atom diagram
atom = create_atom_diagram(
    element_symbol="C",
    electron_config=[2, 4],
    show_nucleus_details=False,
    nucleus_color=RED,
    electron_color=BLUE,
)

# Animate the atom
self.play(Create(atom), run_time=2.0)
self.wait(0.5)

# Add label
label = create_label("Carbon (Z=6)", style="caption")
label.next_to(atom, DOWN, buff=0.8)
self.play(FadeIn(label), run_time=0.8)
self.wait(0.5)
