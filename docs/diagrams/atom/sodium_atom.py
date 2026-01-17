# DIAGRAM_SCHEMA: atom_shells_v1
# DESCRIPTION: Sodium atom showing valence electron
# TOPICS: chemistry, sodium, valence electron

# Create a sodium atom diagram showing the single valence electron
atom = create_atom_diagram(
    element_symbol="Na",
    electron_config=[2, 8, 1],
    show_nucleus_details=False,
    nucleus_color=RED,
    electron_color=BLUE,
)

# Animate the atom
self.play(Create(atom), run_time=2.0)
self.wait(0.5)

# Add label pointing out valence electron
label = create_label("Sodium - 1 valence electron", style="caption")
label.next_to(atom, DOWN, buff=0.8)
self.play(FadeIn(label), run_time=0.8)
self.wait(0.5)
